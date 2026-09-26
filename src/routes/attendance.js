const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { haversineMeters } = require('../utils/geo');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `selfie_${req.user.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('File harus berupa gambar'));
    cb(null, true);
  }
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.post('/clock', authRequired, upload.single('photo'), (req, res) => {
  const { type, lat, lng } = req.body;
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: "type harus 'in' atau 'out'" });
  const latN = parseFloat(lat), lngN = parseFloat(lng);
  if (Number.isNaN(latN) || Number.isNaN(lngN)) {
    return res.status(400).json({ error: 'Lokasi (lat/lng) wajib dikirim' });
  }
  const office = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('office').value);
  const distance = haversineMeters(latN, lngN, office.lat, office.lng);
  const withinZone = distance <= office.radiusMeters ? 1 : 0;
  const ts = new Date().toISOString();
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const info = db
    .prepare(
      `INSERT INTO attendance (user_id, date, type, ts, lat, lng, distance_m, within_zone, photo_path)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.id, todayStr(), type, ts, latN, lngN, distance, withinZone, photoPath);

  res.json({
    id: info.lastInsertRowid,
    date: todayStr(),
    type,
    ts,
    distance_m: distance,
    within_zone: !!withinZone,
    photo_path: photoPath
  });
});

router.get('/me', authRequired, (req, res) => {
  const { from, to, limit = 90 } = req.query;
  let sql = 'SELECT * FROM attendance WHERE user_id = ?';
  const params = [req.user.id];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(Number(limit));
  res.json(db.prepare(sql).all(...params));
});

router.get('/today', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY ts ASC')
    .all(req.user.id, todayStr());
  res.json(rows);
});

router.get('/all', authRequired, adminRequired, (req, res) => {
  const { from, to, limit = 500 } = req.query;
  let sql = `SELECT a.*, u.name AS user_name, u.email AS user_email
             FROM attendance a JOIN users u ON u.id = a.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND a.date >= ?'; params.push(from); }
  if (to) { sql += ' AND a.date <= ?'; params.push(to); }
  sql += ' ORDER BY a.ts DESC LIMIT ?';
  params.push(Number(limit));
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
