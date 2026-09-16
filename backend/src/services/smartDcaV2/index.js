const { ACTIONS, SCORE_THRESHOLDS } = require('../../config/smartDcaV2');
const { scoreStock } = require('./scoring');
const { buildDcaPlan } = require('./allocation');
const { calculatePortfolioRisk, getRiskGate } = require('./risk');

function classifyStockStatus(stock) {
	if (Number(stock.targetWeight) <= 0) return 'NOT_IN_TARGET';
	if (Number(stock.currentWeight) >= Number(stock.hardMaxWeight)) return 'AT_HARD_MAX';
	if (Number(stock.currentWeight) > Number(stock.targetWeight)) return 'OVERWEIGHT';
	return 'TARGET';
}

function analyzePortfolio(portfolio = {}, marketData = {}) {
	const risk = calculatePortfolioRisk(portfolio, marketData);
	return { ...risk, gate: getRiskGate(risk) };
}

function analyzeStock(stock, marketData = {}, portfolio = {}) {
	const ticker = String(stock.ticker || stock.symbol || '').toUpperCase();
	const enrichedStock = { ...stock, ticker, ...(marketData[stock.symbol] || marketData[ticker] || {}) };
	const scored = scoreStock(enrichedStock);
	const status = classifyStockStatus({ ...enrichedStock, ...scored });
	const dataValid = Number(enrichedStock.price) > 0 && Number.isFinite(Number(enrichedStock.rsi)) && Number.isFinite(Number(enrichedStock.ema26)) && Number.isFinite(Number(enrichedStock.pe)) && Number.isFinite(Number(enrichedStock.volatility));
	let action = ACTIONS.DCA;
	if (status === 'NOT_IN_TARGET') action = ACTIONS.NOT_IN_TARGET;
	else if (!dataValid) action = ACTIONS.REVIEW;
	else if (scored.isOverMax) action = ACTIONS.STOP_BUY;
	else if (status === 'OVERWEIGHT') action = ACTIONS.PAUSE;
	else if (scored.compositeScore >= SCORE_THRESHOLDS.ACCUMULATE) action = ACTIONS.ACCUMULATE;
	else if (scored.compositeScore >= SCORE_THRESHOLDS.BUY) action = ACTIONS.BUY;
	else if (scored.compositeScore >= SCORE_THRESHOLDS.DCA) action = ACTIONS.DCA;
	else if (scored.compositeScore >= SCORE_THRESHOLDS.HOLD) action = ACTIONS.HOLD;
	else action = ACTIONS.PAUSE;
	const reasons = generateReasoning({ ...enrichedStock, ...scored, status, action });
	return { ...enrichedStock, ...scored, status, action, dataValid, underweight: Math.max(0, scored.targetWeight - scored.currentWeight), reasons: dataValid || status === 'NOT_IN_TARGET' ? reasons : [...reasons, 'ข้อมูลราคา/indicator ไม่ครบ จึง REVIEW'] };
}

function generateReasoning(stock) {
	const reasons = [];
	if (stock.status === 'NOT_IN_TARGET') return ['ไม่มี Target จึงไม่ซื้อเพิ่มอัตโนมัติ', 'ไม่ทำการขายอัตโนมัติ'];
	if (stock.currentWeight < stock.targetWeight) reasons.push('น้ำหนักต่ำกว่า Target');
	else if (stock.currentWeight > stock.targetWeight) reasons.push('น้ำหนักสูงกว่า Target จึงลด priority');
	if (stock.currentWeight < stock.hardMaxWeight) reasons.push('ยังไม่ถึง Hard Max');
	if (stock.scores?.rsi <= 55) reasons.push('RSI อยู่ใน accumulation zone');
	else if (stock.scores?.rsi >= 70) reasons.push('RSI สูง จึงลด DCA ไม่ใช่สัญญาณขาย');
	if (stock.scores?.trend >= 65) reasons.push('ราคาเทียบ EMA26 สนับสนุนการสะสม');
	if (stock.scores?.valuation >= 65) reasons.push('valuation อยู่ใน acceptable range เมื่อเทียบ reference P/E');
	if (stock.action === ACTIONS.STOP_BUY) reasons.push('ถึงหรือเกิน Hard Max จึงหยุดซื้อ');
	reasons.push(generateActionReason(stock));
	return reasons;
}

