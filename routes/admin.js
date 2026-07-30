const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../models/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

// Admin panel page
router.get('/', (req, res) => {
  const users = db.prepare(
    'SELECT id, email, is_admin, created_at FROM users ORDER BY created_at DESC'
  ).all();

  const usersWithCounts = users.map((u) => {
    const count = db
      .prepare('SELECT COUNT(*) as n FROM vault WHERE user_id = ? AND deleted_at IS NULL')
      .get(u.id);
    return { ...u, entryCount: count.n };
  });

  res.render('admin', {
    user: req.user,
    users: usersWithCounts,
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

// Add user
router.post(
  '/users',
  [
    body('email').trim().normalizeEmail().isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('is_admin').optional().isIn(['0', '1']).withMessage('Invalid admin value'),
    validate,
  ],
  async (req, res) => {
    try {
      const { email, password, is_admin } = req.body;

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
      if (existing) {
        return res.redirect('/admin?error=' + encodeURIComponent('User already exists'));
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const encryptionSalt = crypto.randomBytes(32).toString('hex');

      db.prepare(
        'INSERT INTO users (email, password_hash, encryption_salt, is_admin) VALUES (?, ?, ?, ?)'
      ).run(email.toLowerCase(), passwordHash, encryptionSalt, is_admin === '1' ? 1 : 0);

      res.redirect('/admin?success=' + encodeURIComponent('User created'));
    } catch (err) {
      console.error('Admin add user error:', err.message);
      res.redirect('/admin?error=' + encodeURIComponent('Server error'));
    }
  }
);

// Delete user
router.post('/users/:id/delete', (req, res) => {
  try {
    const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id);
    if (!target) {
      return res.redirect('/admin?error=' + encodeURIComponent('User not found'));
    }

    if (target.id === req.user.id) {
      return res.redirect('/admin?error=' + encodeURIComponent('Cannot delete your own account'));
    }

    db.prepare('DELETE FROM vault WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM password_history WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM categories WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);

    res.redirect('/admin?success=' + encodeURIComponent('User deleted'));
  } catch (err) {
    console.error('Admin delete user error:', err.message);
    res.redirect('/admin?error=' + encodeURIComponent('Server error'));
  }
});

// Reset user password
router.post(
  '/users/:id/reset-password',
  [body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), validate],
  async (req, res) => {
    try {
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
      if (!target) {
        return res.redirect('/admin?error=' + encodeURIComponent('User not found'));
      }

      const passwordHash = await bcrypt.hash(req.body.password, 12);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        passwordHash,
        new Date().toISOString(),
        req.params.id
      );

      res.redirect('/admin?success=' + encodeURIComponent('Password reset'));
    } catch (err) {
      console.error('Admin reset password error:', err.message);
      res.redirect('/admin?error=' + encodeURIComponent('Server error'));
    }
  }
);

// Toggle admin status
router.post('/users/:id/toggle-admin', (req, res) => {
  try {
    const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id);
    if (!target) {
      return res.redirect('/admin?error=' + encodeURIComponent('User not found'));
    }

    if (target.id === req.user.id) {
      return res.redirect('/admin?error=' + encodeURIComponent('Cannot change your own admin status'));
    }

    const newStatus = target.is_admin ? 0 : 1;
    db.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?').run(
      newStatus,
      new Date().toISOString(),
      target.id
    );

    res.redirect('/admin?success=' + encodeURIComponent(newStatus ? 'Admin granted' : 'Admin revoked'));
  } catch (err) {
    console.error('Admin toggle error:', err.message);
    res.redirect('/admin?error=' + encodeURIComponent('Server error'));
  }
});

module.exports = router;
