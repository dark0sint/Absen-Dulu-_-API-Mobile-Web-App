const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/', authRequired, (req, res) => {
  const { date, task, hours } = req.body;
  if (!date || !task) return res.status(400).json({ error: 'Tanggal dan deskripsi tugas wajib diisi' });
  const info = db
    .prepare('INSERT INTO timesheets (user_id, date, task, hours, created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, date, task, parseFloat(hours) || 0, new Date().toISOString());
  res.json(db.prepare('SELECT * FROM timesheets WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/me', authRequired, (req, res) => {
  const { limit = 90 } = req.query;
  res.json(
    db.prepare('SELECT * FROM timesheets WHERE user_id = ? ORDER BY date DESC LIMIT ?').all(req.user.id, Number(limit))
  );
});

router.get('/all', authRequired, adminRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS user_name FROM timesheets t JOIN users u ON u.id = t.user_id
       ORDER BY t.date DESC LIMIT 500`
    )
    .all();
  res.json(rows);
});

module.exports = router;
