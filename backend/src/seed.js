const bcrypt = require('bcryptjs');
const db = require('./db');
const { historicalSnapshots } = require('./data/historicalStatements');

function seedHistoricalSnapshots() {
  const insert = db.prepare(
    `INSERT INTO portfolio_snapshots (date, total_value, total_cost, benchmark_ticker, benchmark_price, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = excluded.total_value, total_cost = excluded.total_cost, created_at = excluded.created_at`
  );
  const now = Date.now();
  for (const snapshot of historicalSnapshots) {
    insert.run(snapshot.date, snapshot.totalValue, snapshot.totalCost, now);
  }
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234';
    const name = process.env.SEED_ADMIN_NAME || 'System Admin';
    db.prepare('INSERT INTO users (id, username, password_hash, name, role, created_at) VALUES (?,?,?,?,?,?)').run(
      'u001',
      username,
      bcrypt.hashSync(password, 10),
      name,
      'owner',
      Date.now()
    );
    console.log(`Seeded initial owner account: ${username} / ${password} (change this password after first login!)`);
  }

  const dcaCfg = db.prepare('SELECT id FROM dca_config WHERE id = 1').get();
  if (!dcaCfg) {
    db.prepare('INSERT INTO dca_config (id, budget, vol) VALUES (1, 0, 0)').run();
  }

  seedHistoricalSnapshots();
}

if (require.main === module) {
  seed();
  console.log('Seed complete.');
}

module.exports = seed;
