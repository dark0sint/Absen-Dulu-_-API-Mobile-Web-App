const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

function monthRange(month) {
  // month = 'YYYY-MM'
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function toCSV(rows, headers) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n');
}

router.get('/me', authRequired, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { from, to } = monthRange(month);
  const att = db
    .prepare('SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY ts ASC')
    .all(req.user.id, from, to);
  const leaves = db
    .prepare(
      `SELECT * FROM leaves WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`
    )
    .all(req.user.id, to, from);
  const hadirDays = new Set(att.filter((a) => a.type === 'in').map((a) => a.date)).size;
  const luarZona = att.filter((a) => a.type === 'in' && !a.within_zone).length;
  res.json({ month, hadirDays, luarZona, cutiDisetujui: leaves.length, attendance: att, leaves });
});

router.get('/all', authRequired, adminRequired, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { from, to } = monthRange(month);
  const rows = db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.email,
        SUM(CASE WHEN a.type='in' THEN 1 ELSE 0 END) AS hadir,
        SUM(CASE WHEN a.type='in' AND a.within_zone=0 THEN 1 ELSE 0 END) AS luar_zona
       FROM users u LEFT JOIN attendance a
         ON a.user_id = u.id AND a.date BETWEEN ? AND ?
       GROUP BY u.id ORDER BY u.name ASC`
    )
    .all(from, to);
  res.json({ month, employees: rows });
});

router.get('/export', authRequired, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const scope = req.query.scope === 'all' ? 'all' : 'me';
  const { from, to } = monthRange(month);

  if (scope === 'all') {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses khusus admin' });
    const rows = db
      .prepare(
        `SELECT u.name AS nama, a.date AS tanggal, a.type AS jenis, a.ts AS waktu,
                a.distance_m AS jarak_m, a.within_zone AS dalam_zona
         FROM attendance a JOIN users u ON u.id = a.user_id
         WHERE a.date BETWEEN ? AND ? ORDER BY u.name, a.ts`
      )
      .all(from, to)
      .map((r) => ({ ...r, dalam_zona: r.dalam_zona ? 'Ya' : 'Tidak' }));
    const csv = toCSV(rows, ['nama', 'tanggal', 'jenis', 'waktu', 'jarak_m', 'dalam_zona']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rekap-semua-${month}.csv"`);
    return res.send(csv);
  }

  const rows = db
    .prepare(
      `SELECT date AS tanggal, type AS jenis, ts AS waktu, distance_m AS jarak_m, within_zone AS dalam_zona
       FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY ts`
    )
    .all(req.user.id, from, to)
    .map((r) => ({ ...r, dalam_zona: r.dalam_zona ? 'Ya' : 'Tidak' }));
  const csv = toCSV(rows, ['tanggal', 'jenis', 'waktu', 'jarak_m', 'dalam_zona']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="absensi-saya-${month}.csv"`);
  res.send(csv);
});

module.exports = router;
