#!/usr/bin/env node
// RegimeSwitch backtest — runs the regime-switching strategy on real Binance OHLCV.
// Discipline: signal decided on bar t, position held over bar t+1 (no look-ahead).
//
// Note on regime source: the LIVE skill reads the regime from CMC sentiment / derivatives.
// Those are not available as keyless history, so the backtest reconstructs the regime from
// PRICE (volatility + drawdown + trend structure) — a backtestable analog of the same idea.

const fs = require("fs");
const path = require("path");

const COST = 0.0005;        // 5 bps per position change (taker-ish)
const WARMUP = 150;         // bars needed before the first trade

// ---------- data ----------
function loadCSV(file) {
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1);
  return rows.map((line) => {
    const c = line.split(",");
    return { time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] };
  });
}

// ---------- indicators ----------
const sma = (a, n, i) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };

function emaSeries(a, n) {
  const k = 2 / (n + 1), out = Array(a.length).fill(null);
  let prev;
  for (let i = 0; i < a.length; i++) {
    prev = i === 0 ? a[0] : a[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiSeries(close, n = 14) {
  const out = Array(close.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i < close.length; i++) {
    const ch = close[i] - close[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) { avgG += g / n; avgL += l / n; if (i === n) out[i] = rsi(avgG, avgL); }
    else { avgG = (avgG * (n - 1) + g) / n; avgL = (avgL * (n - 1) + l) / n; out[i] = rsi(avgG, avgL); }
  }
  return out;
}
const rsi = (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));

function atrSeries(bars, n = 14) {
  const out = Array(bars.length).fill(null);
  let prev;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    if (i <= n) { prev = (prev || 0) + tr / n; if (i === n) out[i] = prev; }
    else { prev = (prev * (n - 1) + tr) / n; out[i] = prev; }
  }
  return out;
}

const rollingMax = (a, n, i) => { if (i < n - 1) return null; let m = -Infinity; for (let k = i - n + 1; k <= i; k++) m = Math.max(m, a[k]); return m; };

// ---------- regime (price-based proxy) ----------
function classify(ctx) {
  const { close, atrPct, dd, sma20, sma100 } = ctx;
  if (atrPct == null || sma100 == null) return null;
  // STRESS = downside risk: deep drawdown, or high volatility while price is falling.
  // (High volatility on the way UP is not stress — that would skip rallies.)
  if (dd < -0.18 || (atrPct > 0.06 && close < sma20)) return "stress";
  // TREND: price above a rising long average with short>long structure
  if (close > sma100 && sma20 > sma100) return "trend";
  return "chop";
}

// desired exposure (0..1) for a regime, given indicators
function exposure(regime, ind) {
  if (regime === "stress") return 0;               // capital preservation: flat
  if (regime === "trend") return ind.close > ind.ema50 ? 1 : 0;  // ride the trend
  // chop -> mean-reversion: only buy dips inside an uptrend, never below SMA100
  if (ind.sma100 != null && ind.close < ind.sma100) return 0;
  if (ind.rsi != null && ind.rsi < 35) return 1;
  if (ind.rsi != null && ind.rsi > 55) return 0;
  return ind.prevPos ?? 0;                          // hold between thresholds
}

// ---------- metrics ----------
function metrics(rets) {
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sharpe = sd === 0 ? 0 : (mean / sd) * Math.sqrt(365);
  let eq = 1, peak = 1, mdd = 0;
  const curve = [1];
  for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); curve.push(eq); }
  const total = eq - 1;
  const cagr = Math.pow(eq, 365 / n) - 1;
  return { total, cagr, sharpe, mdd, curve, end: eq };
}

// ---------- run ----------
function backtestSymbol(symbol) {
  const bars = loadCSV(path.join(__dirname, "data", `binance_${symbol}_1d.csv`));
  const close = bars.map((b) => b.close);
  const ema50 = emaSeries(close, 50);
  const ema12 = emaSeries(close, 12);
  const ema26 = emaSeries(close, 26);
  const macd = close.map((_, i) => ema12[i] - ema26[i]);
  const macdSig = emaSeries(macd, 9);
  const rsiArr = rsiSeries(close, 14);
  const atr = atrSeries(bars, 14);

  const stratRets = [], bhRets = [], regimes = [], dates = [];
  let prevPos = 0;

  for (let i = WARMUP; i < bars.length - 1; i++) {
    const ctx = {
      close: close[i],
      atrPct: atr[i] / close[i],
      dd: close[i] / rollingMax(close, 30, i) - 1,
      sma20: sma(close, 20, i),
      sma100: sma(close, 100, i)
    };
    const regime = classify(ctx) || "chop";
    const pos = exposure(regime, {
      close: close[i], ema50: ema50[i], rsi: rsiArr[i], sma100: ctx.sma100,
      macd: macd[i], macdSig: macdSig[i], prevPos
    });

    const mktRet = close[i + 1] / close[i] - 1;        // bar t+1 return
    let r = pos * mktRet;
    if (pos !== prevPos) r -= COST * Math.abs(pos - prevPos);

    stratRets.push(r);
    bhRets.push(mktRet);
    regimes.push(regime);
    dates.push(bars[i].time.slice(0, 10));
    prevPos = pos;
  }

  const S = metrics(stratRets), B = metrics(bhRets);

  // regime distribution
  const dist = regimes.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {});

  // per-year robustness
  const years = {};
  stratRets.forEach((r, i) => {
    const y = dates[i].slice(0, 4);
    (years[y] ||= { s: [], b: [] }).s.push(r);
    years[y].b.push(bhRets[i]);
  });

  return { symbol, S, B, dist, n: regimes.length, dates, years };
}

