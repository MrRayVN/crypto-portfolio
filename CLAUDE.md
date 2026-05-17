# CLAUDE.md (v5 — packed 2026-05-17 · post-audit cleanup)

Hướng dẫn cho Claude (Cowork + Claude Code) khi tiếp tục project này từ session mới.

---

## ⚡ QUICK START (đọc TRƯỚC khi làm bất cứ gì)

**Live URL**: https://mrrayvn.github.io/crypto-portfolio/
**Engine version**: v47 + Quantum v74 + Strategic v75 (M17-M33)
**Last session**: 2026-05-17 — fixed PnL accounting, purpose-driven loan, capital flows xlsx integration

### File locations

| File | Path | Notes |
|---|---|---|
| `index.html` (production) | `C:\Users\datnl\OneDrive - VIP\Tài liệu\Claude\Projects\Danh mục đầu tư tiền điện tử – Siêu Lastui Nhuậnn\index.html` | Source-of-truth, edit ở đây |
| `index.html` (git mirror) | `C:\Users\datnl\github-repos\crypto-portfolio\index.html` | Synced via .NET copy, deploys to GitHub Pages |
| `worker.js` | `C:\Users\datnl\github-repos\crypto-portfolio\worker.js` | gitignored, Cloudflare Worker source (deploy thủ công) |
| `capital_flows.json` | `C:\Users\datnl\github-repos\crypto-portfolio\capital_flows.json` | Committed, parsed from xlsx, dashboard fetches |
| `parse_capital_flows.py` | `C:\Users\datnl\github-repos\crypto-portfolio\parse_capital_flows.py` | Unified parser for C2C + Fiat xlsx |
| C2C xlsx | `C:\Users\datnl\github-repos\crypto-portfolio\Binance-Lịch-sử-lệnh-C2C-*.xlsx` | gitignored |
| Fiat xlsx | `C:\Users\datnl\github-repos\crypto-portfolio\Binance-Lịch-sử-mua-tiền-pháp-định-*.xlsx` | gitignored |

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

## 🧠 ALL MODULES (M1–M33)

### Engine v47 core (M1-M16)
| # | Name | Purpose |
|---|---|---|
| M1 | Portfolio summary | gross, NET, cost, equity ratio, PnL unrealized |
| M2 | BEP gap | (avg − price) / price · 100 per asset |
| M3 | TP triggers | 4 tier × 3-cond gate (price ≥ trigger AND F&G ≥ N AND bull pts ≥ N) |
| M5 | Plan health | w ∝ max(1, BEP_gap + 8) ideal alloc |
| M7 | Loan framework v1.6 | dynamic soft/accept/hard caps · BTC liquidation price |
| M8 | Stress test | NET impact tại price drops -10/20/30/40/50% |
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
| M20 | Markowitz optimization | Tangency + Min-Variance + Risk-Parity weights |
| M21 | Bayesian Kelly | Beta(2,2) prior + shrinkage + vol-adjusted |
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
| M29 | Backtest M23 cascade | Rolling 365d windows trên BTC klines |
| M30 | Macro overlay | Global M2 liquidity multiplier |
| M31 | Top trader sentiment | L/S ratio contrarian signal |
| M32 | DCA Capacity | USDT runway + deposit schedule awareness |
| M33 | Path-to-Target | 4 scenarios, purpose-driven loan, auto-pick best |

### M23 Cascade Priority Order

```
P1  Liquidation risk (M7 over hard cap)        — REPAY loan
P2  Stop-loss triggered (BTC<65k + F&G≤15)     — SELL spot 30%
P3  TP fired (3/3 conditions met)              — TAKE PROFIT
P3.5 PATH-TO-TARGET (behind schedule)          — Execute best M33 scenario [FIRES AGGRESSIVELY]
P4a Capitulation (P(bull)<15% + F&G≤20 + mom<-10%) — Pause DCA (only true crash)
P4b Cautious bear (P(bull)<35%)                — Keep DCA, no leverage
P5  Dip buy (BTC < SMA20 × 0.92)               — DCA heavy
P6  Pool rebalance (drift > 15pp)              — Adjust Auto-Invest
P7  Funding squeeze (M28 score ≥ 60)           — Long perp Kelly-sized
P8  Bull + underwater                          — Tilt Pool toward underwater
P8.5 USDC yield (idle > $200)                  — Enable Earn 5.5% APR
P9  Default                                    — Maintain DCA
```

