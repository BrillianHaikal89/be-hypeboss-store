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
  DATABASE_URL: process.env.DATABASE_URL ? "Loaded ✅" : "Not Found ❌",
});

console.log("=====================================");

// ===============================
// Pool Configuration
// ===============================
const databaseConnection = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// ===============================
// Pool Events
// ===============================
databaseConnection.on("connect", () => {
  console.log("✅ PostgreSQL Connected");
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

    console.log("✅ Database Connected");
    console.log(result.rows[0]);

    client.release();

    return true;
  } catch (err) {
    console.error("❌ Database Connection Failed");

    console.error({
      message: err.message,
      code: err.code,
      hostname: err.hostname,
      syscall: err.syscall,
    });

    return false;
  }
};

// ===============================
// Query
// ===============================
export const query = async (text, params = []) => {
  try {
    return await databaseConnection.query(text, params);
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
// Transaction
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

// Test saat startup
testConnection();

export default databaseConnection;