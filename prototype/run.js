#!/usr/bin/env node
// RegimeSwitch runner.
//   node run.js --fixture   -> use the bundled real CMC snapshot (default, offline, deterministic)
//   node run.js --live      -> fetch live data from CMC's keyless public API

const fs = require("fs");
const path = require("path");
const { detectRegime, buildCapsule } = require("./regime.js");

const CMC = "https://api.coinmarketcap.com/data-api/v3";

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "regimeswitch/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// Live signals from CMC keyless public endpoints (no API key, no signup).
async function liveSignals() {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 172800; // 48h
  const [g, fg] = await Promise.all([
    getJson(`${CMC}/global-metrics/quotes/latest`),
    getJson(`${CMC}/fear-greed/chart?start=${start}&end=${end}`)
  ]);
  const gd = g.data;
  const q = gd.quotes[0];
  const list = fg.data.dataList;
  const latest = list[list.length - 1];

  return {
    asset: "BTC",
    timeframe: "1d",
    source: "CMC keyless public API (live)",
    fearGreed: latest.score,
    momentum: round(q.totalMarketCapYesterdayPercentageChange),
    dominance: round(gd.btcDominance),
    // derivatives are not exposed keyless -> graceful degradation
    oiChange: null,
    funding: null,
    liqStress: null,
    volatility: null,
    derivativesAvailable: false
  };
}

const round = (v) => (v == null ? null : Math.round(v * 100) / 100);

function fixtureSignals() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixture.json"), "utf8"));
}

function humanReport(c) {
  const s = c.signals;
  const L = [];
  L.push("");
  L.push("  RegimeSwitch — strategy spec");
  L.push("  " + "-".repeat(46));
  L.push(`  Asset / TF   : ${c.asset} / ${c.timeframe}`);
  L.push(`  Source       : ${c.source}`);
  L.push(`  Regime       : ${c.regime}  (confidence: ${c.confidence})`);
  L.push(`  Trigger      : ${c.regime_trigger}`);
  L.push(`  Strategy     : ${c.strategy.name}  | sizing ${c.strategy.position_sizing}`);
  L.push("");
  L.push(`  Signals      : F&G ${s.fear_greed} | mcap24h ${s.momentum_24h_pct}% | dominance ${s.btc_dominance_pct}%`);
  L.push(`                 OI ${fmt(s.open_interest_pct)} | funding ${fmt(s.funding_bps, "bps")} | liq-stress ${fmt(s.liquidation_stress)}`);
  if (c.data_quality.notes.length) L.push(`  Note         : ${c.data_quality.notes[0]}`);
  L.push("");
  L.push("  Entry rules:");
  c.strategy.entry_rules.forEach((r) => L.push(`    - [${r.side}] ${r.condition}${r.stop ? " (stop: " + r.stop + ")" : ""}`));
  L.push("  Exit rules:");
  c.strategy.exit_rules.forEach((r) => L.push(`    - ${r.condition} -> ${r.action}`));
  L.push("");
  return L.join("\n");
}
const fmt = (v, u = "") => (v == null ? "n/a" : v + (u ? " " + u : ""));

async function main() {
  const live = process.argv.includes("--live");
  const signals = live ? await liveSignals() : fixtureSignals();
  const det = detectRegime(signals);
  const capsule = buildCapsule(signals, det);

  console.log(humanReport(capsule));
  console.log("  Strategy Capsule (JSON):");
  console.log(JSON.stringify(capsule, null, 2));
}

main().catch((e) => {
  console.error("RegimeSwitch failed:", e.message);
  process.exit(1);
});