---

## 📐 KEY CALCULATIONS

### True PnL (CRITICAL — corrected during session)

```
PnL = Market Value − Cost Basis
    = M.m1.gross − M.m1.cost
    = Σ qty × (current_price − avg_cost)

PnL % = True PnL / Cost Basis × 100
Target = Cost Basis × 35%
Target Market Value = Cost Basis × 1.35

❌ KHÔNG dùng: NET − (anchor + deposits)
❌ KHÔNG coi withdrawals là realized profit (chỉ là cycling fiat)
✅ Capital Flows (USDT C2C/Fiat) = info only, KHÔNG ảnh hưởng PnL
```

### Loan safe cap (M33)

```
maxSafeLoanTotal = min(
  M.m7.accept × 0.95,    // 95% LTV cap with 5pp buffer
  cost × 0.5,             // max 50% leverage on cost basis
  net × 0.4               // max 40% leverage on net equity
)
maxAdditionalLoan = max(0, maxSafeLoanTotal − M.loan)
```

### Purpose-driven loan (every $ has explicit PnL purpose)

```
PURPOSE 1: BTC dip-buy
  Contribution per $1 = (BTC drift × beta − interest) × T
                      = (0.30 × 0.85 − 0.09) × T = 0.165 × T

PURPOSE 2: DCA fund (carry, no PnL)
  Bridge USDT shortage to next deposit
  Repaid ngày 6 hàng tháng

PURPOSE 3: Squeeze plays (futures equity, not loan)
  Quarter Kelly size × N plays × EV per play
  3 entry triggers + 4 exit rules explicit
```

---

## 🎯 USER PRINCIPLES (decisions made in session)

1. **Tất cả tính toán → 1 hành động duy nhất** (M23 synthesizer, no conflicting recommendations)
2. **DCA là core strategy** — không pause trừ extreme capitulation (3/3 conditions)
3. **Capital Flows ≠ PnL** — USDT C2C/Fiat cycling không phải chốt lời
4. **Vay loan thoải mái** lên đến safe cap, miễn mỗi $ có **purpose cụ thể**
5. **Mục tiêu 35% là priority** — bằng mọi cách (loan-funded scenarios) để hit
6. **Không yêu cầu nạp gấp** khi user không có tiền — luôn có loan/reduce/earn alternatives
7. **Deposit định kỳ ngày 6** — bridge USDT shortage bằng loan ngắn hạn đến ngày này

---

## 📂 DATA STRUCTURE

### state.* (in browser memory + localStorage)

**Holdings** (computed from Binance API fetch):
- `state.holdings.{BTC,WBETH,LINK,BNB,BNSOL,USDC,USDT}.{qty,price,avg}`
- `state.loan` — total margin debt
- `state.pool.{value,days,plan_alloc,api_first_execution,api_total_invested}`

**Market data**:
- `state.market.{fg_cg, btc_*, ret_30d, etc.}`
- `state.coinalyze.{funding_current, pred_funding, ls_current, etc.}`
- `state.klineHistory.{BTC,WBETH,BNB,LINK}` — daily closes (120-400d)
- `state.onchain.{mvrv, sopr, nupl, aviv, mvrv_zscore, puell_multiple, reserve_risk}`