function generateRecommendations(stocks, risk) {
	return stocks.map((stock) => stock.status === 'NOT_IN_TARGET' || stock.status === 'AT_HARD_MAX' ? stock : risk.gate === 'BLOCK' ? { ...stock, action: ACTIONS.REVIEW, reasons: [...stock.reasons, 'ข้อมูลตลาดไม่ถูกต้องหรือไม่ครบ'] } : risk.gate === 'REVIEW' ? { ...stock, action: ACTIONS.REVIEW, reasons: [...stock.reasons, generateRiskReason(risk)] } : stock);
}

function generateDcaPlan(stocks, budget, risk) {
	const plan = buildDcaPlan({ volatility: risk.volatility.volatility, riskScore: risk.score / 100 }, stocks, budget);
	return stocks.map((stock) => ({ ...stock, dcaAmount: Number((plan.allocations[stock.ticker] || 0).toFixed(2)) }));
}

function generateRiskReason(risk) {
	if (risk.drawdown?.review) return 'Portfolio drawdown สูง ควร REVIEW ก่อนเพิ่ม DCA';
	if (risk.infrastructure?.warning) return 'AI infrastructure exposure สูง ควรระวัง concentration';
	return `Portfolio risk ระดับ ${risk.level}`;
}

function buildSmartDcaV2(input = {}) {
	const portfolio = { ...(input.portfolio || {}), holdings: input.portfolio?.holdings || [] };
	const marketData = input.marketData || {};
	const risk = analyzePortfolio(portfolio, marketData);
	let stocks = (input.stocks || portfolio.holdings || []).map((stock) => analyzeStock(stock, marketData, portfolio));
	stocks = generateRecommendations(stocks, risk);
	stocks = generateDcaPlan(stocks, input.monthlyBudget ?? portfolio.monthlyBudget ?? 0, risk);
	const notInTarget = stocks
		.filter((stock) => stock.status === 'NOT_IN_TARGET')
		.map((stock) => ({ ticker: stock.ticker, currentWeight: stock.currentWeight, action: ACTIONS.NOT_IN_TARGET, dcaAmount: 0 }));
	const totalAllocated = stocks.reduce((sum, stock) => sum + stock.dcaAmount, 0);
	return {
		portfolio: { value: Number(portfolio.value || 0), monthlyBudget: Number(input.monthlyBudget ?? portfolio.monthlyBudget ?? 0) },
		risk,
		stocks,
		notInTarget,
		summary: { totalAllocated: Number(totalAllocated.toFixed(2)), cashRemaining: Number(Math.max(0, (input.monthlyBudget ?? portfolio.monthlyBudget ?? 0) - totalAllocated).toFixed(2)) },
	};
}

function generateActionReason(stock) {
	const reasons = {
		BUY: 'คะแนนและ eligibility เหมาะสมกับการซื้อเพิ่ม',
		DCA: 'เหมาะกับการสะสมตามแผนปกติ',
		HOLD: 'ยังไม่จำเป็นต้องเพิ่ม allocation',
		PAUSE: 'ลดหรือหยุด DCA เพราะ overweight หรือ technical condition ไม่เหมาะสม',
		STOP_BUY: 'ถึง Hard Max จึงหยุดซื้อ โดยไม่ขาย',
		NOT_IN_TARGET: 'ไม่มี Target จึงไม่จัดสรรเงินเพิ่ม',
		REVIEW: 'ต้องตรวจสอบข้อมูลหรือความเสี่ยงก่อนจัดสรรเงิน',
		ACCUMULATE: 'คะแนนสูงและ underweight จึงเหมาะกับการสะสม',
	};
	return reasons[stock.action] || 'ต้องตรวจสอบสถานะเพิ่มเติม';
}

module.exports = { buildSmartDcaV2, analyzePortfolio, analyzeStock, classifyStockStatus, generateRecommendations, generateDcaPlan, generateReasoning, generateActionReason, generateRiskReason };
