// Average-cost portfolio engine — ported 1:1 from the original single-file app's
// computeHoldings()/realizedForSell(), now operating on rows fetched from SQLite
// instead of localStorage.

function toUsdAmount(value, currency, fxRate) {
  const amount = Number(value || 0);
  const code = String(currency || 'USD').trim().toUpperCase();
  const rate = Number(fxRate ?? 1);
  if (code === 'USD' || !Number.isFinite(rate) || rate <= 0) return amount;
  return amount * rate;
}

function txUsdAmount(t) {
  const currency = t.currency || 'USD';
  const fxRate = t.fx_rate ?? t.fxRate ?? 1;
  const gross = Number(t.qty || 0) * Number(t.price || 0);
  const fee = Number(t.fee || 0);
  const tax = Number(t.tax || 0);
  return toUsdAmount(gross + fee + tax, currency, fxRate) - toUsdAmount(fee + tax, currency, fxRate);
}

function computeHoldings(txs, uptoDate) {
  const filtered = txs
    .filter((t) => !uptoDate || t.date <= uptoDate)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const map = {};
  for (const t of filtered) {
    const key = t.symbol;
    if (!map[key]) {
      map[key] = { assetType: t.asset_type, symbol: t.symbol, ticker: t.ticker, name: t.name || t.symbol, qty: 0, costBasis: 0, realized: 0, brokers: new Set() };
    }
    const h = map[key];
    h.assetType = t.asset_type;
    h.name = t.name || h.name;
    h.ticker = t.ticker || h.ticker;
    if (t.broker) h.brokers.add(t.broker);
    if (t.action === 'ซื้อ') {
      h.qty += t.qty;
      h.costBasis += toUsdAmount(t.qty * t.price + (t.fee || 0) + (t.tax || 0), t.currency || 'USD', t.fx_rate ?? t.fxRate ?? 1);
    } else if (t.action === 'ขาย') {
      const avg = h.qty > 0 ? h.costBasis / h.qty : 0;
      const proceeds = toUsdAmount(t.qty * t.price - (t.fee || 0) - (t.tax || 0), t.currency || 'USD', t.fx_rate ?? t.fxRate ?? 1);
      const costOut = avg * t.qty;
      h.realized += proceeds - costOut;
      h.qty -= t.qty;
      h.costBasis -= costOut;
      if (h.qty < 0.0000001) {
        h.qty = 0;
        h.costBasis = 0;
      }
    }
  }
  return map;
}

function realizedForSell(allTxsForSymbol, t) {
  const before = allTxsForSymbol
    .filter((x) => x.date < t.date || (x.date === t.date && x.id < t.id))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let qty = 0;
  let cost = 0;
  for (const x of before) {
    if (x.action === 'ซื้อ') {
      qty += x.qty;
      cost += toUsdAmount(x.qty * x.price + (x.fee || 0) + (x.tax || 0), x.currency || 'USD', x.fx_rate ?? x.fxRate ?? 1);
    } else if (x.action === 'ขาย') {
      const avg = qty > 0 ? cost / qty : 0;
      cost -= avg * x.qty;
      qty -= x.qty;
    }
  }
  const avg = qty > 0 ? cost / qty : 0;
  return toUsdAmount(t.qty * t.price - (t.fee || 0) - (t.tax || 0), t.currency || 'USD', t.fx_rate ?? t.fxRate ?? 1) - avg * t.qty;
}

function portfolioTotals(allTxRows, priceRows, cashTrackingStartedAt, currentFxRates = {}) {
  const holdings = computeHoldings(allTxRows);
  const prices = {};
  priceRows.forEach((r) => (prices[r.symbol] = r.price));
  let totalCost = 0;
  let totalMV = 0;
  Object.values(holdings)
    .filter((h) => h.qty > 0.0000001)
    .forEach((h) => {
      const avg = h.costBasis / h.qty;
      const px = prices[h.symbol] != null ? prices[h.symbol] : avg;
      totalCost += h.costBasis;
      totalMV += px * h.qty;
    });
  const cashBalances = computeCashBalances(allTxRows, undefined, cashTrackingStartedAt);
  const rates = resolveCurrencyPerUsdRates(allTxRows, currentFxRates);
  const cashBalance = cashBalancesToUsd(cashBalances, rates);
  return {
    totalCost,
    totalMV,
    cashBalance,
    cashBalances,
    nav: totalMV + cashBalance,
    netTotalInvested: computeNetTotalInvested(allTxRows, undefined, cashTrackingStartedAt, rates),
  };
}

function trackedTransactions(txs, uptoDate, cashTrackingStartedAt) {
  return txs
    .filter((t) => (!uptoDate || t.date <= uptoDate)
      && (!cashTrackingStartedAt || Number(t.created_at || 0) >= Number(cashTrackingStartedAt)));
}

function computeCashBalances(txs, uptoDate, cashTrackingStartedAt) {
  return trackedTransactions(txs, uptoDate, cashTrackingStartedAt).reduce((balances, t) => {
    const currency = String(t.currency || 'USD').trim().toUpperCase();
    const gross = Number(t.qty || 0) * Number(t.price || 0);
    const costs = Number(t.fee || 0) + Number(t.tax || 0);
    let delta = 0;
    if (t.action === 'ฝากเงิน' || t.action === 'ขาย' || t.action === 'ปันผล' || t.action === 'ดอกเบี้ย') delta = gross - costs;
    else if (t.action === 'ถอนเงิน' || t.action === 'ซื้อ') delta = -gross - costs;
    if (delta) balances[currency] = (balances[currency] || 0) + delta;
    return balances;
  }, {});
}

