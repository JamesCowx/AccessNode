const jwt = require('jsonwebtoken');
const db = require('../models/db');

function getToken(req) {
  return req.cookies?.token || req.signedCookies?.token || null;
}

function authMiddleware(req, res, next) {
  const token = getToken(req);

  if (!token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token', { path: '/' });
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return res.redirect('/login');
  }
}

function adminMiddleware(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.is_admin) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return res.status(403).render('403', { user: req.user });
  }
  next();
}

function guestOnly(req, res, next) {
  const token = getToken(req);
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect('/dashboard');
    } catch (err) {
      res.clearCookie('token', { path: '/' });
    }
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, guestOnly };
