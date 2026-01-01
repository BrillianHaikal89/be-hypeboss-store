// src/modules/categories/categories.service.js
import db from '../../config/db.js';

class CategoryService {
  async findAll() {
    try {
      const result = await db.query(
        'SELECT * FROM categories WHERE is_active = true ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching categories: ${error.message}`);
    }
  }

  async findAllWithInactive() {
    try {
      const result = await db.query(
        'SELECT * FROM categories ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching all categories: ${error.message}`);
    }
  }

  async findByStatus(isActive) {
    try {
      const result = await db.query(
        'SELECT * FROM categories WHERE is_active = $1 ORDER BY created_at DESC',
        [isActive]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching categories by status: ${error.message}`);
    }
  }

  async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM categories WHERE id = $1 AND is_active = true',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching category: ${error.message}`);
    }
  }

  async findByIdWithInactive(id) {
    try {
      const result = await db.query(
        'SELECT * FROM categories WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching category with inactive: ${error.message}`);
    }
  }

  async create(categoryData) {
    try {
      const { name, description, image, is_active = true } = categoryData;
      const result = await db.query(
        `INSERT INTO categories (name, description, image, is_active) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [name, description, image, is_active]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating category: ${error.message}`);
    }
  }

  async update(id, categoryData) {
    try {
      const { name, description, image, is_active } = categoryData;
      
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        fields.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }
      if (description !== undefined) {
        fields.push(`description = $${paramCount}`);
        values.push(description);
        paramCount++;
      }
      if (image !== undefined) {
        fields.push(`image = $${paramCount}`);
        values.push(image);
        paramCount++;
      }
      if (is_active !== undefined) {
        fields.push(`is_active = $${paramCount}`);
        values.push(is_active);
        paramCount++;
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(id);
      const query = `
        UPDATE categories 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating category: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      // Hard delete: hapus permanen dari database
      const result = await db.query(
        'DELETE FROM categories WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Set category_id menjadi null pada produk terkait
      await db.query(
        'UPDATE products SET category_id = NULL WHERE category_id = $1',
        [id]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting category: ${error.message}`);
    }
  }

  async getCategoryWithProducts(id) {
    try {
      const categoryResult = await db.query(
        'SELECT * FROM categories WHERE id = $1 AND is_active = true',
        [id]
      );

      if (categoryResult.rows.length === 0) {
        return null;
      }

      const productsResult = await db.query(
        'SELECT * FROM products WHERE category_id = $1 AND is_active = true ORDER BY created_at DESC',
        [id]
      );

      return {
        ...categoryResult.rows[0],
        products: productsResult.rows
      };
    } catch (error) {
      throw new Error(`Error fetching category with products: ${error.message}`);
    }
  }
}

export default new CategoryService();