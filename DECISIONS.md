# DECISIONS.md — Architectural Decision Log

Quyết định kiến trúc + lý do để Claude session mới hiểu được "why", không chỉ "what".

---

## D1: True PnL accounting

**Date**: 2026-05-17
**Trigger**: User phát hiện "tính như hiện tại tôi giao 3650 u thì tôi nạp thêm thì vẫn tính pnl à"

**Rejected**: `True PnL = NET − (anchor + deposits − withdrawals)`
- Sai vì coi deposits là PnL gain (nạp $1000 tăng NET $1000 không phải lãi)

**Rejected v2**: `True PnL = (NET + withdrawals) − (anchor + deposits)` (effective position)
- Sai vì coi withdrawals (SELL USDT C2C → VND) là realized profit
- User chưa SELL crypto → không có realized PnL từ holdings

**Accepted**: `True PnL = Market Value − Cost Basis`
- `cost = Σ qty × avg_cost` (từ Binance UI manual input)
- `market = Σ qty × current_price`
- PnL = market − cost = M.m1.pnl_unreal (engine v47 đã có)
- Plus realized PnL từ futures, earn rewards, minus loan interest
- Đây là standard portfolio accounting

**Implication**: Capital Flows (USDT C2C/Fiat cycling) chỉ là **info**, KHÔNG ảnh hưởng PnL calculation.

---

## D2: Unified Action — 1 hành động duy nhất

**Date**: 2026-05-15
**Trigger**: User: "thứ nhất mọi tính toán đều phải đưa ra 1 kết quả hành động thống nhất, không chồng chéo lẫn nhau"

**Rejected**: 10+ sections each output recommendations (Expert Playbook, Action Plan, Alerts, Quantum Playbook, etc.) → user confused which to follow.

**Accepted**: M23 Decision Synthesizer cascade priority. Mỗi tab có:
- Compact banner trên top showing the unified action
- Detail sections demoted to "supporting analysis" với note "không thay thế M23"

**Cascade rule**: P1 wins over P2, P2 over P3, etc. First match returns.

---

## D3: DCA continues through fear (không pause khi F&G < 30)

**Date**: 2026-05-17
**Trigger**: User: "tại sao yêu cầu tạm ngưng dca" khi F&G = 27

**Rejected**: P4 fire khi P(bull) < 30% → pause Auto-Invest
- Conflict với DCA philosophy (contrarian buy khi fear)
- F&G 27 historically = good entry zone

**Accepted**: Split P4 into 2 tiers:
- **P4a CAPITULATION** (3/3 conditions): P(bull)<15% AND F&G≤20 AND momentum<-10% → pause DCA
- **P4b CAUTIOUS BEAR** (P(bull)<35%): keep Pool DCA, no extra leverage, no squeeze

**Principle**: DCA = core strategy. Chỉ pause khi thực sự catastrophic.

---

## D4: Capital Flows từ xlsx (Binance API không cover C2C)

**Date**: 2026-05-17
**Trigger**: User cung cấp 2 file xlsx (C2C history + Fiat purchase history)

**Rejected**: Auto-fetch via `/sapi/v1/capital/deposit/hisrec`
- Endpoint không cover C2C (P2P trading)
- Không cover VietQR fiat purchases
- 90-day query limit, pagination phức tạp

**Accepted**: Parse xlsx user export định kỳ
- `parse_capital_flows.py` auto-detects file type (C2C vs Fiat)
- Output `capital_flows.json` committed to repo
- Dashboard fetches via `loadCapitalFlowsData()` on init
- Anchor date override từ xlsx period_start

**Workflow**: user drop xlsx mới → run python → commit → push → dashboard auto-update.

---

## D5: Cost basis approach cho PnL target

**Date**: 2026-05-17
**Trigger**: User confirm "tôi chưa hề chốt lời"

**Logic**:
- Cost basis = total $ user paid for crypto holdings (Σ qty × avg)
- Target = cost × 1.35 (35% gain trên cost)
- Market value cần > cost × 1.35 để hit target
- Required CAGR computed on market value → target market value

**KHÔNG dùng**:
- Anchor + deposits làm denominator (sai accounting)
- Effective position (NET + withdrawals) cho withdrawal-heavy case

---

## D6: Purpose-driven loan (every $ has PnL purpose)

**Date**: 2026-05-17
**Trigger**: User: "cứ vay thoải mái an toàn, nhưng loan phải có mục đích sử dụng"

