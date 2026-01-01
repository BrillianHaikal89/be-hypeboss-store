// src/modules/orders/orders.service.js
import db from '../../config/db.js'
import midtransClient from 'midtrans-client'
import fonnteService from '../../utils/fonnteService.js'

class OrderService {
  constructor () {
    // Konfigurasi Midtrans untuk localhost
    const isProduction = process.env.MIDTRANS_PRODUCTION === 'true'
    const serverKey = process.env.MIDTRANS_SERVER_KEY
    const clientKey = process.env.MIDTRANS_CLIENT_KEY

    console.log('Midtrans Config:', {
      isProduction,
      serverKey: serverKey ? '***' + serverKey.slice(-4) : 'not set',
      clientKey: clientKey ? '***' + clientKey.slice(-4) : 'not set'
    })

    this.snap = new midtransClient.Snap({
      isProduction: isProduction,
      serverKey: serverKey,
      clientKey: clientKey
    })

    // Konfigurasi untuk Core API
    this.coreApi = new midtransClient.CoreApi({
      isProduction: isProduction,
      serverKey: serverKey,
      clientKey: clientKey
    })
  }

  // Generate unique order code
  generateOrderCode () {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')
    return `ORD${timestamp}${random}`
  }

  // Get product details by ID
  async getProductById (productId) {
    try {
      const query = `
                SELECT p.*, c.name as category_name 
                FROM products p 
                LEFT JOIN categories c ON p.category_id = c.id 
                WHERE p.id = $1
            `
      const result = await db.query(query, [productId])
      return result.rows[0]
    } catch (error) {
      console.error('Error getting product by ID:', error)
      throw error
    }
  }

