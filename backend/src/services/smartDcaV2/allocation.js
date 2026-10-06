const { ACTIONS, DCA_CONFIG } = require('../../config/smartDcaV2');

const safe = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizeDcaTargetWeights(targetWeights, includedSymbols) {
  const included = new Set(includedSymbols.map((symbol) => String(symbol).trim().toUpperCase()));
  const entries = Object.entries(targetWeights).map(([symbol, weight]) => [symbol.toUpperCase(), Math.max(0, safe(weight))]);
  const total = entries.reduce((sum, [symbol, weight]) => sum + (included.has(symbol) ? weight : 0), 0);
  return Object.fromEntries(entries.map(([symbol, weight]) => [
    symbol,
    included.has(symbol) && total > 0 ? weight / total : 0,
  ]));
}

function calculateBuyCapacity(currentWeight, hardMaxWeight) {
  return Math.max(0, safe(hardMaxWeight) - safe(currentWeight));
}

function calculateUnderweight(currentWeight, targetWeight) {
  return Math.max(0, safe(targetWeight) - safe(currentWeight));
}

function calculatePriority(stockScore, underweight, risk = 0) {
  return Math.max(0, safe(stockScore) * (1 + Math.min(1, safe(underweight))) * (1 - Math.min(0.5, Math.max(0, safe(risk)))));
}

function applyHardMax(stock, allocation) {
  if (stock.isOverMax || safe(stock.currentWeight) >= safe(stock.hardMaxWeight)) return { allocation: 0, action: ACTIONS.STOP_BUY };
  return { allocation: Math.max(0, safe(allocation)), action: stock.action };
}

function applyNotInTarget(stock, allocation) {
  if (stock.status === 'NOT_IN_TARGET' || safe(stock.targetWeight) <= 0) return { allocation: 0, action: ACTIONS.NOT_IN_TARGET };
  return { allocation: Math.max(0, safe(allocation)), action: stock.action };
}

function applySingleStockLimit(allocation, budget) {
  return Math.min(Math.max(0, safe(allocation)), Math.max(0, safe(budget)) * DCA_CONFIG.MAX_SINGLE_DCA_ALLOCATION);
}

function normalizeAllocations(allocations, budget) {
  const entries = Object.entries(allocations).map(([ticker, amount]) => [ticker, Math.max(0, safe(amount))]);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (!total || total <= safe(budget)) return Object.fromEntries(entries.map(([ticker, amount]) => [ticker, Number(amount.toFixed(2))]));
  const scale = safe(budget) / total;
  return Object.fromEntries(entries.map(([ticker, amount]) => [ticker, Number((amount * scale).toFixed(2))]));
}

function volatilityMultiplier(volatility) {
  const value = safe(volatility) > 2 ? safe(volatility) / 100 : safe(volatility);
  if (value < 0.25) return 1;
  if (value < 0.4) return 1.15;
  if (value < 0.6) return 1.3;
  return 1.5;
}

function allocateInitialBudget(stocks, budget, options = {}) {
  const availableBudget = Math.max(0, safe(budget));
  const multiplier = Math.min(1.5, volatilityMultiplier(options.volatility));
  const adjustedBudget = Math.min(availableBudget, availableBudget * multiplier);
  const eligible = stocks.filter((stock) => stock.status !== 'NOT_IN_TARGET' && stock.action !== ACTIONS.PAUSE && stock.action !== ACTIONS.HOLD && stock.action !== ACTIONS.REVIEW && !stock.isOverMax && stock.status !== 'AT_HARD_MAX');
  const priorityTotal = eligible.reduce((sum, stock) => sum + calculatePriority(stock.compositeScore, stock.underweight, options.riskScore), 0);
  const allocations = Object.fromEntries(stocks.map((stock) => [stock.ticker, 0]));
  for (const stock of eligible) {
    allocations[stock.ticker] = priorityTotal ? adjustedBudget * calculatePriority(stock.compositeScore, stock.underweight, options.riskScore) / priorityTotal : 0;
  }
  return { allocations, adjustedBudget, multiplier };
}

