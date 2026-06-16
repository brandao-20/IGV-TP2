const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'igv_tp2',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool PostgreSQL:', err);
});

async function query(text, params = []) {
  const started = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - started;
    if (process.env.NODE_ENV !== 'production' && duration > 800) {
      console.log(`[SQL lento] ${duration}ms`, text.replace(/\s+/g, ' ').trim().slice(0, 160));
    }
    return result;
  } catch (error) {
    error.query = text;
    throw error;
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
