---
name: regime-switch-strategy
description: |
  Generates an adaptive, regime-aware crypto trading strategy spec from CoinMarketCap data.
  It first classifies the current market into one of three regimes — TREND, CHOP, or STRESS —
  then emits a backtestable set of entry / exit / risk rules tailored to that regime.
  This is a research skill: the output is a strategy specification suitable for backtesting,
  not a live-execution agent.
  Use when a user asks which strategy fits current market conditions, wants a regime read,
  or needs an adaptive strategy spec.
  Trigger: "regime strategy", "what strategy now", "market regime", "adaptive strategy",
  "regime switch", "/regime-switch-strategy"
license: MIT
compatibility: ">=1.0.0"
user-invocable: true
allowed-tools:
  - mcp__cmc-mcp__get_global_metrics_latest
  - mcp__cmc-mcp__get_global_crypto_derivatives_metrics
  - mcp__cmc-mcp__get_crypto_marketcap_technical_analysis
  - mcp__cmc-mcp__get_crypto_quotes_latest
---

# RegimeSwitch Strategy Skill

One meta-strategy, three market regimes. This skill reads live CoinMarketCap signals,
decides whether the market is in **TREND**, **CHOP**, or **STRESS**, and returns the
matching, backtestable rule set. Different market, different rules.

## Prerequisites

The CoinMarketCap MCP server (`cmc-mcp`) must be connected. Verify the connection before
running; if data tools are unavailable, do not fabricate values — return a blocked result
(see *Handling Tool Failures*).

```json
{ "mcpServers": { "cmc-mcp": { "command": "cmc-mcp", "env": { "CMC_API_KEY": "<your key>" } } } }
```

## Inputs

| Parameter   | Required | Default | Meaning                                                        |
|-------------|----------|---------|----------------------------------------------------------------|
| `asset`     | no       | `BTC`   | Symbol to build the strategy for.                              |
| `timeframe` | no       | `1d`    | Bar size the emitted rules assume (`1h`, `4h`, `1d`).          |

## Core Principle

A single strategy applied across all conditions underperforms. Trend rules get chopped up in
ranges; mean-reversion rules get run over in trends; both blow up in a deleveraging shock.
RegimeSwitch **detects the regime first, then applies only the rules that fit it.**

## Detection Workflow

Run these steps in order. Each pulls a specific CMC signal used by the classifier below.

1. **Global market health** — `get_global_metrics_latest`
   → read Fear & Greed Index, BTC dominance, total market cap 24h change.
2. **Derivatives positioning** — `get_global_crypto_derivatives_metrics`
   → read aggregate open interest change, average funding rate, long/short ratio,
   and the liquidation-stress ratio (how hard liquidations are actually firing).
3. **Technical structure** — `get_crypto_marketcap_technical_analysis`
   → read trend/momentum signal and a volatility proxy for the market.
4. **Asset confirmation** — `get_crypto_quotes_latest` for `asset`
   → read 24h / 7d price change to confirm direction and momentum strength.

## Regime Classification

Apply in this priority order (first match wins):

```
STRESS  if  Fear&Greed < 25
        AND ( liquidation_stress_ratio > 0.5            # liquidations actually firing
              OR volatility_proxy > 30 )
        # Extreme fear ALONE is not stress. It must be confirmed by liquidations or
        # volatility — otherwise the tape is a fearful range, not a cascade. A sharp OI
        # drop with rising funding is a *watch* signal, not a STRESS trigger on its own.

TREND   if  |asset_momentum_24h| >= 2%
        AND open_interest rising (positioning confirms)
        AND 25 <= Fear&Greed <= 75

CHOP    otherwise — includes "mixed / transition": low conviction, contained liquidations,
        neutral-to-fearful sentiment without a cascade. Bias: stand aside / reduce size,
        fade range extremes only on a clear signal.
```

Report the chosen regime, the triggering condition, and a confidence (`high` / `medium` /
`low`) based on how many signals agree. A regime with conflicting lanes (e.g. extreme fear
but contained liquidations) is `CHOP` at `low` confidence, not `STRESS`.

## Strategy Rule Book

Emit **only** the block matching the detected regime.

