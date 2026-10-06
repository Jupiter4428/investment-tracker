const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');
const { once } = require('node:events');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-price-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.JWT_SECRET = 'live-price-test-secret';

const db = require('../src/db');
const smartDcaRoutes = require('../src/routes/smartDcaV2');
const holdingsRoutes = require('../src/routes/holdings');
const transactionsRoutes = require('../src/routes/transactions');
const marketRoutes = require('../src/routes/market');

test('DCA uses cached market data when calculating and persists market values', async (t) => {
  db.prepare(
    `INSERT INTO transactions (id,date,asset_type,action,symbol,ticker,name,broker,qty,price,fee,note,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run('live-price-test', '2026-10-06', 'Foreign stock', 'ซื้อ', 'TEST', 'TEST', 'Test asset', 'Test broker', 2, 10, 0, '', 'Test', Date.now());
  db.prepare('INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)').run('TEST', 10, Date.now());
  db.prepare('INSERT INTO market_cache (symbol, payload, fetched_at) VALUES (?, ?, ?)').run(
    'TEST',
    JSON.stringify({ ticker: 'TEST', price: 15, rsi: 40, macd: 1, signal: 0, ema26: 14, pe: 20, volatility: 0.2 }),
    Date.now()
  );

  const app = express();
  app.use(express.json());
  app.use('/api/dca/v2', smartDcaRoutes);
  app.use('/api/holdings', holdingsRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/market', marketRoutes);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const token = jwt.sign({ sub: 'test-user', name: 'Test User', role: 'owner' }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}` };
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const dcaResponse = await fetch(`${baseUrl}/dca/v2?fetchLive=true&monthlyBudget=0`, { headers });
  assert.equal(dcaResponse.status, 200);
  const sampleRow = db.prepare("SELECT sample_json FROM smart_dca_training_samples WHERE ticker = 'TEST'").get();
  assert.ok(sampleRow);
  const sample = JSON.parse(sampleRow.sample_json);
  assert.equal(sample.calculationMode, 'fetch_requested');
  assert.equal(sample.features.price, 15);
  assert.equal(sample.recommendation.action, 'NOT_IN_TARGET');
  assert.equal(sample.outcome, null);

  const cachedResponse = await fetch(`${baseUrl}/dca/v2?monthlyBudget=0`, { headers });
  assert.equal(cachedResponse.status, 200);
  const cachedResult = await cachedResponse.json();
  const cachedStock = cachedResult.stocks.find((stock) => stock.ticker === 'TEST');
  assert.equal(cachedStock.price, 15);
  assert.equal(cachedStock.rsi, 40);

  const exportResponse = await fetch(`${baseUrl}/dca/v2/training-data`, { headers });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-type'), /application\/x-ndjson/);
  const exportedSamples = (await exportResponse.text()).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(exportedSamples.some((entry) => entry.runId === sample.runId));

  const holdingsResponse = await fetch(`${baseUrl}/holdings`, { headers });
  const { holdings } = await holdingsResponse.json();
  const dashboardResponse = await fetch(`${baseUrl}/holdings/dashboard`, { headers });
  const dashboard = await dashboardResponse.json();

  assert.equal(holdings[0].currentPrice, 15);
  assert.equal(holdings[0].marketValue, 30);
  assert.equal(dashboard.totalCost, 20);
  assert.equal(dashboard.totalMV, 30);
  assert.equal(dashboard.thbPerUsd, null);

  const depositResponse = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-10-06', action: 'ฝากเงิน', qty: 100, price: 1, fee: 0, tax: 0 }),
  });
  assert.equal(depositResponse.status, 201);
  const { transaction } = await depositResponse.json();
  assert.equal(transaction.asset_type, 'เงินสด');
  assert.equal(transaction.symbol, 'CASH');

  const updatedDashboard = await (await fetch(`${baseUrl}/holdings/dashboard`, { headers })).json();
  assert.equal(updatedDashboard.cashBalance, 80);
  assert.equal(updatedDashboard.nav, 110);
  assert.equal(updatedDashboard.netTotalInvested, 100);

  const saveFxRate = (thbPerUsd) => fetch(`${baseUrl}/market/fx-rates`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rates: { THB: thbPerUsd } }),
  });
  const thbDepositBody = {
    date: '2026-10-06', action: 'ฝากเงิน', qty: 3650, price: 1, fee: 0, tax: 0,
    currency: 'THB',
  };
  const depositBeforeRefresh = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(thbDepositBody),
  });
  assert.equal(depositBeforeRefresh.status, 400);
  assert.match((await depositBeforeRefresh.json()).error, /Refresh current prices/);
  assert.equal((await saveFxRate(36.5)).status, 200);

  const thbDepositResponse = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(thbDepositBody),
  });
  assert.equal(thbDepositResponse.status, 201);

  const dashboardAtDepositRate = await (await fetch(`${baseUrl}/holdings/dashboard`, { headers })).json();
  assert.equal(dashboardAtDepositRate.cashBalance, 180);
  assert.equal(dashboardAtDepositRate.netTotalInvested, 200);
  assert.equal(dashboardAtDepositRate.thbPerUsd, 36.5);

  assert.equal((await saveFxRate(40)).status, 200);
  const dashboardAtCurrentRate = await (await fetch(`${baseUrl}/holdings/dashboard`, { headers })).json();
  assert.equal(dashboardAtCurrentRate.cashBalance, 171.25);
  assert.equal(dashboardAtCurrentRate.netTotalInvested, 200);
  assert.equal(dashboardAtCurrentRate.thbPerUsd, 40);
  const storedThbDeposit = db.prepare("SELECT qty, currency, fx_rate FROM transactions WHERE symbol = 'CASH' AND currency = 'THB'").get();
  assert.equal(storedThbDeposit.qty, 3650);
  assert.equal(storedThbDeposit.currency, 'THB');
  assert.equal(storedThbDeposit.fx_rate, 1 / 36.5);
  assert.equal(db.prepare("SELECT currency_per_usd FROM fx_rates WHERE currency = 'THB'").get().currency_per_usd, 40);

  db.prepare(
    `INSERT INTO transactions (id,date,asset_type,action,symbol,name,qty,price,currency,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run('direct-thb-deposit', '2026-10-06', 'เงินสด', 'ฝากเงิน', 'CASH', 'Cash account', 1260.05, 1, 'THB', 'Test User', Date.now());
  const directDepositDashboard = await (await fetch(`${baseUrl}/holdings/dashboard`, { headers })).json();
  assert.ok(Math.abs(directDepositDashboard.cashBalance - (171.25 + 1260.05 / 40)) < 1e-10);
  assert.ok(Math.abs(directDepositDashboard.netTotalInvested - (200 + 1260.05 / 40)) < 1e-10);
  const transactionsResponse = await fetch(`${baseUrl}/transactions`, { headers });
  const { transactions } = await transactionsResponse.json();
  assert.ok(Math.abs(transactions.find((entry) => entry.id === 'direct-thb-deposit').fx_rate - 1 / 40) < 1e-10);

  db.prepare(
    `INSERT INTO portfolio_snapshots (date,total_value,total_cost,cash_balance,net_total_invested,cash_balances_json,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run('2026-10-06', 210, 20, 180, 200, JSON.stringify({ USD: 80, THB: 3650 }), Date.now() + 1000);
  db.prepare("DELETE FROM transactions WHERE symbol = 'TEST'").run();
  const snapshotDashboard = await (await fetch(`${baseUrl}/holdings/dashboard`, { headers })).json();
  assert.equal(snapshotDashboard.cashBalance, 171.25);
  assert.equal(snapshotDashboard.nav, 201.25);
});