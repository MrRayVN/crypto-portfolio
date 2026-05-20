# CLAUDE.md (v7 — packed 2026-05-20 · external LLM audit hardening)

Hướng dẫn cho Claude (Cowork + Claude Code) khi tiếp tục project này từ session mới.

---

## ⚡ QUICK START (đọc TRƯỚC khi làm bất cứ gì)

**Live URL**: https://mrrayvn.github.io/crypto-portfolio/
**Engine version**: v47 + Quantum v74 + Strategic v75 + **Decision Pipeline v76** (M34/M35/M36/M37/M40/M41/M42 + confidence/entropy/checklist wrappers)
**Last session**: 2026-05-20 — Audit hardening (industry benchmark line + ENGINE_SUMMARY.md for external LLM audits, defending against 14 halucination patterns)

### File locations

| File | Path | Notes |
|---|---|---|
| `index.html` (production) | `C:\Users\datnl\OneDrive - VIP\Tài liệu\Claude\Projects\Danh mục đầu tư tiền điện tử – Siêu Lastui Nhuậnn\index.html` | Source-of-truth, edit ở đây (~500KB) |
| `index.html` (git mirror) | `C:\Users\datnl\github-repos\crypto-portfolio\index.html` | Synced via .NET copy, deploys to GitHub Pages |
| `engine-pure.mjs` | `C:\Users\datnl\github-repos\crypto-portfolio\engine-pure.mjs` | Pure deterministic functions (~300 LoC), mirror từ index.html cho test |
| `tests/engine.test.mjs` | `C:\Users\datnl\github-repos\crypto-portfolio\tests\engine.test.mjs` | Node native test runner — `npm test` (103 tests) |
| `ENGINE_SUMMARY.md` | `C:\Users\datnl\github-repos\crypto-portfolio\ENGINE_SUMMARY.md` | Cô đọng kiến trúc (~17KB) cho external LLM audit, document 14 halucination patterns |
| `worker.js` | `C:\Users\datnl\github-repos\crypto-portfolio\worker.js` | gitignored, Cloudflare Worker source (deploy thủ công) |
| `capital_flows.json` | `C:\Users\datnl\github-repos\crypto-portfolio\capital_flows.json` | Committed, parsed from xlsx, dashboard fetches |
| `parse_capital_flows.py` | `C:\Users\datnl\github-repos\crypto-portfolio\parse_capital_flows.py` | Unified parser for C2C + Fiat xlsx |
| C2C xlsx | `C:\Users\datnl\github-repos\crypto-portfolio\Binance-Lịch-sử-lệnh-C2C-*.xlsx` | gitignored |
| Fiat xlsx | `C:\Users\datnl\github-repos\crypto-portfolio\Binance-Lịch-sử-mua-tiền-pháp-định-*.xlsx` | gitignored |

### External LLM audit protocol

Khi muốn nhờ ChatGPT/Gemini audit, **CHỈ đưa 2 raw links**, không paste index.html:

```
https://raw.githubusercontent.com/MrRayVN/crypto-portfolio/main/ENGINE_SUMMARY.md
https://raw.githubusercontent.com/MrRayVN/crypto-portfolio/main/engine-pure.mjs
```

Prompt: *"Đọc §0 và §7 ENGINE_SUMMARY.md TRƯỚC khi audit để tránh 14 halucination patterns. Engine là read-only dashboard, không phải auto-trading bot."*

### Deploy workflow (chuẩn)

```powershell
$src="C:\Users\datnl\OneDrive - VIP\Tài liệu\Claude\Projects\Danh mục đầu tư tiền điện tử – Siêu Lastui Nhuậnn\index.html"
$repo="C:\Users\datnl\github-repos\crypto-portfolio"
[System.IO.File]::Copy($src, "$repo\index.html", $true)
cd $repo
git add index.html; git commit -m "..."; git push
# GitHub Pages rebuild ~1 phút
```

