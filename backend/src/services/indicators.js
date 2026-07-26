// Technical indicators — ported from Smart-DCA/src/indicators.py (RSI via Wilder's
// smoothing, MACD, EMA, annualised volatility from log returns) operating on plain
// arrays of closing prices instead of pandas Series.

const RSI_PERIOD = Number(process.env.RSI_PERIOD || 14);
const MACD_FAST = Number(process.env.MACD_FAST || 12);
const MACD_SLOW = Number(process.env.MACD_SLOW || 26);
const MACD_SIGNAL = Number(process.env.MACD_SIGNAL || 9);
const EMA_PERIOD = Number(process.env.EMA_PERIOD || 26);
const VOL_WINDOW = Number(process.env.VOL_WINDOW || 20);

// ewm(adjust=False) recurrence, matching pandas' default used throughout indicators.py
function ewm(values, span) {
  const alpha = 2 / (span + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      out[i] = prev;
      continue;
    }
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

// Wilder's smoothing == ewm(com = period - 1, adjust=False) -> alpha = 1/period
function ewmWilder(values, period) {
  const alpha = 1 / period;
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function calculateRSI(closes, period = RSI_PERIOD) {
  const gains = [0];
  const losses = [0];
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }
  const avgGain = ewmWilder(gains, period);
  const avgLoss = ewmWilder(losses, period);
  return closes.map((_, i) => {
    const rs = avgGain[i] / (avgLoss[i] + 1e-10);
    return 100 - 100 / (1 + rs);
  });
}

function calculateMACD(closes, fast = MACD_FAST, slow = MACD_SLOW, signal = MACD_SIGNAL) {
  const emaFast = ewm(closes, fast);
  const emaSlow = ewm(closes, slow);
  const macd = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ewm(macd, signal);
  return { macd, signalLine };
}

function calculateEMA(closes, period = EMA_PERIOD) {
  return ewm(closes, period);
}

// Annualised volatility from the trailing `window` daily log returns.
function calculateVolatility(closes, window = VOL_WINDOW) {
  if (closes.length < window + 1) return 0;
  const logReturns = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const tail = logReturns.slice(-window);
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const variance = tail.reduce((a, b) => a + (b - mean) ** 2, 0) / (tail.length - 1);
  const std = Math.sqrt(variance);
  return std * Math.sqrt(252);
}

function calculateHistoricalGrowth(closes) {
  if (!closes || closes.length < 2) return 0;
  const start = closes[0];
  const end = closes[closes.length - 1];
  return (end - start) / start;
}

// Full snapshot for one symbol's closing-price series, mirroring
// indicators.get_latest_indicators() + the EMA26/volatility additions used by portfolio.py.
function latestIndicatorsFromCloses(closes) {
  if (!closes || closes.length < RSI_PERIOD + 1) return null;
  const rsiSeries = calculateRSI(closes);
  const { macd, signalLine } = calculateMACD(closes);
  const emaSeries = calculateEMA(closes);
  const rsi = rsiSeries[rsiSeries.length - 1];
  const macdVal = macd[macd.length - 1];
  const signalVal = signalLine[signalLine.length - 1];
  const ema26 = emaSeries[emaSeries.length - 1];
  const volatility = calculateVolatility(closes);
  const price = closes[closes.length - 1];
  if (rsi == null || Number.isNaN(rsi)) return null;
  return { rsi, macd: macdVal, signal: signalVal, ema26, volatility, price };
}

module.exports = {
  calculateRSI,
  calculateMACD,
  calculateEMA,
  calculateVolatility,
  calculateHistoricalGrowth,
  latestIndicatorsFromCloses,
};
