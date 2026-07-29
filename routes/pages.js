const express = require('express');
const { authMiddleware, guestOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('landing', { user: null });
});

router.get('/login', guestOnly, (req, res) => {
  res.render('login', { user: null, error: null });
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
