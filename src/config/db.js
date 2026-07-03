// src/config/db.js

import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

// ===============================
// Debug Environment
// ===============================
console.log("========== DATABASE CONFIG ==========");
console.log({
  NODE_ENV: process.env.NODE_ENV,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DATABASE_URL: process.env.DATABASE_URL ? "Loaded ✅" : "Not Found ❌",
});
console.log("=====================================");

// ===============================
// Validasi Environment Variables
// ===============================
if (
  !process.env.DATABASE_URL &&
  (!process.env.DB_HOST ||
    !process.env.DB_PORT ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD ||
    !process.env.DB_NAME)
) {
  console.error("❌ Database environment variables are incomplete.");
}

// ===============================
// Konfigurasi Pool
// ===============================
const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  }
  : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false,
    },
  };

const databaseConnection = new Pool({
  ...poolConfig,

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// ===============================
// Event Listener
// ===============================
databaseConnection.on("connect", () => {
  console.log("✅ PostgreSQL Client Connected");
});

databaseConnection.on("remove", () => {
  console.log("🔌 PostgreSQL Client Removed");
});

databaseConnection.on("error", (err) => {
  console.error("💥 PostgreSQL Pool Error:", err.message);
});

// ===============================
// Test Connection
// ===============================
export const testConnection = async () => {
  let client;

  try {
    client = await databaseConnection.connect();

    const result = await client.query("SELECT NOW()");

    console.log("✅ Database Connected");
    console.log("🕒 Server Time:", result.rows[0].now);

    return true;
  } catch (err) {
    console.error("❌ Database Connection Failed");
    console.error(err.message);
    return false;
  } finally {
    if (client) client.release();
  }
};

// ===============================
// Query Helper
// ===============================
export const query = async (text, params) => {
  const start = Date.now();

  try {
    const result = await databaseConnection.query(text, params);

    console.log("📝 Query Executed", {
      duration: `${Date.now() - start}ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (err) {
    console.error("❌ Query Error");

    console.error({
      query: text,
      params,
      message: err.message,
    });

    throw err;
  }
};

// ===============================
// Transaction Helper
// ===============================
export const transaction = async (callback) => {
  const client = await databaseConnection.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export default databaseConnection;