### Capital flows update workflow

```powershell
# Khi user có xlsx mới
cd C:\Users\datnl\github-repos\crypto-portfolio
python parse_capital_flows.py  # auto-detects C2C + Fiat files
git add capital_flows.json
git commit -m "Update capital flows"
git push
```

### Worker redeploy

User thủ công paste worker.js lên Cloudflare dashboard → Edit code → Deploy. Em không có wrangler auth.

---

## 🚀 PROJECT STATE

**User**: Mr Ray (Lê Tan Đạt Nguyễn, daicatninhphung@gmail.com, Binance UID 39681984)
**Strategy**: Pool DCA $10/d Auto-Invest + 4 levers (DCA / Squeeze / Stop-loss / Loan)
**Target**: ≥35% PnL/năm trên **cost basis** của crypto holdings
**Anchor date**: 2026-08-01 (Binance Auto-Invest firstExecution OR user explicit)
**Holdings**: BTC, WBETH, BNB, LINK, BNSOL, USDC, USDT
**Deposit schedule**: ngày 6 hàng tháng (cố định)

### Architecture

```
Browser (mrrayvn.github.io) ──┬─► Public Binance (CORS open): /api/v3/*, /klines
                              │
                              ├─► Cloudflare Worker /binance/* ──► api.binance.com (HMAC signed)
                              ├─► Cloudflare Worker /coinalyze/* ──► api.coinalyze.net (api_key injected)
                              └─► Cloudflare Worker /bg/* ──► api.bgeometrics.com (token injected)
```

### Worker secrets (Cloudflare Settings → Variables and Secrets)

- `BINANCE_KEY` — read-only API key
- `BINANCE_SECRET` — HMAC SHA256 signing
- `PROXY_TOKEN` — 32-char, browser sends via X-Auth-Token
- `COINALYZE_KEY` — Coinalyze API
- `BG_TOKEN` (optional) — BGeometrics; fallback hardcoded `0OPQFnwZA4`

---

## 🧠 ALL MODULES (M1–M35)

### Engine v47 core (M1-M16)
| # | Name | Purpose |
|---|---|---|
| M1 | Portfolio summary | gross, NET, cost, equity ratio, PnL unrealized |
| M2 | BEP gap | (avg − price) / price · 100 per asset |
| M3 | **Dynamic TP triggers** | 4 tier × 3-cond gate · **per-asset vol-adjusted mult** (LINK ~1.54 vs BTC 1.40) |
| M5 | Plan health | w ∝ max(1, BEP_gap + 8) ideal alloc |
| M7 | Loan framework v1.6 | dynamic soft/accept/hard caps · BTC liquidation price |
| M8 | Stress test | NET impact tại price drops -10/20/30/40/50% — **wired vào M23 P5 gate** |
| M9 | Signal aggregator | bull/bear pts, stance ribbon |
| M12b | Plan-change diff | prev vs current Pool alloc + loan + F&G |
| M14 | Validation | 14-15 checks, must PASS |
| M16 | Funding analyzer | $3650 USDT min, 35% target, scenarios |

### Quantum v74 (M17-M22)
| # | Name | Purpose |
|---|---|---|
| M17 | Portfolio risk metrics | Sharpe/Sortino/Calmar/Omega + VaR/CVaR + MaxDD + GARCH |
| M18 | Per-asset risk profile | Vol + Hurst + OU mean-reversion z-score |
| M19 | Correlation matrix | Pearson ρ between BTC/WBETH/BNB/LINK |
| M20 | Markowitz optimization | Tangency + Min-Variance + Risk-Parity weights — **wired vào M33 scenC alignment check** |
| M21 | **Bayesian Kelly + NAV clamp 6%** | Beta(2,2) prior + shrinkage + vol-adjusted + hard NAV cap |
| M22 | Bayesian regime | F&G + 200WMA + momentum + on-chain blend + sentiment + macro |

