// tests/engine.test.mjs — Smoke + invariant tests cho cascade logic
// Run: `npm test`
// Node native test runner (no deps). Assertions via node:assert.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  TH, m1, m7_loan, kellyClamp, KELLY_MAX_NAV_PCT,
  m34VolState, m35Survival, computeConfidenceTier,
  adjustTpMultForVol, shouldDeferOnBigCandle, entropyRegime,
  m36CumulativeTarget, softTPFires, activeHedgeFires,
  m41Tier, m37CyclePhase, m40DepositMultiplier, m42StableTarget,
} from '../engine-pure.mjs';

// ===================== M1 PORTFOLIO =====================
describe('M1 portfolio summary', () => {
  test('NET = GROSS − LOAN strict (invariant G1)', () => {
    const h = {
      BTC: { qty: 0.1, price: 80000, avg: 60000 },
      USDC: { qty: 1000, price: 1, avg: 1 },
    };
    const M = m1(h, 2000);
    assert.equal(M.gross, 8000 + 1000);
    assert.equal(M.net, M.gross - M.loan);
    assert.equal(M.net, 7000);
  });

  test('PnL = market − cost (CRITICAL #4: not capital flows)', () => {
    const h = {
      BTC: { qty: 0.1, price: 80000, avg: 60000 }, // cost = 6000, market = 8000
    };
    const M = m1(h, 0);
    assert.equal(M.cost, 6000);
    assert.equal(M.gross, 8000);
    assert.equal(M.pnl_unreal, 2000);
    assert.equal(M.pnl_pct, (2000 / 6000) * 100);
  });

  test('PnL fallback to price when avg missing', () => {
    const h = { BTC: { qty: 0.1, price: 80000 } }; // no avg
    const M = m1(h, 0);
    // cost uses price as fallback → no PnL
    assert.equal(M.cost, 8000);
    assert.equal(M.pnl_unreal, 0);
  });

  test('equity_ratio guards divide-by-zero', () => {
    const M = m1({}, 0);
    assert.equal(M.equity_ratio, 0); // gross=0 → 0
  });
});

// ===================== M7 LOAN FRAMEWORK =====================
describe('M7 loan framework', () => {
  test('soft cap = gross × (1−LTV_TARGET=0.60) × MMR=0.90 = gross × 0.36', () => {
    const r = m7_loan(10000, 3000, 80000);
    assert.equal(r.soft, 3600); // 10000 × 0.40 × 0.90
    assert.equal(r.accept, 4050); // 10000 × 0.45 × 0.90
    assert.equal(r.hard, 4500); // 10000 × 0.50 × 0.90
  });

  test('over_hard > 0 → liquidation cascade fires (M23 P1)', () => {
    const r = m7_loan(10000, 4800, 80000); // loan > hard 4500
    assert.ok(r.over_hard > 0);
    assert.equal(r.over_hard, 300);
  });

  test('repay_to_soft = max(0, loan − soft)', () => {
    const r = m7_loan(10000, 4000, 80000); // loan 4000 > soft 3600
    assert.equal(r.repay_to_soft, 400);
  });

  test('liq_dist correct (gross−loan)/gross × 100', () => {
    const r = m7_loan(10000, 3000, 80000);
    assert.equal(r.liq_dist, 70); // 7000/10000 × 100
  });
});

// ===================== KELLY NAV CLAMP =====================
describe('Kelly NAV clamp 6%', () => {
  test('Kelly under cap → no clamp', () => {
    const r = kellyClamp(0.16); // quarter = 4%
    assert.equal(r.clamped_quarter, 4);
    assert.equal(r.clamp_active, false);
  });

  test('Kelly over cap → clamp to KELLY_MAX_NAV_PCT (6%)', () => {
    const r = kellyClamp(0.40); // quarter raw = 10% > 6 cap
    assert.equal(r.raw_quarter, 10);
    assert.equal(r.clamped_quarter, 6);
    assert.equal(r.clamp_active, true);
  });

  test('Half Kelly capped at 2× NAV cap = 12%', () => {
    const r = kellyClamp(0.80); // half raw = 40% → cap 12
    assert.equal(r.half_kelly, 12);
  });

  test('Zero Kelly → zero output', () => {
    const r = kellyClamp(0);
    assert.equal(r.clamped_quarter, 0);
    assert.equal(r.clamp_active, false);
  });
});

