require('dotenv').config();
const express = require('express');
const cors = require('cors');

const seed = require('./seed');
const authRoutes = require('./routes/auth');
const txRoutes = require('./routes/transactions');
const holdingsRoutes = require('./routes/holdings');
const dcaRoutes = require('./routes/dca');
const taxRoutes = require('./routes/tax');
const usersRoutes = require('./routes/users');
const settingsRoutes = require('./routes/settings');
const marketRoutes = require('./routes/market');
const snapshotsRoutes = require('./routes/snapshots');

if (!process.env.JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in environment. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

seed();

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/transactions', txRoutes);
app.use('/api/holdings', holdingsRoutes);
app.use('/api/dca', dcaRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/snapshots', snapshotsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Investment Tracker API listening on http://localhost:${PORT}`);
});
