# ENGINE_SUMMARY.md — Crypto Portfolio Engine v76

**Mục đích file này**: cung cấp tóm tắt **đầy đủ và chính xác** kiến trúc + logic engine cho LLM/auditor ngoài. Đọc file này TRƯỚC khi review code, vì `index.html` ~500KB sẽ bị truncate trong context của hầu hết LLM, dẫn đến halucinate.

**Live**: https://mrrayvn.github.io/crypto-portfolio/ · **Repo**: mrrayvn/crypto-portfolio · **Engine**: v47 + Quantum v74 + Strategic v75 + Decision Pipeline v76

---

## 0. CONTEXT QUAN TRỌNG TRƯỚC KHI AUDIT

### Project KHÔNG phải là gì
- **KHÔNG** phải auto-trading bot. Không thực thi lệnh. Không TWAP/slippage logic cần thiết.
- **KHÔNG** xử lý trade history. Không tính WAC từ trades. Không cần subtract fee.
- **KHÔNG** dùng XIRR/IRR trên cashflow. PnL = market − cost, NOT cashflow accounting.

### Project LÀ gì
- Dashboard **read-only** đọc Binance public + private API (via Cloudflare Worker proxy).
- Compute 35 modules quantitative (M1-M35) → 1 unified action recommendation duy nhất.
- User execute hành động **THỦ CÔNG** trên Binance UI sau khi đọc dashboard.
- Avg cost của holdings = user nhập tay từ Binance UI (Binance API không expose avg).

### Mục tiêu
- ≥35% PnL/năm tính trên **cost basis** của crypto holdings (KHÔNG phải IRR vốn nạp).
- Vehicles: 4 levers (DCA / Squeeze / Stop-loss / Loan) + Pool DCA $10/day Binance Auto-Invest.

---

## 1. KIẾN TRÚC

```
Browser (GitHub Pages) ──┬─► Public Binance (CORS open): /api/v3/*, /klines
                         │
                         ├─► Cloudflare Worker /binance/* ──► api.binance.com (HMAC signed)
                         ├─► Cloudflare Worker /coinalyze/* ──► api.coinalyze.net (api_key)
                         └─► Cloudflare Worker /bg/* ──► api.bgeometrics.com
```

**File structure** (repo: `crypto-portfolio`):
- `index.html` (~500KB) — Single-page dashboard, all UI + logic
- `engine-pure.mjs` (~300 lines) — Pure deterministic functions extracted for testing
- `worker.js` — Cloudflare Worker (deploy thủ công paste vào CF dashboard)
- `capital_flows.json` — Parsed từ Binance C2C + Fiat xlsx (info only, NOT in PnL)
- `parse_capital_flows.py` — xlsx → JSON parser
- `tests/engine.test.mjs` — Node native test runner assertions

---

## 2. 35 MODULES (M1-M35) + 4 WRAPPERS

### Engine v47 core
| # | Module | Purpose |
|---|---|---|
| M1 | Portfolio summary | gross, NET, cost, equity ratio, **pnl = gross − cost** (NOT cashflow) |
| M2 | BEP gap | (avg − price) / price · 100 per asset |
| M3 | **Dynamic TP triggers** | 4 tier × 3-cond gate, vol-adjusted per-asset multiplier |
| M5 | Plan health | w ∝ max(1, BEP_gap + 8) ideal alloc |
| M7 | Loan framework v1.6 | Dynamic soft/accept/hard caps, BTC liquidation price |
| M8 | Stress test | NET impact at -10/20/30/40/50% drops |
| M9 | Signal aggregator | bull/bear pts, stance ribbon |
| M12b | Plan-change diff | prev vs current Pool alloc + loan + F&G |
| M14 | Validation | 14-15 checks, must PASS |
| M16 | Funding analyzer | $3650/yr min, 35% target, scenarios |

### Quantum v74 (M17-M22)
| # | Module | Purpose |
|---|---|---|
| **M17** | **Portfolio risk metrics** | **Sharpe/Sortino/Calmar/Omega + VaR/CVaR + MaxDD + GARCH** ← LLM thường claim "thiếu" — không thiếu |
| M18 | Per-asset risk | Vol + Hurst + OU mean-reversion z-score |
| **M19** | **Correlation matrix** | Pearson ρ between BTC/WBETH/BNB/LINK ← LLM thường claim "thiếu correlation adjustment" |
| M20 | Markowitz | Tangency + Min-Variance + Risk-Parity weights |
| **M21** | **Bayesian Kelly + NAV clamp 6%** | Beta(2,2) prior + shrinkage + vol-adjusted + **HARD NAV CAP 6%** ← LLM thường đề xuất "Quarter-Kelly", clamp này còn nghiêm hơn |
| M22 | Bayesian regime | F&G + 200WMA + momentum + on-chain + sentiment + macro blend |

