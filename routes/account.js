const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/change-password', requireAuth, (req, res) => {
  res.render('change-password', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    error: null,
    success: null,
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  const render = (error, success) => res.render('change-password', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    error,
    success,
  });

  if (!current_password || !new_password || !confirm_password)
    return render('All fields are required', null);

  if (new_password.length < 6)
    return render('New password must be at least 6 characters', null);

  if (new_password !== confirm_password)
    return render('New passwords do not match', null);

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return render('Current password is incorrect', null);

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);

    render(null, 'Password updated successfully');
  } catch (err) {
    console.error(err);
    render('Something went wrong — please try again', null);
  }
});

module.exports = router;
