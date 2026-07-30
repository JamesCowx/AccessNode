const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./models/db');

async function seed() {
  const email = 'Admin@jamescowx.com';
  const password = 'Admin';

  const existing = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    if (!existing.is_admin) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
      console.log('Admin user updated to admin role.');
    } else {
      console.log('Admin user already exists. Skipping.');
    }
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const encryptionSalt = crypto.randomBytes(32).toString('hex');

  db.prepare(
    'INSERT INTO users (email, password_hash, encryption_salt, is_admin) VALUES (?, ?, ?, 1)'
  ).run(email.toLowerCase(), passwordHash, encryptionSalt);

  console.log('Admin user created:');
  console.log('  Email:    ' + email);
  console.log('  Password: ' + password);
  console.log('  Login at: http://localhost:8080/login');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
