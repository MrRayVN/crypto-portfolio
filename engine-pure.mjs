// engine-pure.mjs — Pure deterministic functions extracted from index.html
// Mirror tightly khớp với index.html nguyên bản. Khi sửa logic ở index.html
// (m1, m7_loan, m34_vol_state, m35_survival_mode, attachDecisionConfidence,
//  computeConfidenceTier, adjustTpMultForVol, Kelly clamp), MUST update đây.
//
// Tests trong tests/ assert behavior của các functions này.

// ===================== TH CONSTANTS =====================
export const TH = {
  FG_EXTREME_FEAR: 15,
  FG_CAPITULATION: 20,
  FG_FEAR: 30,
  FG_DIP_BUY_T2: 35,
  FG_NEUTRAL_LOW: 40,
  FG_NEUTRAL_HIGH: 55,
  FG_GREED: 65,
  FG_EXTREME_GREED: 80,
  PBULL_CAPITULATION: 0.15,
  PBULL_CAUTIOUS_BEAR: 0.35,
  PBULL_DIP_BUY_MIN: 0.40,
  PBULL_SQUEEZE_MIN: 0.45,
  PBULL_BULL_TILT: 0.55,
  MOMENTUM_CAPITULATION: -10,
  DIP_SMA_PCT: 0.92,
  DIP_SMA_PCT_T1: 0.97,
  DIP_BUY_LTV_MAX: 0.65,
  POOL_DRIFT_FIRE: 15,
  POOL_DRIFT_WARN: 8,
  SQUEEZE_LEVERAGE: 3,
  SQUEEZE_SCORE_FIRE: 60,
  SQUEEZE_FUNDING_NEGATIVE: -0.005,
  SQUEEZE_NET_PCT: 0.05,
  LOAN_LTV_TARGET: 0.60,
  LTV_ACCEPTABLE: 0.55,
  LTV_HARD_FLOOR: 0.50,
  EFFECTIVE_MMR: 0.90,
  CORR_CRISIS: 0.85,
  CORR_HIGH: 0.70,
  CORR_NORMAL: 0.50,
  USDC_IDLE_MIN_FOR_EARN: 200,
  BTC_STOPLOSS_DEFAULT: 65000,
};

// ===================== M1: Portfolio Summary =====================
export function m1(holdings, loan) {
  // Compute values inline (mirrors computeValues + m1 from index.html)
  for (const k in holdings) holdings[k].value = holdings[k].qty * holdings[k].price;
  const gross = Object.values(holdings).reduce((s, h) => s + h.value, 0);
  const net = gross - loan;
  const cost = Object.values(holdings).reduce((s, h) => s + h.qty * (h.avg ?? h.price), 0);
  const pnl = gross - cost;
  return {
    gross, loan, net, cost, pnl_unreal: pnl,
    equity_ratio: gross > 0 ? net / gross * 100 : 0,
    pnl_pct: cost > 0 ? pnl / cost * 100 : 0,
  };
}

// ===================== M7: Loan Framework =====================
export function m7_loan(gross, loan, btcPrice) {
  const soft = gross * (1 - TH.LOAN_LTV_TARGET) * TH.EFFECTIVE_MMR;
  const accept = gross * (1 - TH.LTV_ACCEPTABLE) * TH.EFFECTIVE_MMR;
  const hard = gross * (1 - TH.LTV_HARD_FLOOR) * TH.EFFECTIVE_MMR;
  const liq_dist = gross > 0 ? (gross - loan) / gross * 100 : 0;
  const btc_liq = btcPrice * (loan / (gross * TH.EFFECTIVE_MMR));
  return {
    loan, soft, accept, hard, liq_dist, btc_liq,
    over_soft: loan - soft, over_accept: loan - accept, over_hard: loan - hard,
    repay_to_soft: Math.max(0, loan - soft),
    repay_to_accept: Math.max(0, loan - accept),
    decision: loan > soft ? 'REPAY' : 'HOLD',
  };
}