### Strategic v75 (M23-M33)
| # | Name | Purpose |
|---|---|---|
| **M23** | **Unified Decision Synthesizer** | Cascade priority → 1 hành động duy nhất |
| M24 | PnL attribution | Phân rã 7 nguồn lãi/lỗ |
| M25 | Correlation regime | Crisis detection (avg ρ ≥ 0.85 = USDC up) |
| M26 | Decision log | localStorage append-only feedback loop |
| M27 | On-chain signals | MVRV + MVRV-Z + SOPR + NUPL + AVIV + Puell + Reserve Risk |
| M28 | Funding rate forecast | AR(1) + smoothing + squeeze score |
| M29 | Backtest M23 cascade | Rolling 365d windows trên BTC klines + **sensitivity test ±20% TH** |
| M30 | Macro overlay | Global M2 liquidity multiplier |
| M31 | Top trader sentiment | L/S ratio contrarian signal |
| M32 | DCA Capacity | USDT runway + deposit schedule awareness |
| M33 | **Path-to-Target + Bootstrap MC** | 4 scenarios re-ranked by 1000-sim bootstrap qua historical BTC returns |

### Decision Pipeline v76 (M34-M35 + wrappers) ⭐ NEW
| # | Name | Purpose |
|---|---|---|
| M34 | **Volatility State Machine** | Composite vol score 0-100 → {QUIET/NORMAL/EXPANDING/PANIC/EUPHORIA} → size multiplier |
| M35 | **Survival Mode (P0 cross-cut)** | Composite ≥3/5 catastrophic triggers → freeze leverage, force defensive |
| `attachDecisionConfidence` | Wrapper sau M23 | 6 factors → tier HIGH/MID/LOW + size adjustment |
| `attachDecisionEntropy` | Wrapper sau confidence | 50-sim input perturbation → CONVERGED/ROBUST/MIXED/DIVERGENT, bias confidence nếu fragile |
| `attachExecutionChecklist` | Wrapper sau entropy | 8 pre-trade guards: ATR, big-candle, funding, cooldown, spread, slippage, size adjust |
| `computeConfidenceTier` | Shared helper | Score 0-100 → {tier, color, size_adjustment, instruction} |

### M34 Volatility State Machine

```
Composite vol score (0-100) = weighted sum:
  realized_vol_pct × 0.45 (Coinalyze BTC vol/yr)
  garch_vol_pct × 0.25     (M17 GARCH conditional)
  gap_intensity × 0.20     (BTC days với move >5% / 30d window)
  move_24h_abs × 4 × 0.10  (capped via min(100))

States + size_multiplier:
  QUIET    (<30):  1.2× — range-bound, breakouts stronger
  NORMAL   (<55):  1.0× — baseline cascade
  EXPANDING(<75):  0.7× — regime shifting, tighten stops
  PANIC    (<90):  0.4× — drawdown cascade risk
  EUPHORIA (≥90):  0.5× — top setup likely, prepare TP
```

### M35 Survival Mode — 5 catastrophic triggers (≥3/5 = active)

```
T1 M25 correlation crisis   (avg ρ ≥ 0.85)
T2 M22 regime collapse      (pBull < 20%)
T3 Volatility panic         (BTC realized vol > 90%/yr)
T4 Drawdown breach          (M17 maxDD > 20%)
T5 Funding inversion        (funding > 0.001 raw OR M28={OVERHEATED_LONGS|NO_EDGE})

Severity: EXTREME(≥4) · HIGH(3) · WATCH(2) · IDLE(0-1)
Active = freeze all leverage/aggressive, force repay/USDC/DCA-minimal
EXCEPTION: M.m7.over_hard > 0 → bypass Survival, fall through P1 (must repay)
```

### M23 Cascade Priority Order (current v76)

