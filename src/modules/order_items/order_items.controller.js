// src/modules/orders/order_items.controller.js
import orderItemService from './order_items.service.js';
import orderService from '../orders/orders.service.js';
import { validationResult } from 'express-validator';

class OrderItemController {
    // Get order items by order ID
    async getItemsByOrderId(req, res) {
        try {
            const orderId = req.params.orderId;
            const userId = req.user.id;
            
            const order = await orderService.getOrderById(orderId);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order tidak ditemukan'
                });
            }
            
            if (order.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Akses ditolak'
                });
            }
            
            const items = await orderItemService.getItemsByOrderId(orderId);
            
            res.json({
                success: true,
                data: items
            });
            
        } catch (error) {
            console.error('Error getting order items:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil data item order',
                error: error.message
            });
        }
    }

    // Get order item by ID
    async getItemById(req, res) {
        try {
            const itemId = req.params.id;
            const userId = req.user.id;
            
            const item = await orderItemService.getItemById(itemId);
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item order tidak ditemukan'
                });
            }
            
            const order = await orderService.getOrderById(item.order_id);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order tidak ditemukan'
                });
            }
            
            if (order.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Akses ditolak'
                });
            }
            
            res.json({
                success: true,
                data: item
            });
            
        } catch (error) {
            console.error('Error getting order item:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil data item order',
                error: error.message
            });
        }
    }

    // Create order item (for admin)
    async createOrderItem(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }
            
            const orderItemData = req.body;
            
            const order = await orderService.getOrderById(orderItemData.order_id);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order tidak ditemukan'
                });
            }
            
            const newItem = await orderItemService.createOrderItem(orderItemData);
            
            res.status(201).json({
                success: true,
                message: 'Item order berhasil ditambahkan',
                data: newItem
            });
            
        } catch (error) {
            console.error('Error creating order item:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal menambahkan item order',
                error: error.message
            });
        }
    }

    // Update order item
    async updateOrderItem(req, res) {
        try {
            const itemId = req.params.id;
            const updateData = req.body;
            
            const currentItem = await orderItemService.getItemById(itemId);
            
            if (!currentItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item order tidak ditemukan'
                });
            }
            
            const order = await orderService.getOrderById(currentItem.order_id);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order tidak ditemukan'
                });
            }
            
            const updatedItem = await orderItemService.updateOrderItem(itemId, updateData);
            
            res.json({
                success: true,
                message: 'Item order berhasil diperbarui',
                data: updatedItem
            });
            
        } catch (error) {
            console.error('Error updating order item:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal memperbarui item order',
                error: error.message
            });
        }
    }

    // Delete order item
    async deleteOrderItem(req, res) {
        try {
            const itemId = req.params.id;
            
            const currentItem = await orderItemService.getItemById(itemId);
            
            if (!currentItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item order tidak ditemukan'
                });
            }
            
            const order = await orderService.getOrderById(currentItem.order_id);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order tidak ditemukan'
                });
            }
            
            const deletedItem = await orderItemService.deleteOrderItem(itemId);
            
            res.json({
                success: true,
                message: 'Item order berhasil dihapus',
                data: deletedItem
            });
            
        } catch (error) {
            console.error('Error deleting order item:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal menghapus item order',
                error: error.message
            });
        }
    }
}

export default new OrderItemController();