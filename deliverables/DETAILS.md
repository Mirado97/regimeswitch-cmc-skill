<!--
  DoraHacks "Details" — ready to paste.
  Copy the text blocks in order. At each "📸 IMAGE" marker, drag the named PNG
  from the /proofs folder into the DoraHacks editor (it uploads and inserts itself).
  The markers themselves are notes for you — delete them / don't paste them.
-->

## 🔗 Links
- **Live demo:** https://mirado97.github.io/regimeswitch-cmc-skill/
- **Code:** https://github.com/Mirado97/regimeswitch-cmc-skill
- **The skill:** `skills/regime-switch-strategy/SKILL.md` (official CMC skill format)

## 🎯 Problem
Most crypto strategies apply **one fixed rule set to every market** — and that is why they fail.
Trend rules get chopped in ranges, mean-reversion gets run over in trends, and both blow up in a
deleveraging shock. Traders also pick tokens by hand and rebuild the same CoinMarketCap data
plumbing before writing any logic.

## 💡 Solution
**RegimeSwitch** is a CoinMarketCap skill that adapts in two layers:
1. **Regime detection** — reads live CMC signals (Fear & Greed, derivatives, BTC dominance,
   volatility) and classifies the whole market into **TREND / CHOP / STRESS**.
2. **Strategy + token screen** — emits the *matching* backtestable strategy spec (entry/exit/risk
   rules) **and** a screened shortlist of the tokens that fit that regime.

> One adaptive meta-strategy instead of one brittle rule — delivered as a ready-to-use CMC skill.

<!-- 📸 IMAGE: drag  proofs/demo_en.png  here -->

## 🧠 How it uses CoinMarketCap
Built entirely on CMC data — two integration paths:

**As a CMC skill (MCP, official format)** — `SKILL.md` declares these CMC tools:
- `get_global_metrics_latest` → Fear & Greed, BTC dominance, total market cap
- `get_global_crypto_derivatives_metrics` → open interest, funding, long/short, liquidation stress (drives STRESS)
- `get_crypto_marketcap_technical_analysis` → trend / volatility
- `get_crypto_quotes_latest` → per-asset 24h / 7d momentum
- `get_crypto_listings_latest` → top-N token universe for the screener

**Live in the prototype (CMC keyless public API, no key)** — `run.js --live` calls:
- `/data-api/v3/fear-greed/chart`, `/global-metrics/quotes/latest`, `/cryptocurrency/listing`

This is the **regime-detection example** from the track brief: derivatives positioning flips the
strategy between regimes.

## 📊 Backtest — real Binance OHLCV (Oct 2023 – Jun 2026)
No look-ahead (signal on bar *t*, position held *t+1*), 5 bps cost. Out-of-sample across 4 assets,
RegimeSwitch delivers a **higher Sharpe and lower drawdown than buy & hold on every one**:

| Asset | Return (strat / b&h) | Sharpe (s / b) | Max DD (s / b) |
|-------|----------------------|----------------|----------------|
| BTC   | +73.2% / +75.9%      | 0.83 / 0.69    | −41.9% / −51.3% |
| ETH   | +100.9% / −13.4%     | 0.89 / 0.26    | −33.6% / −67.8% |
| BNB   | +159.1% / +153.2%    | 1.09 / 0.92    | −32.1% / −56.2% |
| SOL   | +99.8% / +91.6%      | 0.76 / 0.72    | −56.7% / −76.0% |

The edge is **consistent risk-adjusted outperformance**, not a cherry-picked asset.

<!-- 📸 IMAGE: drag  proofs/equity_eth.png  here -->
<!-- 📸 IMAGE: drag  proofs/backtest.png  here -->

## ✅ Validation & tests
Cross-checked live against CMC's own `detect_market_regime`: it labelled the tape
`mixed_transition`; RegimeSwitch returned **CHOP (transition)** — correctly *not* a false STRESS
call. Automated test suite: **10/10 passing**. Live run pulls real CMC keyless data and screens the
top-100 for regime-fit tokens.

<!-- 📸 IMAGE: drag  proofs/runtime.png  here -->

## 🛠️ How to run
```bash
cd prototype
node run.js --live       # regime + token candidates from live CMC
node backtest.js all     # multi-asset backtest
node test.js             # 10/10
```
Zero dependencies, Node ≥18, **no API key** (CMC keyless).

## 🧱 Scope
Sponsor: **CoinMarketCap Agent Hub** (live data + MCP skill format) — targeting *Best Use of CMC
Agent Hub*. Research-only by design: no wallet, no keys, no live trading. The skill produces a
specification; a human or a Track-1 agent decides whether to act on it.
