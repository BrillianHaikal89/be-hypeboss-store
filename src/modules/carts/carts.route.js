// src/modules/carts/carts.route.js
import express from 'express';
import cartController from './carts.controller.js';
import { authenticate } from '../../middleware/auth.js'; // Ubah ini

const router = express.Router();

// Apply authentication middleware to all cart routes
router.use(authenticate); // Ubah ini

/**
 * @route GET /carts
 * @description Get user's cart with all items
 * @access Private (Customer only)
 */
router.get('/', cartController.getCart);

/**
 * @route POST /carts
 * @description Add product to cart or update quantity if exists
 * @body {product_id, quantity}
 * @access Private (Customer only)
 */
router.post('/', cartController.addToCart);

/**
 * @route PUT /carts/:product_id
 * @description Update quantity of specific cart item
 * @body {quantity}
 * @access Private (Customer only)
 */
router.put('/:product_id', cartController.updateCartItem);

/**
 * @route DELETE /carts/:product_id
 * @description Remove specific item from cart
 * @access Private (Customer only)
 */
router.delete('/:product_id', cartController.removeFromCart);

/**
 * @route DELETE /carts
 * @description Clear all items from cart
 * @access Private (Customer only)
 */
router.delete('/', cartController.clearCart);

/**
 * @route GET /carts/summary
 * @description Get cart summary (total items, quantity, amount)
 * @access Private (Customer only)
 */
router.get('/summary', cartController.getCartSummary);

export default router;