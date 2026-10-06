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

function computeXirr(cashFlows) {
  const flows = cashFlows
    .filter((flow) => Number.isFinite(flow.amount) && Number.isFinite(Date.parse(flow.date)))
    .map((flow) => ({ ...flow, timestamp: Date.parse(`${flow.date}T00:00:00Z`) }))
    .filter((flow) => Number.isFinite(flow.timestamp));
  if (!flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;

  const start = Math.min(...flows.map((flow) => flow.timestamp));
  const npv = (rate) => flows.reduce((sum, flow) => {
    const years = (flow.timestamp - start) / (365 * 86400000);
    return sum + flow.amount / ((1 + rate) ** years);
  }, 0);
  const rates = [-0.9999, -0.99, -0.95, -0.9, -0.75, -0.5, -0.25, 0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100, 10000];

  for (let index = 1; index < rates.length; index++) {
    let low = rates[index - 1];
    let high = rates[index];
    let lowValue = npv(low);
    const highValue = npv(high);
    if (lowValue === 0) return low * 100;
    if (highValue === 0) return high * 100;
    if (Math.sign(lowValue) === Math.sign(highValue)) continue;

    for (let iteration = 0; iteration < 100; iteration++) {
      const mid = (low + high) / 2;
      const midValue = npv(mid);
      if (Math.abs(midValue) < 1e-10) return mid * 100;
      if (Math.sign(midValue) === Math.sign(lowValue)) {
        low = mid;
        lowValue = midValue;
      } else {
        high = mid;
      }
    }
    return ((low + high) / 2) * 100;
  }

  return null;
}

function computeStockWinRate(holdings) {
  const stocks = holdings.filter((holding) => (
    holding.assetType === 'หุ้นไทย' || holding.assetType === 'หุ้นต่างประเทศ'
  ));
  const winners = stocks.filter((holding) => holding.unrealizedPL > 0).length;
  return {
    winners,
    total: stocks.length,
    rate: stocks.length ? (winners / stocks.length) * 100 : null,
  };
}

module.exports = { computeMetrics, computeStockWinRate, computeXirr, dailyReturns, stdev, maxDrawdown };
