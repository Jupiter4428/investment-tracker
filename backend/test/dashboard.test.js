const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDashboardTotals } = require('../src/services/portfolioEngine');
const { historicalSnapshots } = require('../src/data/historicalStatements');

test('dashboard totals fall back to latest snapshot when holdings are empty', () => {
  const latest = historicalSnapshots.at(-1);
  const totals = resolveDashboardTotals([], latest);
  assert.equal(totals.totalMV, 15578.95);
  assert.equal(totals.totalCost, 14832.77);
  assert.equal(totals.asOfDate, '2026-08-31');
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
