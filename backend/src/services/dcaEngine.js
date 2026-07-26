// Ported from Smart-DCA/src/portfolio.py + config.py — the volatility-adjusted budget
// formula, rebalance-factor calculation, and the full multi-factor get_action_signal()
// decision tree (EMA26 support/extreme-drop risk check, P/E cheap/expensive buckets,
// exit-position handling, hedge-asset handling).

const { TECH_STOCKS, VALUE_STOCKS, HEDGE_SYMBOLS } = require('../constants');

const RSI_OVERSOLD = Number(process.env.RSI_OVERSOLD || 30);
const RSI_OVERBOUGHT = Number(process.env.RSI_OVERBOUGHT || 70);
const VOL_DCA_CAP = Number(process.env.VOL_DCA_CAP || 1.5);

// Smart-DCA README formula: multiplier = 1 + vol/2, capped, only applied above 25% vol.
// (matches the repo's documented behaviour; vol is a fraction e.g. 0.25 = 25%)
function adjustedBudget(budget, volFraction) {
  if (volFraction > 0.25) {
    const multiplier = Math.min(VOL_DCA_CAP, 1 + volFraction / 2);
    return budget * multiplier;
  }
  return budget;
}

// Boost underweighted, reduce overweighted, then normalize so factors sum to 1.
function calcRebalanceFactors(targetAlloc, currentPct) {
  const factors = {};
  for (const symbol of Object.keys(targetAlloc)) {
    const diff = (currentPct[symbol] || 0) - (targetAlloc[symbol] || 0);
    if (diff < 0) factors[symbol] = 1 + Math.abs(diff) / 10;
    else if (diff > 2) factors[symbol] = Math.max(0.3, 1 - Math.abs(diff) / 10);
    else factors[symbol] = 1.0;
  }
  const total = Object.values(factors).reduce((a, b) => a + b, 0) || 1;
  const norm = {};
  for (const s of Object.keys(factors)) norm[s] = factors[s] / total;
  return norm;
}

/**
 * Full multi-factor action signal — 1:1 port of get_action_signal() in portfolio.py.
 * @param {object} p
 * @param {string} p.symbol
 * @param {number} p.currentPct
 * @param {number} p.targetPct
 * @param {number|null} p.rsi
 * @param {number|null} p.pe
 * @param {number|null} p.macd
 * @param {number|null} p.signal
 * @param {number|null} p.price
 * @param {number|null} p.ema26
 * @returns {{sig:string, note:string}}
 */
function getActionSignal({ symbol, currentPct, targetPct, rsi = null, pe = null, macd = null, signal = null, price = null, ema26 = null }) {
  // 0. Exit position: removed from target portfolio but still held.
  if (targetPct === 0 && currentPct > 0) {
    return { sig: 'SELL 🔴', note: 'Exit Position (ถูกนำออกจากเป้าหมาย — ควรขาย)' };
  }

  // 1. Hedge asset (gold): disciplined DCA regardless of signals.
  if (HEDGE_SYMBOLS.includes(symbol)) {
    return { sig: 'DCA 🔵', note: 'Hedge asset (ซื้อตามวินัย ไม่ขึ้นกับสัญญาณ)' };
  }

  const diff = currentPct != null && targetPct != null ? currentPct - targetPct : 0;
  const isUnderweight = diff < -0.5;
  const isOverweight = diff > 2.0;

  const isOversold = rsi != null ? rsi <= RSI_OVERSOLD : false;
  const isOverbought = rsi != null ? rsi >= RSI_OVERBOUGHT : false;
  const macdBullish = macd != null && signal != null ? macd > signal : false;

  let atEmaSupport = false;
  let priceExtremeDrop = false;
  let isEmaBullish = false;
  if (price != null && ema26 != null && ema26 > 0) {
    const diffEma = ((price - ema26) / ema26) * 100;
    atEmaSupport = diffEma >= -2 && diffEma <= 5;
    isEmaBullish = diffEma > 0;
    if (diffEma < -10) priceExtremeDrop = true;
  }

  let isExpensive = false;
  let isCheap = false;
  if (pe != null && !Number.isNaN(pe)) {
    if (TECH_STOCKS.includes(symbol)) {
      isExpensive = pe > 60;
      isCheap = pe < 30;
    } else if (VALUE_STOCKS.includes(symbol)) {
      isExpensive = pe > 25;
      isCheap = pe < 15;
    }
  }

  // [A] Risk first: capital protection.
  if (priceExtremeDrop && !macdBullish) {
    return { sig: 'HOLD 🟡', note: 'Extreme Downtrend (หยุด DCA รอดูสถานการณ์)' };
  }

  // [B] Overweight.
  if (isOverweight) {
    if (isOverbought && diff > 5.0) {
      return { sig: 'SELL 🔴', note: 'Extreme Overweight + Overbought (Take Profit)' };
    }
    if (isEmaBullish && macdBullish && !isOverbought) {
      return { sig: 'DCA 🔵', note: 'Overweight แต่เทรนด์ยังแข็งแรง (ปล่อยให้กำไรวิ่งต่อ)' };
    }
    if ((isExpensive || isOverbought) && !macdBullish) {
      return { sig: 'HOLD ⚪', note: 'แพง/Overbought และโมเมนตัมอ่อนแรง (หยุดเติมเงิน)' };
    }
    return { sig: 'HOLD ⚪', note: 'Overweight (ย้ายงบ DCA ไปสินทรัพย์ที่ underweight แทน)' };
  }

  // [C] Underweight.
  if (isUnderweight) {
    if (isExpensive || isOverbought) {
      return { sig: 'BUY 🟡', note: 'Underweight แต่ราคาแพง/Overbought (รอย่อตัว)' };
    }
    if ((macdBullish || atEmaSupport) && (isCheap || isOversold) && !isOverbought) {
      return { sig: 'STRONG BUY 🟢🟢', note: 'ราคาถูก/Oversold + โมเมนตัมบวก' };
    }
    if (macdBullish || atEmaSupport) {
      return { sig: 'BUY 🟢', note: 'สะสม (ขาดสัดส่วน + เทรนด์บวก/แนวรับ)' };
    }
    if (isCheap || isOversold) {
      return { sig: 'BUY 🟢', note: 'สะสม (ราคาถูกหรือ Oversold)' };
    }
    return { sig: 'BUY 🟡', note: 'สะสมตามแผน (ขาดสัดส่วน, เทรนด์กลาง)' };
  }

  // [D] On target.
  if (isCheap && macdBullish && !isOverbought) {
    return { sig: 'DCA 🟢', note: 'ราคาถูก + เทรนด์บวก (DCA ตามปกติ)' };
  }
  if (isExpensive || isOverbought) {
    return { sig: 'DCA 🟡', note: 'ราคาสูงแต่ยังคง DCA ตามวินัย' };
  }
  return { sig: 'DCA 🔵', note: 'รักษาวินัย DCA ตามปกติ' };
}

module.exports = { adjustedBudget, calcRebalanceFactors, getActionSignal };