### Strategic v75 (M23-M33)
| # | Module | Purpose |
|---|---|---|
| **M23** | **Unified Decision Synthesizer** | Cascade priority P0→P9 → **1 hành động duy nhất** |
| M24 | PnL attribution | 7 sources: market β · trading · funding · **earn rewards** · loan interest · slippage · fees |
| **M25** | **Correlation regime** | Crisis detection (avg ρ ≥ 0.85 = USDC shift) |
| M26 | Decision log | localStorage append-only feedback loop |
| M27 | On-chain signals | MVRV + MVRV-Z + SOPR + NUPL + AVIV + Puell + Reserve Risk |
| M28 | Funding rate forecast | AR(1) + smoothing + squeeze score |
| M29 | Backtest M23 cascade | Rolling 365d windows on BTC klines + **sensitivity test ±20% TH** |
| M30 | Macro overlay | Global M2 liquidity multiplier |
| M31 | Top trader sentiment | L/S ratio contrarian signal |
| M32 | DCA Capacity | USDT runway + deposit schedule awareness |
| M33 | **Path-to-Target + Bootstrap MC** | 4 scenarios re-ranked by 1000-sim bootstrap qua historical BTC returns |

### Decision Pipeline v76 (M34-M35 + wrappers)
| # | Module | Purpose |
|---|---|---|
| **M34** | **Volatility State Machine** | Composite vol 0-100 → {QUIET/NORMAL/EXPANDING/PANIC/EUPHORIA} → size multiplier 0.4-1.2× |
| **M35** | **Survival Mode (P0 cross-cut)** | Composite ≥3/5 catastrophic triggers → freeze leverage, force defensive |
| **M41** | **Drawdown Breaker** | 6-tier portfolio DD response: NORMAL/WARN/HEDGE_FORCE/SCALE_OUT_20/SCALE_OUT_40/EMERGENCY_LOCK |
| `attachDecisionConfidence` | Wrapper sau M23 | 6 factors → tier HIGH/MID/LOW + size adjustment 1.0/0.7/0.4 |
| `attachDecisionEntropy` | Wrapper | 50-sim input perturbation → CONVERGED/ROBUST/MIXED/DIVERGENT |
| `attachExecutionChecklist` | Wrapper | 8 pre-trade guards: ATR, big-candle, funding, cooldown, spread, slippage, size |

---

## 3. DECISION PIPELINE (mỗi tick)

```
buildMaster(state)
  ↓ compute M1-M22, M27-M32, M34, M35 (M35 BEFORE M23)
m23_unified_decision(M, s)        ← cascade P0→P9, return 1 action
  ↓
attachDecisionConfidence(decision, M)
  ↓ 6 factors → tier HIGH(≥75)/MID(50-74)/LOW(<50) + size 1.0/0.7/0.4
attachDecisionEntropy(decision, M, s)
  ↓ 50 sims perturbing fg±3, btcP±1%, ret_30d±2pp, pBull±0.05
  ↓ MIXED/DIVERGENT → confidence −15 → recompute tier → size cap 0.3
attachExecutionChecklist(decision, M)
  ↓ Big-candle guard (only defer leverage_increase P3.5/P5/P7, NOT P3 TP)
M.m23 final → display + m26_log_decision(M.m23)
```

### M23 Cascade Priority Order
```
P0   SURVIVAL MODE (M35 ≥3/5)        — Freeze leverage, USDC shift, DCA min
P1   Liquidation risk (M7 over hard)  — REPAY loan
P2   Stop-loss (BTC<65k + F&G≤15)     — SELL spot 30%
P3   TP fired (3/3 cond, dynamic)     — TAKE PROFIT
P3.5 PATH-TO-TARGET (behind schedule) — Execute best M33 scenario (bootstrap)
P4a  Capitulation (P(bull)<15% + F&G≤20 + mom<-10%) — Pause DCA
P4b  Cautious bear (P(bull)<35%)      — Keep DCA, no leverage
P5   Dip buy (BTC<SMA20×0.92 + stress-20%) — DCA heavy
P6   Pool rebalance (drift > 15pp)    — Adjust Auto-Invest
P7   Funding squeeze (M28 ≥60 + Kelly clamped 6%) — Long perp
P8   Bull + underwater (pBull > 0.55) — Tilt Pool toward underwater
P8.5 USDC yield (idle > $200)         — Enable Earn 5.5% APR
P9   Default                          — Maintain DCA
```

