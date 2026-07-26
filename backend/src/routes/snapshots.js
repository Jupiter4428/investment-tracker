const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { portfolioTotals } = require('../services/portfolioEngine');
const { computeMetrics } = require('../services/performance');
const { getIndicatorsForTicker } = require('../services/marketData');

const router = express.Router();
router.use(requireAuth);

function getBenchmarkTicker() {
  const row = db.prepare("SELECT v FROM settings WHERE k = 'benchmarkTicker'").get();
  return (row && row.v) || 'SPY';
}

/**
 * POST /api/snapshots/capture
 * Records today's (or a given date's) total portfolio market value + the
 * benchmark's price, so the performance chart has a data point. Safe to call
 * repeatedly — re-capturing the same date overwrites that day's snapshot.
 * body: { date?: 'YYYY-MM-DD', benchmarkTicker?: string }
 */
router.post('/capture', async (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  const benchmarkTicker = (req.body?.benchmarkTicker || getBenchmarkTicker() || 'SPY').toUpperCase();

  const allTx = db.prepare('SELECT * FROM transactions').all();
  const prices = db.prepare('SELECT symbol, price FROM prices').all();
  const { totalCost, totalMV } = portfolioTotals(allTx, prices);

  let benchmarkPrice = null;
  try {
    const ind = await getIndicatorsForTicker(benchmarkTicker);
    benchmarkPrice = ind ? ind.price : null;
  } catch {
    benchmarkPrice = null;
  }

  db.prepare(
    `INSERT INTO portfolio_snapshots (date, total_value, total_cost, benchmark_ticker, benchmark_price, created_at)
     VALUES (@date, @totalMV, @totalCost, @benchmarkTicker, @benchmarkPrice, @createdAt)
     ON CONFLICT(date) DO UPDATE SET total_value=@totalMV, total_cost=@totalCost,
       benchmark_ticker=@benchmarkTicker, benchmark_price=@benchmarkPrice, created_at=@createdAt`
  ).run({ date, totalMV, totalCost, benchmarkTicker, benchmarkPrice, createdAt: Date.now() });

  res.status(201).json({ snapshot: { date, totalValue: totalMV, totalCost, benchmarkTicker, benchmarkPrice } });
});

/**
 * GET /api/snapshots?days=180
 * Returns the snapshot series plus computed performance stats (portfolio vs.
 * benchmark, both normalized to the same starting value so they're visually
 * comparable — same approach as the reference chart).
 */
router.get('/', (req, res) => {
  const days = Number(req.query.days) || 365;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = db
    .prepare('SELECT * FROM portfolio_snapshots WHERE date >= ? ORDER BY date ASC')
    .all(since);

  if (!rows.length) {
    return res.json({ series: [], portfolioMetrics: null, benchmarkMetrics: null, benchmarkTicker: getBenchmarkTicker() });
  }

  const firstMV = rows[0].total_value;
  const firstBenchPrice = rows.find((r) => r.benchmark_price != null)?.benchmark_price;

  const series = rows.map((r) => ({
    date: r.date,
    portfolioValue: r.total_value,
    totalCost: r.total_cost,
    benchmarkValue: firstBenchPrice && r.benchmark_price != null ? firstMV * (r.benchmark_price / firstBenchPrice) : null,
  }));

  const portfolioSeries = series.map((s) => ({ date: s.date, value: s.portfolioValue }));
  const benchmarkSeries = series.filter((s) => s.benchmarkValue != null).map((s) => ({ date: s.date, value: s.benchmarkValue }));

  // Roughly annualize based on actual snapshot cadence rather than assuming daily data.
  const spanDays = (new Date(rows[rows.length - 1].date) - new Date(rows[0].date)) / 86400000;
  const periodsPerYear = spanDays > 0 && rows.length > 1 ? Math.max(4, Math.round(((rows.length - 1) / spanDays) * 365)) : 252;

  res.json({
    series,
    portfolioMetrics: computeMetrics(portfolioSeries, periodsPerYear),
    benchmarkMetrics: benchmarkSeries.length > 1 ? computeMetrics(benchmarkSeries, periodsPerYear) : null,
    benchmarkTicker: rows[rows.length - 1].benchmark_ticker || getBenchmarkTicker(),
  });
});

router.delete('/:date', (req, res) => {
  const info = db.prepare('DELETE FROM portfolio_snapshots WHERE date = ?').run(req.params.date);
  if (info.changes === 0) return res.status(404).json({ error: 'ไม่พบสแนปช็อตวันที่นี้' });
  res.json({ ok: true });
});

module.exports = router;
