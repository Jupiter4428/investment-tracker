const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreStock } = require('../src/services/smartDcaV2/scoring');
const { buildSmartDcaV2 } = require('../src/services/smartDcaV2');
const { allocateDcaBudget } = require('../src/services/smartDcaV2/allocation');
const { historicalSnapshots } = require('../src/data/historicalStatements');

const validMarket = { price: 100, ema26: 110, rsi: 35, macd: -1, signal: 0, pe: 20, volatility: 0.3 };

 test('scoreStock reports overweight and hard-max state', () => {
  const result = scoreStock({ ticker: 'TSM', currentWeight: 0.24, targetWeight: 0.18, hardMaxWeight: 0.23, ...validMarket });
  assert.equal(result.isOverweight, true);
  assert.equal(result.isOverMax, true);
  assert.ok(result.compositeScore >= 0 && result.compositeScore <= 100);
});

test('not-in-target stocks never receive DCA allocation', () => {
  const result = buildSmartDcaV2({
    portfolio: { value: 10000, holdings: [{ symbol: 'IONQ', weight: 0.03 }] },
    stocks: [{ symbol: 'IONQ', ticker: 'IONQ', currentWeight: 0.03, targetWeight: 0, hardMaxWeight: 0, ...validMarket }],
    monthlyBudget: 200,
  });
  assert.equal(result.stocks[0].status, 'NOT_IN_TARGET');
  assert.equal(result.stocks[0].action, 'NOT_IN_TARGET');
  assert.equal(result.stocks[0].dcaAmount, 0);
});

test('allocator respects hard-max capacity, single-stock cap, and budget', () => {
  const result = allocateDcaBudget([
    { ticker: 'A', status: 'TARGET', action: 'BUY', currentWeight: 0.19, hardMaxWeight: 0.20, targetWeight: 0.25, compositeScore: 100, underweight: 0.06 },
    { ticker: 'B', status: 'TARGET', action: 'BUY', currentWeight: 0, hardMaxWeight: 0.5, targetWeight: 0.5, compositeScore: 80, underweight: 0.5 },
    { ticker: 'IONQ', status: 'NOT_IN_TARGET', action: 'NOT_IN_TARGET', currentWeight: 0.03, hardMaxWeight: 0, targetWeight: 0, compositeScore: 100, underweight: 0 },
  ], 1000, { portfolioValue: 10000, volatility: 0, riskScore: 0 });
  assert.ok(result.allocations.A <= 100);
  assert.equal(result.allocations.IONQ, 0);
  assert.ok(Object.values(result.allocations).reduce((sum, amount) => sum + amount, 0) <= 1000);
});

test('high volatility never increases allocation beyond available budget', () => {
  const result = allocateDcaBudget([
    { ticker: 'A', status: 'TARGET', action: 'BUY', currentWeight: 0, hardMaxWeight: 0.5, targetWeight: 0.25, compositeScore: 100, underweight: 0.25 },
    { ticker: 'B', status: 'TARGET', action: 'BUY', currentWeight: 0, hardMaxWeight: 0.5, targetWeight: 0.25, compositeScore: 80, underweight: 0.25 },
    { ticker: 'C', status: 'TARGET', action: 'BUY', currentWeight: 0, hardMaxWeight: 0.5, targetWeight: 0.25, compositeScore: 60, underweight: 0.25 },
    { ticker: 'D', status: 'TARGET', action: 'BUY', currentWeight: 0, hardMaxWeight: 0.5, targetWeight: 0.25, compositeScore: 40, underweight: 0.25 },
  ], 1000, { portfolioValue: 10000, volatility: 0.8, riskScore: 0 });

  const totalAllocated = Object.values(result.allocations).reduce((sum, amount) => sum + amount, 0);
  assert.ok(totalAllocated <= 1000);
  assert.equal(result.multiplier, 1.5);
});

test('engine separates not-in-target holdings in its output', () => {
  const result = buildSmartDcaV2({
    portfolio: { value: 10000, holdings: [{ symbol: 'IONQ', weight: 0.03 }] },
    stocks: [{ symbol: 'IONQ', ticker: 'IONQ', currentWeight: 0.03, targetWeight: 0, hardMaxWeight: 0, ...validMarket }],
    monthlyBudget: 200,
  });

  assert.deepEqual(result.notInTarget, [{ ticker: 'IONQ', currentWeight: 0.03, action: 'NOT_IN_TARGET', dcaAmount: 0 }]);
});

test('invalid market data requires review and receives no allocation', () => {
  const result = buildSmartDcaV2({
    portfolio: { value: 10000, holdings: [] },
    stocks: [{ ticker: 'TSM', currentWeight: 0, targetWeight: 0.18, hardMaxWeight: 0.23 }],
    monthlyBudget: 200,
  });

  assert.equal(result.stocks[0].action, 'REVIEW');
  assert.equal(result.stocks[0].dcaAmount, 0);
  assert.equal(result.summary.totalAllocated, 0);
});

test('historical statements provide month-end portfolio snapshots in THB', () => {
  assert.equal(historicalSnapshots.length, 10);
  assert.deepEqual(historicalSnapshots[0], {
    date: '2025-11-28',
    totalValue: 3920.84,
    totalCost: 3963.78,
    source: 'KKP Dime monthly statement',
  });
  assert.equal(historicalSnapshots.at(-1).date, '2026-08-31');
  assert.ok(historicalSnapshots.every((snapshot) => snapshot.totalValue >= 0 && snapshot.totalCost >= 0));
});
