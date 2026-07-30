const jwt = require('jsonwebtoken');

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

module.exports = { authMiddleware, guestOnly };