// ===================== M34 VOL STATE MACHINE =====================
describe('M34 Volatility State Machine', () => {
  test('Low vol → QUIET (size_multiplier 1.2×)', () => {
    const r = m34VolState({ realizedVol: 20, garchVol: 15, gapIntensity: 0, move24h: 0.5 });
    assert.equal(r.state, 'QUIET');
    assert.equal(r.size_multiplier, 1.2);
  });

  test('Medium vol → NORMAL', () => {
    const r = m34VolState({ realizedVol: 60, garchVol: 55, gapIntensity: 0.1, move24h: 2 });
    assert.equal(r.state, 'NORMAL');
    assert.equal(r.size_multiplier, 1.0);
  });

  test('High vol → EXPANDING (defensive size)', () => {
    const r = m34VolState({ realizedVol: 85, garchVol: 80, gapIntensity: 0.15, move24h: 3 });
    assert.equal(r.state, 'EXPANDING');
    assert.equal(r.size_multiplier, 0.7);
  });

  test('Extreme vol → PANIC (40% size only)', () => {
    const r = m34VolState({ realizedVol: 100, garchVol: 95, gapIntensity: 0.4, move24h: 8 });
    assert.equal(r.state, 'PANIC');
    assert.equal(r.size_multiplier, 0.4);
  });

  test('Missing data uses baseline 50%', () => {
    const r = m34VolState({});
    assert.ok(r.vol_score >= 30 && r.vol_score < 55);
    assert.equal(r.state, 'NORMAL');
  });
});

// ===================== M35 SURVIVAL MODE =====================
describe('M35 Survival Mode (≥3/5 triggers active)', () => {
  test('Healthy market → IDLE', () => {
    const r = m35Survival({ pBull: 0.6, realizedVol: 50, maxDDPct: 10, fundingNow: 0 });
    assert.equal(r.active, false);
    assert.equal(r.severity, 'IDLE');
    assert.equal(r.trigger_count, 0);
  });

  test('1 trigger → WATCH (not active)', () => {
    const r = m35Survival({ pBull: 0.6, maxDDPct: 25 }); // only DD breach
    assert.equal(r.trigger_count, 1);
    assert.equal(r.active, false);
  });

  test('2 triggers → WATCH (not active yet)', () => {
    const r = m35Survival({ pBull: 0.10, maxDDPct: 25 });
    assert.equal(r.trigger_count, 2);
    assert.equal(r.severity, 'WATCH');
    assert.equal(r.active, false);
  });

  test('3 triggers → HIGH (active!)', () => {
    const r = m35Survival({ corrCrisis: true, pBull: 0.10, maxDDPct: 25 });
    assert.equal(r.trigger_count, 3);
    assert.equal(r.active, true);
    assert.equal(r.severity, 'HIGH');
  });

  test('5/5 triggers → EXTREME', () => {
    const r = m35Survival({
      corrCrisis: true, pBull: 0.10, realizedVol: 100, maxDDPct: 25, fundingNow: 0.005,
    });
    assert.equal(r.trigger_count, 5);
    assert.equal(r.severity, 'EXTREME');
  });

  test('Funding inversion threshold 0.001 (not 0.015 dead-bug)', () => {
    const r = m35Survival({ fundingNow: 0.0015 }); // 0.15%/8h
    assert.ok(r.triggers.includes('FUNDING_INVERSION'));
  });

  test('M28 grade NO_EDGE also fires funding inversion', () => {
    const r = m35Survival({ m28Grade: 'NO_EDGE' });
    assert.ok(r.triggers.includes('FUNDING_INVERSION'));
  });
});

// ===================== CONFIDENCE TIER =====================
describe('computeConfidenceTier (shared helper)', () => {
  test('Score 80 → HIGH tier 1.0× size', () => {
    const t = computeConfidenceTier(80);
    assert.equal(t.tier, 'HIGH');
    assert.equal(t.size_adjustment, 1.0);
  });

  test('Score 60 → MID tier 0.7× size', () => {
    const t = computeConfidenceTier(60);
    assert.equal(t.tier, 'MID');
    assert.equal(t.size_adjustment, 0.7);
  });

  test('Score 30 → LOW tier 0.4× size', () => {
    const t = computeConfidenceTier(30);
    assert.equal(t.tier, 'LOW');
    assert.equal(t.size_adjustment, 0.4);
  });

  test('Boundary 75 → HIGH (inclusive)', () => {
    assert.equal(computeConfidenceTier(75).tier, 'HIGH');
  });

  test('Boundary 50 → MID (inclusive)', () => {
    assert.equal(computeConfidenceTier(50).tier, 'MID');
  });
});

