const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getCurrentMarketPrice, getIndicatorsForTicker } = require('../services/marketData');

const router = express.Router();
router.use(requireAuth);

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
