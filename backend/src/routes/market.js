const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getIndicatorsForTicker } = require('../services/marketData');

const router = express.Router();
router.use(requireAuth);

// GET /api/market/indicators/AAPL?refresh=true
router.get('/indicators/:ticker', async (req, res) => {
  const data = await getIndicatorsForTicker(req.params.ticker, { forceRefresh: req.query.refresh === 'true' });
  if (!data) {
    return res.status(502).json({ error: 'ไม่สามารถดึงข้อมูลราคาสำหรับสัญลักษณ์นี้ได้ กรุณากรอกราคา/RSI/P-E ด้วยตนเอง' });
  }
  res.json({ data });
});

module.exports = router;