function redistributeRemainingBudget(allocations, stocks, remainingBudget, options = {}) {
  let remaining = Math.max(0, safe(remainingBudget));
  const portfolioValue = safe(options.portfolioValue);
  const allocationBudget = Math.max(0, safe(options.budget));
  for (let iteration = 0; iteration < stocks.length + 1 && remaining > 0.005; iteration += 1) {
    const eligible = stocks.filter((stock) => {
      const status = applyNotInTarget(stock, 1);
      const hardMax = applyHardMax(stock, 1);
      if (status.action === ACTIONS.NOT_IN_TARGET || hardMax.action === ACTIONS.STOP_BUY || stock.action === ACTIONS.REVIEW || stock.action === ACTIONS.PAUSE || stock.action === ACTIONS.HOLD) return false;
      const hardCapacity = portfolioValue > 0 ? portfolioValue * calculateBuyCapacity(stock.currentWeight, stock.hardMaxWeight) : Infinity;
      const singleCapacity = Math.max(0, allocationBudget * DCA_CONFIG.MAX_SINGLE_DCA_ALLOCATION - safe(allocations[stock.ticker]));
      return Math.min(hardCapacity - safe(allocations[stock.ticker]), singleCapacity) > 0.005;
    });
    if (!eligible.length) break;
    const totalPriority = eligible.reduce((sum, stock) => sum + calculatePriority(stock.compositeScore, stock.underweight, options.riskScore), 0);
    if (!totalPriority) break;
    let distributed = 0;
    for (const stock of eligible) {
      const hardCapacity = portfolioValue > 0 ? portfolioValue * calculateBuyCapacity(stock.currentWeight, stock.hardMaxWeight) : Infinity;
      const singleCapacity = Math.max(0, allocationBudget * DCA_CONFIG.MAX_SINGLE_DCA_ALLOCATION - safe(allocations[stock.ticker]));
      const requested = remaining * calculatePriority(stock.compositeScore, stock.underweight, options.riskScore) / totalPriority;
      const amount = Math.min(requested, Math.max(0, hardCapacity - safe(allocations[stock.ticker])), singleCapacity);
      allocations[stock.ticker] = safe(allocations[stock.ticker]) + amount;
      distributed += amount;
    }
    if (distributed <= 0.005) break;
    remaining -= distributed;
  }
  return { allocations, remainingBudget: Math.max(0, remaining) };
}

function allocateDcaBudget(stocks, budget, options = {}) {
  const initial = allocateInitialBudget(stocks, budget, { ...options, budget });
  const allocations = Object.fromEntries(stocks.map((stock) => [stock.ticker, 0]));
  for (const stock of stocks) {
    const hardMax = safe(options.portfolioValue) > 0 ? safe(options.portfolioValue) * calculateBuyCapacity(stock.currentWeight, stock.hardMaxWeight) : Infinity;
    const capped = Math.min(initial.allocations[stock.ticker] || 0, hardMax, applySingleStockLimit(initial.allocations[stock.ticker] || 0, initial.adjustedBudget));
    allocations[stock.ticker] = applyNotInTarget(stock, applyHardMax(stock, capped).allocation).allocation;
  }
  const allocated = Object.values(allocations).reduce((sum, amount) => sum + amount, 0);
  const redistributed = redistributeRemainingBudget(allocations, stocks, initial.adjustedBudget - allocated, { ...options, budget: initial.adjustedBudget });
  return { allocations: normalizeAllocations(redistributed.allocations, initial.adjustedBudget), adjustedBudget: initial.adjustedBudget, multiplier: initial.multiplier, cashRemaining: redistributed.remainingBudget };
}

function buildDcaPlan(portfolio, stocks, budget) {
  return allocateDcaBudget(stocks, budget, { volatility: portfolio.volatility, riskScore: portfolio.riskScore, portfolioValue: portfolio.value });
}

module.exports = { calculateBuyCapacity, calculateUnderweight, calculatePriority, applyHardMax, applyNotInTarget, applySingleStockLimit, allocateInitialBudget, normalizeAllocations, normalizeDcaTargetWeights, redistributeRemainingBudget, allocateDcaBudget, buildDcaPlan, volatilityMultiplier };
