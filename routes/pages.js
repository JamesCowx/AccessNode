const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, guestOnly } = require('../middleware/auth');
const db = require('../models/db');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('landing', { user: null });
});

router.get('/login', guestOnly, (req, res) => {
  res.render('login', { user: null, error: req.query.error || null });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.redirect('/login?error=' + encodeURIComponent('Email and password required'));
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
    if (!user) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password'));
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password'));
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
      signed: true,
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login POST error:', err.message);
    res.redirect('/login?error=Server error');
  }
});

router.get('/register', guestOnly, (req, res) => {
  res.render('register', { user: null, error: null });
});

router.get('/dashboard', authMiddleware, (req, res) => {
  res.render('dashboard', { user: req.user });
});

router.get('/setup', (req, res) => {
  res.render('setup', { user: null });
});

module.exports = router;
