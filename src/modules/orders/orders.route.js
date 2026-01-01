// src/modules/orders/orders.route.js
import express from 'express';
import orderController from './orders.controller.js';
import orderService from './orders.service.js'; // TAMBAHKAN IMPORT INI
import { authenticate, authorize } from '../../middleware/auth.js';
import upload from '../../middleware/upload.js';

const router = express.Router();

// Routes untuk orders
router.get('/', authenticate, orderController.getAllOrders);
router.get('/user', authenticate, orderController.getUserOrders);
router.get('/:id', authenticate, orderController.getOrderById);
router.post('/', authenticate, orderController.createOrder);
router.put('/:id/status', authenticate, authorize(['admin']), orderController.updateOrderStatus);
router.put('/:id/payment-status', authenticate, authorize(['admin']), orderController.updatePaymentStatus);
router.put('/:id/payment-proof', authenticate, upload.single('payment_proof'), orderController.uploadPaymentProof);
router.delete('/:id', authenticate, authorize(['admin']), orderController.deleteOrder);


// Rute khusus untuk localhost development
router.post('/:id/quick-update', authenticate, orderController.quickUpdateStatus);
router.post('/:id/cancel', authenticate, orderController.cancelOrder);


// WhatsApp routes
router.post('/:id/whatsapp-reminder', authenticate, authorize(['admin']), orderController.sendOrderReminder);
router.post('/:id/whatsapp-receipt', authenticate, orderController.sendReceiptViaWhatsApp);

// Route khusus admin
router.get('/admin/all', authenticate, authorize(['admin']), orderController.getAllOrdersForAdmin);
router.get('/admin/phones', authenticate, authorize(['admin']), orderController.getAdminPhones);

// Tambahan route untuk fitur tambahan
router.get('/export/csv', authenticate, authorize(['admin']), orderController.exportOrders);
router.post('/bulk/update-status', authenticate, authorize(['admin']), orderController.bulkUpdateOrderStatus);
router.get('/code/:code', orderController.getOrderByCode);
router.post('/:id/resend-notification', authenticate, orderController.resendPaymentNotification);

// Route untuk sync payment status (sudah ada di controller)
router.post('/:id/sync-payment', authenticate, orderController.syncPaymentStatus);

// Route untuk direct payment - PERBAIKI INI
router.post('/:id/pay-direct', authenticate, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    
    console.log('💳 Direct payment request for order:', orderId);
    
    // Dapatkan data order menggunakan controller yang sudah ada
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan'
      });
    }
    
    // Verifikasi kepemilikan
    if (order.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }
    
    // Cek apakah sudah ada payment token
    if (order.midtrans_transaction_id) {
      // Jika sudah ada transaksi, gunakan yang sudah ada
      return res.json({
        success: true,
        message: 'Payment token sudah tersedia',
        data: {
          token: order.midtrans_transaction_id,
          snap_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${order.midtrans_transaction_id}`,
          order_id: order.order_code,
          amount: order.final_amount
        }
      });
    }
    
    // Buat transaksi Snap baru
    const transactionData = {
      transaction_details: {
        order_id: order.order_code,
        gross_amount: order.final_amount
      },
      customer_details: {
        first_name: order.user_name || 'Customer',
        phone: order.user_phone,
        email: req.user.email || 'customer@example.com',
        shipping_address: {
          address: order.shipping_address,
          phone: order.shipping_phone
        }
      }
    };
    
    console.log('Creating Snap transaction:', transactionData);
    
    // Buat token Snap menggunakan service
    const transaction = await orderService.createSnapTransaction(transactionData);
    
    if (transaction && transaction.token) {
      // Update transaction ID di database
      await orderService.updateMidtransTransactionId(
        orderId, 
        transaction.transaction_id || order.order_code
      );
      
      res.json({
        success: true,
        message: 'Token pembayaran berhasil dibuat',
        data: {
          token: transaction.token,
          redirect_url: transaction.redirect_url,
          snap_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${transaction.token}`,
          order_id: order.order_code,
          amount: order.final_amount
        }
      });
    } else {
      throw new Error('Gagal membuat token pembayaran');
    }
    
  } catch (error) {
    console.error('❌ Error creating direct payment:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal membuat pembayaran',
      error: error.message
    });
  }
});

