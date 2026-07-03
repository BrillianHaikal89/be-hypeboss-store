import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './modules/index.route.js';

// ES6 modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (gunakan /tmp di Vercel agar mendukung serving file yang baru diupload)
app.use('/uploads', express.static(process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads')));
app.use('/public', express.static(process.env.VERCEL ? '/tmp/public' : path.join(__dirname, '../public')));

// Setup routes
app.use('/api', routes);


/**
 * 404 handler (HARUS TANPA '*')
 * Letakkan SETELAH semua route
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

/**
 * Global error handler (harus PALING AKHIR)
 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
