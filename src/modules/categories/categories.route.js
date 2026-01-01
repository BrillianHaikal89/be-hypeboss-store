// src/modules/categories/categories.route.js
import express from 'express';
import categoryController from './categories.controller.js';
import upload from '../../config/multer.js';

const router = express.Router();

// Get all categories with optional filters
// GET /categories/                     -> only active categories (default)
// GET /categories/?showInactive=true   -> all categories (active & inactive)
// GET /categories/?status=true         -> only active categories
// GET /categories/?status=false        -> only inactive categories
router.get('/', categoryController.getAllCategories);

// Get inactive categories only
router.get('/inactive', categoryController.getInactiveCategories);

// Get single category
// GET /categories/:id                 -> only if active
// GET /categories/:id?showInactive=true -> including inactive
router.get('/:id', categoryController.getCategoryById);

// Get category with products
// GET /categories/:id/products        -> only if category and products are active
// GET /categories/:id/products?showInactive=true -> including inactive
router.get('/:id/products', categoryController.getCategoryWithProducts);

// Create new category with file upload
router.post('/', upload.single('image'), categoryController.createCategory);

// Update category with file upload
router.put('/:id', upload.single('image'), categoryController.updateCategory);

// Delete category (hard delete permanen)
router.delete('/:id', categoryController.deleteCategory);

export default router;