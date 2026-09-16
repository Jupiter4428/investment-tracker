/**
 * Smart-DCA v2 Configuration
 *
 * Long-term portfolio:
 * - No automatic selling
 * - Underweight positions receive higher DCA priority
 * - Overweight positions receive lower DCA priority
 * - Hard max weight = STOP BUY
 */

const TARGET_WEIGHTS = {
  TSM: 0.18,
  MSFT: 0.17,
  GOOGL: 0.15,
  ASML: 0.13,
  NVDA: 0.11,
  AVGO: 0.09,
  AMZN: 0.07,
  LITE: 0.04,
  SPOT: 0.04,
  BE: 0.02,
};

const HARD_MAX_WEIGHTS = {
  TSM: 0.23,
  MSFT: 0.22,
  GOOGL: 0.20,
  ASML: 0.18,
  NVDA: 0.16,
  AVGO: 0.14,
  AMZN: 0.12,
  LITE: 0.07,
  SPOT: 0.07,
  BE: 0.05,
};

/**
 * Score weights
 *
 * Total = 100%
 */
const SCORE_WEIGHTS = {
  UNDERWEIGHT: 0.30,
  VALUATION: 0.20,
  RSI: 0.15,
  TREND: 0.15,
  MACD: 0.10,
  VOLATILITY: 0.10,
};

/**
 * Volatility multiplier
 *
 * Higher volatility gives us permission to accumulate more,
 * but always with a maximum cap.
 */
const VOLATILITY_MULTIPLIER = {
  LOW: 1.00,
  NORMAL: 1.00,
  HIGH: 1.15,
  VERY_HIGH: 1.30,
  EXTREME: 1.50,
};

const ACTIONS = {
  ACCUMULATE: "ACCUMULATE",
  BUY: "BUY",
  DCA: "DCA",
  HOLD: "HOLD",
  PAUSE: "PAUSE",
  STOP_BUY: "STOP_BUY",
  NOT_IN_TARGET: "NOT_IN_TARGET",
  REVIEW: "REVIEW",
};

/**
 * Score thresholds
 */
const SCORE_THRESHOLDS = {
  ACCUMULATE: 75,
  BUY: 60,
  DCA: 45,
  HOLD: 30,
  PAUSE: 15,
};

/**
 * Portfolio risk limits
 */
const RISK_LIMITS = {
  MAX_SINGLE_POSITION: 0.23,

  // Combined semiconductor / AI infrastructure exposure.
  // This is a monitoring threshold rather than an automatic sell rule.
  AI_INFRASTRUCTURE_WARNING: 0.60,

  // If portfolio drawdown reaches this level,
  // the system should flag REVIEW instead of blindly increasing DCA.
  MAX_REVIEW_DRAWDOWN: 0.30,
};

/**
 * DCA configuration
 */
const DCA_CONFIG = {
  DEFAULT_MONTHLY_BUDGET: 200,

  MIN_TRADE_AMOUNT: 1,

  MAX_VOLATILITY_MULTIPLIER: 1.50,

  // Prevent one stock from consuming the entire monthly budget.
  MAX_SINGLE_DCA_ALLOCATION: 0.30,
};

/**
 * Optional valuation reference.
 *
 * These are intentionally configurable.
 * They are NOT "fair value" predictions.
 *
 * The scoring engine uses these only as a reference point
 * for relative valuation scoring.
 */
// Valuation assumption: MANUAL references are strategy assumptions, not fair-value estimates.
// Review these values whenever the valuation framework or data source changes.
const VALUATION_CONFIG = {
  referenceType: 'MANUAL',
  referencePE: {
  TSM: 22,
  MSFT: 30,
  GOOGL: 24,
  ASML: 35,
  NVDA: 35,
  AVGO: 30,
  AMZN: 40,
  LITE: 25,
  SPOT: 70,
  BE: 35,
  },
};

module.exports = {
  TARGET_WEIGHTS,
  HARD_MAX_WEIGHTS,
  SCORE_WEIGHTS,
  VOLATILITY_MULTIPLIER,
  ACTIONS,
  SCORE_THRESHOLDS,
  RISK_LIMITS,
  DCA_CONFIG,
  VALUATION_CONFIG,
  // Kept as a compatibility alias for callers using the pre-v1.1 name.
  VALUATION_REFERENCE_PE: VALUATION_CONFIG.referencePE,
};