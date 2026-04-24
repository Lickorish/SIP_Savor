const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const users = await pool.query('SELECT id, username, is_admin, created_at, last_login FROM users ORDER BY created_at');
  res.render('admin', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    users: users.rows,
    error: null,
    success: null,
  });
});

router.post('/users/create', requireAdmin, async (req, res) => {
  const { username, password, is_admin } = req.body;
  const renderAdmin = async (error, success) => {
    const users = await pool.query('SELECT id, username, is_admin, created_at, last_login FROM users ORDER BY created_at');
    res.render('admin', { user: req.session.username, isAdmin: req.session.isAdmin, users: users.rows, error, success });
  };

  if (!username || !password) return renderAdmin('Username and password are required', null);
  if (password.length < 6) return renderAdmin('Password must be at least 6 characters', null);

  try {
    const clean = username.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [clean]);
    if (existing.rows.length > 0) return renderAdmin(`Username '${clean}' already exists`, null);

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3)',
      [clean, hash, is_admin === 'on']
    );
    renderAdmin(null, `User '${clean}' created successfully`);
  } catch (err) {
    console.error(err);
    renderAdmin('Failed to create user', null);
  }
});

router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.userId) {
    const users = await pool.query('SELECT id, username, is_admin, created_at, last_login FROM users ORDER BY created_at');
    return res.render('admin', { user: req.session.username, isAdmin: req.session.isAdmin, users: users.rows, error: 'You cannot delete your own account', success: null });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  res.redirect('/admin');
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.redirect('/admin');
  }
  const hash = await bcrypt.hash(new_password, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
  res.redirect('/admin');
});

module.exports = router;
