const test = require('node:test');
const assert = require('node:assert/strict');
const { portfolioTotals, resolveDashboardTotals } = require('../src/services/portfolioEngine');
const { historicalSnapshots } = require('../src/data/historicalStatements');

test('dashboard totals fall back to latest snapshot when holdings are empty', () => {
  const latest = historicalSnapshots.at(-1);
  const totals = resolveDashboardTotals([], latest);
  assert.equal(totals.totalMV, 583.06);
  assert.equal(totals.totalCost, 526.13);
  assert.equal(totals.asOfDate, '2026-09-30');
  assert.equal(totals.source, 'snapshot');
});

test('dashboard totals prefer live holdings over statement snapshots', () => {
  const totals = resolveDashboardTotals(
    [{ costBasis: 100, marketValue: 120 }],
    historicalSnapshots.at(-1)
  );
  assert.equal(totals.totalMV, 120);
  assert.equal(totals.totalCost, 100);
  assert.equal(totals.source, 'holdings');
});

test('portfolio totals treat stored prices and costs as USD', () => {
  const transactions = [
    { date: '2026-10-06', asset_type: 'หุ้นต่างประเทศ', action: 'ซื้อ', symbol: 'AAPL', ticker: 'AAPL', qty: 2, price: 10, fee: 0 },
    { date: '2026-10-06', asset_type: 'หุ้นไทย', action: 'ซื้อ', symbol: 'PTT', ticker: 'PTT.BK', qty: 3, price: 20, fee: 0 },
  ];
  const prices = [
    { symbol: 'AAPL', price: 12 },
    { symbol: 'PTT', price: 25 },
  ];

  assert.deepEqual(portfolioTotals(transactions, prices), {
    totalCost: 80,
    totalMV: 99,
  });
});
