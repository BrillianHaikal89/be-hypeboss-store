// src/modules/products/products.service.js
import db from '../../config/db.js';

class ProductService {
  async findAll(filters = {}) {
    try {
      let query = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.is_active = true
      `;
      const values = [];
      let paramCount = 1;
      const conditions = [];

      // Apply filters
      if (filters.category_id) {
        conditions.push(`p.category_id = $${paramCount}`);
        values.push(filters.category_id);
        paramCount++;
      }

      if (filters.is_featured !== undefined) {
        conditions.push(`p.is_featured = $${paramCount}`);
        values.push(filters.is_featured);
        paramCount++;
      }

      if (filters.min_price) {
        conditions.push(`p.price >= $${paramCount}`);
        values.push(filters.min_price);
        paramCount++;
      }

      if (filters.max_price) {
        conditions.push(`p.price <= $${paramCount}`);
        values.push(filters.max_price);
        paramCount++;
      }

      if (filters.search) {
        conditions.push(`(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`);
        values.push(`%${filters.search}%`);
        paramCount++;
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' ORDER BY p.created_at DESC';

      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching products: ${error.message}`);
    }
  }

  // Tambahkan method untuk mendapatkan semua produk termasuk yang inactive
  async findAllIncludingInactive(filters = {}) {
    try {
      let query = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE 1=1
      `;
      const values = [];
      let paramCount = 1;
      const conditions = [];

      // Apply filters
      if (filters.category_id) {
        conditions.push(`p.category_id = $${paramCount}`);
        values.push(filters.category_id);
        paramCount++;
      }

      if (filters.is_featured !== undefined) {
        conditions.push(`p.is_featured = $${paramCount}`);
        values.push(filters.is_featured);
        paramCount++;
      }

      if (filters.min_price) {
        conditions.push(`p.price >= $${paramCount}`);
        values.push(filters.min_price);
        paramCount++;
      }

      if (filters.max_price) {
        conditions.push(`p.price <= $${paramCount}`);
        values.push(filters.max_price);
        paramCount++;
      }

      if (filters.search) {
        conditions.push(`(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`);
        values.push(`%${filters.search}%`);
        paramCount++;
      }

      if (filters.is_active !== undefined) {
        conditions.push(`p.is_active = $${paramCount}`);
        values.push(filters.is_active);
        paramCount++;
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' ORDER BY p.created_at DESC';

      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching all products: ${error.message}`);
    }
  }

