// Live market data via Yahoo Finance — replaces Smart-DCA's yfinance + CSV disk cache
// (indicators.py's download_historical_data) with yahoo-finance2 + a SQLite-backed
// cache table, since this runs as a persistent Node server rather than a one-shot
// Python script.

const db = require('../db');
const { latestIndicatorsFromCloses, calculateHistoricalGrowth } = require('./indicators');

const DATA_PERIOD_DAYS = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730 };
const PERIOD = process.env.DATA_PERIOD || '1y';
const CACHE_MINUTES = Number(process.env.MARKET_CACHE_MINUTES || 60);

let yahooFinance = null;
function getYahoo() {
  if (!yahooFinance) {
    // yahoo-finance2 v4+ exports the YahooFinance *class* as default — it must be
    // instantiated before use (`new YahooFinance()`), unlike v2 which exported an
    // already-constructed singleton.
    const YahooFinance = require('yahoo-finance2').default;
    yahooFinance = new YahooFinance();
  }
  return yahooFinance;
}

function readCache(symbol) {
  const row = db.prepare('SELECT payload, fetched_at FROM market_cache WHERE symbol = ?').get(symbol);
  if (!row) return null;
  const ageMinutes = (Date.now() - row.fetched_at) / 60000;
  if (ageMinutes > CACHE_MINUTES) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function writeCache(symbol, payload) {
  db.prepare(
    `INSERT INTO market_cache (symbol, payload, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(symbol, JSON.stringify(payload), Date.now());
}

/**
 * Fetch indicators + latest price for a Yahoo Finance ticker (e.g. "PTT.BK", "AAPL",
 * "BTC-USD", "GC=F"). Returns null on failure (falls back gracefully to manual price
 * entry in the UI, same as the original single-file app).
 */
async function getIndicatorsForTicker(ticker, { forceRefresh = false } = {}) {
  if (!ticker) return null;
  if (!forceRefresh) {
    const cached = readCache(ticker);
    if (cached) return cached;
  }

  const days = DATA_PERIOD_DAYS[PERIOD] || 365;
  const period1 = new Date(Date.now() - days * 86400000);

  try {
    const yf = getYahoo();
    const chart = await yf.chart(ticker, { period1, interval: '1d' });
    const closes = (chart.quotes || [])
      .map((q) => q.close)
      .filter((c) => c != null && !Number.isNaN(c));
    if (closes.length < 15) return null;

    const snap = latestIndicatorsFromCloses(closes);
    if (!snap) return null;

    let pe = null;
    try {
      const summary = await yf.quoteSummary(ticker, { modules: ['summaryDetail'] });
      pe = summary?.summaryDetail?.trailingPE ?? null;
    } catch {
      // P/E not available for this asset class (crypto/gold/bonds) — that's fine,
      // getActionSignal() treats a missing P/E as "neither cheap nor expensive".
    }

    const result = {
      ticker,
      price: snap.price,
      rsi: snap.rsi,
      macd: snap.macd,
      signal: snap.signal,
      ema26: snap.ema26,
      volatility: snap.volatility,
      historicalGrowth: calculateHistoricalGrowth(closes),
      pe,
      fetchedAt: Date.now(),
    };
    writeCache(ticker, result);
    return result;
  } catch (err) {
    console.error(`[marketData] fetch failed for "${ticker}":`, err.message);
    // Fall back to a stale cache entry if we have one, mirroring indicators.py's
    // "offline fallback to stale cache" behaviour.
    const row = db.prepare('SELECT payload FROM market_cache WHERE symbol = ?').get(ticker);
    if (row) {
      try {
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { getIndicatorsForTicker };
