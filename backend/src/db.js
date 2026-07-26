const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || './data/investment.db';
const resolved = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new DatabaseSync(resolved);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// better-sqlite3 compatibility shim: node:sqlite's DatabaseSync has no built-in
// `.transaction()` helper, so provide the same wrap-in-BEGIN/COMMIT/ROLLBACK API
// used by routes/dca.js and routes/tax.js.
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','staff')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('ซื้อ','ขาย','ปันผล','ดอกเบี้ย')),
  symbol TEXT NOT NULL,
  ticker TEXT,
  name TEXT,
  broker TEXT,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_broker ON transactions(broker);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS tax_rates (
  asset_type TEXT PRIMARY KEY,
  gain_rate REAL NOT NULL DEFAULT 0,
  gain_note TEXT,
  div_rate REAL NOT NULL DEFAULT 0,
  int_rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS target_alloc (
  symbol TEXT PRIMARY KEY,
  target_pct REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dca_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  budget REAL NOT NULL DEFAULT 0,
  vol REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS market_cache (
  symbol TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  date TEXT PRIMARY KEY,
  total_value REAL NOT NULL,
  total_cost REAL NOT NULL,
  benchmark_ticker TEXT,
  benchmark_price REAL,
  created_at INTEGER NOT NULL
);
`);

// Lightweight migration for databases created before the `broker` column existed.
const txColumns = db.prepare("PRAGMA table_info(transactions)").all();
if (!txColumns.some((c) => c.name === 'broker')) {
  db.exec('ALTER TABLE transactions ADD COLUMN broker TEXT;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tx_broker ON transactions(broker);');
}

module.exports = db;
