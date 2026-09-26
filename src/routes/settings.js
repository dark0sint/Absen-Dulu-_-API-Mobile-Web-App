const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/office', authRequired, (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('office');
  res.json(JSON.parse(row.value));
});

router.put('/office', authRequired, adminRequired, (req, res) => {
  const { name, lat, lng, radiusMeters } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !radiusMeters) {
    return res.status(400).json({ error: 'Data lokasi tidak lengkap' });
  }
  const value = JSON.stringify({ name: name || 'Kantor', lat, lng, radiusMeters });
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('office', value);
  res.json(JSON.parse(value));
});

module.exports = router;
