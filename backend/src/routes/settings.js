const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT k, v FROM settings').all();
  const cfg = {};
  rows.forEach((r) => (cfg[r.k] = r.v));
  res.json({ settings: { name: cfg.name || '', address: cfg.address || '', taxId: cfg.taxId || '', benchmarkTicker: cfg.benchmarkTicker || 'SPY' } });
});

router.put('/', requireOwner, (req, res) => {
  const { name, address, taxId, benchmarkTicker } = req.body || {};
  const stmt = db.prepare(
    `INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`
  );
  stmt.run('name', (name || '').trim());
  stmt.run('address', (address || '').trim());
  stmt.run('taxId', (taxId || '').trim());
  if (benchmarkTicker !== undefined) stmt.run('benchmarkTicker', (benchmarkTicker || 'SPY').trim().toUpperCase());
  res.json({ ok: true });
});

module.exports = router;
