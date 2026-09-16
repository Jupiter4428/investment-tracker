const {
	SCORE_WEIGHTS,
	TARGET_WEIGHTS,
	HARD_MAX_WEIGHTS,
	VALUATION_CONFIG,
} = require('../../config/smartDcaV2');

function safeNumber(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 100) {
	return Math.max(min, Math.min(max, safeNumber(value, min)));
}

function underweightScore(currentWeight, targetWeight) {
	const target = safeNumber(targetWeight);
	if (target <= 0) return 0;
	return clamp(50 + ((target - safeNumber(currentWeight)) / target) * 50);
}

function rsiScore(rsi) {
	const value = safeNumber(rsi, 50);
	if (value < 30) return 100;
	if (value < 40) return 85;
	if (value < 50) return 70;
	if (value < 60) return 55;
	if (value < 70) return 35;
	if (value < 80) return 15;
	return 5;
}

function trendScore(price, ema26) {
	const ema = safeNumber(ema26);
	if (safeNumber(price) <= 0 || ema <= 0) return 50;
	const distance = (safeNumber(price) - ema) / ema;
	if (distance <= -0.2) return 100;
	if (distance <= -0.1) return 90;
	if (distance <= -0.05) return 80;
	if (distance <= 0.05) return 65;
	if (distance <= 0.1) return 45;
	if (distance <= 0.2) return 25;
	return 10;
}

function macdScore(macdData = {}) {
	const histogram = macdData.histogram != null
		? safeNumber(macdData.histogram)
		: safeNumber(macdData.macd) - safeNumber(macdData.signal);
	if (!Number.isFinite(histogram)) return 50;
	return histogram < 0 ? 80 : histogram === 0 ? 60 : 40;
}

function valuationScore(ticker, pe, referencePe) {
	const value = safeNumber(pe);
	if (value <= 0) return 50;
	const reference = safeNumber(referencePe || VALUATION_CONFIG.referencePE[ticker] || 30, 30);
	const ratio = value / reference;
	if (ratio <= 0.5) return 100;
	if (ratio <= 0.7) return 90;
	if (ratio <= 0.85) return 75;
	if (ratio <= 1) return 65;
	if (ratio <= 1.15) return 50;
	if (ratio <= 1.3) return 35;
	if (ratio <= 1.5) return 20;
	return 10;
}

function volatilityScore(volatility) {
	const value = safeNumber(volatility);
	const annualized = value > 2 ? value / 100 : value;
	if (annualized <= 0) return 50;
	if (annualized < 0.1) return 35;
	if (annualized < 0.15) return 45;
	if (annualized < 0.25) return 60;
	if (annualized < 0.4) return 75;
	if (annualized < 0.6) return 85;
	return 90;
}

function calculateCompositeScore(scores) {
	return clamp(
		safeNumber(scores.underweight, 50) * SCORE_WEIGHTS.UNDERWEIGHT +
		safeNumber(scores.valuation, 50) * SCORE_WEIGHTS.VALUATION +
		safeNumber(scores.rsi, 50) * SCORE_WEIGHTS.RSI +
		safeNumber(scores.trend, 50) * SCORE_WEIGHTS.TREND +
		safeNumber(scores.macd, 50) * SCORE_WEIGHTS.MACD +
		safeNumber(scores.volatility, 50) * SCORE_WEIGHTS.VOLATILITY
	);
}

function scoreStock(data = {}) {
	const ticker = String(data.ticker || data.symbol || '').toUpperCase();
	const targetWeight = safeNumber(data.targetWeight ?? TARGET_WEIGHTS[ticker]);
	const hardMaxWeight = safeNumber(data.hardMaxWeight ?? HARD_MAX_WEIGHTS[ticker] ?? targetWeight);
	const scores = {
		underweight: underweightScore(data.currentWeight, targetWeight),
		valuation: valuationScore(ticker, data.pe, data.referencePe),
		rsi: rsiScore(data.rsi),
		trend: trendScore(data.price, data.ema26),
		macd: macdScore(data.macdData || (data.macd && typeof data.macd === 'object' ? data.macd : data)),
		volatility: volatilityScore(data.volatility),
	};
	return {
		ticker,
		currentWeight: safeNumber(data.currentWeight),
		targetWeight,
		hardMaxWeight,
		scores,
		compositeScore: Number(calculateCompositeScore(scores).toFixed(2)),
		isOverweight: safeNumber(data.currentWeight) > targetWeight,
		isOverMax: safeNumber(data.currentWeight) >= hardMaxWeight,
	};
}

module.exports = {
	clamp,
	safeNumber,
	underweightScore,
	valuationScore,
	rsiScore,
	trendScore,
	macdScore,
	volatilityScore,
	calculateCompositeScore,
	scoreStock,
};
