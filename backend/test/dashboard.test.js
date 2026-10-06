const test = require('node:test');
const assert = require('node:assert/strict');
const { cashBalancesToUsd, computeCashBalance, computeCashBalances, computeNetTotalInvested, portfolioTotals, resolveDashboardTotals, resolveDashboardSnapshotValue } = require('../src/services/portfolioEngine');
const { computeStockWinRate, computeXirr } = require('../src/services/performance');
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

test('snapshot cash balance is included when recomputing nav after the latest snapshot', () => {
  const totals = resolveDashboardSnapshotValue([], { totalValue: 1000, totalCost: 500, cashBalance: 200 }, 50);
  assert.equal(totals.totalMV, 800);
  assert.equal(totals.cashBalance, 250);
  assert.equal(totals.nav, 1050);
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
    cashBalance: -80,
    cashBalances: { USD: -80 },
    nav: 19,
    netTotalInvested: 0,
  });
});

test('price IRR uses dated cash flows and current value', () => {
  const rate = computeXirr([
    { date: '2025-01-01', amount: -100 },
    { date: '2026-01-01', amount: 110 },
  ]);
  assert.ok(Math.abs(rate - 10) < 0.1);
});

test('stock win rate counts only open Thai and foreign stock holdings', () => {
  assert.deepEqual(computeStockWinRate([
    { assetType: 'หุ้นไทย', unrealizedPL: 10 },
    { assetType: 'หุ้นต่างประเทศ', unrealizedPL: -2 },
    { assetType: 'กองทุนรวม', unrealizedPL: 50 },
  ]), { winners: 1, total: 2, rate: 50 });
});

test('cash ledger includes deposits, trades, fees, taxes, withdrawals and net invested capital', () => {
  const transactions = [
    { date: '2026-01-01', action: 'ฝากเงิน', qty: 100, price: 1, fee: 0, tax: 0 },
    { date: '2026-01-02', action: 'ซื้อ', qty: 2, price: 20, fee: 2, tax: 3 },
    { date: '2026-01-03', action: 'ขาย', qty: 1, price: 25, fee: 1, tax: 1 },
    { date: '2026-01-04', action: 'ถอนเงิน', qty: 10, price: 1, fee: 0, tax: 0 },
  ];
  assert.equal(computeCashBalance(transactions), 68);
  assert.equal(computeNetTotalInvested(transactions), 90);
});

test('cash ledger ignores pre-activation transactions but accepts backfilled entries', () => {
  const transactions = [
    { date: '2025-01-01', action: 'ซื้อ', qty: 2, price: 50, created_at: 10 },
    { date: '2025-01-02', action: 'ฝากเงิน', qty: 80, price: 1, created_at: 200 },
  ];
  assert.equal(computeCashBalance(transactions, undefined, 100), 80);
  assert.equal(computeNetTotalInvested(transactions, undefined, 100), 80);
});

test('cash and dividend flows convert non-USD amounts using fx rate before stats', () => {
  const transactions = [
    { date: '2026-01-01', action: 'ฝากเงิน', qty: 1000, price: 1, fee: 0, tax: 0, currency: 'THB', fx_rate: 0.032 },
    { date: '2026-01-02', action: 'ปันผล', qty: 50, price: 1, fee: 0, tax: 0, currency: 'THB', fx_rate: 0.032 },
  ];
  assert.equal(computeCashBalance(transactions), 33.6);
  assert.equal(computeNetTotalInvested(transactions), 32);
});

test('native cash balances use current FX rates while invested capital keeps its deposit-date value', () => {
  const transactions = [
    { date: '2026-10-06', action: 'ฝากเงิน', qty: 3650, price: 1, fee: 0, tax: 0, currency: 'THB', fx_rate: 1 / 36.5 },
  ];
  const nativeBalances = computeCashBalances(transactions);

  assert.deepEqual(nativeBalances, { THB: 3650 });
  assert.equal(cashBalancesToUsd(nativeBalances, { USD: 1, THB: 36.5 }), 100);
  assert.equal(cashBalancesToUsd(nativeBalances, { USD: 1, THB: 40 }), 91.25);
  assert.equal(computeNetTotalInvested(transactions), 100);
});

test('cash deposits with a default FX rate use the current rate for invested capital', () => {
  const transactions = [
    { date: '2026-10-06', action: 'ฝากเงิน', qty: 1260.05, price: 1, currency: 'THB', fx_rate: 1 },
  ];

  assert.ok(Math.abs(computeNetTotalInvested(transactions, undefined, undefined, { THB: 36.5 }) - 1260.05 / 36.5) < 1e-10);
});
