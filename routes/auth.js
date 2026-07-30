const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../models/db');

const router = express.Router();

function respond(req, res, data) {
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    return res.json(data);
  }
  if (data.error) {
    return res.redirect((req.path === '/login' ? '/login' : '/register') + '?error=' + encodeURIComponent(data.error));
  }
  if (data.redirect) return res.redirect(data.redirect);
  return res.json(data);
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

const registerValidation = [
  body('email')
    .trim()
    .normalizeEmail()
    .isEmail().withMessage('Please enter a valid email address')
    .isLength({ max: 255 }).withMessage('Email is too long'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 }).withMessage('Password is too long')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  validate,
];

const loginValidation = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
  validate,
];

router.post('/register', registerValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return respond(req, res, { error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const encryptionSalt = crypto.randomBytes(32).toString('hex');

    const result = db.prepare(
      'INSERT INTO users (email, password_hash, encryption_salt) VALUES (?, ?, ?)'
    ).run(email.toLowerCase(), passwordHash, encryptionSalt);

    const token = jwt.sign(
      { id: Number(result.lastInsertRowid), email: email.toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.SESSION_EXPIRY || '24h' }
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

    respond(req, res, { success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('Registration error:', err.message);
    respond(req, res, { error: 'Server error during registration' });
  }
});

router.post('/login', loginValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return respond(req, res, { error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return respond(req, res, { error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.SESSION_EXPIRY || '24h' }
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

    respond(req, res, { success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('Login error:', err.message);
    respond(req, res, { error: 'Server error during login' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.clearCookie('accessnode.csrf-token', { path: '/' });
  res.json({ success: true, redirect: '/' });
});

module.exports = router;