```
P0  ⭐ SURVIVAL MODE (M35 ≥3/5 catastrophic) — Freeze leverage, USDC shift, DCA min
P1  Liquidation risk (M7 over hard cap)        — REPAY loan
P2  Stop-loss triggered (BTC<65k + F&G≤15)     — SELL spot 30%
P3  TP fired (3/3 conditions, dynamic per-asset) — TAKE PROFIT
P3.5 PATH-TO-TARGET (behind schedule)          — Execute best M33 scenario (bootstrap-ranked)
P4a Capitulation (P(bull)<15% + F&G≤20 + mom<-10%) — Pause DCA (only true crash)
P4b Cautious bear (P(bull)<35%)                — Keep DCA, no leverage
P5  Dip buy (BTC<SMA20×0.92 + stress-safe -20% gate) — DCA heavy
P6  Pool rebalance (drift > 15pp)              — Adjust Auto-Invest
P7  Funding squeeze (M28 score ≥ 60 + Kelly clamped 6%) — Long perp
P8  Bull + underwater (pBull > 0.55)           — Tilt Pool toward underwater
P8.5 USDC yield (idle > $200)                  — Enable Earn 5.5% APR
P9  Default                                    — Maintain DCA
```

### Decision Pipeline (mỗi tick)

```
buildMaster(state)
  ↓ compute M1-M22, M27-M32, M34, M35 (M35 BEFORE M23 cascade)
m23_unified_decision(M, s)        ← cascade P0→P9, return 1 action
  ↓
attachDecisionConfidence(decision, M)
  ↓ 6 factors: source count, M34 state, M35 partial, pBull, M25 corr, Kelly clamp
  ↓ → tier HIGH(≥75)/MID(50-74)/LOW(<50) + size_adjustment 1.0/0.7/0.4
attachDecisionEntropy(decision, M, s)
  ↓ 50 sims perturbing fg±3, btcP±1%, ret_30d±2pp, pBull±0.05
  ↓ → regime CONVERGED/ROBUST/MIXED/DIVERGENT
  ↓ If MIXED/DIVERGENT: confidence −15 → recompute tier → size cap 0.3
attachExecutionChecklist(decision, M)
  ↓ Big-candle guard (only defer leverage_increase P3.5/P5/P7)
  ↓ ATR proxy, P7 funding gate, cooldown, spread, slippage by vol×size, size adj
M.m23 final → display
m26_log_decision(M.m23) → feedback loop
```

---

## 📐 KEY CALCULATIONS

### True PnL (CRITICAL — gốc của M33)

```
PnL = Market Value − Cost Basis
    = M.m1.gross − M.m1.cost
    = Σ qty × (current_price − avg_cost)

PnL % = True PnL / Cost Basis × 100
Target = Cost Basis × 35%

❌ KHÔNG dùng: NET − (anchor + deposits)
❌ KHÔNG coi withdrawals là realized profit (chỉ là cycling fiat)
✅ Capital Flows (USDT C2C/Fiat) = info only
```

### Loan safe cap (M33)

```
maxSafeLoanTotal = min(
  M.m7.accept × 0.95,    // 95% LTV cap with 5pp buffer
  cost × 0.5,             // max 50% leverage on cost basis
  net × 0.4               // max 40% leverage on net equity
)
```

### Purpose-driven loan

```
PURPOSE 1: BTC dip-buy (PnL contribution per $1)
  = (BTC drift × beta − interest) × T
  = (0.30 × 0.85 − 0.09) × T = 0.165 × T

PURPOSE 2: DCA fund (carry, no PnL, repaid ngày 6)
PURPOSE 3: Squeeze plays (futures equity, Kelly clamped 6% NAV)
```

### Kelly NAV clamp (M21)

```
raw_quarter = adjusted_kelly × 25
clamped_quarter = min(raw_quarter, KELLY_MAX_NAV_PCT = 6.0)
half_kelly = min(adjusted × 50, 12)

→ M21.quarter_kelly_pct downstream = clamped value
→ M21.quarter_kelly_raw_pct + quarter_kelly_clamped flag cho transparency
```

