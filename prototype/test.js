// Minimal, dependency-free tests for the regime classifier.
const fs = require("fs");
const path = require("path");
const { detectRegime } = require("./regime.js");
const { screenTokens } = require("./screener.js");

const cases = [
  {
    name: "STRESS — extreme fear confirmed by liquidations",
    signals: { fearGreed: 12, momentum: -1.2, oiChange: -22, funding: 5, liqStress: 0.72, volatility: null, derivativesAvailable: true },
    expect: "stress"
  },
  {
    name: "TREND — momentum + rising OI + neutral sentiment",
    signals: { fearGreed: 55, momentum: 4.3, oiChange: 9.1, funding: 8, liqStress: 0.2, volatility: 18, derivativesAvailable: true },
    expect: "trend"
  },
  {
    name: "CHOP — extreme fear but liquidations contained (the validated case)",
    signals: JSON.parse(fs.readFileSync(path.join(__dirname, "fixture.json"), "utf8")),
    expect: "chop"
  },
  {
    name: "CHOP — extreme fear, derivatives lane unavailable (keyless live)",
    signals: { fearGreed: 14, momentum: 1.4, oiChange: null, funding: null, liqStress: null, volatility: null, derivativesAvailable: false },
    expect: "chop"
  }
];

let failed = 0;
let total = 0;
function check(name, cond) {
  total++; if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

for (const c of cases) {
  const got = detectRegime(c.signals).key;
  check(`${c.name}  (expected ${c.expect}, got ${got})`, got === c.expect);
}

// --- screener tests (use the bundled real universe) ---
const universe = JSON.parse(fs.readFileSync(path.join(__dirname, "universe.fixture.json"), "utf8"));

const chop = screenTokens("chop", universe, { limit: 5 });
check("screener: chop returns picks", chop.picks.length > 0);
check("screener: chop top pick is the biggest 24h mover (ZEC)", chop.picks[0].symbol === "ZEC");
check("screener: stablecoins filtered out", !chop.picks.some((p) => ["USDT", "USDC"].includes(p.symbol)));

const trend = screenTokens("trend", universe, { limit: 3 });
check("screener: trend returns picks", trend.picks.length === 3);

const userList = screenTokens("chop", universe, { symbols: ["BTC", "ETH", "NOSUCH"] });
check("screener: user list keeps only requested symbols", userList.picks.every((p) => ["BTC", "ETH"].includes(p.symbol)));
check("screener: unknown symbol reported as not_found", userList.missing.includes("NOSUCH"));

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