// ===================== DYNAMIC TP PER-ASSET =====================
describe('Dynamic TP per-asset (vol-adjusted)', () => {
  test('BTC vs BTC ratio=1 → no adjustment', () => {
    const adj = adjustTpMultForVol(1.40, 55, 55);
    assert.equal(adj, 1.40);
  });

  test('LINK vol 100% vs BTC 55% → mult expanded (TP fires xa hơn)', () => {
    const adj = adjustTpMultForVol(1.40, 100, 55);
    // ratio = 1.82, scale = √1.82 ≈ 1.349 (capped 1.35), adjusted = 1 + 0.40 × 1.35 = 1.54
    assert.ok(adj > 1.40 && adj <= 1.60);
  });

  test('Low-vol asset vs BTC → mult contracts (TP closer)', () => {
    const adj = adjustTpMultForVol(1.40, 30, 65); // ratio < 1
    // ratio = 30/65 = 0.46, √ = 0.68, clamped at floor 0.85
    // adj = 1 + (1.40 − 1) × 0.85 = 1.34 (float repr ≈ 1.33999999)
    assert.ok(adj < 1.40);
    assert.ok(Math.abs(adj - 1.34) < 0.001, `Expected adj ≈ 1.34, got ${adj}`);
  });

  test('Missing vol → falls back to base mult', () => {
    assert.equal(adjustTpMultForVol(1.40, null, 55), 1.40);
    assert.equal(adjustTpMultForVol(1.40, 55, 0), 1.40);
    assert.equal(adjustTpMultForVol(1.40, undefined, undefined), 1.40);
  });
});

// ===================== BIG-CANDLE GUARD =====================
describe('Big-candle defer (only leverage_increase)', () => {
  test('P5 dip-buy + BTC +6% → DEFER', () => {
    assert.equal(shouldDeferOnBigCandle(5, 6), true);
  });

  test('P3 TP + BTC +6% → NO defer (selling on green = good)', () => {
    assert.equal(shouldDeferOnBigCandle(3, 6), false);
  });

  test('P1 liq repay + BTC +6% → NO defer (emergency)', () => {
    assert.equal(shouldDeferOnBigCandle(1, 6), false);
  });

  test('P7 squeeze + BTC −7% → DEFER (volatile entry)', () => {
    assert.equal(shouldDeferOnBigCandle(7, 7), true);
  });

  test('P5 + small candle 2% → no defer', () => {
    assert.equal(shouldDeferOnBigCandle(5, 2), false);
  });

  test('P8.5 USDC yield + big candle → no defer (no price expo)', () => {
    assert.equal(shouldDeferOnBigCandle(8.5, 6), false);
  });
});

// ===================== ENTROPY REGIME =====================
describe('Decision Entropy regime classification', () => {
  test('Top 95% → CONVERGED (no bias)', () => {
    assert.equal(entropyRegime(95).regime, 'CONVERGED');
    assert.equal(entropyRegime(95).bias_hold, false);
  });

  test('Top 80% → ROBUST', () => {
    assert.equal(entropyRegime(80).regime, 'ROBUST');
    assert.equal(entropyRegime(80).bias_hold, false);
  });

  test('Top 60% → MIXED (bias HOLD)', () => {
    assert.equal(entropyRegime(60).regime, 'MIXED');
    assert.equal(entropyRegime(60).bias_hold, true);
  });

  test('Top 40% → DIVERGENT (force HOLD)', () => {
    assert.equal(entropyRegime(40).regime, 'DIVERGENT');
    assert.equal(entropyRegime(40).bias_hold, true);
  });
});

