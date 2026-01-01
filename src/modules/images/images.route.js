// Hapus route /check sepenuhnya
// src/modules/images/images.route.js
import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

/**
 * @route GET /api/images/:type/:id/:filename
 * @desc Get image by type, id and filename
 * @access Public
 */
router.get('/:type/:id/:filename', (req, res) => {
  try {
    const { type, id, filename } = req.params;
    
    // Validate allowed types
    const allowedTypes = ['categories', 'products', 'uploads'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type. Allowed: categories, products, uploads'
      });
    }

    // Path to image file
    const imagePath = path.join(process.cwd(), 'public', type, id, filename);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/jpeg';
    
    const contentTypes = {
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp'
    };
    
    contentType = contentTypes[ext] || 'image/jpeg';

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', contentType);
    res.sendFile(imagePath);
    
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while serving image'
    });
  }
});

/**
 * @route GET /api/images/:type/:filename
 * @desc Get image directly from type folder
 * @access Public
 */
router.get('/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    
    const allowedTypes = ['categories', 'products', 'uploads'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type'
      });
    }

    const basePath = path.join(process.cwd(), 'public', type);
    
    if (!fs.existsSync(basePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image directory not found'
      });
    }

    const findFileRecursively = (dir, targetFile) => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            const found = findFileRecursively(fullPath, targetFile);
            if (found) return found;
          } else if (item.name === targetFile) {
            return fullPath;
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
      }
      return null;
    };

    const imagePath = findFileRecursively(basePath, filename);
    
    if (!imagePath) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/jpeg';
    
    const contentTypes = {
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    
    contentType = contentTypes[ext] || 'image/jpeg';

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', contentType);
    res.sendFile(imagePath);
    
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while serving image'
    });
  }
});

export default router;