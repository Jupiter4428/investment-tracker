const { RISK_LIMITS } = require('../../config/smartDcaV2');

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function calculateConcentrationRisk(holdings = []) {
	const largest = holdings.reduce((max, holding) => Math.max(max, number(holding.weight)), 0);
	return { score: Math.min(100, largest / RISK_LIMITS.MAX_SINGLE_POSITION * 100), largestWeight: largest };
}

function calculateAiInfrastructureExposure(holdings = []) {
	const aiSymbols = new Set(['TSM', 'NVDA', 'AVGO', 'ASML', 'LITE']);
	const exposure = holdings.filter((holding) => aiSymbols.has(String(holding.symbol || '').toUpperCase()))
		.reduce((sum, holding) => sum + number(holding.weight), 0);
	return { exposure, warning: exposure >= RISK_LIMITS.AI_INFRASTRUCTURE_WARNING };
}

function calculatePortfolioDrawdown(portfolio = {}) {
	const value = number(portfolio.value);
	const peak = number(portfolio.peakValue, value);
	const drawdown = peak > 0 ? Math.max(0, (peak - value) / peak) : number(portfolio.drawdown);
	return { drawdown, review: drawdown >= RISK_LIMITS.MAX_REVIEW_DRAWDOWN };
}

function calculateVolatilityRisk(portfolio = {}) {
	const volatility = number(portfolio.volatility);
	const normalized = volatility > 2 ? volatility / 100 : volatility;
	return { volatility: normalized, high: normalized >= 0.4 };
}

function checkDataQuality(marketData = {}) {
	const entries = Array.isArray(marketData) ? marketData : Object.entries(marketData).map(([symbol, data]) => ({ symbol, ...data }));
	const invalid = entries.filter((data) => data && (data.price != null && number(data.price) <= 0 || data.rsi != null && (number(data.rsi, NaN) < 0 || number(data.rsi, NaN) > 100)));
	return { valid: invalid.length === 0, invalidTickers: invalid.map((data) => data.symbol || data.ticker) };
}

function calculatePortfolioRisk(portfolio = {}, marketData = {}) {
	const concentration = calculateConcentrationRisk(portfolio.holdings || []);
	const infrastructure = calculateAiInfrastructureExposure(portfolio.holdings || []);
	const drawdown = calculatePortfolioDrawdown(portfolio);
	const volatility = calculateVolatilityRisk(portfolio);
	const dataQuality = checkDataQuality(marketData);
	const score = Math.min(100, Math.round(
		concentration.score * 0.4 +
		(infrastructure.warning ? 100 : infrastructure.exposure / RISK_LIMITS.AI_INFRASTRUCTURE_WARNING * 100) * 0.2 +
		(drawdown.review ? 100 : drawdown.drawdown / RISK_LIMITS.MAX_REVIEW_DRAWDOWN * 100) * 0.25 +
		(volatility.high ? 100 : volatility.volatility / 0.4 * 100) * 0.15
	));
	const level = score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
	return { level, score, concentration, infrastructure, drawdown, volatility, dataQuality };
}

function getRiskGate(risk = {}) {
	if (!risk.dataQuality?.valid) return 'BLOCK';
	if (risk.drawdown?.review || risk.score >= 85) return 'REVIEW';
	if (risk.score >= 60) return 'CAUTION';
	return 'PASS';
}

module.exports = {
	calculateConcentrationRisk,
	calculateAiInfrastructureExposure,
	calculatePortfolioDrawdown,
	calculateVolatilityRisk,
	checkDataQuality,
	calculatePortfolioRisk,
	getRiskGate,
};