**Rejected previous fix**: cap loan to 0 khi gần max safe → user wants full safe utilization

**Accepted**: M33 scenarios chia loan thành 3 purposes:
1. **BTC dip-buy**: contribute PnL = $1 × (drift × beta − interest) × T
2. **DCA fund** (carry, no PnL): bridge USDT shortage to ngày 6
3. **Squeeze plays** (futures equity, NOT loan): N plays × EV per play

Mỗi scenario step show:
- $X for purpose Y
- Expected PnL contribution = $Z
- Math breakdown explicit

**Safe ceilings still enforced**:
```
maxSafe = min(M.m7.accept × 0.95, cost × 0.5, net × 0.4)
```

---

## D7: Deposit schedule awareness (ngày 6 hàng tháng)

**Date**: 2026-05-17
**Trigger**: User: "ngày 06 hàng tháng user mới có thể nạp thêm usdt cố định"

**Logic**:
- M32 computes `days_until_next_deposit` based on `state.deposit_schedule.day_of_month`
- Bottleneck = next scheduled deposit, NOT end of cycle
- USDT shortage actions:
  - If runway ≥ 80% of period → REDUCE pace slightly (zero risk)
  - If 40-80% → 2 options (Reduce or Loan)
  - If < 40% → LOAN PRIMARY (recommend short-term loan)

**Key insight**: User không có cash flow ngay, lịch nạp cố định → loan ngắn hạn cheaper than missing DCA opportunities.

---

## D8: Squeeze plays must have explicit entry/exit conditions

**Date**: 2026-05-17
**Trigger**: User: "bước thực hiện thứ 3 không hiểu, 8 squeeze long futures plays Kelly 69.52 không chỉ rõ entry"

**Rejected**: "Thực hiện 8 squeeze long futures plays (Kelly sized $69.52)" — vague

**Accepted**: Mỗi play needs:
- **Entry triggers** (3 conditions đồng thuận):
  - A: M28 funding 24h forecast ≤ −0.005%
  - B: M22 P(bull) ≥ 45% AND F&G ≥ 30
  - C: M28 squeeze_score ≥ 60
- **Execution**: Long BTC Perp 5×, size from M21 Quarter Kelly
- **Exit rules**:
  - TP1 (+3%): close 50%
  - TP2 (+5%): close rest
  - SL (−1.5%): hard close
  - Force exit: funding flip > +0.005%
- **Frequency**: max 2 plays/month

---

## D9: BGeometrics smart scheduler (rate limit 10/hr · 15/day)

**Date**: 2026-05-17
**Trigger**: User hit 429 rate limit during testing

**Logic**:
- Per-metric TTL (24h for daily metrics)
- Per-metric priority (mvrv/mvrv_zscore highest, aviv lowest)
- Hourly budget tracking (rolling 1h window from localStorage)
- Hard limit BG_HOURLY_LIMIT=10, reserve BG_BUDGET_RESERVE=1
- Sorts stale metrics by (priority↑, age↓), fetches up to budget
- Skips fetch if budget exhausted
- Cache only valid values, NEVER overwrites with null

**Result**: User can refresh dashboard freely without hitting 429.

---

## D10: Worker /bg/ route proxy for CORS bypass

**Date**: 2026-05-16
**Trigger**: BG direct fetch fails with "Failed to fetch" (CORS block)

**Solution**: Add `/bg/<endpoint>` route in worker.js:
- Auth via X-Auth-Token (PROXY_TOKEN)
- 22 BG endpoints whitelisted
- BG_TOKEN secret injected (or fallback hardcoded)
- Adds CORS headers in response

**Note**: User redeploys worker manually via Cloudflare dashboard.

---

## Key learnings (cho session mới)

1. **PnL ≠ Cash Flow**. Đừng confuse deposits/withdrawals với PnL.
2. **DCA is contrarian**, không pause khi fear unless extreme.
3. **Mỗi recommendation phải có purpose** — không vay/buy/sell vô tội vạ.
4. **Single unified action** — never output conflicting recommendations.
5. **xlsx > API** cho C2C/Fiat data.
6. **safeRender** wrap everything → 1 module error không kill dashboard.
7. **try/catch** trong buildMaster cho M22/M23/M28/M32/M33 modules.
8. **Cost basis** là denominator chuẩn cho PnL %.
9. **Loan có 3 purposes**: BTC dip / DCA fund / Squeeze equity.
10. **Cascade > priority numbers** — first match returns.