**Capital flows** (parsed from xlsx, NOT user input by default):
- `state.capital_flows_data` — loaded from `./capital_flows.json` on init
  - `total_deposits_usd` — sum of BUY orders C2C + Fiat purchases
  - `total_withdrawals_usd` — sum of SELL orders C2C
  - `sources[]` — per-file breakdown {type, file, buy_usdt, sell_usdt, order_count}
  - `orders[]` — chronological, with source_type tag

**Settings (user-editable, localStorage)**:
- `state.deposit_schedule.day_of_month` — default 6
- `state.bep_threshold` — BTC stop-loss price (default $65k)
- `state.target_anchor` — initial NET reference
- `state.target_pct` — default 35%
- `state.funding_yearly` — default $3650 ($10/day commit)
- `state.capital_flows.{manual_deposits, manual_withdrawals}` — override xlsx if needed

### localStorage keys

| Key | Purpose |
|---|---|
| `workerUrl` | Cloudflare worker URL |
| `proxyToken` | X-Auth-Token for worker |
| `manualAvg` | Per-coin avg cost (from Binance UI) |
| `accountSnapshotCache` | 24h cache, heavy endpoint |
| `kpiYearStart` | Anchor date timestamp |
| `autoRefresh` | '1' if 60s ticker refresh on |
| `capitalFlows` | Manual override (rarely used) |
| `bgToken` | BGeometrics token override |
| `bgFetchHistory` | Per-metric cache (M27 smart scheduler) |
| `bgOnChainCache` | Legacy 24h cache (deprecated, kept for back-compat) |
| `decisionLog` | M26 append-only log |
| `portfolioState` | Full state JSON (manual save) |

---

## 🔄 SESSION RECOVERY

Khi mở session mới:

