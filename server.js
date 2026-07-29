require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const vaultRoutes = require('./routes/vault');
const pageRoutes = require('./routes/pages');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET;
if (isProduction && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET === 'accessnode-dev-secret-change-in-production') {
  if (!isProduction) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.log('Generated temporary JWT_SECRET for development.');
  }
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
}));

app.use(compression());
app.disable('x-powered-by');
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser(process.env.JWT_SECRET));

// ---- CSRF Protection (Double Submit Cookie pattern) ----
const CSRF_COOKIE = 'an_csrf';
const CSRF_HEADER = 'x-csrf-token';

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

app.use((req, res, next) => {
  let token = req.cookies[CSRF_COOKIE];
  if (!token) {
    token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      signed: false,
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  res.locals.csrfToken = token;
  next();
});

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    return res.status(403).render('403', { user: null });
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '7d' : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    version: require('./package.json').version,
    env: isProduction ? 'production' : 'development',
  });
});

app.use('/', pageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vault', authMiddleware, vaultRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('404', { user: null });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (isProduction) {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    return res.status(500).render('500', { user: null });
  }

  res.status(500).json({ error: err.message, stack: err.stack });
});

const server = app.listen(PORT, () => {
  console.log(`AccessNode running at http://localhost:${PORT} [${isProduction ? 'production' : 'development'}]`);
});

let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Graceful shutdown...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (!isProduction) process.exit(1);
});
