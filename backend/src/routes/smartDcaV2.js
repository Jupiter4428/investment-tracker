const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeHoldings } = require('../services/portfolioEngine');
const { getIndicatorsForTicker } = require('../services/marketData');
const { buildSmartDcaV2 } = require('../services/smartDcaV2');
const { TARGET_WEIGHTS, HARD_MAX_WEIGHTS, DCA_CONFIG } = require('../config/smartDcaV2');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY date ASC, id ASC').all();
    const holdingsMap = computeHoldings(transactions);
    const prices = Object.fromEntries(db.prepare('SELECT symbol, price FROM prices').all().map((row) => [row.symbol, row.price]));
    const symbols = Array.from(new Set([...Object.keys(TARGET_WEIGHTS), ...Object.keys(holdingsMap)]));
    const marketData = {};
    const fetchLive = req.query.fetchLive === 'true';
    for (const symbol of symbols) {
      const holding = holdingsMap[symbol];
      if (fetchLive && holding?.ticker) marketData[symbol] = await getIndicatorsForTicker(holding.ticker);
      if (!marketData[symbol] && prices[symbol] != null) marketData[symbol] = { price: prices[symbol] };
    }

    const holdings = symbols.map((symbol) => {
      const holding = holdingsMap[symbol] || {};
      const market = marketData[symbol] || {};
      const price = Number(market.price ?? prices[symbol] ?? (holding.qty ? holding.costBasis / holding.qty : 0));
      return { symbol, ticker: holding.ticker || symbol, name: holding.name || symbol, price, marketValue: Math.max(0, price * Number(holding.qty || 0)) };
    });
    const value = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
    const weightedHoldings = holdings.map((holding) => ({ ...holding, weight: value > 0 ? holding.marketValue / value : 0 }));
    const volatilityValues = Object.values(marketData).map((market) => Number(market?.volatility)).filter(Number.isFinite);
    const portfolioVolatility = volatilityValues.length ? volatilityValues.reduce((sum, current) => sum + current, 0) / volatilityValues.length : 0;
    const stockInputs = weightedHoldings.map((holding) => ({
      ...holding,
      currentWeight: holding.weight,
      targetWeight: TARGET_WEIGHTS[holding.symbol] || 0,
      hardMaxWeight: HARD_MAX_WEIGHTS[holding.symbol] || TARGET_WEIGHTS[holding.symbol] || 0,
      ...(marketData[holding.symbol] || {}),
    }));
    const config = db.prepare('SELECT budget FROM dca_config WHERE id = 1').get() || {};
    const monthlyBudget = req.query.monthlyBudget != null ? Number(req.query.monthlyBudget) : Number(config.budget || DCA_CONFIG.DEFAULT_MONTHLY_BUDGET);
    const result = buildSmartDcaV2({ portfolio: { value, monthlyBudget, volatility: portfolioVolatility, holdings: weightedHoldings }, stocks: stockInputs, marketData, monthlyBudget });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
