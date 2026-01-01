import express from 'express';
import orderItemsController from './order_items.controller.js';
import { authenticate, authorize } from '../../middleware/auth.js';

const router = express.Router();

// Routes untuk order_items
router.get('/order/:orderId', authenticate, orderItemsController.getItemsByOrderId);
router.get('/:id', authenticate, orderItemsController.getItemById);
router.post('/', authenticate, authorize(['admin']), orderItemsController.createOrderItem);
router.put('/:id', authenticate, authorize(['admin']), orderItemsController.updateOrderItem);
router.delete('/:id', authenticate, authorize(['admin']), orderItemsController.deleteOrderItem);

export default router;