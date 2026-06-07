// Minimal, dependency-free tests for the regime classifier.
const fs = require("fs");
const path = require("path");
const { detectRegime } = require("./regime.js");

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
for (const c of cases) {
  const got = detectRegime(c.signals).key;
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (expected ${c.expect}, got ${got})`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