### Dynamic TP per-asset (M3)

```
adjusted_mult = 1 + (base_mult − 1) × volScale
volScale = clamp((assetVol/btcVol)^0.5, 0.85, 1.35)

Example (LINK vol 100% vs BTC 55%):
  ratio = 1.82 → volScale = 1.35
  TP1 LINK = 1 + 0.40 × 1.35 = 1.54 (vs BTC TP1 = 1.40)
```

### Bootstrap MC (M33 p_hit re-ranking)

```
For each scenario A/B/C/D:
  1000 sims × daysRemaining days
  Each day: sample BTC daily return × portBeta, compound value
  Add dailyDCA + leverageNetPerDay (drift − interest)
  Track maxDD path-dependent
  Squeeze EV via Bernoulli (55% win)

Output per scenario:
  p_hit_bootstrap, p_hit_parametric (erf), fat_tail_penalty_pct
  expected_pnl, pnl_5pct/50pct/95pct, CVaR_5pct
  expected_maxDD_pct, worst_maxDD_pct

Best = scenario có p_hit_bootstrap cao nhất (re-ranked from parametric)
```

---

## 🎯 USER PRINCIPLES (decisions made in session)

1. **Tất cả tính toán → 1 hành động duy nhất** (M23 synthesizer)
2. **DCA là core strategy** — không pause trừ extreme capitulation
3. **Capital Flows ≠ PnL** — USDT C2C/Fiat cycling không phải chốt lời
4. **Vay loan thoải mái** lên đến safe cap, miễn mỗi $ có **purpose cụ thể**
5. **Mục tiêu 35% là priority** — bằng mọi cách hit
6. **Không yêu cầu nạp gấp** khi user không có tiền — luôn có loan/reduce/earn alternatives
7. **Deposit định kỳ ngày 6** — bridge USDT shortage bằng loan ngắn hạn
8. **Confidence + Entropy gate** ⭐ NEW — fragile cascade → bias HOLD, không blind execute
9. **Survival mode is supreme** ⭐ NEW — ≥3/5 catastrophic = freeze trừ liq emergency

---

## 📂 DATA STRUCTURE

### state.* (in browser memory + localStorage)

**Holdings**:
- `state.holdings.{BTC,WBETH,LINK,BNB,BNSOL,USDC,USDT}.{qty,price,avg}`
- `state.loan` · `state.pool.{value,days,plan_alloc,api_first_execution,api_total_invested}`

**Market data**:
- `state.market.{fg_cg, btc_*, ret_30d, btc_above_200wma, rsi6_1d, btc_sma20, btc_vol_ratio, vol_change, funding_btc_pct, funding_binance, funding_threshold_adaptive, funding_history_full, betas}`
- `state.coinalyze.{funding_current, pred_funding, pred_funding_full, ls_current, ls_avg_7d, oi_*, liq_*, btc_realized_vol_annual_pct}`
- `state.klineHistory.{BTC,WBETH,BNB,LINK}` — daily closes (120-400d)
- `state.onchain.{mvrv, sopr, nupl, aviv, mvrv_zscore, puell_multiple, reserve_risk, global_m2, top_trader_ls}`

**Capital flows** (parsed from xlsx):
- `state.capital_flows_data` from `./capital_flows.json`

**Settings (localStorage)**:
- `state.deposit_schedule.day_of_month` (default 6)
- `state.bep_threshold` · `state.target_anchor` · `state.target_pct` · `state.funding_yearly`

**Runtime cache**:
- `state._lastM` — last M from buildMaster (cho sensitivity test reach)
- `state._backtest_cache` — kline-keyed cache cho M29 backtest

### localStorage keys

