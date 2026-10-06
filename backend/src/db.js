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
// used by routes/dca.js.
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
  action TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ticker TEXT,
  name TEXT,
  broker TEXT,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate REAL NOT NULL DEFAULT 1,
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS target_alloc (
  symbol TEXT PRIMARY KEY,
  target_pct REAL NOT NULL DEFAULT 0,
  dca_enabled INTEGER NOT NULL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT PRIMARY KEY,
  currency_per_usd REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  date TEXT PRIMARY KEY,
  total_value REAL NOT NULL,
  total_cost REAL NOT NULL,
  benchmark_ticker TEXT,
  benchmark_price REAL,
  cash_balance REAL NOT NULL DEFAULT 0,
  cash_balances_json TEXT NOT NULL DEFAULT '{}',
  net_total_invested REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS smart_dca_training_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  calculation_mode TEXT NOT NULL CHECK(calculation_mode IN ('stored_calculation','fetch_requested')),
  ticker TEXT NOT NULL,
  sample_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_smart_dca_training_run ON smart_dca_training_samples(run_id);
`);

// Preserve existing transaction rows while upgrading their schema.
const txColumns = db.prepare("PRAGMA table_info(transactions)").all();
if (!txColumns.some((c) => c.name === 'broker')) {
  db.exec('ALTER TABLE transactions ADD COLUMN broker TEXT;');
}
if (!txColumns.some((column) => column.name === 'tax')) db.exec('ALTER TABLE transactions ADD COLUMN tax REAL NOT NULL DEFAULT 0;');
if (!txColumns.some((column) => column.name === 'currency')) db.exec("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';");
if (!txColumns.some((column) => column.name === 'fx_rate')) db.exec('ALTER TABLE transactions ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1;');

const transactionTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").get();
if (/CHECK\s*\(\s*action\s+IN/i.test(transactionTable?.sql || '')) {
  db.exec(`
    CREATE TABLE transactions_migrated (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      action TEXT NOT NULL,
      symbol TEXT NOT NULL,
      ticker TEXT,
      name TEXT,
      broker TEXT,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      fx_rate REAL NOT NULL DEFAULT 1,
      note TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO transactions_migrated (id,date,asset_type,action,symbol,ticker,name,broker,qty,price,fee,tax,currency,fx_rate,note,created_by,created_at)
      SELECT id,date,asset_type,action,symbol,ticker,name,broker,qty,price,fee,tax,'USD',1,note,created_by,created_at FROM transactions;
    DROP TABLE transactions;
    ALTER TABLE transactions_migrated RENAME TO transactions;
  `);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_symbol ON transactions(symbol);');
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);');
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_broker ON transactions(broker);');
db.prepare("INSERT OR IGNORE INTO settings (k, v) VALUES ('cash_tracking_started_at', ?)").run(String(Date.now()));
db.prepare("UPDATE settings SET v = '^GSPC' WHERE k = 'benchmarkTicker' AND v = 'SPY'").run();

const snapshotColumns = db.prepare('PRAGMA table_info(portfolio_snapshots)').all();
if (!snapshotColumns.some((column) => column.name === 'cash_balance')) {
  db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0;');
}
if (!snapshotColumns.some((column) => column.name === 'net_total_invested')) {
  db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN net_total_invested REAL NOT NULL DEFAULT 0;');
}
if (!snapshotColumns.some((column) => column.name === 'cash_balances_json')) {
  db.exec("ALTER TABLE portfolio_snapshots ADD COLUMN cash_balances_json TEXT NOT NULL DEFAULT '{}';");
}

const targetAllocColumns = db.prepare('PRAGMA table_info(target_alloc)').all();
if (!targetAllocColumns.some((column) => column.name === 'dca_enabled')) {
  db.exec('ALTER TABLE target_alloc ADD COLUMN dca_enabled INTEGER NOT NULL DEFAULT 1;');
}

const dcaMembershipMigration = db.prepare("SELECT v FROM settings WHERE k = 'dca_target_membership_migrated'").get();
if (!dcaMembershipMigration) {
  db.exec('UPDATE target_alloc SET dca_enabled = CASE WHEN target_pct > 0 THEN 1 ELSE 0 END;');
  db.prepare("INSERT INTO settings (k, v) VALUES ('dca_target_membership_migrated', '1')").run();
}

module.exports = db;
