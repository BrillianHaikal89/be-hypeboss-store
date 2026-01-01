// src/modules/orders/order_items.service.js
import db from '../../config/db.js';

class OrderItemService {
    // Create order item
    async createOrderItem(orderItemData) {
        try {
            const query = `
                INSERT INTO order_items (
                    order_id, product_id, product_name, 
                    product_price, quantity, subtotal
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const values = [
                orderItemData.order_id,
                orderItemData.product_id,
                orderItemData.product_name,
                orderItemData.product_price,
                orderItemData.quantity,
                orderItemData.subtotal
            ];
            
            const result = await db.query(query, values);
            return result.rows[0];
            
        } catch (error) {
            throw error;
        }
    }

    // Get order items by order ID
    async getItemsByOrderId(orderId) {
        try {
            const query = `
                SELECT oi.*, 
                       p.image as product_image,
                       p.description as product_description
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
                ORDER BY oi.created_at
            `;
            
            const result = await db.query(query, [orderId]);
            return result.rows;
            
        } catch (error) {
            throw error;
        }
    }

    // Get order item by ID
    async getItemById(itemId) {
        try {
            const query = `
                SELECT oi.*, 
                       p.image as product_image,
                       p.description as product_description,
                       o.order_code,
                       o.user_id
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN orders o ON oi.order_id = o.id
                WHERE oi.id = $1
            `;
            
            const result = await db.query(query, [itemId]);
            return result.rows[0];
            
        } catch (error) {
            throw error;
        }
    }

    // Update order item
    async updateOrderItem(itemId, updateData) {
        try {
            if (updateData.quantity || updateData.product_price) {
                const currentItem = await this.getItemById(itemId);
                const quantity = updateData.quantity || currentItem.quantity;
                const price = updateData.product_price || currentItem.product_price;
                updateData.subtotal = quantity * price;
            }
            
            const fields = [];
            const values = [];
            let paramCount = 1;
            
            for (const [key, value] of Object.entries(updateData)) {
                if (value !== undefined) {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }
            
            if (fields.length === 0) {
                throw new Error('No fields to update');
            }
            
            values.push(itemId);
            
            const query = `
                UPDATE order_items 
                SET ${fields.join(', ')} 
                WHERE id = $${paramCount} 
                RETURNING *
            `;
            
            const result = await db.query(query, values);
            return result.rows[0];
            
        } catch (error) {
            throw error;
        }
    }

    // Delete order item
    async deleteOrderItem(itemId) {
        try {
            const query = 'DELETE FROM order_items WHERE id = $1 RETURNING *';
            const result = await db.query(query, [itemId]);
            return result.rows[0];
            
        } catch (error) {
            throw error;
        }
    }
}

export default new OrderItemService();