// ===================== Kelly Clamp =====================
export const KELLY_MAX_NAV_PCT = 6.0;
export function kellyClamp(adjustedKelly) {
  // Mirror index.html line ~1213-1219
  const raw_quarter = adjustedKelly * 25;
  const clamped_quarter = Math.min(raw_quarter, KELLY_MAX_NAV_PCT);
  const clamp_active = raw_quarter > KELLY_MAX_NAV_PCT;
  const half_kelly = Math.min(adjustedKelly * 50, KELLY_MAX_NAV_PCT * 2);
  return { raw_quarter, clamped_quarter, clamp_active, half_kelly };
}

// ===================== M34: Volatility State Machine =====================
export function m34VolState({ realizedVol, garchVol, gapIntensity = 0, move24h = 0 }) {
  const volScore = Math.max(0, Math.min(100,
    (realizedVol != null ? Math.min(100, realizedVol) * 0.45 : 50 * 0.45) +
    (garchVol != null ? Math.min(100, garchVol) * 0.25 : 50 * 0.25) +
    (gapIntensity * 100 * 0.20) +
    (move24h * 4 * 0.10)
  ));
  let state, sizeMultiplier;
  if (volScore < 30) { state = 'QUIET'; sizeMultiplier = 1.2; }
  else if (volScore < 55) { state = 'NORMAL'; sizeMultiplier = 1.0; }
  else if (volScore < 75) { state = 'EXPANDING'; sizeMultiplier = 0.7; }
  else if (volScore < 90) { state = 'PANIC'; sizeMultiplier = 0.4; }
  else { state = 'EUPHORIA'; sizeMultiplier = 0.5; }
  return { state, vol_score: volScore, size_multiplier: sizeMultiplier };
}

// ===================== M35: Survival Mode =====================
export function m35Survival({ corrCrisis = false, pBull = 0.5, realizedVol = null,
                              maxDDPct = 0, fundingNow = 0, m28Grade = null }) {
  const triggers = [];
  if (corrCrisis) triggers.push('M25_CORR_CRISIS');
  if (pBull < 0.20) triggers.push('M22_REGIME_COLLAPSE');
  if (realizedVol != null && realizedVol > 90) triggers.push('VOL_PANIC');
  if (maxDDPct > 20) triggers.push('DD_BREACH');
  if (fundingNow > 0.001 || m28Grade === 'OVERHEATED_LONGS' || m28Grade === 'NO_EDGE') {
    triggers.push('FUNDING_INVERSION');
  }
  const triggerCount = triggers.length;
  const active = triggerCount >= 3;
  let severity;
  if (triggerCount >= 4) severity = 'EXTREME';
  else if (triggerCount >= 3) severity = 'HIGH';
  else if (triggerCount >= 2) severity = 'WATCH';
  else severity = 'IDLE';
  return { active, severity, trigger_count: triggerCount, trigger_total: 5, triggers };
}

// ===================== Confidence Tier =====================
export function computeConfidenceTier(score) {
  if (score >= 75) return {
    tier: 'HIGH', color: '#10b981', size_adjustment: 1.0,
    instruction: 'Execute size đề xuất, confidence cao'
  };
  if (score >= 50) return {
    tier: 'MID', color: '#f59e0b', size_adjustment: 0.7,
    instruction: 'Giảm size 30% so với đề xuất, verify spread/orderbook trước khi enter'
  };
  return {
    tier: 'LOW', color: '#ef4444', size_adjustment: 0.4,
    instruction: 'Giảm size 60% HOẶC delay 4-12h để reconfirm trong tick sau'
  };
}

