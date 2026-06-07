# RegimeSwitch — Adaptive CMC Strategy Skill

**BNB HACK: AI Trading Agent Edition · Track 2 — Strategy Skills**

One meta-strategy, three market regimes. RegimeSwitch is a CoinMarketCap **skill** that reads
live CMC signals, classifies the market into **TREND / CHOP / STRESS**, and emits a
**backtestable strategy spec** (entry / exit / risk rules) tailored to that regime.

> Track 2 deliverable: a CMC skill that turns market data into a trading strategy — a
> backtestable spec, not a live-execution agent.

## Why regime-switching

A single strategy underperforms across conditions: trend rules get chopped up in ranges,
mean-reversion gets run over in trends, and both blow up in a deleveraging shock. RegimeSwitch
**detects the regime first, then applies only the rules that fit it.**

```
CMC market data  →  Regime detector  →  Regime-specific rules  →  Entry/exit spec
   (sponsor)         (TREND/CHOP/STRESS)    (backtestable)
```

## How it uses the sponsor stack

- **CoinMarketCap Agent Hub (required sponsor capability):** all inputs come from CMC MCP tools
  — Fear & Greed, BTC dominance, derivatives (open interest, funding, long/short), technical
  analysis, and quotes. The skill is consumed by an LLM agent over **MCP**.

## Repository layout

```
.
├── skills/
│   └── regime-switch-strategy/
│       └── SKILL.md        # the deliverable: the CMC skill itself
├── index.html              # demo dashboard (visualizes the skill output)
└── README.md
```

## The skill

[`skills/regime-switch-strategy/SKILL.md`](skills/regime-switch-strategy/SKILL.md) — follows
the official CoinMarketCap skill format (YAML frontmatter + `allowed-tools` + workflow steps).
It defines:

- **Inputs:** `asset`, `timeframe`
- **Detection workflow:** four CMC MCP tool calls feeding a transparent classifier
- **Classification:** explicit thresholds for TREND / CHOP / STRESS
- **Rule book:** entry / exit / risk rules per regime (standard indicators: EMA, MACD, RSI, Bollinger, ATR)
- **Output:** a single JSON strategy spec ready for a backtester

## Demo

Open `index.html` in a browser. It visualizes a live snapshot: detected regime, the CMC
signals that drove it, the active strategy, the current signal, and an interactive rule book
for all three regimes.

## Run the skill

1. Connect the CoinMarketCap MCP server (`cmc-mcp`) to your AI agent with a `CMC_API_KEY`.
2. Drop `skills/regime-switch-strategy/` into the agent's skills directory.
3. Ask the agent: *"regime strategy for BTC"* → it runs the workflow and returns the spec.

## License

MIT
