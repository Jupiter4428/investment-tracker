function futureValue(principal, monthlyContribution, annualReturn, years) {
	const months = Math.max(0, Number(years) * 12);
	const monthlyRate = Number(annualReturn) / 12;
	if (!monthlyRate) return Number(principal || 0) + Number(monthlyContribution || 0) * months;
	return Number(principal || 0) * (1 + monthlyRate) ** months + Number(monthlyContribution || 0) * (((1 + monthlyRate) ** months - 1) / monthlyRate);
}

function projectPortfolio(portfolio = {}, monthlyBudget, years) {
	return futureValue(portfolio.value || 0, monthlyBudget || portfolio.monthlyBudget || 0, portfolio.annualReturn || 0.08, years);
}

function calculateScenario(portfolio, monthlyBudget, years, annualReturn) {
	return { annualReturn, years, value: futureValue(portfolio.value || 0, monthlyBudget, annualReturn, years) };
}

function calculateRequiredContribution(principal, targetValue, annualReturn, years) {
	const months = Math.max(1, Number(years) * 12);
	const monthlyRate = Number(annualReturn) / 12;
	const growth = (1 + monthlyRate) ** months;
	return monthlyRate ? (Number(targetValue) - Number(principal || 0) * growth) * monthlyRate / (growth - 1) : (Number(targetValue) - Number(principal || 0)) / months;
}

module.exports = { futureValue, projectPortfolio, calculateScenario, calculateRequiredContribution };
