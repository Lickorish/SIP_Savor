const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✓ Database schema ready');

  // Seed admin user if ADMIN_USERNAME is set and user doesn't exist
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [process.env.ADMIN_USERNAME]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE)',
        [process.env.ADMIN_USERNAME, hash]
      );
      console.log(`✓ Admin user '${process.env.ADMIN_USERNAME}' created`);
    }
  }
}

module.exports = { pool, initDb };