---

## 4. KEY FORMULAS (chính xác từ code)

### M1: True PnL
```
PnL = Σ qty × (price − avg)
PnL % = PnL / cost × 100  (cost > 0 ? else 0)
target_market_value = anchor × (1 + target_pct/100)
```
**KHÔNG dùng**: `NET − (anchor + deposits)`, không coi withdrawals là realized.

### Required CAGR (compound, time-aware)
```
compoundFactor = target_market_value / current_market_value
reqDaily   = (compoundFactor^(1/daysRemaining) − 1) × 100
reqWeekly  = (compoundFactor^(7/daysRemaining) − 1) × 100
reqMonthly = (compoundFactor^(30/daysRemaining) − 1) × 100
```
→ Đã handle time-value of money. **KHÔNG cần XIRR** (vì target là trên cost basis của holdings, không phải IRR trên cashflow nạp/rút).

### M7: Loan safe caps
```
soft   = gross × (1 − LOAN_LTV_TARGET=0.60) × EFFECTIVE_MMR=0.90
accept = gross × (1 − LTV_ACCEPTABLE=0.55) × 0.90
hard   = gross × (1 − LTV_HARD_FLOOR=0.50) × 0.90
btc_liq = btcP × (loan / (gross × 0.90))
maxSafeLoanTotal = min(accept × 0.95, cost × 0.5, net × 0.4)
```

### M21: Kelly NAV clamp
```
raw_quarter     = adjusted_kelly × 25  (Quarter-Kelly base)
clamped_quarter = min(raw_quarter, KELLY_MAX_NAV_PCT=6.0)
half_kelly      = min(adjusted × 50, 12)
```
→ Đã là **Fractional Kelly Quarter + NAV hard cap 6%**, nghiêm ngặt hơn industry "max 25% NAV".

### M3: Dynamic TP per-asset
```
adjusted_mult = 1 + (base_mult − 1) × volScale
volScale = clamp((assetVol/btcVol)^0.5, 0.85, 1.35)
Example LINK (vol 100%) vs BTC (55%): TP1 LINK = 1.54 vs BTC TP1 = 1.40
```

### M33: Bootstrap MC re-ranking
```
For each scenario A/B/C/D:
  1000 sims × daysRemaining days
  Each day: sample BTC daily return × portBeta, compound value
  Add dailyDCA + leverageNetPerDay (drift − interest)
  Track maxDD path-dependent + squeeze EV via Bernoulli (55% win)
Best scenario = highest p_hit_bootstrap (re-ranked from parametric erf)
```

### M34: Volatility State Machine
```
volScore = 0.45 × realizedVol_pct + 0.25 × garchVol_pct + 0.20 × gapIntensity×100 + 0.10 × move24h×4
States + size multiplier:
  QUIET    (<30):  1.2× — range-bound, breakouts stronger
  NORMAL   (<55):  1.0× — baseline cascade
  EXPANDING(<75):  0.7× — regime shifting, tighten stops
  PANIC    (<90):  0.4× — drawdown cascade risk
  EUPHORIA (≥90):  0.5× — top setup likely, prepare TP
```

### M35: Survival Triggers (≥3/5 active)
```
T1 M25 corr crisis        (avg ρ ≥ 0.85)
T2 M22 regime collapse    (pBull < 20%)
T3 Volatility panic       (BTC realized vol > 90%/yr)
T4 Drawdown breach        (portfolio DD > 20%)
T5 Funding inversion      (funding > 0.05 OR M28 OVERHEATED_LONGS/NO_EDGE)
Severity: EXTREME(≥4) · HIGH(3) · WATCH(2) · IDLE(0-1)
EXCEPTION: M7.over_hard > 0 bypass Survival → fall through P1 (must repay)
```

