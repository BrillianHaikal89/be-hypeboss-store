// src/modules/categories/categories.controller.js
import categoryService from './categories.service.js';
import fs from 'fs';
import path from 'path';
import { generateImageUrl } from '../../utils/imageUrlHelper.js'; // Added import

class CategoryController {
  async getAllCategories(req, res) {
    try {
      const { showInactive, status } = req.query;
      let categories;

      if (status !== undefined) {
        const isActive = status === 'true';
        categories = await categoryService.findByStatus(isActive);
      } else if (showInactive === 'true') {
        categories = await categoryService.findAllWithInactive();
      } else {
        categories = await categoryService.findAll();
      }

      // Use helper function to generate image URLs
      const categoriesWithFullImageUrl = categories.map(category => ({
        ...category,
        image: generateImageUrl(req, category.image)
      }));
      
      res.json({
        success: true,
        data: categoriesWithFullImageUrl,
        message: 'Categories retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getInactiveCategories(req, res) {
    try {
      const categories = await categoryService.findByStatus(false);
      
      const categoriesWithFullImageUrl = categories.map(category => ({
        ...category,
        image: generateImageUrl(req, category.image)
      }));
      
      res.json({
        success: true,
        data: categoriesWithFullImageUrl,
        message: 'Inactive categories retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      const { showInactive } = req.query;
      let category;

      if (showInactive === 'true') {
        category = await categoryService.findByIdWithInactive(id);
      } else {
        category = await categoryService.findById(id);
      }

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Use helper function to generate image URL
      category.image = generateImageUrl(req, category.image);

      res.json({
        success: true,
        data: category,
        message: 'Category retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async createCategory(req, res) {
    try {
      const categoryData = req.body;
      
      if (!categoryData.name) {
        return res.status(400).json({
          success: false,
          message: 'Category name is required'
        });
      }

      if (req.file) {
        categoryData.image = `categories/temp/${req.file.filename}`;
      }

      const newCategory = await categoryService.create(categoryData);
      
      if (req.file && newCategory.id) {
        const oldPath = `public/categories/temp/${req.file.filename}`;
        const newFolder = `public/categories/${newCategory.id}`;
        const newPath = `${newFolder}/${req.file.filename}`;
        
        if (!fs.existsSync(newFolder)) {
          fs.mkdirSync(newFolder, { recursive: true });
        }
        
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
          
          const updatedCategory = await categoryService.update(newCategory.id, {
            image: `categories/${newCategory.id}/${req.file.filename}`
          });
          
          newCategory.image = updatedCategory.image;
        }
        
        try {
          const tempFiles = fs.readdirSync('public/categories/temp');
          if (tempFiles.length === 0) {
            fs.rmdirSync('public/categories/temp');
          }
        } catch (error) {
          // Ignore error if folder doesn't exist
        }
      }
      
      // Generate full image URL for response
      newCategory.image = generateImageUrl(req, newCategory.image);
      
      res.status(201).json({
        success: true,
        data: newCategory,
        message: 'Category created successfully'
      });
    } catch (error) {
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const categoryData = req.body;

      const existingCategory = await categoryService.findByIdWithInactive(id);
      if (!existingCategory) {
        if (req.file && req.file.path) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      if (req.file) {
        if (existingCategory.image) {
          const oldImagePath = `public/${existingCategory.image}`;
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
            
            const oldFolder = path.dirname(oldImagePath);
            if (oldFolder !== `public/categories/${id}`) {
              try {
                const files = fs.readdirSync(oldFolder);
                if (files.length === 0) {
                  fs.rmdirSync(oldFolder);
                }
              } catch (error) {
                // Ignore error
              }
            }
          }
        }
        
        const categoryFolder = `public/categories/${id}`;
        if (!fs.existsSync(categoryFolder)) {
          fs.mkdirSync(categoryFolder, { recursive: true });
        }
        
        categoryData.image = `categories/${id}/${req.file.filename}`;
      }

      const updatedCategory = await categoryService.update(id, categoryData);
      
      // Generate full image URL for response
      updatedCategory.image = generateImageUrl(req, updatedCategory.image);
      
      res.json({
        success: true,
        data: updatedCategory,
        message: 'Category updated successfully'
      });
    } catch (error) {
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      
      const existingCategory = await categoryService.findByIdWithInactive(id);
      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Hapus gambar dari filesystem jika ada
      if (existingCategory.image) {
        const imagePath = `public/${existingCategory.image}`;
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          
          // Hapus folder jika kosong
          const folderPath = path.dirname(imagePath);
          try {
            const files = fs.readdirSync(folderPath);
            if (files.length === 0) {
              fs.rmdirSync(folderPath);
            }
          } catch (error) {
            // Ignore error
          }
        }
      }

      // Hard delete (permanen)
      const deleted = await categoryService.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Category not found or already deleted'
        });
      }
      
      res.json({
        success: true,
        data: null,
        message: 'Category permanently deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getCategoryWithProducts(req, res) {
    try {
      const { id } = req.params;
      const { showInactive } = req.query;
      
      let categoryWithProducts;

      if (showInactive === 'true') {
        const categoryResult = await db.query(
          'SELECT * FROM categories WHERE id = $1',
          [id]
        );

        if (categoryResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Category not found'
          });
        }

        const productsResult = await db.query(
          'SELECT * FROM products WHERE category_id = $1 ORDER BY created_at DESC',
          [id]
        );

        categoryWithProducts = {
          ...categoryResult.rows[0],
          products: productsResult.rows
        };
      } else {
        categoryWithProducts = await categoryService.getCategoryWithProducts(id);
        
        if (!categoryWithProducts) {
          return res.status(404).json({
            success: false,
            message: 'Category not found'
          });
        }
      }

      // Generate full image URL for category
      categoryWithProducts.image = generateImageUrl(req, categoryWithProducts.image);

      // Generate full image URLs for products
      categoryWithProducts.products = categoryWithProducts.products.map(product => ({
        ...product,
        image: generateImageUrl(req, product.image)
      }));

      res.json({
        success: true,
        data: categoryWithProducts,
        message: 'Category with products retrieved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new CategoryController();