| Key | Purpose |
|---|---|
| `workerUrl` | Cloudflare worker URL |
| `proxyToken` | X-Auth-Token for worker |
| `manualAvg` | Per-coin avg cost (from Binance UI) |
| `accountSnapshotCache` | 24h cache, heavy endpoint |
| `kpiYearStart` | Anchor date timestamp |
| `autoRefresh` | '1' if 60s ticker refresh on |
| `bgToken` | BGeometrics token override |
| `bgFetchHistory` | Per-metric cache (M27 smart scheduler) |
| `decisionLog` | M26 append-only log |
| `portfolioState` | Full state JSON (manual save) |

### TH constants (single source of truth, line ~427 trong index.html)

```
F&G zones: FG_EXTREME_FEAR(15), FG_CAPITULATION(20), FG_FEAR(30), FG_DIP_BUY_T2(35), FG_NEUTRAL_LOW(40), FG_NEUTRAL_HIGH(55), FG_GREED(65), FG_EXTREME_GREED(80)
P(bull):   PBULL_CAPITULATION(0.15), PBULL_CAUTIOUS_BEAR(0.35), PBULL_DIP_BUY_MIN(0.40), PBULL_SQUEEZE_MIN(0.45), PBULL_BULL_TILT(0.55)
Momentum:  MOMENTUM_CAPITULATION(-10)
Dip-buy:   DIP_SMA_PCT(0.92), DIP_SMA_PCT_T1(0.97), DIP_BUY_LTV_MAX(0.65)
Pool:      POOL_DRIFT_FIRE(15), POOL_DRIFT_WARN(8)
Squeeze:   SQUEEZE_LEVERAGE(3), SQUEEZE_SCORE_FIRE(60), SQUEEZE_FUNDING_NEGATIVE(-0.005), SQUEEZE_NET_PCT(0.05)
Loan:      LOAN_LTV_TARGET(0.60), LTV_ACCEPTABLE(0.55), LTV_HARD_FLOOR(0.50), EFFECTIVE_MMR(0.90)
Corr:      CORR_CRISIS(0.85), CORR_HIGH(0.70), CORR_NORMAL(0.50)
Other:     USDC_IDLE_MIN_FOR_EARN(200), BTC_STOPLOSS_DEFAULT(65000)
```

---

## 🔄 SESSION RECOVERY

Khi mở session mới:

