// Computes the same style of stats shown in the reference chart:
// CumReturn / Vol (annualized) / Sharpe / Max Drawdown — from a series of
// {date, value} snapshots (portfolio value or benchmark-equivalent value).

function dailyReturns(values) {
  const rets = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push(values[i] / values[i - 1] - 1);
  }
  return rets;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(values) {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) maxDd = Math.min(maxDd, v / peak - 1);
  }
  return maxDd * 100;
}

/**
 * @param {{date:string, value:number}[]} series sorted ascending by date
 * @param {number} periodsPerYear e.g. 252 for daily trading days; use a smaller
 *   number (e.g. 52) when snapshots are weekly so annualization isn't overstated.
 */
function computeMetrics(series, periodsPerYear = 252) {
  if (!series || series.length < 2) {
    return { cumReturn: 0, vol: 0, sharpe: 0, maxDrawdown: 0, points: series ? series.length : 0 };
  }
  const values = series.map((s) => s.value);
  const rets = dailyReturns(values);
  const cumReturn = (values[values.length - 1] / values[0] - 1) * 100;
  const std = stdev(rets);
  const meanRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const vol = std * Math.sqrt(periodsPerYear) * 100;
  const sharpe = std > 0 ? (meanRet / std) * Math.sqrt(periodsPerYear) : 0;
  return {
    cumReturn,
    vol,
    sharpe,
    maxDrawdown: maxDrawdown(values),
    points: series.length,
  };
}

module.exports = { computeMetrics, dailyReturns, stdev, maxDrawdown };
