/**
 * src/db/pool.js — Singleton PostgreSQL connection pool.
 *
 * Reads DATABASE_URL from environment variables (via .env at root).
 * All queries in the app should go through this pool.
 */
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("[DB] FATAL: DATABASE_URL is not set in environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon / Render hosted Postgres
  max: 10,              // Max connections in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected error on idle client:", err.message);
});

module.exports = pool;
