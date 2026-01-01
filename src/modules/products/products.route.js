// src/modules/products/products.route.js
import express from 'express';
import productController from './products.controller.js';
import upload from '../../config/multer.js';

const router = express.Router();

// Get all products (with optional filters)
// Tambahkan ?includeInactive=true untuk mengambil semua produk termasuk yang tidak aktif
router.get('/', productController.getAllProducts);

// Get inactive products only
router.get('/inactive', productController.getInactiveProducts);

// Get featured products (default: only active)
// Tambahkan ?includeInactive=true untuk mengambil semua produk featured termasuk yang tidak aktif
router.get('/featured', productController.getAllFeaturedProducts);

// Get single product (can be active or inactive)
router.get('/:id', productController.getProductById);

// Create new product dengan upload file
router.post('/', upload.single('image'), productController.createProduct);

// Update product dengan upload file
router.put('/:id', upload.single('image'), productController.updateProduct);

// Delete product (hard delete - hapus permanen dari database)
router.delete('/:id', productController.deleteProduct);

// Restore product (set is_active to true)
router.patch('/:id/restore', productController.restoreProduct);

// Update product stock (increment/decrement)
router.patch('/:id/stock', productController.updateProductStock);

// Update stock with specific action (increase/decrease/set)
router.patch('/:id/update-stock', productController.updateProductStock);

// routes untuk stock management
router.patch('/:id/manage-stock', productController.manageProductStock);
router.post('/bulk-update-stock', productController.bulkUpdateStock);
router.post('/check-stock', productController.checkStockAvailability);
router.get('/low-stock', productController.getLowStockProducts);
router.get('/out-of-stock', productController.getOutOfStockProducts);

export default router;