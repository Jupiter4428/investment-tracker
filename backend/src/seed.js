const bcrypt = require('bcryptjs');
const db = require('./db');
const { ASSET_TYPES, DEFAULT_TAX_RATES } = require('./constants');

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234';
    const name = process.env.SEED_ADMIN_NAME || 'ผู้ดูแลระบบ';
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

  const rateCount = db.prepare('SELECT COUNT(*) AS c FROM tax_rates').get().c;
  if (rateCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO tax_rates (asset_type, gain_rate, gain_note, div_rate, int_rate) VALUES (?,?,?,?,?)'
    );
    ASSET_TYPES.forEach((a) => {
      const r = DEFAULT_TAX_RATES[a];
      stmt.run(a, r.gainRate, r.gainNote, r.divRate, r.intRate);
    });
    console.log('Seeded default tax rates.');
  }

  const dcaCfg = db.prepare('SELECT id FROM dca_config WHERE id = 1').get();
  if (!dcaCfg) {
    db.prepare('INSERT INTO dca_config (id, budget, vol) VALUES (1, 0, 0)').run();
  }
}

if (require.main === module) {
  seed();
  console.log('Seed complete.');
}

module.exports = seed;
