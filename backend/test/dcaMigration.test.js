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
});