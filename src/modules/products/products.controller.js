// src/modules/products/products.controller.js
import productService from './products.service.js';
import db from '../../config/db.js';
import fs from 'fs';
import path from 'path';
import { generateImageUrl } from '../../utils/imageUrlHelper.js';

class ProductController {
  async getAllProducts(req, res) {
    try {
      const filters = {
        category_id: req.query.category_id,
        is_featured: req.query.is_featured ? req.query.is_featured === 'true' : undefined,
        min_price: req.query.min_price,
        max_price: req.query.max_price,
        search: req.query.search,
        // Tambahkan filter untuk include inactive
        is_active: req.query.includeInactive === 'true' ? undefined : true
      };

      let products;
      if (req.query.includeInactive === 'true') {
        // Ambil semua produk termasuk yang inactive
        products = await productService.findAllIncludingInactive(filters);
      } else {
        // Ambil hanya produk yang active (default)
        products = await productService.findAll(filters);
      }
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = products.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image)
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: 'Products retrieved successfully',
        includeInactive: req.query.includeInactive === 'true'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Tambahkan method untuk mendapatkan hanya produk yang inactive
  async getInactiveProducts(req, res) {
    try {
      const filters = {
        category_id: req.query.category_id,
        search: req.query.search
      };

      const products = await productService.findInactive(filters);
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = products.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image)
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: 'Inactive products retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Tambahkan method untuk mendapatkan semua produk featured termasuk yang inactive
  async getAllFeaturedProducts(req, res) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      
      let featuredProducts;
      if (includeInactive) {
        // Ambil semua produk featured termasuk yang inactive
        featuredProducts = await productService.getAllFeaturedProducts();
      } else {
        // Ambil hanya produk featured yang active (default)
        featuredProducts = await productService.getFeaturedProducts();
      }
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = featuredProducts.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image)
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: 'Featured products retrieved successfully',
        includeInactive
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProductById(req, res) {
    try {
      const { id } = req.params;
      const product = await productService.findById(id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Gunakan helper function untuk generate image URL
      product.image = generateImageUrl(req, product.image);

      res.json({
        success: true,
        data: product,
        message: 'Product retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async createProduct(req, res) {
    try {
      const productData = req.body;
      
      // Basic validation
      if (!productData.name || !productData.price) {
        // Hapus file jika ada error validasi
        if (req.file && req.file.path) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: 'Product name and price are required'
        });
      }

      // Handle file upload jika ada
      if (req.file) {
        // Simpan dengan format: products/{category_id}/{filename}
        let categoryId = productData.category_id;
        
        if (!categoryId) {
          // Default folder jika tidak ada category_id
          productData.image = `products/general/${req.file.filename}`;
          const generalFolder = 'public/products/general';
          if (!fs.existsSync(generalFolder)) {
            fs.mkdirSync(generalFolder, { recursive: true });
          }
          const newPath = path.join(generalFolder, req.file.filename);
          fs.renameSync(req.file.path, newPath);
        } else {
          // Simpan di folder category
          const categoryFolder = `public/products/category-${categoryId}`;
          if (!fs.existsSync(categoryFolder)) {
            fs.mkdirSync(categoryFolder, { recursive: true });
          }
          
          // Pindahkan file ke folder kategori
          const newPath = path.join(categoryFolder, req.file.filename);
          fs.renameSync(req.file.path, newPath);
          productData.image = `products/category-${categoryId}/${req.file.filename}`;
        }
      }

      const newProduct = await productService.create(productData);
      
      // Gunakan helper function untuk generate image URL
      newProduct.image = generateImageUrl(req, newProduct.image);
      
      res.status(201).json({
        success: true,
        data: newProduct,
        message: 'Product created successfully'
      });
    } catch (error) {
      // Hapus file jika terjadi error
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const productData = req.body;

      const existingProduct = await productService.findById(id);
      if (!existingProduct) {
        // Hapus file yang baru diupload jika product tidak ditemukan
        if (req.file && req.file.path) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Handle file upload jika ada
      if (req.file) {
        // Hapus gambar lama jika ada
        if (existingProduct.image) {
          const oldImagePath = `public/${existingProduct.image}`;
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
            
            // Coba hapus folder jika kosong
            const oldFolder = path.dirname(oldImagePath);
            if (fs.existsSync(oldFolder)) {
              const files = fs.readdirSync(oldFolder);
              if (files.length === 0) {
                fs.rmdirSync(oldFolder);
              }
            }
          }
        }
        
        // Tentukan folder baru berdasarkan category_id
        let categoryId = productData.category_id || existingProduct.category_id;
        
        if (!categoryId) {
          // Default folder jika tidak ada category_id
          productData.image = `products/general/${req.file.filename}`;
          const generalFolder = 'public/products/general';
          if (!fs.existsSync(generalFolder)) {
            fs.mkdirSync(generalFolder, { recursive: true });
          }
          const newPath = path.join(generalFolder, req.file.filename);
          fs.renameSync(req.file.path, newPath);
        } else {
          // Simpan di folder category
          const categoryFolder = `public/products/category-${categoryId}`;
          if (!fs.existsSync(categoryFolder)) {
            fs.mkdirSync(categoryFolder, { recursive: true });
          }
          
          // Pindahkan file ke folder kategori
          const newPath = path.join(categoryFolder, req.file.filename);
          fs.renameSync(req.file.path, newPath);
          productData.image = `products/category-${categoryId}/${req.file.filename}`;
        }
      }

      const updatedProduct = await productService.update(id, productData);
      
      // Gunakan helper function untuk generate image URL
      updatedProduct.image = generateImageUrl(req, updatedProduct.image);
      
      res.json({
        success: true,
        data: updatedProduct,
        message: 'Product updated successfully'
      });
    } catch (error) {
      // Hapus file jika terjadi error
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      
      const existingProduct = await productService.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Hapus gambar fisik jika ada
      if (existingProduct.image) {
        const oldImagePath = `public/${existingProduct.image}`;
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
          
          // Coba hapus folder jika kosong
          const oldFolder = path.dirname(oldImagePath);
          if (fs.existsSync(oldFolder)) {
            const files = fs.readdirSync(oldFolder);
            if (files.length === 0) {
              fs.rmdirSync(oldFolder);
            }
          }
        }
      }

      // Hapus permanen dari database
      const deletedProduct = await productService.delete(id);
      
      res.json({
        success: true,
        data: deletedProduct,
        message: 'Product permanently deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Tambahkan method untuk mengaktifkan kembali produk
  async restoreProduct(req, res) {
    try {
      const { id } = req.params;
      
      const existingProduct = await productService.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Jika produk sudah aktif, tidak perlu restore
      if (existingProduct.is_active) {
        return res.status(400).json({
          success: false,
          message: 'Product is already active'
        });
      }

      const restoredProduct = await productService.restore(id);
      
      // Gunakan helper function untuk generate image URL
      restoredProduct.image = generateImageUrl(req, restoredProduct.image);
      
      res.json({
        success: true,
        data: restoredProduct,
        message: 'Product restored successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProductStock(req, res) {
    try {
      const { id } = req.params;
      const { quantity } = req.body;

      if (quantity === undefined || isNaN(quantity)) {
        return res.status(400).json({
          success: false,
          message: 'Quantity is required and must be a number'
        });
      }

      const existingProduct = await productService.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Cek apakah produk aktif
      if (!existingProduct.is_active) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update stock for inactive product'
        });
      }

      const updatedProduct = await productService.updateStock(id, quantity);
      
      // Gunakan helper function untuk generate image URL
      updatedProduct.image = generateImageUrl(req, updatedProduct.image);
      
      res.json({
        success: true,
        data: updatedProduct,
        message: 'Product stock updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // New method for advanced stock management with actions
  async manageProductStock(req, res) {
    try {
      const { id } = req.params;
      const { quantity, action = 'set' } = req.body; // 'set', 'increase', 'decrease'

      if (quantity === undefined || isNaN(quantity)) {
        return res.status(400).json({
          success: false,
          message: 'Quantity is required and must be a number'
        });
      }

      const existingProduct = await productService.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Cek apakah produk aktif
      if (!existingProduct.is_active) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update stock for inactive product'
        });
      }

      let updatedProduct;
      
      switch (action.toLowerCase()) {
        case 'increase':
          if (quantity <= 0) {
            return res.status(400).json({
              success: false,
              message: 'Quantity must be positive for increase action'
            });
          }
          updatedProduct = await productService.increaseStock(id, quantity);
          break;
          
        case 'decrease':
          if (quantity <= 0) {
            return res.status(400).json({
              success: false,
              message: 'Quantity must be positive for decrease action'
            });
          }
          
          // Validasi stok cukup sebelum mengurangi
          if (existingProduct.stock < quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock. Current stock: ${existingProduct.stock}, requested to decrease: ${quantity}`
            });
          }
          
          updatedProduct = await productService.decreaseStock(id, quantity);
          break;
          
        case 'set':
        default:
          if (quantity < 0) {
            return res.status(400).json({
              success: false,
              message: 'Stock cannot be negative'
            });
          }
          
          // Untuk set langsung, kita perlu menghitung selisihnya
          const difference = quantity - existingProduct.stock;
          if (difference > 0) {
            updatedProduct = await productService.increaseStock(id, difference);
          } else if (difference < 0) {
            const decreaseAmount = Math.abs(difference);
            updatedProduct = await productService.decreaseStock(id, decreaseAmount);
          } else {
            updatedProduct = existingProduct;
          }
          break;
      }
      
      // Gunakan helper function untuk generate image URL
      updatedProduct.image = generateImageUrl(req, updatedProduct.image);
      
      res.json({
        success: true,
        data: updatedProduct,
        message: `Product stock ${action} successfully. New stock: ${updatedProduct.stock}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Method to bulk update stock (for admin use)
  async bulkUpdateStock(req, res) {
    try {
      const { products } = req.body; // Array of { product_id, quantity, action }
      
      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Products array is required and must not be empty'
        });
      }

      const results = [];
      const errors = [];
      
      // Process each product update
      for (const item of products) {
        try {
          const { product_id, quantity, action = 'set' } = item;
          
          if (!product_id || quantity === undefined || isNaN(quantity)) {
            errors.push({
              product_id,
              error: 'Missing product_id or invalid quantity'
            });
            continue;
          }
          
          const existingProduct = await productService.findById(product_id);
          if (!existingProduct) {
            errors.push({
              product_id,
              error: 'Product not found'
            });
            continue;
          }
          
          if (!existingProduct.is_active) {
            errors.push({
              product_id,
              error: 'Product is inactive'
            });
            continue;
          }
          
          let updatedProduct;
          
          switch (action.toLowerCase()) {
            case 'increase':
              updatedProduct = await productService.increaseStock(product_id, quantity);
              break;
            case 'decrease':
              // Check if stock is sufficient
              if (existingProduct.stock < quantity) {
                errors.push({
                  product_id,
                  error: `Insufficient stock. Current: ${existingProduct.stock}, Requested decrease: ${quantity}`
                });
                continue;
              }
              updatedProduct = await productService.decreaseStock(product_id, quantity);
              break;
            case 'set':
            default:
              if (quantity < 0) {
                errors.push({
                  product_id,
                  error: 'Stock cannot be negative'
                });
                continue;
              }
              const difference = quantity - existingProduct.stock;
              if (difference > 0) {
                updatedProduct = await productService.increaseStock(product_id, difference);
              } else if (difference < 0) {
                updatedProduct = await productService.decreaseStock(product_id, Math.abs(difference));
              } else {
                updatedProduct = existingProduct;
              }
              break;
          }
          
          results.push({
            product_id,
            success: true,
            new_stock: updatedProduct.stock,
            action: action
          });
          
        } catch (itemError) {
          errors.push({
            product_id: item.product_id,
            error: itemError.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Bulk stock update completed. Success: ${results.length}, Errors: ${errors.length}`,
        data: {
          results,
          errors
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getFeaturedProducts(req, res) {
    try {
      const featuredProducts = await productService.getFeaturedProducts();
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = featuredProducts.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image)
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: 'Featured products retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Method to check stock availability for multiple products
  async checkStockAvailability(req, res) {
    try {
      const { items } = req.body; // Array of { product_id, quantity }
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items array is required and must not be empty'
        });
      }
      
      const availability = [];
      const insufficientStock = [];
      
      for (const item of items) {
        const { product_id, quantity } = item;
        
        if (!product_id || quantity === undefined || isNaN(quantity) || quantity <= 0) {
          availability.push({
            product_id,
            available: false,
            error: 'Invalid product_id or quantity'
          });
          continue;
        }
        
        const product = await productService.findById(product_id);
        
        if (!product) {
          availability.push({
            product_id,
            available: false,
            error: 'Product not found'
          });
          continue;
        }
        
        if (!product.is_active) {
          availability.push({
            product_id,
            available: false,
            error: 'Product is inactive',
            product_name: product.name
          });
          continue;
        }
        
        const isAvailable = product.stock >= quantity;
        
        availability.push({
          product_id,
          product_name: product.name,
          requested_quantity: quantity,
          available_stock: product.stock,
          available: isAvailable,
          insufficient: product.stock - quantity
        });
        
        if (!isAvailable) {
          insufficientStock.push({
            product_id,
            product_name: product.name,
            requested: quantity,
            available: product.stock
          });
        }
      }
      
      const allAvailable = availability.every(item => item.available === true);
      
      res.json({
        success: true,
        data: {
          availability,
          insufficient_stock: insufficientStock,
          all_available: allAvailable,
          summary: {
            total_items: items.length,
            available_items: availability.filter(item => item.available === true).length,
            unavailable_items: availability.filter(item => item.available === false).length
          }
        },
        message: allAvailable 
          ? 'All items are available in sufficient quantity' 
          : 'Some items have insufficient stock'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Method to get low stock products (for admin alerts)
  async getLowStockProducts(req, res) {
    try {
      const threshold = parseInt(req.query.threshold) || 10; // Default threshold is 10
      
      const query = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.is_active = true 
          AND p.stock <= $1 
          AND p.stock > 0
        ORDER BY p.stock ASC, p.name ASC
      `;
      
      const result = await db.query(query, [threshold]);
      const products = result.rows;
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = products.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image),
        stock_status: product.stock === 0 ? 'out_of_stock' : 'low_stock',
        stock_level: product.stock <= 3 ? 'critical' : product.stock <= 10 ? 'low' : 'warning'
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: `Low stock products retrieved (threshold: ${threshold})`,
        summary: {
          total_low_stock: products.length,
          critical_stock: products.filter(p => p.stock <= 3).length,
          warning_stock: products.filter(p => p.stock > 3 && p.stock <= 10).length,
          threshold: threshold
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Method to get out of stock products
  async getOutOfStockProducts(req, res) {
    try {
      const query = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.is_active = true 
          AND p.stock = 0
        ORDER BY p.name ASC
      `;
      
      const result = await db.query(query);
      const products = result.rows;
      
      // Gunakan helper function untuk generate image URL
      const productsWithFullImageUrl = products.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image),
        stock_status: 'out_of_stock'
      }));
      
      res.json({
        success: true,
        data: productsWithFullImageUrl,
        message: 'Out of stock products retrieved',
        summary: {
          total_out_of_stock: products.length
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}


export default new ProductController();