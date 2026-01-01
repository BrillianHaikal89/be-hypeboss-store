// src/modules/carts/carts.service.js
import db from '../../config/db.js';

class CartService {
  async getCartByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT 
          c.id as cart_id,
          c.user_id,
          c.product_id,
          c.quantity,
          c.created_at,
          c.updated_at,
          p.name as product_name,
          p.price,
          p.discount_price,
          p.stock,
          p.image as product_image,
          cat.name as category_name
        FROM carts c
        JOIN products p ON c.product_id = p.id
        JOIN categories cat ON p.category_id = cat.id
        WHERE c.user_id = $1 AND p.is_active = TRUE
        ORDER BY c.created_at DESC`,
        [userId]
      );
      
      // Format response dan hitung subtotal
      const cartItems = result.rows.map(item => {
        const finalPrice = item.discount_price || item.price;
        const subtotal = finalPrice * item.quantity;
        
        // NOTE: product_image akan diproses di controller untuk menjadi full URL
        return {
          cart_id: item.cart_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_image: item.product_image, // Masih relative path
          category_name: item.category_name,
          price: parseFloat(item.price),
          discount_price: item.discount_price ? parseFloat(item.discount_price) : null,
          final_price: parseFloat(finalPrice),
          quantity: item.quantity,
          stock: item.stock,
          subtotal: parseFloat(subtotal),
          created_at: item.created_at,
          updated_at: item.updated_at
        };
      });
      
      // Hitung total keseluruhan
      const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
      
      return {
        success: true,
        data: {
          user_id: userId,
          items: cartItems,
          total_items: cartItems.length,
          total_amount: parseFloat(totalAmount)
        }
      };
    } catch (error) {
      throw new Error(`Error getting cart: ${error.message}`);
    }
  }

  async getCartItem(userId, productId) {
    try {
      const result = await db.query(
        `SELECT c.*, p.stock, p.image as product_image
        FROM carts c 
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = $1 AND c.product_id = $2 AND p.is_active = TRUE`,
        [userId, productId]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting cart item: ${error.message}`);
    }
  }

  async addToCart(userId, productId, quantity = 1) {
    try {
      // Cek apakah produk ada dan aktif
      const productResult = await db.query(
        'SELECT id, stock, is_active, image as product_image FROM products WHERE id = $1 AND is_active = TRUE',
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error('Product not found or inactive');
      }
      
      const product = productResult.rows[0];
      
      // Cek stok
      if (product.stock < quantity) {
        throw new Error(`Insufficient stock. Available: ${product.stock}`);
      }
      
      // Cek apakah item sudah ada di cart
      const existingCartItem = await this.getCartItem(userId, productId);
      
      let newQuantity = quantity;
      let cartItem;
      
      if (existingCartItem) {
        // Update quantity jika sudah ada
        newQuantity = existingCartItem.quantity + quantity;
        
        // Cek stok lagi untuk total quantity
        if (product.stock < newQuantity) {
          throw new Error(`Insufficient stock for additional quantity. Available: ${product.stock}, Requested total: ${newQuantity}`);
        }
        
        const updateResult = await db.query(
          `UPDATE carts 
           SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = $2 AND product_id = $3 
           RETURNING *`,
          [newQuantity, userId, productId]
        );
        
        cartItem = updateResult.rows[0];
        // Tambahkan product_image ke cartItem
        cartItem.product_image = product.product_image;
      } else {
        // Tambah item baru
        const insertResult = await db.query(
          `INSERT INTO carts (user_id, product_id, quantity) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [userId, productId, quantity]
        );
        
        cartItem = insertResult.rows[0];
        // Tambahkan product_image ke cartItem
        cartItem.product_image = product.product_image;
      }
      
      return {
        success: true,
        message: existingCartItem ? 'Cart item updated' : 'Product added to cart',
        data: cartItem
      };
    } catch (error) {
      throw error;
    }
  }

  async updateCartItem(userId, productId, quantity) {
    try {
      // Cek apakah item ada di cart
      const cartItem = await this.getCartItem(userId, productId);
      
      if (!cartItem) {
        throw new Error('Cart item not found');
      }
      
      // Validasi quantity
      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      
      // Cek stok produk
      const productResult = await db.query(
        'SELECT stock, image as product_image FROM products WHERE id = $1',
        [productId]
      );
      
      if (productResult.rows[0].stock < quantity) {
        throw new Error(`Insufficient stock. Available: ${productResult.rows[0].stock}`);
      }
      
      // Update quantity
      const result = await db.query(
        `UPDATE carts 
         SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $2 AND product_id = $3 
         RETURNING *`,
        [quantity, userId, productId]
      );
      
      const updatedItem = result.rows[0];
      // Tambahkan product_image ke response
      updatedItem.product_image = productResult.rows[0].product_image;
      
      return {
        success: true,
        message: 'Cart item updated successfully',
        data: updatedItem
      };
    } catch (error) {
      throw error;
    }
  }

  async removeFromCart(userId, productId) {
    try {
      // Dapatkan info produk sebelum dihapus untuk mendapatkan image
      const productResult = await db.query(
        'SELECT image as product_image FROM products WHERE id = $1',
        [productId]
      );
      
      const result = await db.query(
        'DELETE FROM carts WHERE user_id = $1 AND product_id = $2 RETURNING *',
        [userId, productId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Cart item not found');
      }
      
      const deletedItem = result.rows[0];
      // Tambahkan product_image ke response
      if (productResult.rows.length > 0) {
        deletedItem.product_image = productResult.rows[0].product_image;
      }
      
      return {
        success: true,
        message: 'Item removed from cart',
        data: deletedItem
      };
    } catch (error) {
      throw new Error(`Error removing item from cart: ${error.message}`);
    }
  }

  async clearCart(userId) {
    try {
      const result = await db.query(
        'DELETE FROM carts WHERE user_id = $1 RETURNING *',
        [userId]
      );
      
      return {
        success: true,
        message: 'Cart cleared successfully',
        deleted_count: result.rowCount
      };
    } catch (error) {
      throw new Error(`Error clearing cart: ${error.message}`);
    }
  }

  async getCartSummary(userId) {
    try {
      const result = await db.query(
        `SELECT 
          COUNT(DISTINCT c.product_id) as total_items,
          SUM(c.quantity) as total_quantity,
          SUM(c.quantity * COALESCE(p.discount_price, p.price)) as total_amount
        FROM carts c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = $1 AND p.is_active = TRUE`,
        [userId]
      );
      
      const summary = result.rows[0];
      
      return {
        success: true,
        data: {
          user_id: userId,
          total_items: parseInt(summary.total_items) || 0,
          total_quantity: parseInt(summary.total_quantity) || 0,
          total_amount: parseFloat(summary.total_amount) || 0
        }
      };
    } catch (error) {
      throw new Error(`Error getting cart summary: ${error.message}`);
    }
  }
}

export default new CartService();