  // Get multiple products by IDs
  async getProductsByIds (productIds) {
    try {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return []
      }

      const query = `
                SELECT p.*, c.name as category_name 
                FROM products p 
                LEFT JOIN categories c ON p.category_id = c.id 
                WHERE p.id = ANY($1::int[])
                AND p.is_active = true
            `
      const result = await db.query(query, [productIds])
      return result.rows
    } catch (error) {
      console.error('Error getting products by IDs:', error)
      throw error
    }
  }

  // Check stock availability for products
  async checkStockAvailability (productQuantities) {
    try {
      const productIds = productQuantities.map(item => item.product_id)
      const products = await this.getProductsByIds(productIds)

      const insufficientStock = []
      const availableProducts = []

      for (const item of productQuantities) {
        const product = products.find(p => p.id === item.product_id)

        if (!product) {
          insufficientStock.push({
            product_id: item.product_id,
            message: 'Product not found or inactive',
            available: false
          })
          continue
        }

        if (product.stock < item.quantity) {
          insufficientStock.push({
            product_id: item.product_id,
            product_name: product.name,
            requested: item.quantity,
            available: product.stock,
            message: `Insufficient stock. Available: ${product.stock}, Requested: ${item.quantity}`
          })
        } else {
          availableProducts.push({
            product_id: item.product_id,
            product_name: product.name,
            quantity: item.quantity,
            price: product.price,
            discount_price: product.discount_price,
            image: product.image,
            stock: product.stock
          })
        }
      }

      return {
        allAvailable: insufficientStock.length === 0,
        insufficientStock,
        availableProducts
      }
    } catch (error) {
      console.error('Error checking stock availability:', error)
      throw error
    }
  }

  // Create new order
  async createOrder (userId, orderData, cartItems) {
    const client = await db.connect()

    try {
      console.log('Starting create order for user:', userId)

      if (!Array.isArray(cartItems)) {
        throw new Error('cartItems harus berupa array')
      }

      // Convert cart items to product quantities for stock check
      const productQuantities = cartItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      }))

      // Check stock availability
      const stockCheck = await this.checkStockAvailability(productQuantities)

      if (!stockCheck.allAvailable) {
        throw new Error(
          `Stock tidak mencukupi untuk produk: ${stockCheck.insufficientStock
            .map(item => item.product_name || item.product_id)
            .join(', ')}`
        )
      }

      await client.query('BEGIN')

      // Generate order code
      const orderCode = this.generateOrderCode()

      // Calculate totals
      let totalAmount = 0
      let totalDiscount = 0
      let totalOriginalPrice = 0
      const orderItems = []

      // Get all product details for calculation
      const productIds = cartItems.map(item => item.product_id)
      const products = await this.getProductsByIds(productIds)

      // Prepare order items from cart
      console.log('Processing cart items...')
      for (const item of cartItems) {
        const product = products.find(p => p.id === item.product_id)

        if (!product) {
          throw new Error(
            `Produk dengan ID ${item.product_id} tidak ditemukan atau tidak aktif`
          )
        }

        const quantity = item.quantity
        const originalPrice = parseFloat(product.price)
        const discountPrice = product.discount_price
          ? parseFloat(product.discount_price)
          : 0
        const finalPrice = originalPrice - discountPrice
        const safeFinalPrice = finalPrice > 0 ? finalPrice : originalPrice

        const subtotal = safeFinalPrice * quantity
        const itemDiscount = discountPrice * quantity
        const itemOriginalPrice = originalPrice * quantity

        console.log(`Product: ${product.name}`)
        console.log(`  Original Price: ${originalPrice}`)
        console.log(`  Discount Price: ${discountPrice}`)
        console.log(`  Final Price: ${safeFinalPrice}`)
        console.log(`  Quantity: ${quantity}`)
        console.log(`  Subtotal: ${subtotal}`)
        console.log(`  Item Discount: ${itemDiscount}`)
        console.log(`  Item Original: ${itemOriginalPrice}`)
        console.log(`  Available Stock: ${product.stock}`)

        totalAmount += subtotal
        totalDiscount += itemDiscount
        totalOriginalPrice += itemOriginalPrice

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_price: safeFinalPrice,
          original_price: originalPrice,
          discount_price: discountPrice,
          quantity: quantity,
          subtotal: subtotal,
          product_image: product.image
        })
      }

      console.log('=== ORDER SUMMARY ===')
      console.log('Total Original Price:', totalOriginalPrice)
      console.log('Total Discount:', totalDiscount)
      console.log('Total Amount (after discount):', totalAmount)

      const shippingCost = orderData.shipping_cost || 0
      const finalAmount = totalAmount + shippingCost

      console.log('Shipping cost:', shippingCost)
      console.log('Final amount:', finalAmount)

      // Insert order
      const orderQuery = `
                INSERT INTO orders (
                    order_code, user_id, total_amount, shipping_cost, 
                    final_amount, shipping_address, shipping_phone, notes,
                    order_status, payment_status, payment_method,
                    midtrans_transaction_id, payment_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
            `

      const orderValues = [
        orderCode,
        userId,
        totalAmount,
        shippingCost,
        finalAmount,
        orderData.shipping_address,
        orderData.shipping_phone,
        orderData.notes || null,
        'pending', // order_status awal
        'pending', // payment_status awal
        orderData.payment_method || 'bank_transfer',
        null,
        null
      ]

      console.log('Inserting order with values:', orderValues)

      const orderResult = await client.query(orderQuery, orderValues)
      const order = orderResult.rows[0]

      console.log('Order created with ID:', order.id)

      // Insert order items dengan semua data harga
      console.log('Inserting order items...')
      for (const item of orderItems) {
        const itemQuery = `
                    INSERT INTO order_items (
                        order_id, product_id, product_name, 
                        product_price, original_price, discount_value,
                        quantity, subtotal, product_image
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `

        const itemValues = [
          order.id,
          item.product_id,
          item.product_name,
          item.product_price,
          item.original_price,
          item.discount_price,
          item.quantity,
          item.subtotal,
          item.product_image
        ]

        console.log('Inserting order item:', itemValues)
        await client.query(itemQuery, itemValues)
      }

      // Clear user's cart
      console.log('Clearing user cart for user:', userId)
      await client.query('DELETE FROM carts WHERE user_id = $1', [userId])

      await client.query('COMMIT')
      console.log('Transaction committed successfully')

      // Get complete order with items
      const completeOrder = await this.getOrderById(order.id)

      // Tambahkan summary untuk response
      completeOrder.summary = {
        total_original_price: totalOriginalPrice,
        total_discount: totalDiscount,
        total_after_discount: totalAmount,
        shipping_cost: shippingCost,
        final_amount: finalAmount
      }

      return {
        success: true,
        order: completeOrder
      }
    } catch (error) {
      console.error('Error in createOrder:', error)
      console.error('Error stack:', error.stack)
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Create Midtrans transaction - MODIFIKASI UNTUK LOCALHOST

  // Format nomor WhatsApp untuk Fonnte
  formatWhatsAppNumber (phone) {
    let cleaned = phone.replace(/\D/g, '')

    // Fonnte menggunakan format 628xxx tanpa +62
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1)
    }

    if (cleaned.startsWith('+62')) {
      cleaned = cleaned.substring(1)
    }

    if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned
    }

    return cleaned
  }

  // Update Midtrans transaction ID ke database

  // Handle Midtrans notification - MODIFIKASI UNTUK LOCALHOST DEBUG

  // Method untuk memproses pembayaran berhasil (kurangi stok)
  async processSuccessfulPayment (orderId, client) {
    try {
      console.log(`Processing successful payment for order ${orderId}`)

      // Ambil semua item dari order
      const itemsQuery = 'SELECT * FROM order_items WHERE order_id = $1'
      const itemsResult = await client.query(itemsQuery, [orderId])

      if (itemsResult.rows.length === 0) {
        console.log(`No items found for order ${orderId}`)
        return true
      }

      // Kurangi stok untuk setiap produk
      for (const item of itemsResult.rows) {
        console.log(
          `Reducing stock for product ${item.product_id} by ${item.quantity}`
        )

        try {
          // Cek stok terlebih dahulu dengan FOR UPDATE
          const checkQuery = `
                        SELECT stock, name, is_active 
                        FROM products 
                        WHERE id = $1 
                        FOR UPDATE
                    `
          const checkResult = await client.query(checkQuery, [item.product_id])

          if (checkResult.rows.length === 0) {
            console.error(`Product ${item.product_id} not found`)
            throw new Error(
              `Product dengan ID ${item.product_id} tidak ditemukan`
            )
          }

          const product = checkResult.rows[0]

          if (!product.is_active) {
            console.error(`Product ${product.name} is inactive`)
            throw new Error(`Produk ${product.name} tidak aktif`)
          }

          if (product.stock < item.quantity) {
            throw new Error(
              `Stok tidak mencukupi untuk produk ${product.name}. Tersedia: ${product.stock}, Dibutuhkan: ${item.quantity}`
            )
          }

          // Update stok
          const updateQuery = `
                        UPDATE products 
                        SET stock = stock - $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                        RETURNING *
                    `

          const updateResult = await client.query(updateQuery, [
            item.quantity,
            item.product_id
          ])

          console.log(
            `Successfully reduced stock for product ${product.name}. New stock: ${updateResult.rows[0].stock}`
          )
        } catch (productError) {
          console.error(
            `Error reducing stock for product ${item.product_id}:`,
            productError
          )
          throw productError
        }
      }

      return true
    } catch (error) {
      console.error('Error in processSuccessfulPayment:', error)
      throw error
    }
  }

  // Method untuk memproses pembatalan (kembalikan stok)
  async processCancelledPayment (orderId, client) {
    try {
      console.log(`Processing cancelled payment for order ${orderId}`)

      // Cek apakah order sebelumnya sudah berstatus 'paid'
      const orderCheckQuery = 'SELECT payment_status FROM orders WHERE id = $1'
      const orderCheckResult = await client.query(orderCheckQuery, [orderId])

      // Hanya kembalikan stok jika sebelumnya statusnya 'paid'
      if (
        orderCheckResult.rows.length > 0 &&
        orderCheckResult.rows[0].payment_status === 'paid'
      ) {
        const itemsQuery = 'SELECT * FROM order_items WHERE order_id = $1'
        const itemsResult = await client.query(itemsQuery, [orderId])

        // Kembalikan stok untuk setiap produk
        for (const item of itemsResult.rows) {
          console.log(
            `Returning stock for product ${item.product_id} by ${item.quantity}`
          )

          try {
            // Cek apakah produk masih ada dan aktif
            const checkQuery = `
                            SELECT id, name, is_active 
                            FROM products 
                            WHERE id = $1 
                            FOR UPDATE
                        `
            const checkResult = await client.query(checkQuery, [
              item.product_id
            ])

            if (checkResult.rows.length === 0) {
              console.error(`Product ${item.product_id} not found`)
              continue
            }

            if (!checkResult.rows[0].is_active) {
              console.error(`Product ${checkResult.rows[0].name} is inactive`)
              continue
            }

            const returnStockQuery = `
                            UPDATE products 
                            SET stock = stock + $1,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $2
                            RETURNING *
                        `

            const returnResult = await client.query(returnStockQuery, [
              item.quantity,
              item.product_id
            ])
            console.log(
              `Successfully returned stock for product ${checkResult.rows[0].name}. New stock: ${returnResult.rows[0].stock}`
            )
          } catch (returnError) {
            console.error(
              `Error returning stock for product ${item.product_id}:`,
              returnError
            )
            // Lanjutkan ke produk berikutnya meskipun ada error
            continue
          }
        }
      } else {
        console.log(
          `Order ${orderId} was not previously paid. No stock to return.`
        )
      }

      return true
    } catch (error) {
      console.error('Error in processCancelledPayment:', error)
      throw error
    }
  }

  // Update payment status manually (dengan pengurangan stok)
  async updatePaymentStatusManually (orderId, paymentStatus) {
    try {
      const client = await db.connect()

      try {
        await client.query('BEGIN')

        const order = await this.getOrderById(orderId)
        if (!order) {
          throw new Error('Order not found')
        }

        console.log(
          `Manually updating payment status for order ${orderId} from ${order.payment_status} to ${paymentStatus}`
        )

        let newOrderStatus = order.order_status

        // Jika mengubah ke status 'paid', kurangi stok dan update order status
        if (paymentStatus === 'paid' && order.payment_status !== 'paid') {
          console.log('Processing payment as paid - reducing stock')
          await this.processSuccessfulPayment(orderId, client)
          newOrderStatus = 'processing'

          // Ambil data user untuk notifikasi
          const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
          const userResult = await db.query(userQuery, [order.user_id])
          const user = userResult.rows[0]

          if (user) {
            // Kirim notifikasi kepada pembeli
            await this.sendPaymentSuccessNotification(
              order,
              user,
              'Manual Update'
            )

            // Kirim notifikasi ke admin
            await this.sendAdminNotification(order, user)
          }
        }

        // Jika mengubah dari 'paid' ke status lain, kembalikan stok
        if (order.payment_status === 'paid' && paymentStatus !== 'paid') {
          console.log('Reverting from paid status - returning stock')
          await this.processCancelledPayment(orderId, client)
          newOrderStatus = 'cancelled'
        }

        // Update status pembayaran dan order
        const query = `
                    UPDATE orders 
                    SET payment_status = $1, 
                        order_status = $2,
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $3 
                    RETURNING *
                `

        const result = await client.query(query, [
          paymentStatus,
          newOrderStatus,
          orderId
        ])

        await client.query('COMMIT')

        return result.rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      throw new Error(`Error updating payment status: ${error.message}`)
    }
  }

  // Kirim notifikasi WhatsApp kepada admin
  async sendAdminNotification (order, customer) {
    try {
      console.log('Sending notification to admin...')

      // Ambil semua nomor admin
      const adminQuery = 'SELECT phone, full_name FROM users WHERE role = $1'
      const adminResult = await db.query(adminQuery, ['admin'])

      if (adminResult.rows.length === 0) {
        console.log('No admin users found')
        return { success: false, message: 'No admin users found' }
      }

      let successfulSends = 0
      let failedSends = 0

      // Kirim notifikasi ke setiap admin
      for (const admin of adminResult.rows) {
        try {
          const phoneNumber = this.formatWhatsAppNumber(admin.phone)
          const message = this.createAdminNotificationMessage(
            order,
            customer,
            admin.full_name
          )

          console.log(`Sending admin notification to ${phoneNumber}`)

          const result = await fonnteService.sendMessage(phoneNumber, message)

          if (result.status === true) {
            successfulSends++
            console.log(
              `Admin notification sent to ${admin.full_name} (${phoneNumber})`
            )
          } else {
            failedSends++
            console.error(
              `Failed to send admin notification to ${admin.full_name} (${phoneNumber})`
            )
          }
        } catch (error) {
          console.error(
            `Error sending admin notification to ${admin.full_name}:`,
            error
          )
          failedSends++
        }
      }

      console.log(
        `Admin notifications: ${successfulSends} successful, ${failedSends} failed`
      )

      return {
        success: true,
        sent_count: successfulSends,
        failed_count: failedSends
      }
    } catch (error) {
      console.error('Error sending admin notifications:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Buat pesan notifikasi untuk admin
  createAdminNotificationMessage (order, customer, adminName) {
    const itemsList = order.items
      .map(
        (item, index) =>
          `${index + 1}. ${item.product_name} (${
            item.quantity
          } x Rp ${item.product_price.toLocaleString('id-ID')})`
      )
      .join('\n')

    return `🛒 *ORDER BARU TELAH DIBAYAR* - ${
      process.env.STORE_NAME || 'BOSS STORE'
    }

Halo ${adminName},

Ada order baru yang telah berhasil dibayar dan memerlukan perhatian Anda:

📋 *Detail Order:*
🆔 Order ID: ${order.order_code}
👤 Customer: ${customer.full_name}
📱 Telp Customer: ${customer.phone}
📅 Tanggal Order: ${new Date(order.created_at).toLocaleDateString('id-ID')}
📍 Alamat Pengiriman: ${order.shipping_address}

🛍️ *Items Pesanan:*
${itemsList}

💰 *Ringkasan Pembayaran:*
Total Belanja: Rp ${order.total_amount.toLocaleString('id-ID')}
Ongkir: Rp ${order.shipping_cost.toLocaleString('id-ID')}
*Total Bayar: Rp ${order.final_amount.toLocaleString('id-ID')}*

📊 *Status:*
✅ Pembayaran: SUDAH DIBAYAR
📦 Order: MENUNGGU PROSES

🚀 *Tindakan yang diperlukan:*
1. Siapkan produk sesuai pesanan
2. Update status order menjadi "processing"
3. Persiapkan pengiriman

🔗 *Akses Order:*
${
  process.env.ADMIN_URL || process.env.FRONTEND_URL || 'http://localhost:3000'
}/orders/${order.id}

Mohon segera diproses ya! 😊

_Notifikasi ini dikirim otomatis oleh sistem_`
  }

  // Kirim notifikasi WhatsApp kepada pembeli jika pembayaran berhasil
  async sendPaymentSuccessNotification (
    order,
    user,
    paymentType = 'Transfer Bank'
  ) {
    try {
      const phoneNumber = this.formatWhatsAppNumber(user.phone)
      const message = this.createPaymentSuccessMessage(order, user, paymentType)

      console.log(`Sending payment success notification to ${phoneNumber}`)

      const result = await fonnteService.sendMessage(phoneNumber, message)
      console.log(
        `WhatsApp payment success notification sent to customer ${user.full_name} (${phoneNumber}):`,
        result
      )

      return {
        success: true,
        fonnteResult: result
      }
    } catch (error) {
      console.error(
        'Error sending WhatsApp payment success notification:',
        error
      )
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Kirim notifikasi WhatsApp kepada pembeli jika pembayaran pending
  async sendPaymentPendingNotification (order, user) {
    try {
      const phoneNumber = this.formatWhatsAppNumber(user.phone)
      const message = this.createPaymentPendingMessage(order, user)

      const result = await fonnteService.sendMessage(phoneNumber, message)
      console.log(
        `WhatsApp payment pending notification sent to ${phoneNumber}:`,
        result
      )

      return {
        success: true,
        fonnteResult: result
      }
    } catch (error) {
      console.error(
        'Error sending WhatsApp payment pending notification:',
        error
      )
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Buat pesan untuk pembayaran berhasil kepada pembeli
  createPaymentSuccessMessage (order, user, paymentType) {
    const itemsList = order.items
      .map(
        (item, index) =>
          `${index + 1}. ${item.product_name} (${
            item.quantity
          } x Rp ${item.product_price.toLocaleString('id-ID')})`
      )
      .join('\n')

    return `✅ *PEMBAYARAN BERHASIL - ${process.env.STORE_NAME || 'BOSS STORE'}*

Halo ${user.full_name},

Pembayaran Anda untuk pesanan *${order.order_code}* telah berhasil kami terima.

💰 *Detail Pembayaran:*
ID Pesanan: ${order.order_code}
Jumlah: Rp ${order.final_amount.toLocaleString('id-ID')}
Metode: ${paymentType}
Tanggal: ${new Date().toLocaleDateString('id-ID')}

🛒 *Items Pesanan:*
${itemsList}

📦 *Status Pesanan:*
Pesanan Anda sekarang dalam status *"Diproses"* dan akan segera kami siapkan untuk pengiriman.

⏰ *Estimasi Pengiriman:*
2-3 hari kerja (tergantung lokasi pengiriman)

📞 *Hubungi Kami:*
Jika ada pertanyaan, hubungi customer service kami di:
${process.env.STORE_PHONE || '081234567890'}

Terima kasih telah berbelanja di ${process.env.STORE_NAME || 'BOSS STORE'}! 🙏

_Lacak pesanan Anda di: ${
      process.env.FRONTEND_URL || 'http://localhost:3000'
    }/order/${order.id}_`
  }

  // Buat pesan untuk pembayaran pending kepada pembeli
  createPaymentPendingMessage (order, user) {
    return `⏳ *PEMBAYARAN TERTUNDA - ${process.env.STORE_NAME || 'BOSS STORE'}*

Halo ${user.full_name},

Pembayaran untuk Order ID: ${order.order_code} masih dalam proses.

💰 Total: Rp ${order.final_amount.toLocaleString('id-ID')}
⏰ Batas waktu: 24 jam sejak pemesanan

Silakan selesaikan pembayaran Anda di:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${order.id}/pay

_Mohon abaikan pesan ini jika sudah melakukan pembayaran._

Terima kasih,
${process.env.STORE_NAME || 'BOSS STORE'} Team`
  }

  // Check payment status dari Midtrans - MODIFIKASI UNTUK LOCALHOST

  // Tambahkan di orders.service.js
  async processMidtransResponse (transactionData) {
    try {
      const {
        order_id,
        transaction_status,
        fraud_status,
        payment_type,
        transaction_id,
        gross_amount
      } = transactionData

      console.log(`🔄 Processing Midtrans response for order: ${order_id}`)
      console.log('Transaction data:', transactionData)

      // Cari order berdasarkan order_code
      const query = 'SELECT * FROM orders WHERE order_code = $1'
      const result = await db.query(query, [order_id])

      if (result.rows.length === 0) {
        console.error(`Order ${order_id} not found in database`)
        return { success: false, message: 'Order not found' }
      }

      const order = result.rows[0]
      const client = await db.connect()

      try {
        await client.query('BEGIN')

        // Update berdasarkan status transaksi
        let paymentStatus = 'pending'
        let orderStatus = 'pending'

        switch (transaction_status) {
          case 'capture':
            if (fraud_status === 'challenge') {
              paymentStatus = 'challenge'
              orderStatus = 'pending'
            } else if (fraud_status === 'accept') {
              paymentStatus = 'paid'
              orderStatus = 'processing'

              // Kurangi stok
              await this.processSuccessfulPayment(order.id, client)
            }
            break

          case 'settlement':
            paymentStatus = 'paid'
            orderStatus = 'processing'

            // Kurangi stok
            await this.processSuccessfulPayment(order.id, client)
            break

          case 'pending':
            paymentStatus = 'pending'
            orderStatus = 'pending'
            break

          case 'deny':
          case 'cancel':
          case 'expire':
            paymentStatus = 'failed'
            orderStatus = 'cancelled'

            // Jika sebelumnya sudah paid, kembalikan stok
            if (order.payment_status === 'paid') {
              await this.processCancelledPayment(order.id, client)
            }
            break

          case 'refund':
          case 'partial_refund':
            paymentStatus = 'refunded'
            orderStatus = 'cancelled'
            break
        }

        // Update order di database
        const updateQuery = `
        UPDATE orders 
        SET payment_status = $1,
            order_status = $2,
            midtrans_transaction_id = $3,
            payment_type = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `

        const updateResult = await client.query(updateQuery, [
          paymentStatus,
          orderStatus,
          transaction_id,
          payment_type,
          order.id
        ])

        const updatedOrder = updateResult.rows[0]

        // Kirim notifikasi jika pembayaran berhasil
        if (paymentStatus === 'paid') {
          const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
          const userResult = await db.query(userQuery, [order.user_id])

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0]

            // Kirim notifikasi ke pembeli
            await this.sendPaymentSuccessNotification(
              updatedOrder,
              user,
              payment_type
            )

            // Kirim notifikasi ke admin
            await this.sendAdminNotification(updatedOrder, user)
          }
        }

        await client.query('COMMIT')

        return {
          success: true,
          order: updatedOrder,
          payment_status: paymentStatus,
          order_status: orderStatus
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error processing Midtrans response:', error)
      throw error
    }
  }

  // Get order by ID with items
  async getOrderById (orderId) {
    try {
      const orderQuery = `
                SELECT o.*, 
                       u.full_name as user_name,
                       u.phone as user_phone
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                WHERE o.id = $1
            `

      const orderResult = await db.query(orderQuery, [orderId])

      if (orderResult.rows.length === 0) {
        return null
      }

      const order = orderResult.rows[0]

      // Ambil semua data harga yang diperlukan
      const itemsQuery = `
                SELECT 
                    oi.*,
                    p.image as product_image,
                    p.price as product_original_price,
                    (oi.original_price - oi.product_price) as discount_per_item
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
                ORDER BY oi.created_at
            `

      const itemsResult = await db.query(itemsQuery, [orderId])

      // Format items dengan data lengkap
      order.items = itemsResult.rows.map(item => {
        const originalPrice = parseFloat(
          item.original_price ||
            item.product_original_price ||
            item.product_price
        )
        const finalPrice = parseFloat(item.product_price)
        const discountValue = parseFloat(
          item.discount_value || item.discount_per_item || 0
        )
        const quantity = parseInt(item.quantity)
        const subtotal = parseFloat(item.subtotal)

        return {
          id: item.id,
          order_id: item.order_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_price: finalPrice,
          original_price: originalPrice,
          discount_price: discountValue,
          quantity: quantity,
          subtotal: subtotal,
          product_image: item.product_image,
          created_at: item.created_at,
          updated_at: item.updated_at
        }
      })

      // Tambahkan summary untuk frontend
      order.summary = {
        total_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
        total_original_price: order.items.reduce(
          (sum, item) => sum + item.original_price * item.quantity,
          0
        ),
        total_discount: order.items.reduce(
          (sum, item) => sum + (item.discount_price || 0) * item.quantity,
          0
        )
      }

      return order
    } catch (error) {
      console.error('Error in getOrderById:', error)
      throw error
    }
  }

  // Get orders by user ID
  async getOrdersByUserId (userId, limit = 10, offset = 0) {
    try {
      const query = `
                SELECT o.*, 
                       COUNT(*) OVER() as total_count
                FROM orders o
                WHERE o.user_id = $1
                ORDER BY o.created_at DESC
                LIMIT $2 OFFSET $3
            `

      const result = await db.query(query, [userId, limit, offset])

      const orders = result.rows
      for (const order of orders) {
        const itemsQuery = `
                    SELECT 
                        oi.*,
                        p.image as product_image,
                        p.price as product_original_price,
                        (oi.original_price - oi.product_price) as discount_per_item
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = $1
                `
        const itemsResult = await db.query(itemsQuery, [order.id])

        order.items = itemsResult.rows.map(item => ({
          ...item,
          original_price: parseFloat(
            item.original_price ||
              item.product_original_price ||
              item.product_price
          ),
          discount_price: parseFloat(
            item.discount_value || item.discount_per_item || 0
          )
        }))

        // Tambahkan summary untuk setiap order
        order.summary = {
          total_items: order.items.reduce(
            (sum, item) => sum + item.quantity,
            0
          ),
          total_original_price: order.items.reduce(
            (sum, item) =>
              sum + (item.original_price || item.product_price) * item.quantity,
            0
          ),
          total_discount: order.items.reduce(
            (sum, item) => sum + (item.discount_price || 0) * item.quantity,
            0
          )
        }
      }

      return {
        orders: orders,
        total: orders.length > 0 ? parseInt(orders[0].total_count) : 0
      }
    } catch (error) {
      throw error
    }
  }

  async createSnapTransaction (transactionData) {
    try {
      console.log('Creating Snap transaction:', transactionData)

      const transaction = await this.snap.createTransaction(transactionData)
      console.log('Snap transaction created:', transaction)

      return transaction
    } catch (error) {
      console.error('Error creating Snap transaction:', error)
      throw error
    }
  }

  // TAMBAHKAN FUNGSI INI: Update Midtrans transaction ID
  async updateMidtransTransactionId (orderId, transactionId) {
    try {
      const query = `
                UPDATE orders 
                SET midtrans_transaction_id = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `

      const result = await db.query(query, [transactionId, orderId])
      console.log(
        'Updated transaction ID for order:',
        orderId,
        'to:',
        transactionId
      )

      return result.rows[0]
    } catch (error) {
      console.error('Error updating transaction ID:', error)
      throw error
    }
  }

  // TAMBAHKAN FUNGSI INI: Check payment status from Midtrans
  async checkMidtransStatus (transactionId) {
    try {
      if (!transactionId) {
        return null
      }

      const statusResponse = await this.coreApi.transaction.status(
        transactionId
      )
      console.log('Midtrans status response:', statusResponse)

      return statusResponse
    } catch (error) {
      console.error('Error checking Midtrans status:', error)

      // Untuk development, return mock data
      if (process.env.NODE_ENV === 'development') {
        console.log('Returning mock status for development')
        return {
          transaction_status: 'settlement',
          fraud_status: 'accept',
          payment_type: 'bank_transfer',
          transaction_id: transactionId,
          gross_amount: '100000'
        }
      }

      return null
    }
  }

  // Get all orders (for admin)
  async getAllOrders (limit = 20, offset = 0, filters = {}) {
    try {
      let query = `
                SELECT o.*, 
                       u.full_name as user_name,
                       u.phone as user_phone,
                       COUNT(*) OVER() as total_count
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                WHERE 1=1
            `

      const values = []
      let paramCount = 1

      if (filters.order_status) {
        query += ` AND o.order_status = $${paramCount}`
        values.push(filters.order_status)
        paramCount++
      }

      if (filters.payment_status) {
        query += ` AND o.payment_status = $${paramCount}`
        values.push(filters.payment_status)
        paramCount++
      }

      if (filters.start_date) {
        query += ` AND o.created_at >= $${paramCount}`
        values.push(filters.start_date)
        paramCount++
      }

      if (filters.end_date) {
        query += ` AND o.created_at <= $${paramCount}`
        values.push(filters.end_date)
        paramCount++
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${paramCount} OFFSET $${
        paramCount + 1
      }`
      values.push(limit, offset)

      const result = await db.query(query, values)

      const orders = result.rows
      for (const order of orders) {
        const itemsQuery = `
                    SELECT 
                        oi.*,
                        p.image as product_image,
                        p.price as product_original_price,
                        (oi.original_price - oi.product_price) as discount_per_item
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = $1
                `
        const itemsResult = await db.query(itemsQuery, [order.id])

        order.items = itemsResult.rows.map(item => ({
          ...item,
          original_price: parseFloat(
            item.original_price ||
              item.product_original_price ||
              item.product_price
          ),
          discount_price: parseFloat(
            item.discount_value || item.discount_per_item || 0
          )
        }))

        // Tambahkan summary untuk setiap order
        order.summary = {
          total_items: order.items.reduce(
            (sum, item) => sum + item.quantity,
            0
          ),
          total_original_price: order.items.reduce(
            (sum, item) =>
              sum + (item.original_price || item.product_price) * item.quantity,
            0
          ),
          total_discount: order.items.reduce(
            (sum, item) => sum + (item.discount_price || 0) * item.quantity,
            0
          )
        }
      }

      return {
        orders: orders,
        total: orders.length > 0 ? parseInt(orders[0].total_count) : 0
      }
    } catch (error) {
      throw error
    }
  }

  // Update order status
  async updateOrderStatus (orderId, status) {
    try {
      const query = `
                UPDATE orders 
                SET order_status = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2 
                RETURNING *
            `

      const result = await db.query(query, [status, orderId])
      return result.rows[0]
    } catch (error) {
      throw error
    }
  }

  // Update payment status (legacy)
  async updatePaymentStatus (orderId, paymentStatus, paymentProof = null) {
    try {
      let query, values

      if (paymentProof) {
        query = `
                    UPDATE orders 
                    SET payment_status = $1, payment_proof = $2, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $3 
                    RETURNING *
                `
        values = [paymentStatus, paymentProof, orderId]
      } else {
        query = `
                    UPDATE orders 
                    SET payment_status = $1, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $2 
                    RETURNING *
                `
        values = [paymentStatus, orderId]
      }

      const result = await db.query(query, values)
      return result.rows[0]
    } catch (error) {
      throw error
    }
  }

  // Delete order
  async deleteOrder (orderId) {
    try {
      const query = 'DELETE FROM orders WHERE id = $1 RETURNING *'
      const result = await db.query(query, [orderId])
      return result.rows[0]
    } catch (error) {
      throw error
    }
  }

  // Get current payment status
  async getPaymentStatus (orderId) {
    try {
      const query = 'SELECT payment_status FROM orders WHERE id = $1'
      const result = await db.query(query, [orderId])
      return result.rows[0]?.payment_status || null
    } catch (error) {
      throw error
    }
  }

  // Helper functions untuk address parsing
  getCityFromAddress (address) {
    const cities = [
      'Jakarta',
      'Bandung',
      'Surabaya',
      'Medan',
      'Semarang',
      'Makassar'
    ]
    for (const city of cities) {
      if (address.toLowerCase().includes(city.toLowerCase())) {
        return city
      }
    }
    return 'Jakarta'
  }

  getPostalCodeFromAddress (address) {
    const postalMatch = address.match(/\b\d{5}\b/)
    return postalMatch ? postalMatch[0] : '12345'
  }

  // Send WhatsApp reminder
  async sendWhatsAppReminder (orderId) {
    try {
      const order = await this.getOrderById(orderId)
      if (!order) {
        throw new Error('Order not found')
      }

      const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
      const userResult = await db.query(userQuery, [order.user_id])
      const user = userResult.rows[0]

      const phoneNumber = this.formatWhatsAppNumber(user.phone)
      const message = this.createPaymentPendingMessage(order, user)

      const result = await fonnteService.sendMessage(phoneNumber, message)

      return {
        success: true,
        message: 'Reminder sent',
        fonnteResult: result
      }
    } catch (error) {
      console.error('Error sending WhatsApp reminder:', error)
      throw error
    }
  }

  // Send receipt via WhatsApp
  async sendReceiptViaWhatsApp (orderId) {
    try {
      const order = await this.getOrderById(orderId)
      if (!order) {
        throw new Error('Order not found')
      }

      const userQuery = 'SELECT phone, full_name FROM users WHERE id = $1'
      const userResult = await db.query(userQuery, [order.user_id])
      const user = userResult.rows[0]

      // Buat detail items dengan harga yang benar
      let itemsDetail = ''
      order.items.forEach((item, index) => {
        const originalPrice = item.original_price || item.product_price
        const finalPrice = item.product_price
        const discount = item.discount_price || 0
        const discountText =
          discount > 0
            ? ` (Diskon: Rp ${discount.toLocaleString('id-ID')})`
            : ''

        itemsDetail += `${index + 1}. ${item.product_name}\n`
        itemsDetail += `   ${item.quantity} x Rp ${finalPrice.toLocaleString(
          'id-ID'
        )}${discountText}\n`
        itemsDetail += `   Subtotal: Rp ${item.subtotal.toLocaleString(
          'id-ID'
        )}\n\n`
      })

      const message = `🧾 *STRUK PEMBELIAN - ${
        process.env.STORE_NAME || 'BOSS STORE'
      }*

Halo ${user.full_name},

Berikut adalah struk pembelian Anda:

📋 *Order ID:* ${order.order_code}
📅 *Tanggal:* ${new Date(order.created_at).toLocaleDateString('id-ID')}
📍 *Alamat:* ${order.shipping_address}

📦 *Items Pembelian:*
${itemsDetail}

💳 *Ringkasan Pembayaran:*
Harga Asli: Rp ${
        order.summary?.total_original_price?.toLocaleString('id-ID') || '0'
      }
Total Diskon: -Rp ${
        order.summary?.total_discount?.toLocaleString('id-ID') || '0'
      }
Subtotal: Rp ${order.total_amount.toLocaleString('id-ID')}
Ongkir: Rp ${order.shipping_cost.toLocaleString('id-ID')}
*Total: Rp ${order.final_amount.toLocaleString('id-ID')}*

📦 *Status Pesanan:* ${order.order_status}
💰 *Status Pembayaran:* ${order.payment_status}

Terima kasih telah berbelanja di ${process.env.STORE_NAME || 'BOSS STORE'}! 🙏

Hubungi kami jika ada pertanyaan:
📞 ${process.env.STORE_PHONE || '081234567890'}`

      const phoneNumber = this.formatWhatsAppNumber(user.phone)
      const result = await fonnteService.sendMessage(phoneNumber, message)

      return {
        success: true,
        message: 'Receipt sent',
        fonnteResult: result
      }
    } catch (error) {
      console.error('Error sending receipt via WhatsApp:', error)
      throw error
    }
  }
}

export default new OrderService()
