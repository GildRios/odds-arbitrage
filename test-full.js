import {
  getBetplayOdds, getRushbetOdds, getStakeOdds, getWplayOdds,
  getZambaOdds, getLuckiaOdds, getCodereOdds, getRivaloOdds, getBetssonOdds
} from "./src/services/oddsService.js";
import { hasArbitrage, calculateStakeDistribution } from "./src/utils/calculator.js";

async function testHouse(name, fn) {
  const start = Date.now();
  try {
    const odds = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ ${name.padEnd(10)} ${String(odds.length).padStart(4)} partidos  (${elapsed}s)`);
    return odds;
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✗ ${name.padEnd(10)} ERROR: ${err.message.split("\n")[0]}  (${elapsed}s)`);
    return [];
  }
}

console.log("\n=== FASE 1 — Playwright (Wplay, Luckia, Rivalo) ===\n");

const [wplayOdds, luckiaOdds, rivaloOdds] = await Promise.all([
  testHouse("Wplay",    getWplayOdds),
  testHouse("Luckia",   getLuckiaOdds),
  testHouse("Rivalo",   getRivaloOdds),
]);

console.log("\n=== FASE 2 — REST (Betplay, Rushbet, Stake, Zamba, Codere, Betsson) ===\n");

const [betplayOdds, rushbetOdds, stakeOdds, zambaOdds, codereOdds, betssonOdds] = await Promise.all([
  testHouse("Betplay",  getBetplayOdds),
  testHouse("Rushbet",  getRushbetOdds),
  testHouse("Stake",    getStakeOdds),
  testHouse("Zamba",    getZambaOdds),
  testHouse("Codere",   getCodereOdds),
  testHouse("Betsson",  getBetssonOdds),
]);

const allOdds = [
  ...wplayOdds, ...luckiaOdds, ...rivaloOdds,
  ...betplayOdds, ...rushbetOdds, ...stakeOdds,
  ...zambaOdds, ...codereOdds, ...betssonOdds,
];

console.log(`\nTotal cuotas obtenidas: ${allOdds.length}`);

// --- Arbitraje usando los datos ya obtenidos ---
console.log("\n=== ARBITRAJE (stake $100.000) ===\n");

const grouped = {};
for (const odd of allOdds) {
  if (!grouped[odd.matchKey]) grouped[odd.matchKey] = [];
  grouped[odd.matchKey].push(odd);
}

const multiHouseKeys = Object.keys(grouped).filter(k => grouped[k].length >= 2);
console.log(`Partidos con cuotas en 2+ casas: ${multiHouseKeys.length}`);

const opportunities = [];
for (const matchKey of multiHouseKeys) {
  const oddsArray = grouped[matchKey];
  const bestLocal = Math.max(...oddsArray.map(o => o.odds.local));
  const bestDraw  = Math.max(...oddsArray.map(o => o.odds.empate));
  const bestAway  = Math.max(...oddsArray.map(o => o.odds.visitante));

  if (hasArbitrage(bestLocal, bestDraw, bestAway)) {
    const dist = calculateStakeDistribution(bestLocal, bestDraw, bestAway, 100000);
    opportunities.push({ matchKey, bestLocal, bestDraw, bestAway, ...dist });
  }
}

if (opportunities.length === 0) {
  console.log("\nSin oportunidades de arbitraje en este momento (el sistema funciona correctamente).");
} else {
  console.log(`\n¡${opportunities.length} oportunidad(es) encontrada(s)!\n`);
  for (const op of opportunities) {
    const sumInv = 1/op.bestLocal + 1/op.bestDraw + 1/op.bestAway;
    const margin = ((1 - sumInv) * 100).toFixed(2);
    console.log(`  Partido:   ${op.matchKey}`);
    console.log(`  Cuotas:    Local ${op.bestLocal}  Empate ${op.bestDraw}  Visitante ${op.bestAway}`);
    console.log(`  Margen:    ${margin}% garantizado`);
    console.log(`  Stakes:    L=$${op.localStake.toFixed(0)}  E=$${op.drawStake.toFixed(0)}  V=$${op.awayStake.toFixed(0)}`);
    console.log(`  Ganancia:  $${op.guaranteedValue.toFixed(0)}\n`);
  }
}
