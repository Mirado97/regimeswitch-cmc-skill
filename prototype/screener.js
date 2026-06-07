// Token screener — given the regime, rank tokens that fit its playbook.
// Pure logic + a keyless CMC universe fetch. Proxies (from % changes) are clearly labelled;
// true RSI/MACD belong to the per-token backtest, not to this snapshot screen.

const STABLES = new Set(["USDT","USDC","DAI","FDUSD","TUSD","USDE","USD1","BUSD","USDD",
  "PYUSD","FRAX","USDF","LISUSD","XUSD","EURI","FDUSD"]);
const MIN_VOL = 5e6; // drop illiquid names

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const pct = (v) => (v > 0 ? "+" : "") + v + "%";

// CMC keyless listing -> normalized universe.
async function fetchUniverse(limit = 100) {
  const url = `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing` +
    `?start=1&limit=${limit}&sortBy=market_cap&sortType=desc&convert=USD`;
  const r = await fetch(url, { headers: { "User-Agent": "regimeswitch/1.0" } });
  if (!r.ok) throw new Error(`listing HTTP ${r.status}`);
  const j = await r.json();
  return j.data.cryptoCurrencyList.map((c) => {
    const q = c.quotes[0];
    return {
      symbol: c.symbol, name: c.name, rank: c.cmcRank,
      price: r2(q.price), ch1h: r2(q.percentChange1h),
      ch24h: r2(q.percentChange24h), ch7d: r2(q.percentChange7d),
      vol24h: Math.round(q.volume24h), mcap: Math.round(q.marketCap)
    };
  });
}

// Rank tokens for a regime. opts: { symbols?: string[], limit?: number }
function screenTokens(regimeKey, universe, opts = {}) {
  const userSymbols = (opts.symbols || []).map((s) => s.toUpperCase());
  const limit = opts.limit || 5;

  let pool;
  if (userSymbols.length) {
    // user list overrides the stable/liquidity filters
    pool = universe.filter((t) => userSymbols.includes(t.symbol.toUpperCase()));
  } else {
    pool = universe.filter((t) => !STABLES.has(t.symbol.toUpperCase()) && t.vol24h >= MIN_VOL);
  }

  let scored;
  if (regimeKey === "trend") {
    // tokens trending with the market; recent move weighted higher
    scored = pool.map((t) => ({ t,
      score: Math.abs(0.6 * t.ch24h + 0.4 * t.ch7d),
      side: t.ch24h >= 0 ? "long" : "short",
      reason: `momentum 24h ${pct(t.ch24h)}, 7d ${pct(t.ch7d)}` }));
  } else if (regimeKey === "stress") {
    // defensive: calmest names (smallest moves) rank first
    scored = pool.map((t) => ({ t,
      score: -(Math.abs(t.ch24h) + Math.abs(t.ch7d) * 0.3),
      side: "avoid / hold",
      reason: `calmest: 24h ${pct(t.ch24h)}, 7d ${pct(t.ch7d)} — defensive` }));
  } else { // chop — mean-reversion: fade the 24h extreme
    scored = pool.map((t) => ({ t,
      score: Math.abs(t.ch24h),
      side: t.ch24h < 0 ? "long (oversold)" : "short (overbought)",
      reason: `24h ${pct(t.ch24h)} — ${t.ch24h < 0 ? "oversold bounce" : "overbought fade"} (RSI proxy)` }));
  }

  scored.sort((a, b) => b.score - a.score);
  const picks = scored.slice(0, limit).map((x) => ({
    symbol: x.t.symbol, rank: x.t.rank, side: x.side,
    ch24h: x.t.ch24h, ch7d: x.t.ch7d, reason: x.reason
  }));

  const missing = userSymbols.filter(
    (s) => !universe.some((t) => t.symbol.toUpperCase() === s)
  );

  return { picks, missing };
}

module.exports = { fetchUniverse, screenTokens };
