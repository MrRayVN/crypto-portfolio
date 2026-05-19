// tests/engine.test.mjs — Smoke + invariant tests cho cascade logic
// Run: `npm test`
// Node native test runner (no deps). Assertions via node:assert.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  TH, m1, m7_loan, kellyClamp, KELLY_MAX_NAV_PCT,
  m34VolState, m35Survival, computeConfidenceTier,
  adjustTpMultForVol, shouldDeferOnBigCandle, entropyRegime,
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
