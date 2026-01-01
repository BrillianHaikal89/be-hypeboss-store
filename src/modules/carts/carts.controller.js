// src/modules/carts/carts.controller.js
import cartService from './carts.service.js';
import { generateImageUrl } from '../../utils/imageUrlHelper.js'; // Tambahkan import

class CartController {
  async getCart(req, res, next) {
    try {
      const userId = req.user.id;
      
      const result = await cartService.getCartByUserId(userId);
      
      // Tambahkan full URL untuk setiap gambar produk
      if (result.data && result.data.items) {
        result.data.items = result.data.items.map(item => ({
          ...item,
          // Generate full URL untuk product_image
          product_image: generateImageUrl(req, item.product_image)
        }));
      }
      
      res.status(200).json({
        success: true,
        message: 'Cart retrieved successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }

  async addToCart(req, res, next) {
    try {
      const userId = req.user.id;
      const { product_id, quantity } = req.body;
      
      // Validasi input
      if (!product_id) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
      }
      
      if (quantity && (isNaN(quantity) || quantity <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive number'
        });
      }
      
      const result = await cartService.addToCart(userId, product_id, quantity || 1);
      
      // Tambahkan full URL untuk product_image
      if (result.data && result.data.product_image) {
        result.data.product_image = generateImageUrl(req, result.data.product_image);
      }
      
      res.status(201).json({
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCartItem(req, res, next) {
    try {
      const userId = req.user.id;
      const { product_id } = req.params;
      const { quantity } = req.body;
      
      // Validasi input
      if (!quantity || isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid quantity is required'
        });
      }
      
      const result = await cartService.updateCartItem(userId, parseInt(product_id), quantity);
      
      // Tambahkan full URL untuk product_image
      if (result.data && result.data.product_image) {
        result.data.product_image = generateImageUrl(req, result.data.product_image);
      }
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFromCart(req, res, next) {
    try {
      const userId = req.user.id;
      const { product_id } = req.params;
      
      const result = await cartService.removeFromCart(userId, parseInt(product_id));
      
      // Tambahkan full URL untuk product_image
      if (result.data && result.data.product_image) {
        result.data.product_image = generateImageUrl(req, result.data.product_image);
      }
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }

  async clearCart(req, res, next) {
    try {
      const userId = req.user.id;
      
      const result = await cartService.clearCart(userId);
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          deleted_count: result.deleted_count
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getCartSummary(req, res, next) {
    try {
      const userId = req.user.id;
      
      const result = await cartService.getCartSummary(userId);
      
      res.status(200).json({
        success: true,
        message: 'Cart summary retrieved successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CartController();