function cashBalancesToUsd(cashBalances, currencyPerUsdRates) {
  return Object.entries(cashBalances).reduce((total, [currency, amount]) => {
    const rate = currency === 'USD' ? 1 : Number(currencyPerUsdRates?.[currency]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Missing current FX rate for ${currency}`);
    return total + Number(amount || 0) / rate;
  }, 0);
}

function mergeCashBalances(...balancesList) {
  return balancesList.reduce((merged, balances) => {
    Object.entries(balances || {}).forEach(([currency, amount]) => {
      merged[currency] = (merged[currency] || 0) + Number(amount || 0);
    });
    return merged;
  }, {});
}

function resolveCurrencyPerUsdRates(txs, currentRates = {}) {
  const rates = { USD: 1 };
  const orderedTransactions = txs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id || '').localeCompare(String(b.id || ''))));
  orderedTransactions.forEach((t) => {
    const currency = String(t.currency || 'USD').trim().toUpperCase();
    const fxRate = Number(t.fx_rate ?? t.fxRate ?? 1);
    if (currency !== 'USD' && Number.isFinite(fxRate) && fxRate > 0) rates[currency] = 1 / fxRate;
  });
  Object.entries(currentRates).forEach(([currency, rate]) => {
    const code = String(currency).trim().toUpperCase();
    const value = Number(rate);
    if (code === 'USD') rates.USD = 1;
    else if (Number.isFinite(value) && value > 0) rates[code] = value;
  });
  return rates;
}

function computeCashBalance(txs, uptoDate, cashTrackingStartedAt, currencyPerUsdRates) {
  if (currencyPerUsdRates) {
    const rates = resolveCurrencyPerUsdRates(txs, currencyPerUsdRates);
    return cashBalancesToUsd(computeCashBalances(txs, uptoDate, cashTrackingStartedAt), rates);
  }
  return trackedTransactions(txs, uptoDate, cashTrackingStartedAt)
    .reduce((balance, t) => {
      const currency = String(t.currency || 'USD').trim().toUpperCase();
      const fxRate = Number(t.fx_rate ?? t.fxRate ?? 1);
      const gross = currency === 'USD' || !Number.isFinite(fxRate) || fxRate <= 0 ? (t.qty * t.price) : (t.qty * t.price) * fxRate;
      const costs = currency === 'USD' || !Number.isFinite(fxRate) || fxRate <= 0 ? ((t.fee || 0) + (t.tax || 0)) : ((t.fee || 0) + (t.tax || 0)) * fxRate;
      if (t.action === 'ฝากเงิน') return balance + gross - costs;
      if (t.action === 'ถอนเงิน') return balance - gross - costs;
      if (t.action === 'ซื้อ') return balance - gross - costs;
      if (t.action === 'ขาย' || t.action === 'ปันผล' || t.action === 'ดอกเบี้ย') return balance + gross - costs;
      return balance;
    }, 0);
}

function computeNetTotalInvested(txs, uptoDate, cashTrackingStartedAt, currencyPerUsdRates = {}) {
  return trackedTransactions(txs, uptoDate, cashTrackingStartedAt)
    .filter((t) => t.action === 'ฝากเงิน' || t.action === 'ถอนเงิน')
    .reduce((total, t) => {
      const currency = String(t.currency || 'USD').trim().toUpperCase();
      const storedFxRate = Number(t.fx_rate ?? t.fxRate ?? 1);
      const currentCurrencyPerUsd = Number(currencyPerUsdRates[currency]);
      const fxRate = currency !== 'USD' && storedFxRate === 1 && Number.isFinite(currentCurrencyPerUsd) && currentCurrencyPerUsd > 0
        ? 1 / currentCurrencyPerUsd
        : storedFxRate;
      const amount = currency === 'USD' || !Number.isFinite(fxRate) || fxRate <= 0 ? (t.qty * t.price) : (t.qty * t.price) * fxRate;
      return total + (t.action === 'ฝากเงิน' ? amount : -amount);
    }, 0);
}

function resolveDashboardTotals(holdingsList, latestSnapshot) {
  const liveCost = holdingsList.reduce((sum, holding) => sum + holding.costBasis, 0);
  const liveMV = holdingsList.reduce((sum, holding) => sum + holding.marketValue, 0);
  if (holdingsList.length > 0) {
    return { totalCost: liveCost, totalMV: liveMV, asOfDate: null, source: 'holdings' };
  }
  if (latestSnapshot && (Number(latestSnapshot.totalValue) > 0 || Number(latestSnapshot.totalCost) > 0)) {
    return {
      totalCost: Number(latestSnapshot.totalCost),
      totalMV: Number(latestSnapshot.totalValue) - Number(latestSnapshot.cashBalance || 0),
      asOfDate: latestSnapshot.date || null,
      source: 'snapshot',
    };
  }
  return { totalCost: 0, totalMV: 0, asOfDate: null, source: 'empty' };
}

function resolveDashboardSnapshotValue(holdingsList, latestSnapshot, cashDelta = 0) {
  const base = resolveDashboardTotals(holdingsList, latestSnapshot);
  const snapshotCashBalance = latestSnapshot ? Number(latestSnapshot.cashBalance || 0) : 0;
  const cashBalance = base.source === 'snapshot' ? snapshotCashBalance + Number(cashDelta || 0) : Number(cashDelta || 0);
  return {
    ...base,
    cashBalance,
    nav: base.totalMV + cashBalance,
  };
}

module.exports = {
  cashBalancesToUsd,
  computeCashBalance,
  computeCashBalances,
  computeHoldings,
  computeNetTotalInvested,
  realizedForSell,
  portfolioTotals,
  mergeCashBalances,
  resolveDashboardTotals,
  resolveCurrencyPerUsdRates,
  resolveDashboardSnapshotValue,
};