  // Tambahkan method untuk mendapatkan hanya produk yang inactive
  async findInactive(filters = {}) {
    try {
      let query = `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.is_active = false
      `;
      const values = [];
      let paramCount = 1;
      const conditions = [];

      // Apply filters
      if (filters.category_id) {
        conditions.push(`p.category_id = $${paramCount}`);
        values.push(filters.category_id);
        paramCount++;
      }

      if (filters.search) {
        conditions.push(`(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`);
        values.push(`%${filters.search}%`);
        paramCount++;
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' ORDER BY p.created_at DESC';

      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching inactive products: ${error.message}`);
    }
  }

  async findById(id) {
    try {
      const result = await db.query(
        `SELECT p.*, c.name as category_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching product: ${error.message}`);
    }
  }

  async create(productData) {
    try {
      const {
        name,
        description,
        category_id,
        price,
        discount_price,
        stock = 0,
        image,
        is_featured = false,
        is_active = true
      } = productData;

      // Validate category exists (jika category_id disediakan)
      if (category_id) {
        const categoryCheck = await db.query(
          'SELECT id FROM categories WHERE id = $1',
          [category_id]
        );
        
        if (categoryCheck.rows.length === 0) {
          throw new Error('Category not found');
        }
      }

      const result = await db.query(
        `INSERT INTO products (
          name, description, category_id, price, discount_price, 
          stock, image, is_featured, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [
          name, description, category_id, price, discount_price,
          stock, image, is_featured, is_active
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating product: ${error.message}`);
    }
  }

  async update(id, productData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Dynamically build update query based on provided fields
      const fieldMappings = {
        name: 'name',
        description: 'description',
        category_id: 'category_id',
        price: 'price',
        discount_price: 'discount_price',
        stock: 'stock',
        image: 'image',
        is_featured: 'is_featured',
        is_active: 'is_active'
      };

      for (const [key, dbField] of Object.entries(fieldMappings)) {
        if (productData[key] !== undefined) {
          // Special validation for category_id
          if (key === 'category_id' && productData[key] !== null) {
            const categoryCheck = await db.query(
              'SELECT id FROM categories WHERE id = $1',
              [productData[key]]
            );
            
            if (categoryCheck.rows.length === 0) {
              throw new Error('Category not found');
            }
          }

          fields.push(`${dbField} = $${paramCount}`);
          values.push(productData[key]);
          paramCount++;
        }
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(id);
      const query = `
        UPDATE products 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating product: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      // Hard delete: hapus permanen dari database
      const result = await db.query(
        'DELETE FROM products WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting product: ${error.message}`);
    }
  }

  // Tambahkan method untuk mengaktifkan kembali produk
  async restore(id) {
    try {
      const result = await db.query(
        'UPDATE products SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error restoring product: ${error.message}`);
    }
  }

  // Tambahkan method untuk mengurangi stok produk dengan aman
  async decreaseStock(productId, quantity) {
    try {
      const client = await db.connect();
      
      try {
        await client.query('BEGIN');
        
        // Pastikan stok cukup sebelum mengurangi dengan FOR UPDATE untuk mencegah race condition
        const checkQuery = 'SELECT stock FROM products WHERE id = $1 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [productId]);
        
        if (checkResult.rows.length === 0) {
          throw new Error('Product not found');
        }
        
        const currentStock = checkResult.rows[0].stock;
        
        if (currentStock < quantity) {
          throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`);
        }
        
        // Update stok
        const updateQuery = 'UPDATE products SET stock = stock - $1 WHERE id = $2 RETURNING *';
        const updateResult = await client.query(updateQuery, [quantity, productId]);
        
        await client.query('COMMIT');
        
        return updateResult.rows[0];
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      throw new Error(`Error decreasing product stock: ${error.message}`);
    }
  }

  // Tambahkan method untuk mengembalikan stok (jika order dibatalkan)
  async increaseStock(productId, quantity) {
    try {
      const client = await db.connect();
      
      try {
        await client.query('BEGIN');
        
        // Pastikan produk ada
        const checkQuery = 'SELECT id FROM products WHERE id = $1 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [productId]);
        
        if (checkResult.rows.length === 0) {
          throw new Error('Product not found');
        }
        
        // Update stok
        const updateQuery = 'UPDATE products SET stock = stock + $1 WHERE id = $2 RETURNING *';
        const updateResult = await client.query(updateQuery, [quantity, productId]);
        
        await client.query('COMMIT');
        
        return updateResult.rows[0];
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Error increasing product stock: ${error.message}`);
    }
  }

  // Update stock dengan metode yang aman
  async updateStock(id, quantity) {
    try {
      // Periksa apakah produk ada sebelum update stock
      const checkProduct = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [id]
      );
      
      if (checkProduct.rows.length === 0) {
        throw new Error('Product not found');
      }
      
      // Cek apakah produk aktif
      if (!checkProduct.rows[0].is_active) {
        throw new Error('Cannot update stock for inactive product');
      }

      // Gunakan transaksi untuk update stock
      const client = await db.connect();
      
      try {
        await client.query('BEGIN');
        
        // Gunakan FOR UPDATE untuk mencegah race condition
        const lockQuery = 'SELECT stock FROM products WHERE id = $1 FOR UPDATE';
        await client.query(lockQuery, [id]);
        
        // Update stock dengan quantity yang bisa positif (tambah) atau negatif (kurang)
        const result = await client.query(
          'UPDATE products SET stock = stock + $1 WHERE id = $2 AND is_active = true RETURNING *',
          [quantity, id]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Failed to update stock. Product may be inactive or not found.');
        }
        
        // Cek jika stock menjadi negatif
        if (result.rows[0].stock < 0) {
          // Rollback dan kembalikan error
          await client.query('ROLLBACK');
          throw new Error('Stock cannot be negative');
        }
        
        await client.query('COMMIT');
        return result.rows[0];
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Error updating product stock: ${error.message}`);
    }
  }

  async getFeaturedProducts() {
    try {
      const result = await db.query(
        `SELECT p.*, c.name as category_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.is_featured = true AND p.is_active = true 
         ORDER BY p.created_at DESC 
         LIMIT 10`
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching featured products: ${error.message}`);
    }
  }

  // Tambahkan method untuk mendapatkan produk featured termasuk yang inactive
  async getAllFeaturedProducts() {
    try {
      const result = await db.query(
        `SELECT p.*, c.name as category_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.is_featured = true
         ORDER BY p.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching all featured products: ${error.message}`);
    }
  }
}

export default new ProductService();