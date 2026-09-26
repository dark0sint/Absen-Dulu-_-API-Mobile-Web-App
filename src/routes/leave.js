const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/', authRequired, (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate) {
    return res.status(400).json({ error: 'Jenis, tanggal mulai, dan selesai wajib diisi' });
  }
  if (endDate < startDate) return res.status(400).json({ error: 'Tanggal selesai tidak boleh sebelum mulai' });
  const info = db
    .prepare(
      `INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, created_at)
       VALUES (?,?,?,?,?,'pending',?)`
    )
    .run(req.user.id, type, startDate, endDate, reason || '', new Date().toISOString());
  res.json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/me', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

router.get('/all', authRequired, adminRequired, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT l.*, u.name AS user_name FROM leaves l JOIN users u ON u.id = l.user_id`;
  const params = [];
  if (status) { sql += ' WHERE l.status = ?'; params.push(status); }
  sql += ' ORDER BY l.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.patch('/:id', authRequired, adminRequired, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status harus 'approved' atau 'rejected'" });
  }
  const result = db
    .prepare('UPDATE leaves SET status = ?, decided_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
  res.json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id));
});

module.exports = router;
