const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeHoldings, realizedForSell } = require('../services/portfolioEngine');

const router = express.Router();
router.use(requireAuth);

function allTx() {
  return db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all();
}

router.get('/', (req, res) => {
  const { q, from, to, type, action, broker } = req.query;
  let rows = allTx();
  if (q) {
    const needle = q.trim().toUpperCase();
    rows = rows.filter((t) => t.symbol.includes(needle) || (t.name || '').toUpperCase().includes(needle));
  }
  if (from) rows = rows.filter((t) => t.date >= from);
  if (to) rows = rows.filter((t) => t.date <= to);
  if (type) rows = rows.filter((t) => t.asset_type === type);
  if (action) rows = rows.filter((t) => t.action === action);
  if (broker) rows = rows.filter((t) => (t.broker || '') === broker);
  res.json({ transactions: rows });
});

// Distinct list of brokers already used, for the filter dropdown / datalist suggestions.
router.get('/brokers', (req, res) => {
  const rows = db.prepare("SELECT DISTINCT broker FROM transactions WHERE broker IS NOT NULL AND broker != '' ORDER BY broker").all();
  res.json({ brokers: rows.map((r) => r.broker) });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.assetType || !b.symbol || !b.action || !(Number(b.qty) > 0)) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  const symbol = String(b.symbol).trim().toUpperCase();

  if (b.action === 'ขาย') {
    const holdings = computeHoldings(allTx());
    const h = holdings[symbol];
    if (!h || h.qty < Number(b.qty) - 0.0000001) {
      return res.status(400).json({ error: 'จำนวนหน่วยที่มีไม่พอสำหรับขาย' });
    }
  }

  const row = {
    id: 't' + Date.now() + Math.floor(Math.random() * 1000),
    date: b.date || new Date().toISOString().slice(0, 10),
    asset_type: b.assetType,
    action: b.action,
    symbol,
    ticker: b.ticker ? String(b.ticker).trim() : null,
    name: (b.name || '').trim(),
    broker: b.broker ? String(b.broker).trim() : null,
    qty: Number(b.qty) || 0,
    price: Number(b.price) || 0,
    fee: Number(b.fee) || 0,
    note: (b.note || '').trim(),
    created_by: req.user.name,
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO transactions (id,date,asset_type,action,symbol,ticker,name,broker,qty,price,fee,note,created_by,created_at)
     VALUES (@id,@date,@asset_type,@action,@symbol,@ticker,@name,@broker,@qty,@price,@fee,@note,@created_by,@created_at)`
  ).run(row);

  db.prepare(
    `INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
  ).run(symbol, row.price, Date.now());

  res.status(201).json({ transaction: row });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบธุรกรรม' });
  const b = req.body || {};
  const updated = {
    id: existing.id,
    date: b.date || existing.date,
    asset_type: b.assetType || existing.asset_type,
    action: b.action || existing.action,
    symbol: (b.symbol ? String(b.symbol).trim().toUpperCase() : existing.symbol),
    ticker: b.ticker !== undefined ? (b.ticker ? String(b.ticker).trim() : null) : existing.ticker,
    name: b.name !== undefined ? String(b.name).trim() : existing.name,
    broker: b.broker !== undefined ? (b.broker ? String(b.broker).trim() : null) : existing.broker,
    qty: b.qty !== undefined ? Number(b.qty) || 0 : existing.qty,
    price: b.price !== undefined ? Number(b.price) || 0 : existing.price,
    fee: b.fee !== undefined ? Number(b.fee) || 0 : existing.fee,
    note: b.note !== undefined ? String(b.note).trim() : existing.note,
  };
  db.prepare(
    `UPDATE transactions SET date=@date, asset_type=@asset_type, action=@action, symbol=@symbol,
     ticker=@ticker, name=@name, broker=@broker, qty=@qty, price=@price, fee=@fee, note=@note WHERE id=@id`
  ).run(updated);
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'ไม่พบธุรกรรม' });
  res.json({ ok: true });
});

// Preview of realized gain for a hypothetical/pending SELL, used by the "new tx" form
// (mirrors calcTx()'s realizedBox logic in the original app).
router.post('/preview-sell', (req, res) => {
  const b = req.body || {};
  const symbol = String(b.symbol || '').trim().toUpperCase();
  const qty = Number(b.qty) || 0;
  const price = Number(b.price) || 0;
  const fee = Number(b.fee) || 0;
  const holdings = computeHoldings(allTx());
  const h = holdings[symbol];
  const avg = h && h.qty > 0 ? h.costBasis / h.qty : 0;
  const gain = price * qty - fee - avg * qty;
  res.json({ avgCost: avg, remainingQty: h ? h.qty : 0, estimatedGain: gain });
});

module.exports = router;
module.exports.allTx = allTx;
module.exports.realizedForSell = realizedForSell;