### M41: Drawdown Breaker tiers
```
DD < 10%       → NORMAL,        IDLE,     no action
10% ≤ DD < 15% → WARN,          LOW,      monitor
15% ≤ DD < 25% → HEDGE_FORCE,   MEDIUM,   force hedge
25% ≤ DD < 35% → SCALE_OUT_20,  HIGH,     scale down 20%
35% ≤ DD < 50% → SCALE_OUT_40,  CRITICAL, scale down 40%
DD ≥ 50%       → EMERGENCY_LOCK,EXTREME,  freeze all
```

---

## 5. TH CONSTANTS (single source of truth)

```
F&G:       EXTREME_FEAR=15, CAPITULATION=20, FEAR=30, DIP_BUY_T2=35,
           NEUTRAL_LOW=40, NEUTRAL_HIGH=55, GREED=65, EXTREME_GREED=80
P(bull):   CAPITULATION=0.15, CAUTIOUS_BEAR=0.35, DIP_BUY_MIN=0.40,
           SQUEEZE_MIN=0.45, BULL_TILT=0.55
Momentum:  CAPITULATION=-10
Dip-buy:   SMA_PCT=0.92, SMA_PCT_T1=0.97, LTV_MAX=0.65
Pool:      DRIFT_FIRE=15, DRIFT_WARN=8
Squeeze:   LEVERAGE=3, SCORE_FIRE=60, FUNDING_NEG=-0.005, NET_PCT=0.05
Loan:      LTV_TARGET=0.60, LTV_ACCEPTABLE=0.55, LTV_HARD_FLOOR=0.50, EFFECTIVE_MMR=0.90
Corr:      CRISIS=0.85, HIGH=0.70, NORMAL=0.50
Kelly:     MAX_NAV_PCT=6.0
Other:     USDC_IDLE_MIN_FOR_EARN=200, BTC_STOPLOSS_DEFAULT=65000
```

---

## 6. INVARIANTS (KHÔNG ĐƯỢC PHÁ)

1. **NET = GROSS − LOAN** strict
2. **F&G CoinGlass primary** (fallback CoinGecko)
3. **Avg cost từ Binance UI = source of truth** (API không expose). User nhập tay localStorage `manualAvg`.
4. **PnL = market − cost, NOT capital flows accounting**. Capital flows xlsx = INFO ONLY.
5. **Single unified action** từ M23 cascade — không bao giờ multiple conflicting actions
6. **DCA không pause** trừ extreme capitulation (P4a 3/3 conditions)
7. **Loan có purpose cụ thể** — không vay vô tội vạ
8. **Read-only Binance API** — không trade execution
9. **safeRender wrapping** — 1 module error không kill dashboard
10. **TH constants** = single source of truth
11. **Tactical + Quantum sections = INFO ONLY** — actions chỉ từ M23
12. **M35 Survival = P0** — fires BEFORE P1 trừ over_hard exception
13. **Kelly NAV clamp 6%** — quarter_kelly_pct CANNOT exceed 6% NAV
14. **Pipeline order**: m23 → confidence → entropy(bias) → checklist
15. **Bootstrap MC ranks ALL scenarios** — best CANNOT chọn parametric rồi replace
16. **Dynamic TP per-asset** — m3_tp() MUST receive assetVols từ M18
17. **Big-candle guard scope** — chỉ defer leverage_increase [3.5, 5, 7]

---

## 7. NHỮNG LỖI LLM EXTERNAL THƯỜNG MẮC KHI AUDIT

LLM khi chỉ thấy partial code (CSS hoặc đầu file) thường **fabricate** ra critique. Các pattern halucinate đã gặp:

### ❌ Halucinate #1: "Engine bỏ qua fee BNB → PnL ảo"
**Sự thật**: Engine không hề tự tính PnL từ trades. Avg cost lấy từ Binance UI (đã nett fee). User nhập tay.

### ❌ Halucinate #2: "Chia zero netInvested → Infinity"
**Sự thật**: M1 formula là `pnl_pct = pnl/cost ×100`, đã guard `cost > 0 ? : 0`. Không liên quan netInvested.

### ❌ Halucinate #3: "Bỏ qua Earn/Staking yield"
**Sự thật**: M24 PnL Attribution có `earn_annualized` field, render trong tab Vị Thế. Đã track.

### ❌ Halucinate #4: "Phải dùng XIRR đo time-value 35%/năm"
**Sự thật**: Target là trên **cost basis** không phải IRR cashflow. Đã có `computeRequiredCAGR()` với compound formula. XIRR sẽ phá invariant #4.