// ===================== M36 CUMULATIVE TARGET =====================
describe('M36 Cumulative Target Tracker', () => {
  test('Year 1 (no history) → required = annual target', () => {
    const r = m36CumulativeTarget({ annualTargetPct: 35, yearHistory: [], currentPnLPct: 0 });
    assert.equal(r.current_year_n, 1);
    assert.equal(r.n_years_completed, 0);
    // Ideal (1.35)^1 = 1.35 → 35%
    assert.ok(Math.abs(r.cumulative_ideal_pct - 35) < 0.001);
    assert.ok(Math.abs(r.required_current_year_pct - 35) < 0.001);
  });

  test('Year 2 after Year 1 at +50% → required current lower (catch-up)', () => {
    const r = m36CumulativeTarget({
      annualTargetPct: 35,
      yearHistory: [{ year: 2025, actual_pnl_pct: 50 }],
      currentPnLPct: 0,
    });
    // Ideal Year-2 cum = 1.35² = 1.8225 → 82.25%
    // Prior actual = 1.50 → required current = 1.8225/1.50 - 1 = 0.215 = 21.5%
    assert.ok(Math.abs(r.cumulative_ideal_pct - 82.25) < 0.01);
    assert.ok(Math.abs(r.required_current_year_pct - 21.5) < 0.5);
  });

  test('Year 2 after Year 1 at -20% → required current much higher (recovery)', () => {
    const r = m36CumulativeTarget({
      annualTargetPct: 35,
      yearHistory: [{ year: 2025, actual_pnl_pct: -20 }],
      currentPnLPct: 0,
    });
    // Required = 1.8225 / 0.80 - 1 = 1.278 - 1 = 0.278 = 127.8%
    assert.ok(r.required_current_year_pct > 100);
  });

  test('AHEAD status when PnL >> required', () => {
    const r = m36CumulativeTarget({
      annualTargetPct: 35, yearHistory: [], currentPnLPct: 45,
    });
    assert.equal(r.status, 'AHEAD');
  });

  test('SEVERELY_BEHIND when PnL << required', () => {
    const r = m36CumulativeTarget({
      annualTargetPct: 35, yearHistory: [], currentPnLPct: 5,
    });
    assert.equal(r.status, 'SEVERELY_BEHIND');
  });

  test('Cumulative actual compounds correctly across multiple years', () => {
    const r = m36CumulativeTarget({
      annualTargetPct: 35,
      yearHistory: [
        { actual_pnl_pct: 40 },
        { actual_pnl_pct: -10 },
      ],
      currentPnLPct: 20,
    });
    // (1.40 × 0.90 × 1.20) − 1 = 1.512 − 1 = 51.2%
    assert.ok(Math.abs(r.cumulative_actual_pct - 51.2) < 0.5);
  });
});

// ===================== P3-SOFT GATE =====================
describe('P3-SOFT partial TP gate', () => {
  test('Fires when price ∈ [avg×1.25, avg×1.40) + F&G ≥ 55 + bull ≥ 5', () => {
    const fires = softTPFires({ price: 130, avg: 100, fg: 60, bullTotal: 6 });
    assert.equal(fires, true);
  });

  test('Does NOT fire if price ≥ avg×1.40 (full TP1 takes over)', () => {
    const fires = softTPFires({ price: 145, avg: 100, fg: 60, bullTotal: 6 });
    assert.equal(fires, false);
  });

  test('Does NOT fire if price < avg×1.25 (gain too small)', () => {
    const fires = softTPFires({ price: 120, avg: 100, fg: 60, bullTotal: 6 });
    assert.equal(fires, false);
  });

  test('Does NOT fire if F&G < 55', () => {
    const fires = softTPFires({ price: 130, avg: 100, fg: 50, bullTotal: 6 });
    assert.equal(fires, false);
  });

  test('Does NOT fire if bull_total < 5', () => {
    const fires = softTPFires({ price: 130, avg: 100, fg: 60, bullTotal: 3 });
    assert.equal(fires, false);
  });

  test('Returns false if avg missing/zero', () => {
    assert.equal(softTPFires({ price: 100, avg: 0, fg: 60, bullTotal: 6 }), false);
    assert.equal(softTPFires({ price: 100, fg: 60, bullTotal: 6 }), false);
  });
});

