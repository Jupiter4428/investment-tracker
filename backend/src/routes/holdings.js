const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeHoldings, realizedForSell } = require('../services/portfolioEngine');

const router = express.Router();
router.use(requireAuth);

function allTx() {
  return db.prepare('SELECT * FROM transactions ORDER BY date ASC, id ASC').all();
}
function priceMap() {
  const rows = db.prepare('SELECT symbol, price FROM prices').all();
  const m = {};
  rows.forEach((r) => (m[r.symbol] = r.price));
  return m;
}

function holdingsWithMarketValue() {
  const holdings = computeHoldings(allTx());
  const prices = priceMap();
  return Object.values(holdings)
    .filter((h) => h.qty > 0.0000001)
    .map((h) => {
      const avg = h.costBasis / h.qty;
      const px = prices[h.symbol] != null ? prices[h.symbol] : avg;
      const mv = px * h.qty;
      const pl = mv - h.costBasis;
      const pct = h.costBasis > 0 ? (pl / h.costBasis) * 100 : 0;
      return { ...h, brokers: Array.from(h.brokers || []), avgCost: avg, currentPrice: px, marketValue: mv, unrealizedPL: pl, unrealizedPct: pct };
    });
}

router.get('/', (req, res) => {
  res.json({ holdings: holdingsWithMarketValue() });
});

router.put('/:symbol/price', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const price = Number(req.body?.price);
  if (Number.isNaN(price)) return res.status(400).json({ error: 'ราคาไม่ถูกต้อง' });
  db.prepare(
    `INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
  ).run(symbol, price, Date.now());
  res.json({ ok: true });
});

router.get('/dashboard', (req, res) => {
  const list = holdingsWithMarketValue();
  const totalCost = list.reduce((s, h) => s + h.costBasis, 0);
  const totalMV = list.reduce((s, h) => s + h.marketValue, 0);
  const unrealizedPL = totalMV - totalCost;

  const thisYear = String(new Date().getFullYear());
  const txs = allTx();
  const sells = txs.filter((t) => t.action === 'ขาย' && t.date.startsWith(thisYear));
  const bySymbol = {};
  txs.forEach((t) => {
    (bySymbol[t.symbol] = bySymbol[t.symbol] || []).push(t);
  });
  const realizedThisYear = sells.reduce((s, t) => s + realizedForSell(bySymbol[t.symbol] || [], t), 0);
  const divThisYear = txs
    .filter((t) => (t.action === 'ปันผล' || t.action === 'ดอกเบี้ย') && t.date.startsWith(thisYear))
    .reduce((s, t) => s + t.qty * t.price, 0);

  const recent = txs.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.id < a.id ? -1 : 1)).slice(0, 8);

  const byType = {};
  list.forEach((h) => {
    byType[h.assetType] = (byType[h.assetType] || 0) + h.marketValue;
  });

  res.json({
    totalCost,
    totalMV,
    unrealizedPL,
    unrealizedPct: totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0,
    realizedThisYear,
    divThisYear,
    assetCount: list.length,
    recentTransactions: recent,
    byType,
  });
});

module.exports = router;
