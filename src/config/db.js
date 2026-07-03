import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

console.log("===== ENV CHECK =====");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "ADA" : "TIDAK ADA");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_USER:", process.env.DB_USER);
console.log("=====================");

dotenv.config();

// ===============================
// Debug Environment
// ===============================
console.log("========== DATABASE CONFIG ==========");

console.log({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? "Loaded ✅" : "Not Found ❌",
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
});

console.log("=====================================");

// ===============================
// Build Config
// ===============================
let poolConfig;

if (process.env.DATABASE_URL) {
  console.log("🚀 Using DATABASE_URL");

  poolConfig = {
    connectionString: process.env.DATABASE_URL.trim(),
    ssl: {
      rejectUnauthorized: false,
    },
  };
} else {
  console.log("🚀 Using DB_HOST Configuration");

  poolConfig = {
    host: process.env.DB_HOST?.trim(),
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME?.trim(),

    ssl: process.env.NODE_ENV === "production"
      ? {
        rejectUnauthorized: false,
      }
      : false,
  };
}

// ===============================
// Create Pool
// ===============================
const databaseConnection = new Pool({
  ...poolConfig,

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// ===============================
// Pool Events
// ===============================
databaseConnection.on("connect", () => {
  console.log("✅ PostgreSQL Client Connected");
});

databaseConnection.on("remove", () => {
  console.log("🔌 PostgreSQL Client Removed");
});

databaseConnection.on("error", (err) => {
  console.error("💥 PostgreSQL Pool Error");
  console.error(err);
});

// ===============================
// Test Connection
// ===============================
export const testConnection = async () => {
  let client;

  try {
    client = await databaseConnection.connect();

    const result = await client.query("SELECT NOW()");

    console.log("✅ Database Connected Successfully");
    console.log("Server Time:", result.rows[0].now);

    client.release();

    return true;
  } catch (err) {
    console.error("❌ Database Connection Failed");

    console.error({
      message: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      hostname: err.hostname,
      stack: err.stack,
    });

    return false;
  }
};

// ===============================
// Query Helper
// ===============================
export const query = async (text, params = []) => {
  const start = Date.now();

  try {
    const result = await databaseConnection.query(text, params);

    console.log("✅ Query Success", {
      duration: `${Date.now() - start} ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (err) {
    console.error("❌ Query Error");

    console.error({
      query: text,
      params,
      message: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      hostname: err.hostname,
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

// ===============================
// Test Database Saat Startup
// ===============================
(async () => {
  await testConnection();
})();

export default databaseConnection;