// ===================== P4c ACTIVE HEDGE GATE =====================
describe('P4c Active Hedge gate (short BTC perp in bear)', () => {
  test('Fires khi pBull ∈ [0.15, 0.30) + M28 OVERHEATED + no crisis + stress safe', () => {
    const fires = activeHedgeFires({
      pBull: 0.22, m28Grade: 'OVERHEATED_LONGS',
      m25Regime: 'NORMAL', stress30Equity: 45,
    });
    assert.equal(fires, true);
  });

  test('NO_EDGE grade also fires', () => {
    const fires = activeHedgeFires({
      pBull: 0.20, m28Grade: 'NO_EDGE',
      m25Regime: 'HIGH_CORRELATION', stress30Equity: 50,
    });
    assert.equal(fires, true);
  });

  test('Does NOT fire if pBull < PBULL_CAPITULATION (P4a takes over)', () => {
    const fires = activeHedgeFires({
      pBull: 0.10, m28Grade: 'OVERHEATED_LONGS',
      m25Regime: 'NORMAL', stress30Equity: 50,
    });
    assert.equal(fires, false);
  });

  test('Does NOT fire if pBull ≥ 0.30 (bullish enough, no hedge needed)', () => {
    const fires = activeHedgeFires({
      pBull: 0.35, m28Grade: 'OVERHEATED_LONGS',
      m25Regime: 'NORMAL', stress30Equity: 50,
    });
    assert.equal(fires, false);
  });

  test('Does NOT fire if M25 CORRELATION_CRISIS (no hedge edge)', () => {
    const fires = activeHedgeFires({
      pBull: 0.22, m28Grade: 'OVERHEATED_LONGS',
      m25Regime: 'CORRELATION_CRISIS', stress30Equity: 50,
    });
    assert.equal(fires, false);
  });

  test('Does NOT fire if stress at -30% drop pushes equity below 40%', () => {
    const fires = activeHedgeFires({
      pBull: 0.22, m28Grade: 'OVERHEATED_LONGS',
      m25Regime: 'NORMAL', stress30Equity: 35,
    });
    assert.equal(fires, false);
  });

  test('Does NOT fire if M28 grade healthy (no funding edge)', () => {
    const fires = activeHedgeFires({
      pBull: 0.22, m28Grade: 'NEUTRAL',
      m25Regime: 'NORMAL', stress30Equity: 50,
    });
    assert.equal(fires, false);
  });
});

// ===================== M41 DRAWDOWN BREAKER TIERS =====================
describe('M41 Drawdown Circuit Breaker tier classification', () => {
  test('DD 5% → NORMAL (not active)', () => {
    const t = m41Tier(5);
    assert.equal(t.tier, 'NORMAL');
    assert.equal(t.is_active, false);
  });

  test('DD 12% → WARN (active, block leverage)', () => {
    const t = m41Tier(12);
    assert.equal(t.tier, 'WARN');
    assert.equal(t.is_active, true);
  });

  test('DD 18% → HEDGE_FORCE (force P4c)', () => {
    assert.equal(m41Tier(18).tier, 'HEDGE_FORCE');
  });

  test('DD 28% → SCALE_OUT_20', () => {
    assert.equal(m41Tier(28).tier, 'SCALE_OUT_20');
  });

  test('DD 40% → SCALE_OUT_40', () => {
    assert.equal(m41Tier(40).tier, 'SCALE_OUT_40');
  });

  test('DD 55% → EMERGENCY_LOCK', () => {
    const t = m41Tier(55);
    assert.equal(t.tier, 'EMERGENCY_LOCK');
    assert.equal(t.severity, 'EXTREME');
  });

  test('Boundary 10% → WARN (inclusive)', () => {
    assert.equal(m41Tier(10).tier, 'WARN');
  });
});

// ===================== M37 CYCLE PHASE =====================
describe('M37 Cycle Phase classifier', () => {
  test('Extreme fear + crashing → CAPITULATION', () => {
    const r = m37CyclePhase({ pBull: 0.10, fg: 12, ret30: -15, ret90: -25 });
    assert.equal(r.phase, 'CAPITULATION');
    assert.equal(r.target_crypto_pct, 90);
  });

  test('Bear with funding overheated → BEAR + hedge', () => {
    const r = m37CyclePhase({ pBull: 0.25, mvrv: 1.5, m28Grade: 'OVERHEATED_LONGS', ret30: -3, ret90: -10, fg: 30 });
    assert.equal(r.phase, 'BEAR');
    assert.equal(r.target_crypto_pct, 80);
    assert.equal(r.hedge_pct_nav, 1.5);
  });

  test('Distribution top (MVRV > 2.5 + greed) → DISTRIBUTION', () => {
    const r = m37CyclePhase({ pBull: 0.50, mvrv: 2.8, fg: 80, ret30: 5, ret90: 30 });
    assert.equal(r.phase, 'DISTRIBUTION');
    assert.equal(r.target_crypto_pct, 60);
  });

  test('Late bull (MVRV > 2 + funding positive) → LATE_BULL', () => {
    const r = m37CyclePhase({ pBull: 0.65, mvrv: 2.3, fundingNow: 0.0005, fg: 72, ret30: 10, ret90: 40 });
    assert.equal(r.phase, 'LATE_BULL');
    assert.equal(r.target_crypto_pct, 80);
  });

  test('Early bull (low MVRV + negative funding) → EARLY_BULL 120%', () => {
    const r = m37CyclePhase({ pBull: 0.60, mvrv: 0.9, fundingNow: -0.0002, fg: 50, ret30: 5, ret90: 15 });
    assert.equal(r.phase, 'EARLY_BULL');
    assert.equal(r.target_crypto_pct, 120);
  });

  test('Mid bull default (no extremes) → MID_BULL 100%', () => {
    const r = m37CyclePhase({ pBull: 0.60, mvrv: 1.5, fundingNow: 0, fg: 60, ret30: 5, ret90: 15 });
    assert.equal(r.phase, 'MID_BULL');
    assert.equal(r.target_crypto_pct, 100);
  });
});

