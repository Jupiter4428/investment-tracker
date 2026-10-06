const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeHoldings, realizedForSell } = require('../services/portfolioEngine');

const router = express.Router();
router.use(requireAuth);

const transactionActions = new Set(['ซื้อ', 'ขาย', 'ปันผล', 'ดอกเบี้ย', 'ฝากเงิน', 'ถอนเงิน']);
const cashActions = new Set(['ฝากเงิน', 'ถอนเงิน']);

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
  const currencyPerUsdRates = Object.fromEntries(db.prepare('SELECT currency, currency_per_usd FROM fx_rates').all().map((row) => [row.currency, row.currency_per_usd]));
  const transactions = rows.map((t) => {
    const currency = String(t.currency || 'USD').trim().toUpperCase();
    const currencyPerUsd = Number(currencyPerUsdRates[currency]);
    return currency !== 'USD' && Number(t.fx_rate) === 1 && Number.isFinite(currencyPerUsd) && currencyPerUsd > 0
      ? { ...t, fx_rate: 1 / currencyPerUsd }
      : t;
  });
  res.json({ transactions });
});

// Distinct list of brokers already used, for the filter dropdown / datalist suggestions.
router.get('/brokers', (req, res) => {
  const rows = db.prepare("SELECT DISTINCT broker FROM transactions WHERE broker IS NOT NULL AND broker != '' ORDER BY broker").all();
  res.json({ brokers: rows.map((r) => r.broker) });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const isCashFlow = cashActions.has(b.action);
  const quantity = Number(b.qty);
  const price = Number(b.price);
  const fee = Number(b.fee) || 0;
  const tax = Number(b.tax) || 0;
  const currency = String(b.currency || 'USD').trim().toUpperCase() || 'USD';
  const suppliedFxRate = b.fxRate ?? b.fx_rate;
  const storedCurrencyPerUsd = currency === 'USD'
    ? 1
    : Number(db.prepare('SELECT currency_per_usd FROM fx_rates WHERE currency = ?').get(currency)?.currency_per_usd);
  const fxRate = currency === 'USD'
    ? 1
    : suppliedFxRate !== undefined
      ? Number(suppliedFxRate)
      : Number.isFinite(storedCurrencyPerUsd) && storedCurrencyPerUsd > 0
        ? 1 / storedCurrencyPerUsd
        : NaN;
  if (currency !== 'USD' && (!Number.isFinite(fxRate) || fxRate <= 0)) {
    return res.status(400).json({ error: `Refresh current prices to load an FX rate for ${currency} before saving this transaction` });
  }
  if (!transactionActions.has(b.action) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !Number.isFinite(quantity) || quantity <= 0
    || (!isCashFlow && (!b.assetType || !b.symbol || !Number.isFinite(price) || price <= 0))
    || fee < 0 || tax < 0 || !Number.isFinite(fee) || !Number.isFinite(tax)) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }
  const symbol = isCashFlow ? 'CASH' : String(b.symbol).trim().toUpperCase();

  if (b.action === 'ขาย') {
    const holdings = computeHoldings(allTx());
    const h = holdings[symbol];
    if (!h || h.qty < Number(b.qty) - 0.0000001) {
      return res.status(400).json({ error: 'Not enough units to sell' });
    }
  }

  const row = {
    id: 't' + Date.now() + Math.floor(Math.random() * 1000),
    date: b.date || new Date().toISOString().slice(0, 10),
    asset_type: isCashFlow ? 'เงินสด' : b.assetType,
    action: b.action,
    symbol,
    ticker: !isCashFlow && b.ticker ? String(b.ticker).trim() : null,
    name: isCashFlow ? 'Cash account' : (b.name || '').trim(),
    broker: b.broker ? String(b.broker).trim() : null,
    qty: quantity,
    price: isCashFlow ? 1 : price,
    fee,
    tax,
    currency,
    fx_rate: currency === 'USD' ? 1 : Number(fxRate || 1),
    note: (b.note || '').trim(),
    created_by: req.user.name,
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO transactions (id,date,asset_type,action,symbol,ticker,name,broker,qty,price,fee,tax,currency,fx_rate,note,created_by,created_at)
     VALUES (@id,@date,@asset_type,@action,@symbol,@ticker,@name,@broker,@qty,@price,@fee,@tax,@currency,@fx_rate,@note,@created_by,@created_at)`
  ).run(row);

  if (!isCashFlow && row.price > 0) {
    db.prepare(
      `INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
    ).run(symbol, row.price, Date.now());
  }

  res.status(201).json({ transaction: row });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });
  const b = req.body || {};
  const action = b.action || existing.action;
  if (!transactionActions.has(action)) return res.status(400).json({ error: 'Invalid transaction type' });
  const isCashFlow = cashActions.has(action);
  const currency = String(b.currency !== undefined ? (b.currency || 'USD') : (existing.currency || 'USD')).trim().toUpperCase() || 'USD';
  const fxRate = Number(b.fxRate ?? b.fx_rate ?? existing.fx_rate ?? 1);
  const updated = {
    id: existing.id,
    date: b.date || existing.date,
    asset_type: isCashFlow ? 'เงินสด' : (b.assetType || existing.asset_type),
    action,
    symbol: isCashFlow ? 'CASH' : (b.symbol ? String(b.symbol).trim().toUpperCase() : existing.symbol),
    ticker: isCashFlow ? null : b.ticker !== undefined ? (b.ticker ? String(b.ticker).trim() : null) : existing.ticker,
    name: isCashFlow ? 'Cash account' : b.name !== undefined ? String(b.name).trim() : existing.name,
    broker: b.broker !== undefined ? (b.broker ? String(b.broker).trim() : null) : existing.broker,
    qty: b.qty !== undefined ? Number(b.qty) || 0 : existing.qty,
    price: isCashFlow ? 1 : b.price !== undefined ? Number(b.price) || 0 : existing.price,
    fee: b.fee !== undefined ? Number(b.fee) || 0 : existing.fee,
    tax: b.tax !== undefined ? Number(b.tax) || 0 : existing.tax || 0,
    currency,
    fx_rate: currency === 'USD' ? 1 : Number.isFinite(fxRate) && fxRate > 0 ? fxRate : 1,
    note: b.note !== undefined ? String(b.note).trim() : existing.note,
  };
  db.prepare(
    `UPDATE transactions SET date=@date, asset_type=@asset_type, action=@action, symbol=@symbol,
    ticker=@ticker, name=@name, broker=@broker, qty=@qty, price=@price, fee=@fee, tax=@tax, currency=@currency, fx_rate=@fx_rate, note=@note WHERE id=@id`
  ).run(updated);
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ ok: true });
});

// Preview of realized gain for a hypothetical/pending SELL, used by the "new tx" form
// (mirrors calcTx()'s realizedBox logic in the original app).
router.post('/preview-sell', (req, res) => {
  const b = req.body || {};
  const symbol = String(b.symbol || '').trim().toUpperCase();
  const qty = Number(b.qty) || 0;
  const price = Number(b.price) || 0;
  const fee = (Number(b.fee) || 0) + (Number(b.tax) || 0);
  const holdings = computeHoldings(allTx());
  const h = holdings[symbol];
  const avg = h && h.qty > 0 ? h.costBasis / h.qty : 0;
  const gain = price * qty - fee - avg * qty;
  res.json({ avgCost: avg, remainingQty: h ? h.qty : 0, estimatedGain: gain });
});

module.exports = router;
module.exports.allTx = allTx;
module.exports.realizedForSell = realizedForSell;