const pct = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

function report(symbol, S, B, dist, n, dates, years) {
  const line = "-".repeat(58);
  console.log(`\n  RegimeSwitch backtest — ${symbol} 1d`);
  console.log(`  ${dates[0]} -> ${dates[dates.length - 1]}  (${n} bars)`);
  console.log(`  ${line}`);
  console.log(`  Metric            RegimeSwitch        Buy & Hold`);
  console.log(`  Total return      ${pad(pct(S.total))}    ${pct(B.total)}`);
  console.log(`  CAGR              ${pad(pct(S.cagr))}    ${pct(B.cagr)}`);
  console.log(`  Sharpe (ann.)     ${pad(S.sharpe.toFixed(2))}    ${B.sharpe.toFixed(2)}`);
  console.log(`  Max drawdown      ${pad(pct(S.mdd))}    ${pct(B.mdd)}`);
  console.log(`  ${line}`);
  console.log(`  Regime mix        ` + Object.entries(dist).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join("  "));
  console.log(`  ${line}`);
  console.log(`  Per-year (strategy vs buy&hold):`);
  for (const [y, d] of Object.entries(years)) {
    const s = d.s.reduce((a, b) => a * (1 + b), 1) - 1;
    const b = d.b.reduce((a, b) => a * (1 + b), 1) - 1;
    console.log(`    ${y}   strat ${pad(pct(s), 8)}   b&h ${pct(b)}`);
  }
  console.log("");
}
const pad = (s, w = 14) => String(s).padEnd(w);

function writeEquity(dates, sCurve, bCurve) {
  const out = ["date,strategy,buy_hold"];
  for (let i = 0; i < dates.length; i++) out.push(`${dates[i]},${sCurve[i].toFixed(4)},${bCurve[i].toFixed(4)}`);
  fs.writeFileSync(path.join(__dirname, "equity.csv"), out.join("\n"));
}

function writeSVG(symbol, dates, s, b) {
  const W = 900, H = 320, P = 40;
  const max = Math.max(...s, ...b), min = Math.min(...s, ...b, 0);
  const x = (i) => P + (W - 2 * P) * i / (s.length - 1);
  const y = (v) => H - P - (H - 2 * P) * (v - min) / (max - min);
  const poly = (arr, col) => `<polyline fill="none" stroke="${col}" stroke-width="2" points="${arr.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ")}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="#0a0e17"/>
<text x="${P}" y="24" fill="#e6ecf7" font-size="14">RegimeSwitch vs Buy&amp;Hold — ${symbol} 1d equity (start = 1.0)</text>
${poly(b, "#8b97b0")}
${poly(s, "#f0b90b")}
<text x="${W - P - 150}" y="46" fill="#f0b90b" font-size="12">RegimeSwitch</text>
<text x="${W - P - 150}" y="64" fill="#8b97b0" font-size="12">Buy &amp; Hold</text>
</svg>`;
  fs.writeFileSync(path.join(__dirname, "equity.svg"), svg);
}

function main() {
  const arg = (process.argv[2] || "BTCUSDT").toUpperCase();
  const ALL = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
  if (arg === "ALL") {
    const line = "-".repeat(70);
    console.log(`\n  RegimeSwitch — multi-asset backtest (1d, 2023-10-29 -> 2026-06-05)`);
    console.log(`  ${line}`);
    console.log(`  Asset    Return strat / b&h      Sharpe s / b      MaxDD s / b`);
    for (const s of ALL) {
      const r = backtestSymbol(s);
      console.log(`  ${s.replace("USDT", "").padEnd(5)}    ${pad(pct(r.S.total) + " / " + pct(r.B.total), 19)}  ${pad(r.S.sharpe.toFixed(2) + " / " + r.B.sharpe.toFixed(2), 13)}  ${pct(r.S.mdd)} / ${pct(r.B.mdd)}`);
    }
    console.log(`  ${line}\n`);
  } else {
    const r = backtestSymbol(arg);
    report(r.symbol, r.S, r.B, r.dist, r.n, r.dates, r.years);
    writeEquity(r.dates, r.S.curve, r.B.curve);
    writeSVG(r.symbol, r.dates, r.S.curve, r.B.curve);
    console.log(`  Equity curve -> prototype/equity.csv, equity.svg\n`);
  }
}

main();
