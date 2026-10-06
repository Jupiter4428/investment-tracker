const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cashBalancesToUsd, computeCashBalances, computeHoldings, computeNetTotalInvested, mergeCashBalances, realizedForSell, resolveCurrencyPerUsdRates, resolveDashboardSnapshotValue } = require('../services/portfolioEngine');
const { computeStockWinRate, computeXirr } = require('../services/performance');

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
function snapshotCashBalances(snapshot) {
  if (snapshot?.cashBalancesJson) {
    try {
      const balances = JSON.parse(snapshot.cashBalancesJson);
      if (balances && typeof balances === 'object' && Object.keys(balances).length) return balances;
    } catch { /* legacy snapshot without native-currency balances */ }
  }
  return snapshot ? { USD: Number(snapshot.cashBalance || 0) } : {};
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
  if (Number.isNaN(price)) return res.status(400).json({ error: 'Invalid price' });
  db.prepare(
    `INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
  ).run(symbol, price, Date.now());
  res.json({ ok: true });
});

router.get('/dashboard', (req, res) => {
  const list = holdingsWithMarketValue();
  const latestSnapshot = db.prepare(
    'SELECT date, total_value AS totalValue, total_cost AS totalCost, cash_balance AS cashBalance, cash_balances_json AS cashBalancesJson, net_total_invested AS netTotalInvested, created_at AS createdAt FROM portfolio_snapshots ORDER BY date DESC LIMIT 1'
  ).get();
  const thisYear = String(new Date().getFullYear());
  const txs = allTx();
  const trackingStart = db.prepare("SELECT v FROM settings WHERE k = 'cash_tracking_started_at'").get()?.v;
  const snapshotBase = resolveDashboardSnapshotValue(list, latestSnapshot, 0);
  const source = snapshotBase.source;
  const cashTransactions = latestSnapshot && source === 'snapshot'
    ? txs.filter((t) => t.date > latestSnapshot.date || (t.date === latestSnapshot.date && t.created_at > latestSnapshot.createdAt))
    : txs;
  const balances = source === 'snapshot'
    ? mergeCashBalances(snapshotCashBalances(latestSnapshot), computeCashBalances(cashTransactions, undefined, trackingStart))
    : computeCashBalances(txs, undefined, trackingStart);
  const storedFxRates = Object.fromEntries(db.prepare('SELECT currency, currency_per_usd FROM fx_rates').all().map((row) => [row.currency, row.currency_per_usd]));
  const currentFxRates = resolveCurrencyPerUsdRates(txs, storedFxRates);
  const cashBalance = cashBalancesToUsd(balances, currentFxRates);
  const { totalCost, totalMV, asOfDate, source: resolvedSource } = snapshotBase;
  const nav = totalMV + cashBalance;
  const unrealizedPL = totalMV - totalCost;
  const netTotalInvested = resolvedSource === 'snapshot'
    ? Number(latestSnapshot.netTotalInvested || 0) + computeNetTotalInvested(cashTransactions, undefined, trackingStart, currentFxRates)
    : computeNetTotalInvested(txs, undefined, trackingStart, currentFxRates);
  const sells = txs.filter((t) => t.action === 'ขาย' && t.date.startsWith(thisYear));
  const bySymbol = {};
  txs.forEach((t) => {
    (bySymbol[t.symbol] = bySymbol[t.symbol] || []).push(t);
  });
  const realizedThisYear = sells.reduce((s, t) => s + realizedForSell(bySymbol[t.symbol] || [], t), 0);
  const divThisYear = txs
    .filter((t) => (t.action === 'ปันผล' || t.action === 'ดอกเบี้ย') && t.date.startsWith(thisYear))
    .reduce((s, t) => s + t.qty * t.price - (t.fee || 0) - (t.tax || 0), 0);

  const valuationDate = asOfDate || new Date().toISOString().slice(0, 10);
  const priceCashFlows = txs
    .filter((t) => t.date <= valuationDate && (t.action === 'ซื้อ' || t.action === 'ขาย'))
    .map((t) => ({
      date: t.date,
      amount: t.action === 'ซื้อ'
        ? -(t.qty * t.price + t.fee + (t.tax || 0))
        : t.qty * t.price - t.fee - (t.tax || 0),
    }));
  if (source !== 'snapshot' && totalMV > 0) priceCashFlows.push({ date: valuationDate, amount: totalMV });
  const priceIrr = computeXirr(priceCashFlows);

  const benchmarkTicker = (db.prepare("SELECT v FROM settings WHERE k = 'benchmarkTicker'").get()?.v || '^GSPC').toUpperCase();
  const benchmarkRows = db.prepare(
    'SELECT date, benchmark_price FROM portfolio_snapshots WHERE benchmark_ticker = ? AND benchmark_price > 0 ORDER BY date ASC'
  ).all(benchmarkTicker);
  const firstBenchmark = benchmarkRows[0];
  const lastBenchmark = benchmarkRows.at(-1);
  const benchmarkReturn = benchmarkRows.length > 1 && lastBenchmark.date > firstBenchmark.date
    ? (lastBenchmark.benchmark_price / firstBenchmark.benchmark_price - 1) * 100
    : null;
  const stockWinRate = computeStockWinRate(list);

  const recent = txs.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.id < a.id ? -1 : 1)).slice(0, 8);

  const byType = {};
  list.forEach((h) => {
    byType[h.assetType] = (byType[h.assetType] || 0) + h.marketValue;
  });

  res.json({
    totalCost,
    totalMV,
    cashBalance,
    nav,
    netTotalInvested,
    unrealizedPL,
    unrealizedPct: totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0,
    realizedThisYear,
    divThisYear,
    priceIrr,
    benchmarkTicker,
    benchmarkReturn,
    stockWinRate,
    assetCount: list.length,
    recentTransactions: recent,
    byType,
    asOfDate,
  });
});

module.exports = router;