### TREND — momentum follow
- **Indicators:** `EMA50`, `MACD(12,26,9)`, `ATR(14)`
- **Enter LONG:** price > `EMA50` AND `MACD` histogram turns positive, while 40 ≤ Fear&Greed ≤ 70.
- **Enter SHORT:** price < `EMA50` AND `MACD` bearish (confirmed downtrend).
- **Exit:** opposite `MACD` cross OR trailing stop = `1.5 × ATR`.
- **Risk:** larger size vs other regimes; one position per asset; no counter-trend entries.

### CHOP — mean-reversion
- **Indicators:** `RSI(14)`, `Bollinger(20,2)`, `VWAP`
- **Enter LONG:** at range support, `RSI < 30` (oversold).
- **Enter SHORT:** at range resistance, `RSI > 70` (overbought).
- **Exit:** take profit at range mid (`VWAP` / middle Bollinger band); tight stop beyond the band.
- **Risk:** smaller size, fast turnover; stand aside the moment a breakout confirms (regime change).

### STRESS — capital preservation
- **Indicators:** support levels, `ATR(14)`, Fear&Greed
- **Default:** FLAT / cash; halve normal position sizing.
- **Enter SHORT:** only on confirmed breakdown of key support, tight stop.
- **Exit:** cut losers immediately; no averaging down; exit on volatility spike.
- **No fresh longs** until Fear&Greed recovers above 25 (regime-exit condition).

## Output Format — backtestable strategy spec

Return a single JSON object the user can hand to a backtester:

```json
{
  "asset": "BTC",
  "timeframe": "1d",
  "regime": "STRESS",
  "regime_trigger": "Fear&Greed 15 < 25",
  "confidence": "high",
  "signals": {
    "fear_greed": 15,
    "funding_avg_pct": -0.011,
    "open_interest_24h_pct": 11.4,
    "momentum_24h_pct": 3.30,
    "volatility_proxy": 15.40
  },
  "strategy": {
    "name": "capital_preservation",
    "indicators": ["ATR(14)", "support_levels", "fear_greed"],
    "entry_rules": [
      { "side": "short", "condition": "confirmed breakdown of key support", "stop": "tight" }
    ],
    "exit_rules": [
      { "condition": "volatility_spike OR loss > stop", "action": "exit" }
    ],
    "position_sizing": "0.5x baseline",
    "regime_exit": "Fear&Greed > 25"
  },
  "disclaimer": "Research spec for backtesting. Not financial advice, not live-execution."
}
```

## Backtesting Notes

- The `signals` block is the regime fingerprint at generation time — log it so backtests are reproducible.
- Indicators are standard (`EMA`, `MACD`, `RSI`, `Bollinger`, `ATR`) and available in any backtest engine.
- Apply realistic transaction costs and a max-drawdown guard; the STRESS block exists precisely to cap drawdown.

## Validation

Cross-checked live against CMC's own `detect_market_regime` (2026-06-07, 7d window):
Fear&Greed 14, open interest 7d −15.82%, average funding 41.57 bps, liquidation stress 0.24
(contained). CMC labelled the tape `mixed_transition / low conviction → stay selective`.

RegimeSwitch returns **CHOP (transition, low confidence)** for the same snapshot: extreme fear
is present, but liquidations are contained, so it correctly avoids a false `STRESS` call. The
original `Fear&Greed < 25 ⇒ STRESS` rule was tightened to require liquidation/volatility
confirmation as a direct result of this check.

## Handling Tool Failures

Degrade gracefully — never invent numbers.

| Missing tool                              | Fallback                                                        |
|-------------------------------------------|----------------------------------------------------------------|
| `get_global_metrics_latest`               | Cannot read Fear&Greed → block (regime undecidable).           |
| `get_global_crypto_derivatives_metrics`   | Drop OI/funding from the classifier; lower confidence to `medium`. |
| `get_crypto_marketcap_technical_analysis` | Use price-change momentum only; note reduced volatility read.   |
| `get_crypto_quotes_latest`                | Use global 24h change as the momentum proxy.                    |

If the core sentiment lane is unavailable, return:
```json
{ "status": "blocked", "reason": "core CMC signals unavailable; regime undecidable" }
```
