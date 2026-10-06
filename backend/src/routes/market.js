const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getCurrentMarketPrice, getIndicatorsForTicker } = require('../services/marketData');

const router = express.Router();
router.use(requireAuth);

router.put('/fx-rates', (req, res) => {
  const suppliedRates = req.body?.rates;
  if (!suppliedRates || typeof suppliedRates !== 'object' || Array.isArray(suppliedRates)) {
    return res.status(400).json({ error: 'FX rates must be an object' });
  }
  const supportedCurrencies = new Set(['USD', 'THB', 'EUR', 'JPY', 'GBP']);
  const rates = Object.entries(suppliedRates).map(([currency, value]) => ({
    currency: currency.trim().toUpperCase(),
    rate: Number(value),
  }));
  if (rates.some(({ currency, rate }) => !supportedCurrencies.has(currency) || !Number.isFinite(rate) || rate <= 0 || (currency === 'USD' && rate !== 1))) {
    return res.status(400).json({ error: 'Invalid FX rate' });
  }
  const saveRate = db.prepare(
    `INSERT INTO fx_rates (currency, currency_per_usd, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(currency) DO UPDATE SET currency_per_usd=excluded.currency_per_usd, updated_at=excluded.updated_at`
  );
  for (const { currency, rate } of rates) saveRate.run(currency, rate, Date.now());
  res.json({ rates: Object.fromEntries(rates.map(({ currency, rate }) => [currency, rate])) });
});

// GET /api/market/indicators/AAPL?refresh=true
router.get('/indicators/:ticker', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const data = await getIndicatorsForTicker(req.params.ticker, {
    forceRefresh,
    allowStaleFallback: !forceRefresh,
  });
  if (!data) {
    return res.status(502).json({ error: 'Could not fetch a price for this ticker. Enter price / RSI / P-E manually.' });
  }
  res.json({ data });
});

router.get('/quote/:ticker', async (req, res) => {
  try {
    const price = await getCurrentMarketPrice(req.params.ticker);
    if (!price) return res.status(502).json({ error: 'Could not fetch a current price for this ticker' });
    res.json({ quote: { ticker: req.params.ticker, price } });
  } catch {
    res.status(502).json({ error: 'Could not fetch a current price for this ticker' });
  }
});

module.exports = router;
