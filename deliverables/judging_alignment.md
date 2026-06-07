# Judging Alignment — RegimeSwitch (Track 2: Strategy Skills)

How this project maps to the BNB HACK submission requirements and judging criteria.

## Submission requirements

| Requirement | How it is met |
|---|---|
| Public repository | `github.com/Mirado97/regimeswitch-cmc-skill` |
| Reproducibility (repo + demo/video or setup) | Runnable prototype (`prototype/`, `npm test` / `npm run fixture` / `npm start`), plus `index.html` demo and this doc |
| At least one sponsor capability | **CoinMarketCap** — live data via the keyless public API and the CMC skill format (`SKILL.md`) |
| No token launch during the event | Research-only skill; no token, no fundraising |
| AI tooling allowed | Built with an AI coding agent |
| On-chain agent address | Not required for Track 2 |

## Track 2 deliverable

| Track 2 ask | How it is met |
|---|---|
| Build a CMC skill | `skills/regime-switch-strategy/SKILL.md` in the official CMC skill format (frontmatter + `allowed-tools` + workflow) |
| Turn market data into a strategy | Regime classifier → per-regime entry/exit/risk rule book |
| Output a backtestable spec, not a live agent | `Strategy Capsule` JSON (`regimeswitch.capsule.v1`) emitted by `prototype/run.js` |
| Built on CMC data | Live CMC keyless API in `--live`; documented MCP tools in `SKILL.md` |

## Judging criteria

| Criterion | Evidence |
|---|---|
| **Technical execution** | Runs end-to-end: `npm start` pulls **live** CMC data and prints a strategy spec; `npm test` passes 4/4; classifier logic in code matches the documented `SKILL.md` |
| **Originality** | Regime-switching meta-strategy (TREND / CHOP / STRESS), not a single fixed indicator rule |
| **Real-world relevance** | Clear user (quant / strategy researcher); output is a ready-to-backtest spec; graceful degradation when a data lane is missing |
| **Demo & presentation** | Bilingual (EN/RU) `index.html` dashboard wired to a live CMC snapshot; human-readable report from the CLI |

## Validation

The classifier was cross-checked against CMC's own `detect_market_regime` (2026-06-07, 7d):
Fear&Greed 14, OI −15.82%, funding 41.57 bps, liquidation stress 0.24 (contained). CMC labelled it
`mixed_transition / low conviction → stay selective`. RegimeSwitch returns **CHOP (transition, low
confidence)** for the same snapshot — it correctly does **not** false-trigger STRESS on extreme fear
alone. The original `fear < 25 ⇒ STRESS` rule was tightened to require liquidation/volatility
confirmation as a direct result. Covered by the `npm test` suite.

## Scope boundary (research-only)

Out of scope by design (Track 2 is research, not execution): live trading, wallet integration,
private API keys, and DoraHacks auto-submission. The skill produces a specification; a human or a
Track 1 agent decides whether to act on it.
