const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { TARGET_WEIGHTS } = require('../config/smartDcaV2');

const router = express.Router();
router.use(requireAuth);
const TARGET_ALLOC_CONFIGURED_KEY = 'dca_target_alloc_configured';

function getTargetAllocation() {
  const rows = db.prepare('SELECT symbol, target_pct, dca_enabled FROM target_alloc').all();
  const configured = db.prepare('SELECT v FROM settings WHERE k = ?').get(TARGET_ALLOC_CONFIGURED_KEY);
  if (!rows.length && !configured) {
    return {
      targetAlloc: Object.fromEntries(Object.entries(TARGET_WEIGHTS).map(([symbol, weight]) => [symbol, weight * 100])),
      dcaSymbols: Object.keys(TARGET_WEIGHTS),
    };
  }
  return {
    targetAlloc: Object.fromEntries(rows.map((row) => [row.symbol, row.target_pct])),
    dcaSymbols: rows.filter((row) => row.dca_enabled).map((row) => row.symbol),
  };
}

router.get('/config', (req, res) => {
  const cfg = db.prepare('SELECT budget, vol FROM dca_config WHERE id = 1').get() || { budget: 0, vol: 0 };
  res.json({ config: cfg });
});

router.put('/config', (req, res) => {
  const budget = Number(req.body?.budget) || 0;
  const vol = Number(req.body?.vol) || 0;
  db.prepare(
    `INSERT INTO dca_config (id, budget, vol) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET budget = excluded.budget, vol = excluded.vol`
  ).run(budget, vol);
  res.json({ ok: true });
});

router.get('/target-alloc', (req, res) => {
  res.json(getTargetAllocation());
});

router.put('/target-alloc', (req, res) => {
  const alloc = req.body?.targetAlloc || {};
  const entries = Object.entries(alloc);
  const dcaSymbols = new Set((Array.isArray(req.body?.dcaSymbols)
    ? req.body.dcaSymbols
    : entries.map(([symbol]) => symbol))
    .map((symbol) => String(symbol).trim().toUpperCase()));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM target_alloc').run();
    const stmt = db.prepare('INSERT INTO target_alloc (symbol, target_pct, dca_enabled) VALUES (?, ?, ?)');
    for (const [rawSymbol, pct] of entries) {
      const symbol = String(rawSymbol).trim().toUpperCase();
      if (symbol) stmt.run(symbol, Number(pct) || 0, dcaSymbols.has(symbol) ? 1 : 0);
    }
    db.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .run(TARGET_ALLOC_CONFIGURED_KEY, '1');
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;
