const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../models/db');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

function getEncryptionKey(userId) {
  const user = db.prepare('SELECT password_hash, encryption_salt FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  return user.password_hash + user.encryption_salt;
}

function decryptEntry(entry, masterKey) {
  try {
    return {
      ...entry,
      password: decrypt(entry.password_encrypted, masterKey),
      notes: entry.notes_encrypted ? decrypt(entry.notes_encrypted, masterKey) : '',
      password_encrypted: undefined,
      notes_encrypted: undefined,
    };
  } catch (e) {
    return {
      ...entry,
      password: '[Decryption Error]',
      notes: '',
      password_encrypted: undefined,
      notes_encrypted: undefined,
    };
  }
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

// ---- Entries CRUD ----
router.get('/entries', (req, res) => {
  try {
    const { search, category, favorite, trash } = req.query;
    const userId = req.user.id;
    const masterKey = getEncryptionKey(userId);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    let query = 'SELECT * FROM vault WHERE user_id = ?';
    const params = [userId];

    if (trash === '1') {
      query += ' AND deleted_at IS NOT NULL';
    } else {
      query += ' AND deleted_at IS NULL';
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (favorite === '1') {
      query += ' AND favorite = 1';
    }

    if (search && typeof search === 'string') {
      query += ' AND (title LIKE ? OR username LIKE ? OR url LIKE ? OR category LIKE ?)';
      const s = `%${search.replace(/[%_]/g, '\\$&')}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY favorite DESC, updated_at DESC';

    const entries = db.prepare(query).all(...params);
    const decrypted = entries.map((e) => decryptEntry(e, masterKey));
    res.json(decrypted);
  } catch (err) {
    console.error('Get entries error:', err.message);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

router.get('/entries/:id', (req, res) => {
  try {
    const entry = db
      .prepare('SELECT * FROM vault WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    db.prepare('UPDATE vault SET last_accessed_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      entry.id
    );

    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    res.json(decryptEntry(entry, masterKey));
  } catch (err) {
    console.error('Get entry error:', err.message);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

const entryValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title is required (max 255 characters)'),
  body('username')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Username is required (max 255 characters)'),
  body('password')
    .isLength({ min: 1, max: 512 })
    .withMessage('Password is required (max 512 characters)'),
  body('url')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2048 })
    .withMessage('URL is too long'),
  body('notes')
    .optional({ values: 'falsy' })
    .isLength({ max: 10000 })
    .withMessage('Notes are too long'),
  body('category')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category name is too long'),
  validate,
];

router.post('/entries', entryValidation, (req, res) => {
  try {
    const { title, username, password, url, notes, category } = req.body;
    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    const passwordEncrypted = encrypt(password, masterKey);
    const notesEncrypted = notes ? encrypt(notes, masterKey) : '';

    const result = db
      .prepare(
        `INSERT INTO vault (user_id, title, username, password_encrypted, url, notes_encrypted, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.id, title, username, passwordEncrypted, url || '', notesEncrypted, category || 'General');

    res.json({ success: true, id: Number(result.lastInsertRowid), message: 'Entry created' });
  } catch (err) {
    console.error('Create entry error:', err.message);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

router.put('/entries/:id', entryValidation, (req, res) => {
  try {
    const entry = db
      .prepare('SELECT * FROM vault WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const { title, username, password, url, notes, category, favorite } = req.body;
    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (username !== undefined) updates.username = username;
    if (url !== undefined) updates.url = url;
    if (category !== undefined) updates.category = category;
    if (favorite !== undefined) updates.favorite = favorite ? 1 : 0;
    if (notes !== undefined) {
      updates.notes_encrypted = notes ? encrypt(notes, masterKey) : '';
    }

    if (password !== undefined) {
      try {
        const currentPw = decrypt(entry.password_encrypted, masterKey);
        if (password !== currentPw) {
          db.prepare('INSERT INTO password_history (user_id, entry_id, password_encrypted) VALUES (?, ?, ?)').run(
            req.user.id,
            entry.id,
            entry.password_encrypted
          );
          updates.password_encrypted = encrypt(password, masterKey);
        }
      } catch (e) {
        updates.password_encrypted = encrypt(password, masterKey);
      }
    }

    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);
    values.push(req.params.id, req.user.id);

    db.prepare(`UPDATE vault SET ${setClauses} WHERE id = ? AND user_id = ?`).run(...values);
    res.json({ success: true, message: 'Entry updated' });
  } catch (err) {
    console.error('Update entry error:', err.message);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// ---- Soft Delete / Trash ----
router.delete('/entries/:id', (req, res) => {
  try {
    const result = db
      .prepare('UPDATE vault SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .run(new Date().toISOString(), req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true, message: 'Entry moved to trash' });
  } catch (err) {
    console.error('Soft delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

router.patch('/entries/:id/restore', (req, res) => {
  try {
    const result = db
      .prepare(
        'UPDATE vault SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
      )
      .run(new Date().toISOString(), req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found in trash' });
    res.json({ success: true, message: 'Entry restored' });
  } catch (err) {
    console.error('Restore error:', err.message);
    res.status(500).json({ error: 'Failed to restore entry' });
  }
});

router.delete('/entries/:id/permanent', (req, res) => {
  try {
    db.prepare('DELETE FROM password_history WHERE entry_id = ? AND user_id = ?').run(
      req.params.id,
      req.user.id
    );
    const result = db
      .prepare('DELETE FROM vault WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL')
      .run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true, message: 'Entry permanently deleted' });
  } catch (err) {
    console.error('Permanent delete error:', err.message);
    res.status(500).json({ error: 'Failed to permanently delete entry' });
  }
});

router.post('/entries/empty-trash', (req, res) => {
  try {
    db.prepare(
      'DELETE FROM password_history WHERE entry_id IN (SELECT id FROM vault WHERE user_id = ? AND deleted_at IS NOT NULL)'
    ).run(req.user.id);
    const result = db
      .prepare('DELETE FROM vault WHERE user_id = ? AND deleted_at IS NOT NULL')
      .run(req.user.id);
    res.json({ success: true, deleted: result.changes, message: 'Trash emptied' });
  } catch (err) {
    console.error('Empty trash error:', err.message);
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

// ---- Favorites ----
router.patch('/entries/:id/favorite', (req, res) => {
  try {
    const entry = db
      .prepare('SELECT * FROM vault WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const newFav = entry.favorite ? 0 : 1;
    db.prepare('UPDATE vault SET favorite = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      newFav,
      new Date().toISOString(),
      req.params.id,
      req.user.id
    );
    res.json({ success: true, favorite: newFav });
  } catch (err) {
    console.error('Toggle favorite error:', err.message);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// ---- Password History ----
router.get('/entries/:id/history', (req, res) => {
  try {
    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    const history = db
      .prepare(
        'SELECT id, changed_at, password_encrypted FROM password_history WHERE entry_id = ? AND user_id = ? ORDER BY changed_at DESC LIMIT 10'
      )
      .all(req.params.id, req.user.id);

    const decrypted = history.map((h) => ({
      id: h.id,
      changed_at: h.changed_at,
      password: decrypt(h.password_encrypted, masterKey),
    }));
    res.json(decrypted);
  } catch (err) {
    console.error('Get history error:', err.message);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// ---- Vault Statistics ----
router.get('/stats', (req, res) => {
  try {
    const userId = req.user.id;
    const masterKey = getEncryptionKey(userId);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    const total = db
      .prepare('SELECT COUNT(*) as count FROM vault WHERE user_id = ? AND deleted_at IS NULL')
      .get(userId).count;
    const favorites = db
      .prepare('SELECT COUNT(*) as count FROM vault WHERE user_id = ? AND favorite = 1 AND deleted_at IS NULL')
      .get(userId).count;
    const trash = db
      .prepare('SELECT COUNT(*) as count FROM vault WHERE user_id = ? AND deleted_at IS NOT NULL')
      .get(userId).count;
    const categoriesCount = db
      .prepare('SELECT COUNT(DISTINCT category) as count FROM vault WHERE user_id = ? AND deleted_at IS NULL')
      .get(userId).count;

    const entries = db
      .prepare('SELECT password_encrypted, updated_at FROM vault WHERE user_id = ? AND deleted_at IS NULL')
      .all(userId);

    let weakCount = 0;
    let oldCount = 0;
    const reused = new Map();

    entries.forEach((e) => {
      try {
        const pw = decrypt(e.password_encrypted, masterKey);
        reused.set(pw, (reused.get(pw) || 0) + 1);

        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (pw.length >= 16) score++;
        if (/[a-z]/.test(pw)) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score += 2;
        if (score <= 3) weakCount++;

        const updated = new Date(e.updated_at);
        const monthsOld = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsOld > 6) oldCount++;
      } catch (ex) {
        /* skip decryption errors */
      }
    });

    let reusedCount = 0;
    reused.forEach((v) => {
      if (v > 1) reusedCount += v - 1;
    });

    res.json({
      total,
      favorites,
      trash,
      categoriesCount,
      health: {
        weak: weakCount,
        old: oldCount,
        reused: reusedCount,
        strong: total - weakCount,
      },
    });
  } catch (err) {
    console.error('Get stats error:', err.message);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ---- Import / Export ----
router.get('/export', (req, res) => {
  try {
    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    const entries = db
      .prepare('SELECT * FROM vault WHERE user_id = ? AND deleted_at IS NULL')
      .all(req.user.id);

    const exported = entries.map((e) => ({
      title: e.title,
      username: e.username,
      password: decrypt(e.password_encrypted, masterKey),
      url: e.url,
      notes: e.notes_encrypted ? decrypt(e.notes_encrypted, masterKey) : '',
      category: e.category,
      favorite: !!e.favorite,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accessnode-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: 1, exported_at: new Date().toISOString(), entries: exported });
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post('/import', (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Invalid import file format' });
    }
    if (entries.length > 5000) {
      return res.status(400).json({ error: 'Too many entries. Maximum 5000 per import.' });
    }

    const masterKey = getEncryptionKey(req.user.id);
    if (!masterKey) return res.status(401).json({ error: 'Authentication required' });

    let imported = 0;
    let skipped = 0;

    const insert = db.prepare(`
      INSERT INTO vault (user_id, title, username, password_encrypted, url, notes_encrypted, category, favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
      for (const e of entries) {
        if (!e.title || !e.username || !e.password) {
          skipped++;
          continue;
        }
        insert.run(
          req.user.id,
          String(e.title).slice(0, 255),
          String(e.username).slice(0, 255),
          encrypt(String(e.password).slice(0, 512), masterKey),
          String(e.url || '').slice(0, 2048),
          e.notes ? encrypt(String(e.notes).slice(0, 10000), masterKey) : '',
          String(e.category || 'General').slice(0, 100),
          e.favorite ? 1 : 0
        );
        imported++;
      }
    });

    txn();
    res.json({ success: true, imported, skipped, message: `Imported ${imported} entries` });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

// ---- Categories ----
router.get('/categories', (req, res) => {
  try {
    const categories = db
      .prepare(
        `SELECT c.*, COUNT(v.id) as entry_count
       FROM categories c
       LEFT JOIN vault v ON v.category = c.name AND v.user_id = c.user_id AND v.deleted_at IS NULL
       WHERE c.user_id = ? GROUP BY c.id ORDER BY c.name`
      )
      .all(req.user.id);

    const usedCategories = db
      .prepare(
        `SELECT DISTINCT category FROM vault
       WHERE user_id = ? AND deleted_at IS NULL
       AND category NOT IN (SELECT name FROM categories WHERE user_id = ?)`
      )
      .all(req.user.id, req.user.id);

    res.json([
      ...categories,
      ...usedCategories.map((c) => ({ name: c.category, color: '#6b7280', entry_count: 0 })),
    ]);
  } catch (err) {
    console.error('Get categories error:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

const categoryValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Category name is required'),
  body('color')
    .optional()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage('Invalid color format'),
  validate,
];

router.post('/categories', categoryValidation, (req, res) => {
  try {
    db.prepare('INSERT OR IGNORE INTO categories (user_id, name, color) VALUES (?, ?, ?)').run(
      req.user.id,
      req.body.name,
      req.body.color || '#6366f1'
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Create category error:', err.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.delete('/categories/:name', (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE user_id = ? AND name = ?').run(
      req.user.id,
      req.params.name
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Delete category error:', err.message);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ---- Theme ----
router.get('/theme', (req, res) => {
  try {
    const user = db.prepare('SELECT theme FROM users WHERE id = ?').get(req.user.id);
    res.json({ theme: user ? user.theme : 'dark' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

const themeValidation = [
  body('theme').isIn(['dark', 'light']).withMessage('Theme must be "dark" or "light"'),
  validate,
];

router.put('/theme', themeValidation, (req, res) => {
  try {
    db.prepare('UPDATE users SET theme = ?, updated_at = ? WHERE id = ?').run(
      req.body.theme,
      new Date().toISOString(),
      req.user.id
    );
    res.json({ success: true, theme: req.body.theme });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update theme' });
  }
});

module.exports = router;
