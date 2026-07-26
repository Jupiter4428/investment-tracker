const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeHoldings } = require('../services/portfolioEngine');
const { adjustedBudget, calcRebalanceFactors, getActionSignal } = require('../services/dcaEngine');
const { getIndicatorsForTicker } = require('../services/marketData');

const router = express.Router();
router.use(requireAuth);

function allTx() {
  return db.prepare('SELECT * FROM transactions').all();
}
function priceMap() {
  const rows = db.prepare('SELECT symbol, price FROM prices').all();
  const m = {};
  rows.forEach((r) => (m[r.symbol] = r.price));
  return m;
}

function currentHoldingsMV() {
  const holdings = computeHoldings(allTx());
  const prices = priceMap();
  const out = {};
  let total = 0;
  Object.values(holdings)
    .filter((h) => h.qty > 0.0000001)
    .forEach((h) => {
      const avg = h.costBasis / h.qty;
      const px = prices[h.symbol] != null ? prices[h.symbol] : avg;
      const mv = px * h.qty;
      out[h.symbol] = { assetType: h.assetType, name: h.name, ticker: h.ticker, mv };
      total += mv;
    });
  return { holdings: out, total };
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

/**
 * GET /api/dca/rebalance?fetchLive=true
 * Computes rebalance suggestions + action signals. If fetchLive=true, pulls live
 * RSI/MACD/EMA26/P-E from Yahoo Finance for any holding that has a `ticker` set
 * (falls back to manual rsi/pe query overrides per symbol otherwise, same spirit as
 * the original app's manual-entry fields).
 */
router.get('/rebalance', async (req, res) => {
  const allocRows = db.prepare('SELECT symbol, target_pct FROM target_alloc').all();
  const targetAlloc = {};
  allocRows.forEach((r) => (targetAlloc[r.symbol] = r.target_pct));

  const cfg = db.prepare('SELECT budget, vol FROM dca_config WHERE id = 1').get() || { budget: 0, vol: 0 };
  const { holdings, total } = currentHoldingsMV();
  const symbols = Array.from(new Set([...Object.keys(targetAlloc), ...Object.keys(holdings)]));

  if (!symbols.length || !allocRows.length) {
    return res.json({ rows: [], budgetUsed: 0, message: 'กรุณาตั้งเป้าหมายสัดส่วนพอร์ตก่อน' });
  }

  const currentPct = {};
  symbols.forEach((s) => (currentPct[s] = total > 0 ? ((holdings[s] ? holdings[s].mv : 0) / total) * 100 : 0));

  const factors = calcRebalanceFactors(targetAlloc, currentPct);
  // vol stored as a whole-number percent (e.g. 28 = 28%) in dca_config, matching the UI;
  // the engine's adjustedBudget() expects a fraction.
  const budget = adjustedBudget(cfg.budget || 0, (cfg.vol || 0) / 100);

  const fetchLive = String(req.query.fetchLive) === 'true';
  // Optional manual RSI/P-E overrides for symbols without a ticker (or when live
  // fetch is off), passed as JSON: ?overrides={"PTT":{"rsi":45,"pe":12}}
  let overrides = {};
  if (req.query.overrides) {
    try {
      overrides = JSON.parse(req.query.overrides);
    } catch {
      overrides = {};
    }
  }

  const rows = [];
  for (const s of symbols) {
    const h = holdings[s] || {};
    let indicators = null;
    if (fetchLive && h.ticker) {
      indicators = await getIndicatorsForTicker(h.ticker);
    }
    const manual = overrides[s] || {};
    const rsi = indicators?.rsi ?? (manual.rsi != null ? Number(manual.rsi) : null);
    const pe = indicators?.pe ?? (manual.pe != null ? Number(manual.pe) : null);
    const macd = indicators?.macd ?? null;
    const signal = indicators?.signal ?? null;
    const price = indicators?.price ?? null;
    const ema26 = indicators?.ema26 ?? null;

    const cur = currentPct[s] || 0;
    const tgt = targetAlloc[s] || 0;
    const diff = cur - tgt;
    const suggestBuy = budget * (factors[s] || 0);
    const { sig, note } = getActionSignal({ symbol: s, currentPct: cur, targetPct: tgt, rsi, pe, macd, signal, price, ema26 });

    rows.push({
      symbol: s,
      assetType: h.assetType || '-',
      ticker: h.ticker || null,
      currentPct: cur,
      targetPct: tgt,
      diffPct: diff,
      suggestBuy,
      signal: sig,
      note,
      indicators: indicators
        ? { rsi, pe, macd, signal, ema26, volatility: indicators.volatility, price, fetchedAt: indicators.fetchedAt }
        : null,
    });
  }

  res.json({ rows, budgetUsed: budget, volAdjusted: (cfg.vol || 0) > 25 });
});

module.exports = router;
