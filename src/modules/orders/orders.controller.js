// src/modules/orders/orders.controller.js
import orderService from './orders.service.js'
import cartService from '../carts/carts.service.js'
import db from '../../config/db.js'
import { generateImageUrl } from '../../utils/imageUrlHelper.js'

class OrderController {
  // Create new order from cart
  async createOrder (req, res) {
    try {
      const userId = req.user.id
      const orderData = req.body

      // Validasi manual
      if (!orderData.shipping_address || !orderData.shipping_phone) {
        return res.status(400).json({
          success: false,
          message: 'Alamat pengiriman dan nomor telepon harus diisi'
        })
      }

      // Get user's cart items
      let cartResponse
      try {
        cartResponse = await cartService.getCartByUserId(userId)
        console.log('Cart response:', JSON.stringify(cartResponse, null, 2))

        if (!cartResponse.success) {
          return res.status(400).json({
            success: false,
            message: 'Gagal mengambil data keranjang belanja'
          })
        }
      } catch (cartError) {
        console.error('Error getting cart:', cartError)
        return res.status(400).json({
          success: false,
          message: 'Gagal mengambil data keranjang belanja'
        })
      }

      const cartItems =
        cartResponse.data?.items || cartResponse.data?.cart?.items || []

      if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Keranjang belanja kosong'
        })
      }

      // Debug log untuk melihat struktur data
      console.log('Cart items structure:')
      cartItems.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          cart_id: item.cart_id,
          product_id: item.product_id,
          product_name: item.product_name,
          price: item.price,
          discount_price: item.discount_price,
          final_price: item.final_price,
          quantity: item.quantity,
          subtotal: item.subtotal
        })
      })

      // Format cart items untuk order service
      const formattedCartItems = cartItems.map(item => {
        return {
          id: item.cart_id,
          user_id: userId,
          product_id: item.product_id,
          quantity: item.quantity,
          product: {
            id: item.product_id,
            name: item.product_name,
            price: parseFloat(item.price),
            discount_price: item.discount_price
              ? parseFloat(item.discount_price)
              : 0,
            final_price: item.final_price
              ? parseFloat(item.final_price)
              : parseFloat(item.price) -
                (item.discount_price ? parseFloat(item.discount_price) : 0),
            stock: item.stock,
            image: item.product_image,
            subtotal: item.subtotal ? parseFloat(item.subtotal) : 0
          }
        }
      })

      // Log formatted items
      console.log('Formatted cart items:')
      formattedCartItems.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          product_id: item.product_id,
          product_name: item.product.name,
          price: item.product.price,
          discount_price: item.product.discount_price,
          final_price: item.product.final_price,
          quantity: item.quantity,
          subtotal: item.product.subtotal
        })
      })

      // Check stock availability
      const stockCheck = await orderService.checkStockAvailability(
        formattedCartItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      )

      if (!stockCheck.allAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Stok produk tidak mencukupi',
          data: {
            insufficient_stock: stockCheck.insufficientStock
          }
        })
      }

      // Create order
      const result = await orderService.createOrder(
        userId,
        orderData,
        formattedCartItems
      )

      // Get user data for Midtrans
      const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
      const userResult = await db.query(userQuery, [userId])
      const userData = userResult.rows[0]

      // Note: Payment akan dibuat terpisah melalui payment module
      const paymentData = {
        message: 'Payment will be created separately using payment module',
        order_id: result.order.id,
        order_code: result.order.order_code,
        amount: result.order.final_amount
      }

      // Generate full URL untuk product_image di setiap item
      if (
        result.order &&
        result.order.items &&
        Array.isArray(result.order.items)
      ) {
        result.order.items = result.order.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      // Helper functions untuk summary
      const calculateTotalOriginal = items => {
        return items.reduce((total, item) => {
          return total + item.product.price * item.quantity
        }, 0)
      }

      const calculateTotalDiscount = items => {
        return items.reduce((total, item) => {
          const discount = item.product.discount_price || 0
          return total + discount * item.quantity
        }, 0)
      }

      res.status(201).json({
        success: true,
        message: 'Order berhasil dibuat',
        data: {
          order: result.order,
          summary: {
            total_original_price: calculateTotalOriginal(formattedCartItems),
            total_discount: calculateTotalDiscount(formattedCartItems),
            total_after_discount: result.order.total_amount,
            shipping_cost: orderData.shipping_cost,
            final_amount: result.order.final_amount
          }
        }
      })
    } catch (error) {
      console.error('Error creating order:', error)
      console.error('Error stack:', error.stack)
      res.status(500).json({
        success: false,
        message: 'Gagal membuat order',
        error: error.message
      })
    }
  }

  // Handle Midtrans notification (webhook) - MODIFIKASI UNTUK LOCALHOST
  async handleNotification (req, res) {
    try {
      console.log('=== MIDTRANS WEBHOOK RECEIVED ===')
      console.log('Headers:', req.headers)
      console.log('Body:', req.body)
      console.log('===============================')

      const notification = req.body

      // Untuk development/localhost, kita perlu handle mock notification
      if (
        process.env.NODE_ENV === 'development' &&
        req.headers['x-mock-notification']
      ) {
        console.log('Processing mock notification for localhost')
      }

      const result = await orderService.handleMidtransNotification(notification)

      res.json({
        success: true,
        message: 'Notification processed successfully',
        data: result
      })
    } catch (error) {
      console.error('Error handling notification:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal memproses notifikasi',
        error: error.message
      })
    }
  }



  // Di orders.controller.js, tambahkan fungsi ini:
  async syncPaymentStatus (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      console.log(`🔄 Syncing payment status for order: ${orderId}`)

      // Dapatkan data order
      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      // Verifikasi kepemilikan
      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      // Cek status di Midtrans
      let midtransStatus = null
      try {
        if (order.midtrans_transaction_id) {
          midtransStatus = await orderService.checkMidtransStatus(
            order.midtrans_transaction_id
          )
        }
      } catch (midtransError) {
        console.log(
          'Tidak bisa mengakses Midtrans, menggunakan status database'
        )
      }

      // Jika status di Midtrans sudah settlement, update database
      if (
        midtransStatus &&
        (midtransStatus.transaction_status === 'settlement' ||
          midtransStatus.transaction_status === 'capture')
      ) {
        console.log(
          `✅ Midtrans status: ${midtransStatus.transaction_status}, updating database...`
        )

        // Update payment status ke paid
        await orderService.updatePaymentStatusManually(orderId, 'paid')

        // Dapatkan order yang sudah diupdate
        const updatedOrder = await orderService.getOrderById(orderId)

        // Generate full URL untuk product_image di setiap item
        if (
          updatedOrder &&
          updatedOrder.items &&
          Array.isArray(updatedOrder.items)
        ) {
          updatedOrder.items = updatedOrder.items.map(item => ({
            ...item,
            product_image: generateImageUrl(req, item.product_image)
          }))
        }

        return res.json({
          success: true,
          message: 'Status pembayaran berhasil disinkronisasi',
          data: {
            order: updatedOrder,
            was_updated: true,
            previous_status: order.payment_status,
            new_status: 'paid',
            midtrans_status: midtransStatus.transaction_status
          }
        })
      }

      // Jika tidak ada perubahan, kembalikan status saat ini
      return res.json({
        success: true,
        message: 'Status pembayaran sudah sesuai',
        data: {
          order: order,
          was_updated: false,
          current_status: order.payment_status,
          midtrans_status: midtransStatus
            ? midtransStatus.transaction_status
            : 'unavailable'
        }
      })
    } catch (error) {
      console.error('Error syncing payment status:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal menyinkronisasi status pembayaran',
        error: error.message
      })
    }
  }

  // TAMBAHKAN: Quick update untuk localhost development
  async quickUpdateStatus (req, res) {
    try {
      const orderId = req.params.id
      const { status } = req.body

      console.log('Quick update for order:', orderId, 'to status:', status)

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status harus diisi'
        })
      }

      const client = await db.connect()

      try {
        await client.query('BEGIN')

        // Ambil order dengan items
        const orderQuery = `
                SELECT o.*, 
                       u.full_name, u.phone,
                       oi.product_id, oi.quantity, p.name as product_name
                FROM orders o
                JOIN users u ON o.user_id = u.id
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.id = $1
            `
        const orderResult = await client.query(orderQuery, [orderId])

        if (orderResult.rows.length === 0) {
          await client.query('ROLLBACK')
          return res.status(404).json({
            success: false,
            message: 'Order tidak ditemukan'
          })
        }

        const order = {
          id: orderResult.rows[0].id,
          order_code: orderResult.rows[0].order_code,
          user_id: orderResult.rows[0].user_id,
          final_amount: orderResult.rows[0].final_amount,
          items: orderResult.rows.map(row => ({
            product_id: row.product_id,
            quantity: row.quantity,
            product_name: row.product_name
          }))
        }

        // Group items by product_id
        const itemsByProduct = {}
        order.items.forEach(item => {
          if (!itemsByProduct[item.product_id]) {
            itemsByProduct[item.product_id] = {
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: 0
            }
          }
          itemsByProduct[item.product_id].quantity += item.quantity
        })

        const items = Object.values(itemsByProduct)

        // Jika status diubah menjadi 'paid', kurangi stok
        if (status === 'paid') {
          console.log('Processing as paid - reducing stock for items:', items)

          // Kurangi stok untuk setiap produk
          for (const item of items) {
            console.log(
              `Reducing stock for product ${item.product_name}: ${item.quantity} units`
            )

            try {
              // Lock product row untuk mencegah race condition
              const lockQuery =
                'SELECT * FROM products WHERE id = $1 FOR UPDATE'
              await client.query(lockQuery, [item.product_id])

              // Update stock
              const updateQuery = `
                            UPDATE products 
                            SET stock = stock - $1, 
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $2 AND is_active = true
                            RETURNING *
                        `

              const updateResult = await client.query(updateQuery, [
                item.quantity,
                item.product_id
              ])

              if (updateResult.rows.length === 0) {
                throw new Error(
                  `Product ${item.product_name} tidak ditemukan atau tidak aktif`
                )
              }

              const updatedProduct = updateResult.rows[0]
              console.log(
                `✓ Stock updated: ${item.product_name} = ${updatedProduct.stock}`
              )
            } catch (stockError) {
              console.error(
                `Error reducing stock for ${item.product_name}:`,
                stockError
              )
              await client.query('ROLLBACK')
              return res.status(400).json({
                success: false,
                message: `Gagal mengurangi stok: ${stockError.message}`
              })
            }
          }

          console.log('All stock reductions completed successfully')

          // Update status order
          const updateOrderQuery = `
                    UPDATE orders 
                    SET payment_status = 'paid', 
                        order_status = 'processing',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 
                    RETURNING *
                `

          const updateOrderResult = await client.query(updateOrderQuery, [
            orderId
          ])
          const updatedOrder = updateOrderResult.rows[0]

          // Ambil user info untuk notifikasi
          const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
          const userResult = await db.query(userQuery, [order.user_id])
          const user = userResult.rows[0]

          await client.query('COMMIT')

          // Kirim notifikasi
          if (user) {
            await orderService.sendPaymentSuccessNotification(
              updatedOrder,
              user,
              'Manual Update'
            )
            await orderService.sendAdminNotification(updatedOrder, user)
          }
        } else {
          // Untuk status selain 'paid', hanya update status
          const updateQuery = `
                    UPDATE orders 
                    SET payment_status = $1, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2 
                    RETURNING *
                `

          const updateResult = await client.query(updateQuery, [
            status,
            orderId
          ])
          await client.query('COMMIT')
        }

        // Get complete order dengan images
        const completeOrder = await orderService.getOrderById(orderId)

        // Generate full URL untuk product_image di setiap item
        if (
          completeOrder &&
          completeOrder.items &&
          Array.isArray(completeOrder.items)
        ) {
          completeOrder.items = completeOrder.items.map(item => ({
            ...item,
            product_image: generateImageUrl(req, item.product_image)
          }))
        }

        res.json({
          success: true,
          message: `Status berhasil diupdate ke ${status}`,
          data: completeOrder,
          stock_reduced: status === 'paid'
        })
      } catch (error) {
        await client.query('ROLLBACK')
        console.error('Error in quick update transaction:', error)
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error in quick update:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengupdate status',
        error: error.message
      })
    }
  }

  // Cancel order
  async cancelOrder (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      // Hanya bisa dibatalkan jika belum dibayar atau masih pending
      if (
        order.payment_status === 'paid' ||
        order.payment_status === 'settlement'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Order sudah dibayar dan tidak dapat dibatalkan'
        })
      }

      const updatedOrder = await orderService.updateOrderStatus(
        orderId,
        'cancelled'
      )

      // Get complete order dengan images
      const completeOrder = await orderService.getOrderById(orderId)

      // Generate full URL untuk product_image di setiap item
      if (
        completeOrder &&
        completeOrder.items &&
        Array.isArray(completeOrder.items)
      ) {
        completeOrder.items = completeOrder.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        message: 'Order berhasil dibatalkan',
        data: completeOrder
      })
    } catch (error) {
      console.error('Error cancelling order:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal membatalkan order',
        error: error.message
      })
    }
  }

  // Send WhatsApp reminder
  async sendOrderReminder (req, res) {
    try {
      const orderId = req.params.id

      const result = await orderService.sendWhatsAppReminder(orderId)

      res.json({
        success: true,
        message: 'WhatsApp reminder telah dikirim',
        data: result
      })
    } catch (error) {
      console.error('Error sending WhatsApp reminder:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengirim reminder',
        error: error.message
      })
    }
  }

  // Send receipt via WhatsApp
  async sendReceiptViaWhatsApp (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      // Hanya kirim receipt untuk order yang sudah dibayar
      if (
        order.payment_status !== 'paid' &&
        order.payment_status !== 'settlement'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Hanya bisa mengirim receipt untuk order yang sudah dibayar'
        })
      }

      const result = await orderService.sendReceiptViaWhatsApp(orderId)

      res.json({
        success: true,
        message: 'Struk telah dikirim via WhatsApp',
        data: result
      })
    } catch (error) {
      console.error('Error sending receipt via WhatsApp:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengirim struk',
        error: error.message
      })
    }
  }

  // Get order by ID
  async getOrderById (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      // Check Midtrans status jika masih pending
      if (order.payment_status === 'pending' && order.midtrans_transaction_id) {
        try {
          const midtransStatus = await orderService.checkPaymentStatus(orderId)

          // Jika status di Midtrans sudah settlement/capture, trigger update
          if (
            midtransStatus &&
            (midtransStatus.transaction_status === 'settlement' ||
              midtransStatus.transaction_status === 'capture')
          ) {
            console.log(`Order ${orderId} needs status sync from Midtrans`)
          }
        } catch (error) {
          console.error(
            'Error checking Midtrans status in getOrderById:',
            error
          )
        }
      }

      // Generate full URL untuk product_image di setiap item
      if (order.items && Array.isArray(order.items)) {
        order.items = order.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        data: order
      })
    } catch (error) {
      console.error('Error getting order:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data order',
        error: error.message
      })
    }
  }

  // Get user's orders
  async getUserOrders (req, res) {
    try {
      const userId = req.user.id
      const { limit = 10, page = 1, status } = req.query
      const offset = (page - 1) * limit

      let filters = {}
      if (status) {
        filters.order_status = status
      }

      const result = await orderService.getOrdersByUserId(
        userId,
        parseInt(limit),
        offset
      )

      // Generate full URL untuk product_image di setiap item
      const ordersWithImages = result.orders.map(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items = order.items.map(item => ({
            ...item,
            product_image: generateImageUrl(req, item.product_image)
          }))
        }
        return order
      })

      res.json({
        success: true,
        data: {
          orders: ordersWithImages,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
          }
        }
      })
    } catch (error) {
      console.error('Error getting user orders:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data order',
        error: error.message
      })
    }
  }

  // Get all orders (for admin)
  async getAllOrders (req, res) {
    try {
      const {
        limit = 20,
        page = 1,
        order_status,
        payment_status,
        start_date,
        end_date
      } = req.query
      const offset = (page - 1) * limit

      const filters = {}
      if (order_status) filters.order_status = order_status
      if (payment_status) filters.payment_status = payment_status
      if (start_date) filters.start_date = start_date
      if (end_date) filters.end_date = end_date

      const result = await orderService.getAllOrders(
        parseInt(limit),
        offset,
        filters
      )

      // Generate full URL untuk product_image di setiap item
      const ordersWithImages = result.orders.map(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items = order.items.map(item => ({
            ...item,
            product_image: generateImageUrl(req, item.product_image)
          }))
        }
        return order
      })

      res.json({
        success: true,
        data: {
          orders: ordersWithImages,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
          }
        }
      })
    } catch (error) {
      console.error('Error getting all orders:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data order',
        error: error.message
      })
    }
  }

  // Update order status
  async updateOrderStatus (req, res) {
    try {
      const orderId = req.params.id
      const { status } = req.body

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status order harus diisi'
        })
      }

      const allowedStatuses = [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled'
      ]
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status order tidak valid'
        })
      }

      const updatedOrder = await orderService.updateOrderStatus(orderId, status)

      if (!updatedOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      // Get complete order dengan images
      const completeOrder = await orderService.getOrderById(orderId)

      // Generate full URL untuk product_image di setiap item
      if (
        completeOrder &&
        completeOrder.items &&
        Array.isArray(completeOrder.items)
      ) {
        completeOrder.items = completeOrder.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        message: 'Status order berhasil diperbarui',
        data: completeOrder
      })
    } catch (error) {
      console.error('Error updating order status:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal memperbarui status order',
        error: error.message
      })
    }
  }

  // Update payment status (dengan pengurangan stok)
  async updatePaymentStatus (req, res) {
    try {
      const orderId = req.params.id
      const { payment_status } = req.body

      if (!payment_status) {
        return res.status(400).json({
          success: false,
          message: 'Status pembayaran harus diisi'
        })
      }

      const allowedStatuses = [
        'pending',
        'paid',
        'failed',
        'refunded',
        'challenge'
      ]
      if (!allowedStatuses.includes(payment_status)) {
        return res.status(400).json({
          success: false,
          message: 'Status pembayaran tidak valid'
        })
      }

      // Gunakan method baru yang menangani stok
      const updatedOrder = await orderService.updatePaymentStatusManually(
        orderId,
        payment_status
      )

      if (!updatedOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      // Get complete order dengan images
      const completeOrder = await orderService.getOrderById(orderId)

      // Generate full URL untuk product_image di setiap item
      if (
        completeOrder &&
        completeOrder.items &&
        Array.isArray(completeOrder.items)
      ) {
        completeOrder.items = completeOrder.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        message: 'Status pembayaran berhasil diperbarui',
        data: completeOrder
      })
    } catch (error) {
      console.error('Error updating payment status:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal memperbarui status pembayaran',
        error: error.message
      })
    }
  }

  // Upload payment proof
  async uploadPaymentProof (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Bukti pembayaran harus diunggah'
        })
      }

      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      const paymentProof = `/uploads/payment-proofs/${req.file.filename}`
      const updatedOrder = await orderService.updatePaymentStatus(
        orderId,
        'pending',
        paymentProof
      )

      // Get complete order dengan images
      const completeOrder = await orderService.getOrderById(orderId)

      // Generate full URL untuk product_image di setiap item
      if (
        completeOrder &&
        completeOrder.items &&
        Array.isArray(completeOrder.items)
      ) {
        completeOrder.items = completeOrder.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        message: 'Bukti pembayaran berhasil diunggah',
        data: completeOrder
      })
    } catch (error) {
      console.error('Error uploading payment proof:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengunggah bukti pembayaran',
        error: error.message
      })
    }
  }

  // Delete order
  async deleteOrder (req, res) {
    try {
      const orderId = req.params.id

      const deletedOrder = await orderService.deleteOrder(orderId)

      if (!deletedOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      // Get complete order dengan images sebelum dihapus
      const completeOrder = await orderService.getOrderById(orderId)

      // Generate full URL untuk product_image di setiap item
      if (
        completeOrder &&
        completeOrder.items &&
        Array.isArray(completeOrder.items)
      ) {
        completeOrder.items = completeOrder.items.map(item => ({
          ...item,
          product_image: generateImageUrl(req, item.product_image)
        }))
      }

      res.json({
        success: true,
        message: 'Order berhasil dihapus',
        data: completeOrder
      })
    } catch (error) {
      console.error('Error deleting order:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal menghapus order',
        error: error.message
      })
    }
  }

  // Get all orders for admin (with more details)
  async getAllOrdersForAdmin (req, res) {
    try {
      const { limit = 50, page = 1, ...filters } = req.query
      const offset = (page - 1) * limit

      const result = await orderService.getAllOrders(
        parseInt(limit),
        offset,
        filters
      )

      // Generate full URL untuk product_image di setiap item
      const ordersWithImages = result.orders.map(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items = order.items.map(item => ({
            ...item,
            product_image: generateImageUrl(req, item.product_image)
          }))
        }
        return order
      })

      res.json({
        success: true,
        data: {
          orders: ordersWithImages,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
          }
        }
      })
    } catch (error) {
      console.error('Error getting admin orders:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data order',
        error: error.message
      })
    }
  }

  // Export orders to CSV/Excel (for admin)
  async exportOrders (req, res) {
    try {
      const { start_date, end_date, format = 'csv' } = req.query

      let query = `
                SELECT 
                    o.order_code,
                    o.created_at,
                    u.full_name as customer_name,
                    u.phone as customer_phone,
                    o.shipping_address,
                    o.shipping_phone,
                    o.total_amount,
                    o.shipping_cost,
                    o.final_amount,
                    o.payment_status,
                    o.order_status,
                    o.payment_method,
                    o.payment_type,
                    o.notes
                FROM orders o
                JOIN users u ON o.user_id = u.id
                WHERE 1=1
            `

      const values = []
      let paramCount = 1

      if (start_date) {
        query += ` AND o.created_at >= $${paramCount}`
        values.push(start_date)
        paramCount++
      }

      if (end_date) {
        query += ` AND o.created_at <= $${paramCount}`
        values.push(end_date)
        paramCount++
      }

      query += ` ORDER BY o.created_at DESC`

      const result = await db.query(query, values)
      const orders = result.rows

      if (format === 'json') {
        return res.json({
          success: true,
          data: orders,
          count: orders.length
        })
      }

      // Convert to CSV
      const headers = [
        'Order Code',
        'Date',
        'Customer Name',
        'Customer Phone',
        'Shipping Address',
        'Shipping Phone',
        'Total Amount',
        'Shipping Cost',
        'Final Amount',
        'Payment Status',
        'Order Status',
        'Payment Method',
        'Payment Type',
        'Notes'
      ]

      const csvRows = orders.map(order => [
        order.order_code,
        new Date(order.created_at).toLocaleDateString('id-ID'),
        order.customer_name,
        order.customer_phone,
        order.shipping_address,
        order.shipping_phone,
        order.total_amount,
        order.shipping_cost,
        order.final_amount,
        order.payment_status,
        order.order_status,
        order.payment_method,
        order.payment_type,
        order.notes || ''
      ])

      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=orders_${
          new Date().toISOString().split('T')[0]
        }.csv`
      )

      res.send(csvContent)
    } catch (error) {
      console.error('Error exporting orders:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengekspor data order',
        error: error.message
      })
    }
  }

  // Bulk update order status (for admin)
  async bulkUpdateOrderStatus (req, res) {
    try {
      const { order_ids, status } = req.body

      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Order IDs harus diisi dan berupa array'
        })
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status order harus diisi'
        })
      }

      const allowedStatuses = [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled'
      ]
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status order tidak valid'
        })
      }

      const client = await db.connect()

      try {
        await client.query('BEGIN')

        const updatedOrders = []

        for (const orderId of order_ids) {
          const query = `
                        UPDATE orders 
                        SET order_status = $1, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = $2 
                        RETURNING *
                    `

          const result = await client.query(query, [status, orderId])

          if (result.rows.length > 0) {
            const order = result.rows[0]

            // Get user info for notification
            const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
            const userResult = await client.query(userQuery, [order.user_id])

            if (userResult.rows.length > 0) {
              const user = userResult.rows[0]

              // Send WhatsApp notification for status updates
              if (status === 'shipped' || status === 'delivered') {
                await orderService.sendOrderStatusUpdateNotification(
                  order,
                  user,
                  status
                )
              }
            }

            updatedOrders.push(order)
          }
        }

        await client.query('COMMIT')

        res.json({
          success: true,
          message: `${updatedOrders.length} order berhasil diperbarui`,
          data: {
            updated_count: updatedOrders.length,
            orders: updatedOrders
          }
        })
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error bulk updating order status:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal memperbarui status order secara massal',
        error: error.message
      })
    }
  }

  // Get order by order code (public)
  async getOrderByCode (req, res) {
    try {
      const orderCode = req.params.code

      const query = `
                SELECT o.*, 
                       u.full_name as user_name,
                       u.phone as user_phone
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                WHERE o.order_code = $1
            `

      const result = await db.query(query, [orderCode])

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      const order = result.rows[0]

      // Get order items
      const itemsQuery = `
                SELECT 
                    oi.*,
                    p.image as product_image
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
                ORDER BY oi.created_at
            `

      const itemsResult = await db.query(itemsQuery, [order.id])
      order.items = itemsResult.rows.map(item => ({
        ...item,
        product_image: generateImageUrl(req, item.product_image)
      }))

      res.json({
        success: true,
        data: order
      })
    } catch (error) {
      console.error('Error getting order by code:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data order',
        error: error.message
      })
    }
  }

  // Resend payment notification
  async resendPaymentNotification (req, res) {
    try {
      const orderId = req.params.id
      const userId = req.user.id

      const order = await orderService.getOrderById(orderId)

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order tidak ditemukan'
        })
      }

      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        })
      }

      // Get user info
      const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
      const userResult = await db.query(userQuery, [order.user_id])

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User tidak ditemukan'
        })
      }

      const user = userResult.rows[0]

      // Send payment notification
      const result = await orderService.sendWhatsAppReminder(orderId)

      res.json({
        success: true,
        message: 'Notifikasi pembayaran berhasil dikirim ulang',
        data: result
      })
    } catch (error) {
      console.error('Error resending payment notification:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengirim ulang notifikasi',
        error: error.message
      })
    }
  }

  // Get admin phone numbers for notification
  async getAdminPhones (req, res) {
    try {
      const query = 'SELECT phone FROM users WHERE role = $1'
      const result = await db.query(query, ['admin'])

      const adminPhones = result.rows.map(row => row.phone)

      res.json({
        success: true,
        data: adminPhones
      })
    } catch (error) {
      console.error('Error getting admin phones:', error)
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil nomor admin',
        error: error.message
      })
    }
  }
}

export default new OrderController()
