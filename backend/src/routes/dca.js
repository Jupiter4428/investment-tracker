const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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
  const rows = db.prepare('SELECT symbol, target_pct FROM target_alloc').all();
  const alloc = {};
  rows.forEach((r) => (alloc[r.symbol] = r.target_pct));
  res.json({ targetAlloc: alloc });
});

router.put('/target-alloc', (req, res) => {
  const alloc = req.body?.targetAlloc || {};
  const tx = db.transaction((entries) => {
    db.prepare('DELETE FROM target_alloc').run();
    const stmt = db.prepare('INSERT INTO target_alloc (symbol, target_pct) VALUES (?, ?)');
    for (const [symbol, pct] of entries) stmt.run(symbol.toUpperCase(), Number(pct) || 0);
  });
  tx(Object.entries(alloc));
  res.json({ ok: true });
});

module.exports = router;
