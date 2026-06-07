// RegimeSwitch core — pure, dependency-free.
// Same classifier the SKILL.md documents: detect regime, then emit the matching rule set.

const STRATEGY = {
  trend: {
    name: "momentum_follow",
    indicators: ["EMA50", "MACD(12,26,9)", "ATR(14)"],
    entry_rules: [
      { side: "long",  condition: "price > EMA50 AND MACD histogram turns positive AND 40 <= Fear&Greed <= 70" },
      { side: "short", condition: "price < EMA50 AND MACD bearish (confirmed downtrend)" }
    ],
    exit_rules: [
      { condition: "opposite MACD cross OR trailing stop = 1.5 x ATR", action: "exit" }
    ],
    position_sizing: "1.0x baseline (largest of the three regimes)",
    regime_exit: "momentum fades below 2% or OI stops confirming"
  },
  chop: {
    name: "mean_reversion",
    indicators: ["RSI(14)", "Bollinger(20,2)", "VWAP"],
    entry_rules: [
      { side: "long",  condition: "range support AND RSI < 30 (oversold)" },
      { side: "short", condition: "range resistance AND RSI > 70 (overbought)" }
    ],
    exit_rules: [
      { condition: "price reaches range mid (VWAP / middle Bollinger band)", action: "take_profit" },
      { condition: "breakout confirms beyond band", action: "exit_regime_change" }
    ],
    position_sizing: "0.6x baseline (smaller, quick turnover)",
    regime_exit: "a clean breakout confirms a trend"
  },
  stress: {
    name: "capital_preservation",
    indicators: ["ATR(14)", "support_levels", "fear_greed"],
    entry_rules: [
      { side: "short", condition: "confirmed breakdown of key support", stop: "tight" }
    ],
    exit_rules: [
      { condition: "volatility_spike OR loss > stop", action: "exit" }
    ],
    position_sizing: "0.5x baseline (defensive); default FLAT",
    regime_exit: "Fear&Greed recovers above 25"
  }
};

// Decide the regime from a signals object. Returns { key, conf, trigger }.
function detectRegime(s) {
  const fg = s.fearGreed;
  const liq = s.liqStress;
  const vol = s.volatility;
  const oi = s.oiChange;
  const m = s.momentum;

  // STRESS needs extreme fear CONFIRMED by liquidations or volatility.
  const stressConfirm = (liq != null && liq > 0.5) || (vol != null && vol > 30);
  if (fg != null && fg < 25 && stressConfirm) {
    return { key: "stress", conf: "high",
      trigger: `Fear&Greed ${fg} < 25 confirmed by ${liq != null && liq > 0.5 ? `liquidation stress ${liq}` : `volatility ${vol}`}` };
  }

  // TREND needs momentum AND positioning (OI) AND non-extreme sentiment.
  if (m != null && Math.abs(m) >= 2 && oi != null && oi > 0 && fg != null && fg >= 25 && fg <= 75) {
    return { key: "trend", conf: "medium",
      trigger: `|momentum ${m}%| >= 2 AND OI rising (${oi}%) AND 25 <= F&G ${fg} <= 75` };
  }

  // Everything else is CHOP / transition.
  let trigger;
  if (fg != null && fg < 25 && !s.derivativesAvailable) {
    trigger = `Fear&Greed ${fg} extreme but STRESS unconfirmed (derivatives lane unavailable) -> transition`;
  } else if (fg != null && fg < 25) {
    trigger = `Fear&Greed ${fg} extreme but liquidations contained (${liq}) -> range/transition, not a cascade`;
  } else {
    trigger = `no TREND or STRESS trigger met -> range/transition`;
  }
  return { key: "chop", conf: "low", trigger };
}

// Assemble the backtestable Strategy Capsule.
function buildCapsule(s, det) {
  return {
    schema: "regimeswitch.capsule.v1",
    asset: s.asset || "BTC",
    timeframe: s.timeframe || "1d",
    generated_at: new Date().toISOString(),
    source: s.source || "unknown",
    regime: det.key.toUpperCase(),
    regime_trigger: det.trigger,
    confidence: det.conf,
    signals: {
      fear_greed: s.fearGreed ?? null,
      momentum_24h_pct: s.momentum ?? null,
      open_interest_pct: s.oiChange ?? null,
      funding_bps: s.funding ?? null,
      liquidation_stress: s.liqStress ?? null,
      btc_dominance_pct: s.dominance ?? null,
      volatility_proxy: s.volatility ?? null
    },
    data_quality: {
      derivatives_lane: s.derivativesAvailable ? "available" : "unavailable (keyless public API)",
      notes: s.derivativesAvailable ? []
        : ["OI / funding / liquidation not exposed keyless; STRESS cannot be confirmed, so confidence is capped and STRESS is never asserted on sentiment alone."]
    },
    strategy: STRATEGY[det.key],
    disclaimer: "Research spec for backtesting. Not financial advice, not live execution."
  };
}

module.exports = { STRATEGY, detectRegime, buildCapsule };
