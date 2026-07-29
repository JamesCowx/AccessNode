const crypto = require('crypto');

function generatePassword(options = {}) {
  const {
    length = 20,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
    excludeAmbiguous = false
  } = options;

  const chars = {
    uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lowercase: 'abcdefghjkmnpqrstuvwxyz',
    numbers: '23456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  const ambiguousChars = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  const source = excludeAmbiguous ? chars : ambiguousChars;

  let pool = '';
  if (uppercase) pool += source.uppercase;
  if (lowercase) pool += source.lowercase;
  if (numbers) pool += source.numbers;
  if (symbols) pool += source.symbols;

  if (!pool) pool = source.lowercase + source.numbers;

  let password = '';
  const randomBytes = crypto.randomBytes(length * 2);

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % pool.length;
    password += pool[randomIndex];
  }

  if (uppercase && !/[A-Z]/.test(password)) {
    const pos = randomBytes[length] % length;
    const char = source.uppercase[randomBytes[length + 1] % source.uppercase.length];
    password = password.substring(0, pos) + char + password.substring(pos + 1);
  }
  if (lowercase && !/[a-z]/.test(password)) {
    const pos = randomBytes[length + 2] % length;
    const char = source.lowercase[randomBytes[length + 3] % source.lowercase.length];
    password = password.substring(0, pos) + char + password.substring(pos + 1);
  }
  if (numbers && !/[0-9]/.test(password)) {
    const pos = randomBytes[length + 4] % length;
    const char = source.numbers[randomBytes[length + 5] % source.numbers.length];
    password = password.substring(0, pos) + char + password.substring(pos + 1);
  }
  if (symbols && !/[^a-zA-Z0-9]/.test(password)) {
    const pos = randomBytes[length + 6] % length;
    const char = source.symbols[randomBytes[length + 7] % source.symbols.length];
    password = password.substring(0, pos) + char + password.substring(pos + 1);
  }

  return password;
}

function calculateStrength(password) {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 2;

  if (score <= 3) return { label: 'Weak', color: '#ef4444', score };
  if (score <= 5) return { label: 'Fair', color: '#f97316', score };
  if (score <= 7) return { label: 'Strong', color: '#22c55e', score };
  return { label: 'Very Strong', color: '#10b981', score };
}

module.exports = { generatePassword, calculateStrength };