1. **Đọc CLAUDE.md** (file này) toàn bộ
2. **Đọc `index.html`** ở OneDrive path để hiểu code state
3. **Check git log** trong github-repos để xem recent commits
4. **Verify dashboard** đang live (https://mrrayvn.github.io/crypto-portfolio/)
5. **Check capital_flows.json** đang up-to-date không

### Recent commit highlights (chronological, newest first)

```
ba02f27  C6: Fix 5 logic conflicts (bootstrap re-rank, big-candle scope, confidence buy/sell split, tier recompute, M35 funding threshold)
f041b4b  C5: Execution checklist v2 (ATR, size-tier) + Decision Entropy (50-sim regime detector)
ca2aa38  C4: Execution checklist v1 + M29 sensitivity test (lazy ±20% TH perturbation)
6df6333  C3: Dynamic TP per-asset (vol-adjusted) + M33 Bootstrap MC (1000 sims fat-tail check)
d89b235  C2: M34 Volatility State Machine + M23 Decision Confidence (6 factors)
714f948  C1: Kelly NAV clamp 6% + M35 Survival Mode (P0 cross-cutting gate)
1b2f7b0  Wire orphan calcs (M.stress→P5, m20→M33, riskGateOK→M33)
c435830  TH centralization · kill duplicates · renderJourney dead code
3a7fcdb  Squeeze conflict resolved (Tactical+M23+M33 shared gate)
b8019e2  CLAUDE.md v5 + post-audit cleanup (31 findings, ~230 lines cleaned)
```

---

## 🚧 KNOWN ISSUES / TODO

1. **Worker /bg/ route** — user redeploy thủ công nếu add endpoints
2. **Capital flows xlsx** — user export Binance + chạy `parse_capital_flows.py`
3. **M2 Global endpoint** — paid tier 403, handle graceful
4. **Backtest M29** — F&G proxy bằng RSI (no historical F&G free)
5. **GitHub Pages cache** — hard refresh (Ctrl+Shift+R) sau push
6. **Bootstrap MC compute cost** — ~200ms × 4 scenarios per render (acceptable)
7. **Decision Entropy compute cost** — 50 sims × cascade replay per render
8. **Sensitivity test** — lazy on-demand (button trong renderBacktest), ~10-20s

---

## 🎨 UI STRUCTURE (current tabs)

```
📊 Tổng Quan
  - Required CAGR banner (C3)
  - Unified Action (M23 + confidence + entropy + checklist)
  - Hero — True PnL display
  - KPI Tracker — PnL breakdown table
  - Portfolio cards
  - Alerts

🎯 Chiến Lược
  - Unified Action compact
  - Backtest (M29) + Sensitivity test button ⭐ NEW
  - Path-to-35 Monte Carlo
  - Conditional Scenarios
  - Expert Playbook (chi tiết)
  - Action Plan
  - Funding analyzer (M16)
  - Target

🧠 Lượng Tử
  - Quantum Header (M22 regime)
  - On-Chain (M27) — 7 metrics
  - Macro Overlay (M30)
  - Top Trader (M31)
  - Correlation Regime (M25)
  - Quantum Playbook (info-only)
  - [Collapsed] Risk Metrics (M17)
  - [Collapsed] Jump-Diffusion MC
  - [Collapsed] Asset Risk Profile (M18)
  - [Collapsed] Correlation Matrix (M19)
  - [Collapsed] Markowitz (M20)
  - [Collapsed] Top Trader
  - Kelly Bayesian (M21, NAV clamp displayed)
  - Decision Log (M26)

💼 Vị Thế
  - Unified Action compact
  - Capital Flows (M32 + xlsx)
  - PnL Attribution (M24)
  - Pool ROI · Plan Health · DCA Pool
  - Loan Orders · Trades Journal · Exposure (G9)

🌍 Thị Trường
  - Market Aggregate (Coinalyze)
  - Signals (M9)
  - TP Triggers (dynamic per-asset ⭐ NEW)
  - TP math

⚡ Chiến Thuật
  - Funding Forecast (M28)
  - Squeeze ARM
  - Dip Ladder
  - Stop-Loss Framework
  - Stress Test

🔧 Cài Đặt
  - Manual avg cost · Capital Flows manual override
  - BG token + cache control · Binance API config · Edit data form
```

---

## 💎 CRITICAL — KHÔNG ĐƯỢC PHÁ

1. **NET = GROSS − LOAN strict** (G1)
2. **F&G CoinGlass primary** (G2)
3. **Avg cost từ Binance UI** = source of truth (API không expose)
4. **PnL = market − cost, NOT capital flows accounting**
5. **Single unified action** từ M23 cascade — không bao giờ multiple conflicting actions
6. **Capital flows xlsx** = source of truth cho deposits/withdrawals
7. **DCA không pause** trừ extreme capitulation (P4a 3/3 conditions)
8. **Loan có purpose cụ thể** — không vay vô tội vạ
9. **Read-only Binance API** — không trade execution
10. **safeRender wrapping** — 1 module error không kill dashboard
11. **TH constants** = single source of truth, KHÔNG hardcode rải rác
12. **Tactical + Quantum sections = INFO ONLY** — actions chỉ từ M23
13. **Squeeze leverage = 3x** (TH.SQUEEZE_LEVERAGE) mọi nơi
14. ⭐ **M35 Survival = P0** — fires BEFORE P1 trừ over_hard exception
15. ⭐ **Kelly NAV clamp 6%** — quarter_kelly_pct CANNOT exceed 6% NAV
16. ⭐ **Decision pipeline order** — m23 → confidence → entropy(bias) → checklist
17. ⭐ **Bootstrap MC ranks all scenarios** — best CANNOT chosen parametric then replaced
18. ⭐ **Dynamic TP per-asset** — m3_tp() MUST receive assetVols từ M18
19. ⭐ **Entropy bias recompute tier** — không leave tier stale sau score adjust
20. ⭐ **Big-candle guard scope** — chỉ defer leverage_increase [3.5, 5, 7], không defer sell/TP

---

## 🧹 SESSION 2026-05-19 AUDIT TRAIL

### Commits in order
- **c435830** TH centralization (pre-session)
- **1b2f7b0** Wire 3 orphan calcs (M.stress→P5, m20→M33, riskGateOK→M33)
- **C1 (714f948)**: Kelly NAV clamp 6% + M35 Survival Mode
- **C2 (d89b235)**: M34 Vol State + M23 Decision Confidence
- **C3 (6df6333)**: Dynamic TP per-asset + Bootstrap MC
- **C4 (ca2aa38)**: Execution checklist v1 + Sensitivity test
- **C5 (f041b4b)**: Checklist v2 (ATR/size-tier) + Decision Entropy
- **C6 (ba02f27)**: Fix 5 logic conflicts from self-audit

### Self-audit (C6) findings + fixes
1. **Bootstrap MC ranking bug** — ran chỉ cho best (parametric-chosen) → inconsistent. Fixed: run cho all 4, re-rank.
2. **Big-candle guard scope** — defer cả P3 TP (sell trên green = good). Fixed: explicit `leverageIncreaseActions = [3.5, 5, 7]`.
3. **Confidence aggressive list** — P3 EUPHORIA penalty 20 (sai). Fixed: split tpExits = +10 reward.
4. **Tier không recompute** sau entropy bias. Fixed: `computeConfidenceTier()` shared helper.
5. **M35 funding threshold** — `> 0.015` never fires. Fixed: `> 0.001` realistic + M28 NO_EDGE detection.

### ChatGPT critique remediation (8 critiques addressed)
| # | Critique | Fix |
|---|---|---|
| 1 | Single-signal blind execution | Decision Confidence (6 factors) |
| 2 | No vol regime awareness | M34 Vol State Machine |
| 3 | Kelly bias risk | NAV clamp 6% |
| 4 | erf fat-tail optimistic | Bootstrap MC 1000 sims |
| 5 | No execution layer | Execution Checklist (out-of-scope: TWAP/smart routing — read-only project) |
| 6 | Over-fitting risk | M29 sensitivity test lazy |
| 7 | Fixed TP cứng | Dynamic per-asset vol-adjusted |
| 8 | No survival mode | M35 P0 cross-cutting gate |
| **+** | Decision Entropy | Input perturbation cascade stability |

---

## 📝 TONE & UX

- Tiếng Việt working language
- Decision DNA: mọi action có rationale list + sources_fired + confidence + entropy
- Validation must show `N/N PASS`
- Numbers: $78,268.95 · qty 8dp · +/- explicit
- Em xưng "em", user xưng "anh"

## 🎓 CLAUDE CODE WORKFLOW NOTES (Anthropic best practices applied)

1. **CLAUDE.md = primary context** — update sau mọi major change (v5 → v6 this session)
2. **Sync workflow chuẩn**: OneDrive (edit) → repo (commit + push) → GitHub Pages
3. **safeRender** = critical, mỗi render function MUST wrap để 1 error không cascade
4. **Pipeline order tightness** — đặc biệt confidence/entropy/checklist sequence
5. **Self-audit sau mỗi feature** — C6 catch 5 bugs từ C1-C5 chỉ qua manual review
6. **Lazy compute** cho expensive ops (sensitivity test, bootstrap MC ok ~200ms)