// ===================== M40 DEPOSIT TIMING =====================
describe('M40 Tactical Capital Deployment', () => {
  test('Extreme fear + crash → 3× multiplier', () => {
    const m = m40DepositMultiplier({ fg: 12, ret30: -15, phase: 'CAPITULATION' });
    assert.equal(m, 3.0);
  });

  test('Bear phase → 2×', () => {
    const m = m40DepositMultiplier({ fg: 35, ret30: -5, phase: 'BEAR' });
    assert.equal(m, 2.0);
  });

  test('F&G neutral → 1× baseline', () => {
    const m = m40DepositMultiplier({ fg: 50, ret30: 0, phase: 'MID_BULL' });
    assert.equal(m, 1.0);
  });

  test('F&G greed → 0.5× (save cash)', () => {
    const m = m40DepositMultiplier({ fg: 70, ret30: 8, phase: 'LATE_BULL' });
    assert.equal(m, 0.5);
  });

  test('F&G euphoria → 0× (skip deposit)', () => {
    const m = m40DepositMultiplier({ fg: 85, ret30: 12, phase: 'DISTRIBUTION' });
    assert.equal(m, 0.0);
  });
});

// ===================== M42 STABLE FLOOR =====================
describe('M42 Stablecoin Floor Target', () => {
  test('Q1 + MID_BULL → 10% base', () => {
    assert.equal(m42StableTarget({ yearProgress: 0.10, phase: 'MID_BULL' }), 10);
  });

  test('Q4 + MID_BULL → 30%', () => {
    assert.equal(m42StableTarget({ yearProgress: 0.85, phase: 'MID_BULL' }), 30);
  });

  test('Q2 + LATE_BULL → 15 + 10 = 25%', () => {
    assert.equal(m42StableTarget({ yearProgress: 0.40, phase: 'LATE_BULL' }), 25);
  });

  test('Q3 + CAPITULATION → 20 - 10 = 10%', () => {
    assert.equal(m42StableTarget({ yearProgress: 0.60, phase: 'CAPITULATION' }), 10);
  });

  test('Floor clamp: never below 5%', () => {
    const t = m42StableTarget({ yearProgress: 0.10, phase: 'CAPITULATION' });
    assert.ok(t >= 5);
  });

  test('Ceiling clamp: never above 50%', () => {
    const t = m42StableTarget({ yearProgress: 0.99, phase: 'DISTRIBUTION' });
    assert.ok(t <= 50);
  });
});

// ===================== TH CONSTANTS SANITY =====================
describe('TH constants (single source of truth)', () => {
  test('Squeeze leverage = 3× (critical rule #13)', () => {
    assert.equal(TH.SQUEEZE_LEVERAGE, 3);
  });

  test('Loan LTV target = 0.60 (soft cap basis)', () => {
    assert.equal(TH.LOAN_LTV_TARGET, 0.60);
  });

  test('F&G ordering: extreme_fear < capitulation < fear < neutral < greed', () => {
    assert.ok(TH.FG_EXTREME_FEAR < TH.FG_CAPITULATION);
    assert.ok(TH.FG_CAPITULATION < TH.FG_FEAR);
    assert.ok(TH.FG_FEAR < TH.FG_NEUTRAL_LOW);
    assert.ok(TH.FG_NEUTRAL_LOW < TH.FG_GREED);
  });

  test('pBull ordering: capitulation < cautious_bear < dip_buy_min < squeeze_min < bull_tilt', () => {
    assert.ok(TH.PBULL_CAPITULATION < TH.PBULL_CAUTIOUS_BEAR);
    assert.ok(TH.PBULL_CAUTIOUS_BEAR < TH.PBULL_DIP_BUY_MIN);
    assert.ok(TH.PBULL_DIP_BUY_MIN < TH.PBULL_SQUEEZE_MIN);
    assert.ok(TH.PBULL_SQUEEZE_MIN < TH.PBULL_BULL_TILT);
  });
});
