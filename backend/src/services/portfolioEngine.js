// Average-cost portfolio engine — ported 1:1 from the original single-file app's
// computeHoldings()/realizedForSell(), now operating on rows fetched from SQLite
// instead of localStorage.

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
      h.costBasis += t.qty * t.price + t.fee;
    } else if (t.action === 'ขาย') {
      const avg = h.qty > 0 ? h.costBasis / h.qty : 0;
      const proceeds = t.qty * t.price - t.fee;
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
      cost += x.qty * x.price + x.fee;
    } else if (x.action === 'ขาย') {
      const avg = qty > 0 ? cost / qty : 0;
      cost -= avg * x.qty;
      qty -= x.qty;
    }
  }
  const avg = qty > 0 ? cost / qty : 0;
  return t.qty * t.price - t.fee - avg * t.qty;
}

function portfolioTotals(allTxRows, priceRows) {
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
  return { totalCost, totalMV };
}

module.exports = { computeHoldings, realizedForSell, portfolioTotals };