// Route untuk check payment status
router.get('/:id/payment-status', authenticate, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    
    console.log('🔍 Checking payment status for order:', orderId);
    
    // Dapatkan data order
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan'
      });
    }
    
    // Verifikasi kepemilikan
    if (order.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }
    
    // Cek status di Midtrans jika ada transaction ID
    let midtransStatus = null;
    let requiresSync = false;
    
    if (order.midtrans_transaction_id) {
      try {
        midtransStatus = await orderService.checkMidtransStatus(
          order.midtrans_transaction_id
        );
        
        // Periksa apakah status perlu disinkronisasi
        if (midtransStatus && 
            (midtransStatus.transaction_status === 'settlement' || 
             midtransStatus.transaction_status === 'capture') && 
            order.payment_status !== 'paid') {
          requiresSync = true;
        }
      } catch (midtransError) {
        console.log('Tidak bisa mengakses Midtrans:', midtransError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Status pembayaran berhasil diambil',
      data: {
        order_id: order.id,
        order_code: order.order_code,
        payment_status: order.payment_status,
        order_status: order.order_status,
        midtrans_status: midtransStatus?.transaction_status || null,
        requires_sync: requiresSync,
        is_mock: process.env.NODE_ENV === 'development' && !midtransStatus,
        updated_at: order.updated_at
      }
    });
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memeriksa status pembayaran',
      error: error.message
    });
  }
});

// Route untuk update status dari Midtrans (manual trigger)
router.post('/:id/update-status', authenticate, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    
    console.log('🔄 Manual status update for order:', orderId);
    
    // Dapatkan data order
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan'
      });
    }
    
    // Verifikasi kepemilikan
    if (order.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }
    
    // Cek status di Midtrans
    if (order.midtrans_transaction_id) {
      const midtransStatus = await orderService.checkMidtransStatus(
        order.midtrans_transaction_id
      );
      
      if (midtransStatus) {
        // Proses response dari Midtrans
        const result = await orderService.processMidtransResponse({
          order_id: order.order_code,
          transaction_status: midtransStatus.transaction_status,
          fraud_status: midtransStatus.fraud_status || 'accept',
          payment_type: midtransStatus.payment_type || 'bank_transfer',
          transaction_id: order.midtrans_transaction_id,
          gross_amount: midtransStatus.gross_amount || order.final_amount
        });
        
        return res.json({
          success: true,
          message: 'Status berhasil diperbarui dari Midtrans',
          data: result
        });
      }
    }
    
    // Jika tidak ada transaksi Midtrans, gunakan sync payment status
    const syncResult = await orderController.syncPaymentStatus(req, res);
    return syncResult;
    
  } catch (error) {
    console.error('Error in manual status update:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui status',
      error: error.message
    });
  }
});

// TAMBAHKAN Route untuk payment link (sebagai fallback)
router.post('/:id/payment-link', authenticate, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    
    console.log('🔄 Payment link request for order:', orderId);
    
    // Dapatkan data order
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan'
      });
    }
    
    // Verifikasi kepemilikan
    if (order.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }
    
    // Gunakan payment link yang sudah ada
    const paymentLink = 'https://app.sandbox.midtrans.com/payment-links/1748988501455';
    
    // Tambahkan parameter order ID ke URL
    const finalPaymentLink = `${paymentLink}?order_id=${order.order_code}&amount=${order.final_amount}&customer_name=${encodeURIComponent(order.user_name || 'Customer')}`;
    
    console.log('✅ Payment link generated:', finalPaymentLink);
    
    res.json({
      success: true,
      message: 'Payment link berhasil dibuat',
      data: {
        payment_link: finalPaymentLink,
        order_id: order.order_code,
        amount: order.final_amount,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 jam
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal membuat payment link',
      error: error.message
    });
  }
});

export default router;