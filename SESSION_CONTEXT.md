# SESSION_CONTEXT.md — Last Session State

**Date packed**: 2026-05-17
**Last commit**: `5b9d94a` Purpose-driven loan breakdown
**Session status**: ✅ Stable, all features deployed

---

## 🎯 Where we left off

User confirmed working principles:
- ✅ DCA never pauses (chỉ extreme capitulation)
- ✅ Vay loan thoải mái lên safe cap, mỗi $ có purpose
- ✅ True PnL = market value − cost basis (not capital flows)
- ✅ M23 single unified action, no conflicting recommendations

User uploaded 2 xlsx files:
- C2C history (P2P trades) — 60 orders Aug 2025 to May 2026
- Fiat purchase (VietQR) — 15 successful orders Mar 2026

User confirmed: anchor date = **2025-08-01** (firstExecutionDateTime of Auto-Invest)

User confirmed: **deposit schedule = ngày 6 hàng tháng** (cố định)

---

## 📊 Current portfolio state (last known)

| Field | Value | Notes |
|---|---|---|
| Cost basis | ~$4,748 | Σ qty × avg from Binance UI |
| Market value | ~$1,590 (NET) | After loan |
| Gross | varies | depends on prices |
| Loan | $1,275 (recently increased $840) | user took loan based on earlier recommendation |
| Target PnL | $1,662 (35% of cost) | needs to add by EOY |
| Time remaining | ~139 days | from anchor 2025-08-01 + 365 |
| BTC price | ~$77,955 | (last screenshot) |
| F&G | 27 (Fear) | not extreme |
| P(bull) Bayesian | 29.7% | borderline |

---

## 🚨 Pending items / next steps

1. **User may take more action** based on latest M33 scenarios
2. **Loan tracking** — recent change $435→$1,275 should reflect in fresh fetch
3. **xlsx re-export** mỗi tháng để cập nhật C2C/Fiat data

---

## 🔧 Recent fixes (last session)

| Commit | Fix |
|---|---|
| `5b9d94a` | Purpose-driven loan (every $ explicit PnL) |
| `ebfc902` | SAFE loan cap + squeeze entry/exit conditions |
| `85f8060` | Target-first cascade (never pause DCA, always loan-fund) |
| `1af4b2b` | M32+M33 cascade alternatives (loan/reduce/earn) |
| `1ac2c80` | M32 DCA Capacity + M33 Path-to-Target |
| `0929892` | Unified parse_capital_flows.py + Fiat xlsx |
| `35385be` | capital_flows.json committed |
| `a66dc36` | TRUE PnL = market_value − cost_basis |
| `ca47ac1` | Split M23 P4 (capitulation vs cautious bear) |
| `d62a81b` | Dashboard freeze fix (M33 field rename + try/catch) |

---

## 💬 User context

- Email: daicatninhphung@gmail.com
- Vietnamese, working language Vietnamese
- Pattern: anh xưng "anh", em xưng "em"
- Trading mode: DCA-first long-term holder
- Cash flow: fixed deposit ngày 6 mỗi tháng
- Risk tolerance: medium-high (accepts loan, accepts leverage to hit target)

---

## 📝 If user wants to continue improving system

Next reasonable upgrades (em đã propose nhưng chưa triển khai):

1. **Push notifications** (cần server infra, Cloudflare Worker scheduled triggers)
2. **Auto-execute mode** (cần Binance trade permission — user đã decline)
3. **Tax tracking** Vietnam crypto landscape
4. **Sentiment integration** (Twitter/Reddit API, paid)
5. **Backtest extension** — F&G historical data hoặc dùng on-chain proxy
6. **Real-time price WebSocket** (currently polling)

---

## 🛠️ Quick verify commands (cho session mới)

```powershell
# 1. Verify live URL
# Open https://mrrayvn.github.io/crypto-portfolio/

# 2. Check last commits
cd C:\Users\datnl\github-repos\crypto-portfolio
git log --oneline -10

# 3. Check capital_flows.json
cat capital_flows.json | python -m json.tool | head -20

# 4. Test parse_capital_flows.py
python parse_capital_flows.py  # auto-detects xlsx in current dir

# 5. Verify worker endpoint
curl https://rapid-band-e1cbinance-proxya.nguyenletandat-58131725.workers.dev/

# 6. Check OneDrive vs git sync
diff "$src" "$repo/index.html"  # should be empty
```

---

## 🔐 Sensitive data NOT to commit

- worker.js (gitignored, has secrets refs)
- *.xlsx files (gitignored)
- Personal data: user email, UID, address (mention in CLAUDE.md only)