// ===================== Dynamic TP Multiplier (vol-adjusted per-asset) =====================
export function adjustTpMultForVol(baseMult, assetVol, btcVol) {
  if (!assetVol || !btcVol || assetVol <= 0 || btcVol <= 0) return baseMult;
  const ratio = assetVol / btcVol;
  const volScale = Math.max(0.85, Math.min(1.35, Math.pow(ratio, 0.5)));
  return 1 + (baseMult - 1) * volScale;
}

// ===================== Bigcandle / Leverage-Increase Classifier =====================
export const LEVERAGE_INCREASE_PRIORITIES = [3.5, 5, 7];
export function shouldDeferOnBigCandle(priority, btc24hAbs) {
  const bigCandle = btc24hAbs > 5;
  const isLeverageIncrease = LEVERAGE_INCREASE_PRIORITIES.includes(priority);
  return bigCandle && isLeverageIncrease;
}

// ===================== Decision Entropy Regime Classifier =====================
export function entropyRegime(topPct) {
  if (topPct >= 90) return { regime: 'CONVERGED', bias_hold: false };
  if (topPct >= 70) return { regime: 'ROBUST', bias_hold: false };
  if (topPct >= 50) return { regime: 'MIXED', bias_hold: true };
  return { regime: 'DIVERGENT', bias_hold: true };
}

// ===================== M36: Cumulative Target Tracker =====================
export function m36CumulativeTarget({ annualTargetPct = 35, yearHistory = [], currentPnLPct = 0 }) {
  const nCompleted = yearHistory.length;
  const N = nCompleted + 1;
  const ideal_multiplier = Math.pow(1 + annualTargetPct / 100, N);
  let prior_multiplier = 1;
  for (const y of yearHistory) prior_multiplier *= (1 + (y.actual_pnl_pct || 0) / 100);
  const actual_multiplier = prior_multiplier * (1 + currentPnLPct / 100);
  const required_current_multiplier = ideal_multiplier / Math.max(prior_multiplier, 0.001);
  const required_current_pct = (required_current_multiplier - 1) * 100;
  const shortfall_pp = required_current_pct - currentPnLPct;
  let status;
  if (currentPnLPct >= required_current_pct * 1.05) status = 'AHEAD';
  else if (currentPnLPct >= required_current_pct * 0.90) status = 'ON_TRACK';
  else if (currentPnLPct >= required_current_pct * 0.50) status = 'BEHIND';
  else status = 'SEVERELY_BEHIND';
  return {
    current_year_n: N, n_years_completed: nCompleted,
    cumulative_ideal_pct: (ideal_multiplier - 1) * 100,
    cumulative_actual_pct: (actual_multiplier - 1) * 100,
    required_current_year_pct: required_current_pct,
    shortfall_pp, status,
  };
}

// ===================== P3-SOFT Gate (partial TP lower tier) =====================
// Fires khi: price ∈ [avg×1.25, avg×1.40), F&G ≥ 55, bull_total ≥ 5
export function softTPFires({ price, avg, fg, bullTotal }) {
  if (!avg || avg <= 0) return false;
  const softLow = avg * 1.25;
  const fullTP1 = avg * 1.40;
  return price >= softLow && price < fullTP1 && fg >= TH.FG_NEUTRAL_HIGH && bullTotal >= 5;
}

// ===================== P4c Active Hedge Gate =====================
// Fires khi: bear pBull ∈ [PBULL_CAPITULATION, 0.30), M28 overheated/no_edge,
//            NOT correlation crisis, stress at -30% drop equity ≥ 40%
export function activeHedgeFires({ pBull, m28Grade, m25Regime, stress30Equity }) {
  const inBearWindow = pBull < 0.30 && pBull >= TH.PBULL_CAPITULATION;
  const fundingBad = m28Grade === 'OVERHEATED_LONGS' || m28Grade === 'NO_EDGE';
  const notCorrCrisis = m25Regime !== 'CORRELATION_CRISIS';
  const stressSafe = stress30Equity == null || stress30Equity >= 40;
  return inBearWindow && fundingBad && notCorrCrisis && stressSafe;
}
