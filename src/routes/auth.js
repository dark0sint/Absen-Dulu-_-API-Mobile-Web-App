const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Register. Orang pertama yang mendaftar otomatis jadi admin.
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const role = userCount === 0 ? 'admin' : 'employee';
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), hash, role, new Date().toISOString());
    const user = { id: info.lastInsertRowid, name, role };
    res.json({ token: signToken(user), user });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Email sudah terdaftar' });
    res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }
  const user = { id: row.id, name: row.name, role: row.role };
  res.json({ token: signToken(user), user });
});

router.get('/me', authRequired, (req, res) => {
  const row = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  res.json(row);
});

module.exports = router;
