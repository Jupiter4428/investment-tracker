// Statement values converted from THB to USD using the latest USD/THB close
// on or before each statement date. September uses the statement's own rate.
const historicalSnapshots = [
  { date: '2025-11-28', totalValue: 121.73, totalCost: 123.06, source: 'KKP Dime monthly statement' },
  { date: '2025-12-31', totalValue: 92.56, totalCost: 90.19, source: 'KKP Dime monthly statement' },
  { date: '2026-01-30', totalValue: 16.35, totalCost: 22.33, source: 'KKP Dime monthly statement' },
  { date: '2026-02-27', totalValue: 30.26, totalCost: 31.88, source: 'KKP Dime monthly statement' },
  { date: '2026-03-31', totalValue: 106.03, totalCost: 108.07, source: 'KKP Dime monthly statement' },
  { date: '2026-04-30', totalValue: 140.41, totalCost: 133.06, source: 'KKP Dime monthly statement' },
  { date: '2026-05-29', totalValue: 192.08, totalCost: 152.46, source: 'KKP Dime monthly statement' },
  { date: '2026-06-30', totalValue: 167.68, totalCost: 146.79, source: 'KKP Dime monthly statement' },
  { date: '2026-07-31', totalValue: 277.72, totalCost: 263.16, source: 'KKP Dime monthly statement' },
  { date: '2026-08-31', totalValue: 470.31, totalCost: 447.78, source: 'KKP Dime monthly statement' },
  { date: '2026-09-30', totalValue: 583.06, totalCost: 526.13, source: 'KKP Dime monthly statement' },
];

module.exports = { historicalSnapshots };