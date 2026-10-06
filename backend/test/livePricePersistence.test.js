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
});