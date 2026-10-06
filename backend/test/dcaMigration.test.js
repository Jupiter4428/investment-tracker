const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dca-migration-test-'));
const dbPath = path.join(tempDir, 'legacy.db');
const legacyDb = new DatabaseSync(dbPath);
legacyDb.exec(`
  CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE target_alloc (symbol TEXT PRIMARY KEY, target_pct REAL NOT NULL DEFAULT 0);
  INSERT INTO target_alloc (symbol, target_pct) VALUES ('TSM', 18), ('AVGO', 0), ('SPOT', 0);
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, asset_type TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('ซื้อ','ขาย','ปันผล','ดอกเบี้ย')),
    symbol TEXT NOT NULL, ticker TEXT, name TEXT, qty REAL NOT NULL,
    price REAL NOT NULL, fee REAL NOT NULL DEFAULT 0, note TEXT,
    created_by TEXT, created_at INTEGER NOT NULL
  );
  INSERT INTO transactions (id,date,asset_type,action,symbol,qty,price,fee,created_at)
    VALUES ('legacy-tx','2026-01-01','หุ้นไทย','ซื้อ','PTT',2,10,0,1);
  CREATE TABLE portfolio_snapshots (
    date TEXT PRIMARY KEY, total_value REAL NOT NULL, total_cost REAL NOT NULL,
    benchmark_ticker TEXT, benchmark_price REAL, created_at INTEGER NOT NULL
  );
`);
legacyDb.close();
process.env.DB_PATH = dbPath;

const db = require('../src/db');

test('legacy zero-weight targets remain excluded from DCA after migration', (t) => {
  t.after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const rows = Object.fromEntries(db.prepare('SELECT symbol, dca_enabled FROM target_alloc').all().map((row) => [row.symbol, row.dca_enabled]));
  assert.deepEqual(rows, { TSM: 1, AVGO: 0, SPOT: 0 });

  const legacyTransaction = Object.assign({}, db.prepare("SELECT action, symbol, broker, tax FROM transactions WHERE id = 'legacy-tx'").get());
  assert.deepEqual(legacyTransaction, { action: 'ซื้อ', symbol: 'PTT', broker: null, tax: 0 });
  db.prepare(
    `INSERT INTO transactions (id,date,asset_type,action,symbol,qty,price,fee,tax,created_at)
     VALUES ('cash-in','2026-10-06','เงินสด','ฝากเงิน','CASH',100,1,0,0,2)`
  ).run();
  assert.equal(db.prepare("SELECT action FROM transactions WHERE id = 'cash-in'").get().action, 'ฝากเงิน');
  assert.ok(db.prepare('PRAGMA table_info(portfolio_snapshots)').all().some((column) => column.name === 'net_total_invested'));
  assert.ok(db.prepare("SELECT v FROM settings WHERE k = 'cash_tracking_started_at'").get());
});