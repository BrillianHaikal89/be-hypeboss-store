// src/config/multer.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'public/uploads';
    
    if (req.baseUrl.includes('/categories')) {
      // Untuk categories
      if (req.params.id) {
        // Update: gunakan ID dari params
        uploadPath = `public/categories/${req.params.id}`;
      } else if (req.body.name && !req.params.id) {
        // Create: buat temporary folder dulu
        uploadPath = 'public/categories/temp';
      } else {
        uploadPath = 'public/categories';
      }
    } else if (req.baseUrl.includes('/products')) {
      // Untuk products
      let categoryId = null;
      
      // Cari category_id dari body atau params
      if (req.body.category_id) {
        categoryId = req.body.category_id;
      } else if (req.params.id) {
        // Untuk update, kita butuh cari category_id dari database
        // Atau bisa dari request body jika disertakan
        categoryId = req.body.category_id;
      }
      
      if (categoryId) {
        // Simpan di folder category-{id}
        uploadPath = `public/products/category-${categoryId}`;
      } else {
        // Simpan di folder general jika tidak ada category_id
        uploadPath = 'public/products/general';
      }
    }
    
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const originalName = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');
    
    // Format: originalname-timestamp-random.extension
    const filename = `${originalName}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

export default upload;