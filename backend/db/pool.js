const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:tmkFLOVnfxzrLbTaFQdofBEMoQzsspGg@crossover.proxy.rlwy.net:24532/railway';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;