### ❌ Halucinate #5: "Thiếu Std deviation / Sharpe / VaR"
**Sự thật**: M17 có đầy đủ Sharpe + Sortino + Calmar + Omega + VaR + CVaR + MaxDD + GARCH.

### ❌ Halucinate #6: "Phải có Risk of Ruin / Circuit Breaker"
**Sự thật**: M35 Survival Mode (P0 cross-cut) + M41 Drawdown Breaker (6 tier) = circuit breaker đầy đủ.

### ❌ Halucinate #7: "Phải dùng Quarter-Kelly / Fractional Kelly"
**Sự thật**: M21 đã là Quarter-Kelly base + HARD NAV CAP 6% (nghiêm hơn industry max 25%).

### ❌ Halucinate #8: "Phải TWAP / chống MEV / Slippage Tolerance"
**Sự thật**: Read-only dashboard. Không execute lệnh. User trade thủ công trên Binance UI. Slippage/MEV không applicable.

### ❌ Halucinate #9: "Thiếu correlation adjustment giữa coin"
**Sự thật**: M19 Correlation Matrix + M25 Correlation Regime (CRISIS detect ρ ≥ 0.85).

### ❌ Halucinate #10: "50K historical trades sẽ block event loop / cần Web Workers / O(n²)"
**Sự thật**: Engine **không xử lý trade history**. avg cost = user input. Klines max ~400 daily candles × 4 coins = ~1.6K data points. Bootstrap MC ~200ms × 4 scenarios là acceptable. Không có code path nào touch >2K records.

### ❌ Halucinate #11: "Phải implement FIFO cost basis với queue/dequeue algorithm"
**Sự thật**: Cost basis = `qty × avg` ở M1. `avg` lấy từ Binance UI (Binance đã FIFO/WAC ở phía họ). User nhập tay vào `localStorage.manualAvg`. Engine **không tính cost basis từ trades**.

### ❌ Halucinate #12: "IEEE 754 Float64 precision loss với token micro-cap (vd MARVIN $0.0000006744)"
**Sự thật**: Portfolio chỉ chứa blue-chip: BTC/WBETH/BNB/LINK/BNSOL/USDC/USDT. Range giá $1-$80K, qty 8dp. Phép tính (qty × price) nằm hoàn toàn trong band Float64 precision (15-17 chữ số có nghĩa). Cherry-pick token không tồn tại trong holdings là pattern halucinate phổ biến.

### ❌ Halucinate #13: "Cần Immutable.js + normalized by-id lookup tables để fix GC pressure"
**Sự thật**: State data ~3KB (7 coins × ~400 klines + metadata). GC pressure không phải vấn đề ở scale này. Immutable.js sẽ thêm 30-50KB bundle để fix non-issue. Over-engineering.

### ❌ Halucinate #14: "Cần liquidity discount model (constant product x·y=k) để chiết khấu paper valuation"
**Sự thật**: Portfolio không chứa low-cap. BTC/ETH/BNB có thanh khoản 9-10 figures USD/24h. Slippage thoát vị thế nằm trong noise của 60s price refresh. Liquidity discount chỉ relevant cho memecoin tracker.

---

## 8. CÁCH AUDIT ĐÚNG

1. **Đọc file này TRƯỚC** rồi mới đọc code.
2. **Đưa cho LLM** `engine-pure.mjs` (~300 dòng, fit context) + file này, KHÔNG đưa full `index.html`.
3. Critique chỉ có giá trị nếu **chỉ vào line cụ thể** trong code thật.
4. Nếu critique nói "thiếu X" — search file này trước. Pattern halucinate ở §7 chiếm 90% các critique sai.

---

## 9. INDUSTRY BENCHMARK (validate 35% target)

Theo Cayman Finance 7th Annual + PwC Crypto Hedge Fund Report 2025:

| Chiến lược | Annual Return 2025 |
|---|---|
| **Quant/HFT** | **48%** |
| **Industry average** | **36%** ← target 35% bám sát |
| DeFi | 28% |
| Long-only | 21% |
| Arbitrage | 16% |
| Market-Neutral | 13% |
| **HFR traditional hedge funds** | 16.6% |

→ Target 35%/năm **không phải ảo tưởng**, nằm trong band hợp lý nếu duy trì kỷ luật Kelly clamp + MaxDD control.
