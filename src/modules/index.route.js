// src/modules/index.route.js
import express from 'express';
import authRoutes from './auth/auth.route.js';
import categoryRoutes from './categories/categories.route.js';
import productRoutes from './products/products.route.js';
import imagesRoutes from './images/images.route.js';
import cartsRoute from './carts/carts.route.js';
import ordersRoutes from './orders/orders.route.js';
import orderItemsRoutes from './order_items/order_items.route.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/images', imagesRoutes);
router.use('/carts', cartsRoute);
router.use('/orders', ordersRoutes);
router.use('/order-items', orderItemsRoutes);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

export default router;