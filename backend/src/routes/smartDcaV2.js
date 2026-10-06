const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { computeHoldings } = require('../services/portfolioEngine');
const { getIndicatorsForTicker } = require('../services/marketData');
const { buildSmartDcaV2 } = require('../services/smartDcaV2');
const { TARGET_WEIGHTS, HARD_MAX_WEIGHTS, DCA_CONFIG } = require('../config/smartDcaV2');
const { normalizeDcaTargetWeights } = require('../services/smartDcaV2/allocation');

const router = express.Router();
router.use(requireAuth);
const TARGET_ALLOC_CONFIGURED_KEY = 'dca_target_alloc_configured';

function readCachedMarketData(ticker) {
  const row = db.prepare('SELECT payload FROM market_cache WHERE symbol = ?').get(ticker);
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

router.get('/training-data', requireOwner, (req, res) => {
  const rows = db.prepare('SELECT sample_json FROM smart_dca_training_samples ORDER BY id').all();
  const jsonl = rows.map((row) => row.sample_json).join('\n');
  res.type('application/x-ndjson');
  res.set('Content-Disposition', 'attachment; filename="smart-dca-training.jsonl"');
  res.send(jsonl ? `${jsonl}\n` : '');
});

router.get('/', async (req, res, next) => {
  try {
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY date ASC, id ASC').all();
    const holdingsMap = computeHoldings(transactions);
    const prices = Object.fromEntries(db.prepare('SELECT symbol, price FROM prices').all().map((row) => [row.symbol, row.price]));
    const targetRows = db.prepare('SELECT symbol, target_pct, dca_enabled FROM target_alloc').all();
    const targetConfigSaved = db.prepare('SELECT v FROM settings WHERE k = ?').get(TARGET_ALLOC_CONFIGURED_KEY);
    const targetAlloc = targetRows.length || targetConfigSaved
      ? Object.fromEntries(targetRows.map((row) => [row.symbol, row.target_pct]))
      : TARGET_WEIGHTS;
    const dcaSymbols = targetRows.length || targetConfigSaved
      ? targetRows.filter((row) => row.dca_enabled).map((row) => row.symbol)
      : Object.keys(TARGET_WEIGHTS);
    const targetWeights = normalizeDcaTargetWeights(targetAlloc, dcaSymbols);
    const symbols = Array.from(new Set([...Object.keys(targetWeights), ...Object.keys(holdingsMap)]));
    const marketData = {};
    const fetchLive = req.query.fetchLive === 'true';
    for (const symbol of symbols) {
      const holding = holdingsMap[symbol];
      const ticker = holding?.ticker || symbol;
      let liveData = null;
      if (fetchLive && holding?.ticker) {
        liveData = await getIndicatorsForTicker(ticker);
      }
      const cachedData = readCachedMarketData(ticker);
      if (liveData || cachedData) marketData[symbol] = { ...(cachedData || {}), ...(liveData || {}) };
      if (!marketData[symbol] && prices[symbol] != null) marketData[symbol] = { price: prices[symbol] };
      const currentPrice = Number(marketData[symbol]?.price);
      if (Number.isFinite(currentPrice) && currentPrice > 0) {
        db.prepare(
          `INSERT INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`
        ).run(symbol, currentPrice, Date.now());
        prices[symbol] = currentPrice;
      }
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
      targetWeight: targetWeights[holding.symbol] || 0,
      hardMaxWeight: targetWeights[holding.symbol] > 0
        ? HARD_MAX_WEIGHTS[holding.symbol] || targetWeights[holding.symbol]
        : 0,
      ...(marketData[holding.symbol] || {}),
    }));
    const config = db.prepare('SELECT budget FROM dca_config WHERE id = 1').get() || {};
    const monthlyBudget = req.query.monthlyBudget != null ? Number(req.query.monthlyBudget) : Number(config.budget || DCA_CONFIG.DEFAULT_MONTHLY_BUDGET);
    const result = buildSmartDcaV2({ portfolio: { value, monthlyBudget, volatility: portfolioVolatility, holdings: weightedHoldings }, stocks: stockInputs, marketData, monthlyBudget });
    const capturedAt = Date.now();
    const runId = crypto.randomUUID();
    const calculationMode = fetchLive ? 'fetch_requested' : 'stored_calculation';
    const insertSample = db.prepare(
      'INSERT INTO smart_dca_training_samples (run_id, captured_at, calculation_mode, ticker, sample_json) VALUES (?, ?, ?, ?, ?)'
    );
    db.transaction(() => {
      for (const stock of result.stocks) {
        const sample = {
          schemaVersion: 1,
          runId,
          capturedAt: new Date(capturedAt).toISOString(),
          calculationMode,
          features: {
            ticker: stock.ticker,
            price: stock.price,
            currentWeight: stock.currentWeight,
            targetWeight: stock.targetWeight,
            hardMaxWeight: stock.hardMaxWeight,
            underweight: stock.underweight,
            rsi: stock.rsi ?? null,
            macd: stock.macd ?? null,
            signal: stock.signal ?? null,
            ema26: stock.ema26 ?? null,
            volatility: stock.volatility ?? null,
            pe: stock.pe ?? null,
            historicalGrowth: stock.historicalGrowth ?? null,
            marketDataFetchedAt: stock.fetchedAt ?? null,
            portfolioValue: result.portfolio.value,
            monthlyBudget: result.portfolio.monthlyBudget,
            portfolioRisk: result.risk,
          },
          recommendation: {
            status: stock.status,
            action: stock.action,
            dataValid: stock.dataValid,
            compositeScore: stock.compositeScore,
            dcaAmount: stock.dcaAmount,
            reasons: stock.reasons,
          },
          outcome: null,
        };
        insertSample.run(runId, capturedAt, calculationMode, stock.ticker, JSON.stringify(sample));
      }
    })();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