1. **Đọc CLAUDE.md** (file này) toàn bộ
2. **Đọc `index.html`** ở OneDrive path để hiểu code state
3. **Check git log** trong github-repos để xem recent commits
4. **Verify dashboard** đang live (https://mrrayvn.github.io/crypto-portfolio/)
5. **Check capital_flows.json** đang up-to-date không

### Recent commit highlights (chronological)

```
ebfc902 SAFE loan cap + squeeze entry/exit conditions
5b9d94a Purpose-driven loan breakdown (every $ explicit PnL purpose)
85f8060 Target-first cascade (never pause DCA, always loan-funded paths)
1af4b2b M32+M33 cascade alternatives (loan vs reduce vs earn)
1ac2c80 M32 DCA Capacity + M33 Path-to-Target
0929892 Add Fiat Purchase xlsx + unified parse_capital_flows.py
35385be capital_flows_c2c.json + parse_c2c.py (legacy, replaced)
a66dc36 CRITICAL: True PnL = market_value − cost_basis (not capital flows)
d62a81b Fix dashboard freeze: M33 field rename + try/catch wraps
ca47ac1 Split M23 P4 (capitulation vs cautious bear)
1ac2c80 M32 DCA Capacity + M33 Path-to-Target
fe55631 H3 M27 On-Chain Signals via BGeometrics
4c552de H2 Funding Forecast (M28) + C1 Backtest (M29)
dde04b7 M17 BTC proxy + M21 Bayesian Kelly
64031aa Phase 1 audit (6 upgrades)
c54551f M23 Unified Decision Synthesizer
dde04b7 Quantum v74 deploy
```

---

## 🚧 KNOWN ISSUES / TODO

1. **Worker /bg/ route** — user đã deploy lần đầu, nhưng nếu thêm endpoints mới (em add vào worker.js) → user phải redeploy
2. **Capital flows xlsx** — user export định kỳ từ Binance, drop file vào repo, chạy `parse_capital_flows.py`
3. **M2 Global endpoint** — paid tier 403, đã handle graceful (return null)
4. **Backtest M29** — F&G proxy bằng RSI (true F&G không có historical free)
5. **GitHub Pages cache** — anh nên hard refresh (Ctrl+Shift+R) sau mỗi push

---

## 🎨 UI STRUCTURE (current tabs)

```
📊 Tổng Quan
  - Required CAGR banner (C3)
  - Unified Action (M23) — primary
  - Hero — True PnL display
  - KPI Tracker — PnL breakdown table
  - Portfolio cards
  - Alerts

🎯 Chiến Lược
  - Unified Action compact
  - Backtest (M29)
  - Path-to-35 Monte Carlo
  - Conditional Scenarios (C4)
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
  - Quantum Playbook
  - Risk Metrics (M17)
  - Jump-Diffusion MC
  - Asset Risk Profile (M18)
  - Correlation Matrix (M19)
  - Markowitz (M20)
  - Kelly Bayesian (M21)
  - Decision Log (M26)

💼 Vị Thế
  - Unified Action compact
  - Capital Flows (M32 + xlsx)
  - PnL Attribution (M24)
  - Pool ROI
  - Plan Health
  - DCA Pool
  - Loan Orders
  - Trades Journal
  - Exposure (G9)

🌍 Thị Trường
  - Market Aggregate (Coinalyze)
  - Signals (M9)
  - TP Triggers
  - TP math
  - Journey

⚡ Chiến Thuật
  - Funding Forecast (M28)
  - Squeeze ARM
  - Dip Ladder
  - Stop-Loss Framework
  - Stress Test

🔧 Cài Đặt
  - Manual avg cost
  - Capital Flows manual override
  - BG token + cache control
  - Binance API config
  - Edit data form
```

---

## 💎 CRITICAL — KHÔNG ĐƯỢC PHÁ

1. **NET = GROSS − LOAN strict** (G1)
2. **F&G CoinGlass primary** (G2)
3. **Avg cost từ Binance UI** = source of truth (Binance API không expose)
4. **PnL = market − cost, NOT capital flows accounting**
5. **Single unified action** từ M23 cascade — không bao giờ output multiple conflicting actions
6. **Capital flows xlsx** là source of truth cho deposits/withdrawals (API không cover C2C)
7. **DCA không pause** trừ extreme capitulation (3/3 conditions)
8. **Loan có purpose cụ thể** — không vay vô tội vạ
9. **Read-only Binance API** — không trade execution
10. **safeRender wrapping** — error 1 module không kill toàn dashboard
11. **TH constants** (line ~390 trong index.html) — single source of truth cho thresholds. KHÔNG hardcode F&G/P(bull) numbers rải rác.
12. **Tactical + Quantum sections = INFO ONLY** — actions chỉ từ M23 cascade. Tabs này show status, không produce action verbs.
13. **Squeeze leverage = 3x** (TH.SQUEEZE_LEVERAGE) mọi nơi.

## 🧹 AUDIT CLEANUP (v5)

Phase A (HIGH severity fixes):
- C2: Squeeze leverage synced 5x → 3x mọi nơi
- C3/C4: Stop-Loss + Dip-Ladder INFO-only (no action verbs, defer M23)
- C1: renderSqueeze converted to status display
- C7: renderActions = read-only M23 trace, legacy actions collapsed
- D1: 4-LEVER mini cards deleted (renderLeverDCA/Squeeze/Loan/Stop removed)
- D2: Markowitz Action 5 removed from QuantumPlaybook
- O1: Dead M32 cascade block deleted (~80 lines)
- D9: renderScenarios stub deleted

Phase B (medium cleanups):
- TH constants object added — centralize thresholds
- P(hit) labels: "GBM MC" vs "Jump-Diffusion MC"
- Quantum analytics collapsed `<details>` (Risk Metrics, Jump-Diff, AssetRisk, Correlation, Markowitz, TopTrader)
- D7: renderJourney removed (Plan Changes covers diff)

Total: ~230 lines cleaned. Dashboard lean hơn, single source of action.

---

## 📝 TONE & UX

- Tiếng Việt working language
- Decision DNA: mọi action có rationale list + sources_fired
- Validation must show `N/N PASS`
- Numbers: $78,268.95 · qty 8dp · +/- explicit
- Em xưng "em", user xưng "anh"
