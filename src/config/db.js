// src/config/db.js
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

// Validasi environment variables
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1);
}

// Konfigurasi pool connection
const databaseConnection = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  
  // Konfigurasi tambahan untuk performance
  max: 20, // maksimum koneksi di pool
  idleTimeoutMillis: 30000, // koneksi idle ditutup setelah 30 detik
  connectionTimeoutMillis: 2000, // timeout saat connect
});

// Event listeners untuk monitoring
databaseConnection.on('connect', () => {
  console.log('🔗 PostgreSQL client connected');
});

databaseConnection.on('remove', () => {
  console.log('🔌 PostgreSQL client removed');
});

databaseConnection.on('error', (err) => {
  console.error('💥 Unexpected PostgreSQL error:', err.message);
});

// Fungsi untuk menguji koneksi
const testConnection = async () => {
  try {
    const client = await databaseConnection.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected at:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection test failed:', error.message);
    return false;
  }
};

// Connect dan test saat startup
databaseConnection.connect()
  .then(() => {
    console.log('✔️ PostgreSQL Connected');
    // Test koneksi setelah connect
    setTimeout(testConnection, 1000);
  })
  .catch((err) => {
    console.error('❌ PostgreSQL Connection Error:', err.message);
    console.error('⚠️  Check your database configuration in .env file');
  });

// Helper function untuk query dengan logging
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await databaseConnection.query(text, params);
    const duration = Date.now() - start;
    console.log(`📝 Executed query: ${text}`, {
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    return result;
  } catch (error) {
    console.error(`❌ Query error: ${text}`, {
      params: params,
      error: error.message
    });
    throw error;
  }
};

// Helper function untuk transaction
export const transaction = async (callback) => {
  const client = await databaseConnection.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Export default dan named exports
export default databaseConnection;

// Named exports tambahan
export { testConnection };