import { getBetplayOdds, getRushbetOdds, getStakeOdds, getWplayOdds, getZambaOdds, getLuckiaOdds, getCodereOdds, getRivaloOdds, getBetssonOdds, getSportiumOdds, getBwinOdds } from "./oddsService.js";
import { hasArbitrage, calculateStakeDistribution } from "../utils/calculator.js";

function groupByMatchKey(allOdds) {
  const grouped = {};
  allOdds.forEach(odd => {
    if (!grouped[odd.matchKey]) {
      grouped[odd.matchKey] = [];
    }
    grouped[odd.matchKey].push(odd);
  });
  return grouped;
}

async function safeCall(fn, name) {
  try { return await fn(); }
  catch (err) { console.warn(`[${name}] error: ${err.message}`); return []; }
}

export async function findArbitrageOpportunities(totalStake) {
  // All sources run sequentially so the GC can free each source's raw JSON before the next one loads.
  // Kambi endpoints (Betplay/Rushbet) return global football data that can be hundreds of MB parsed;
  // running 8 such sources in parallel was the cause of the OOM crash.
  const allOdds = [];
  for (const [fn, name] of [
    [getBetplayOdds,  "Betplay"],
    [getRushbetOdds,  "Rushbet"],
    [getStakeOdds,    "Stake"],
    [getZambaOdds,    "Zamba"],
    [getCodereOdds,   "Codere"],
    [getBetssonOdds,  "Betsson"],
    [getSportiumOdds, "Sportium"],
    [getBwinOdds,     "Bwin"],
    [getWplayOdds,    "Wplay"],
    [getLuckiaOdds,   "Luckia"],
    [getRivaloOdds,   "Rivalo"],
  ]) {
    console.log(`[${new Date().toISOString()}] [${name}] fetching...`);
    const odds = await safeCall(fn, name);
    console.log(`[${new Date().toISOString()}] [${name}] ${odds.length} eventos`);
    allOdds.push(...odds);
    // Nudge the GC to collect the raw response objects from this source before the next fetch
    if (typeof globalThis.gc === "function") globalThis.gc();
  }
  const groupedOdds = groupByMatchKey(allOdds);
  const opportunities = [];

  for (const matchKey in groupedOdds) {
    const oddsArray = groupedOdds[matchKey];

    if (oddsArray.length < 2) continue;

    const bestLocalEntry    = oddsArray.reduce((b, o) => o.odds.local    > b.odds.local    ? o : b);
    const bestDrawEntry     = oddsArray.reduce((b, o) => o.odds.empate   > b.odds.empate   ? o : b);
    const bestVisitanteEntry = oddsArray.reduce((b, o) => o.odds.visitante > b.odds.visitante ? o : b);

    const bestLocal = bestLocalEntry.odds.local;
    const bestDraw  = bestDrawEntry.odds.empate;
    const bestAway  = bestVisitanteEntry.odds.visitante;

    if (hasArbitrage(bestLocal, bestDraw, bestAway)) {
      const { localStake, drawStake, awayStake, guaranteedValue } =
        calculateStakeDistribution(bestLocal, bestDraw, bestAway, totalStake);

      opportunities.push({
        match:       bestLocalEntry.match,
        date:        bestLocalEntry.date,
        profitPct:   +((guaranteedValue / totalStake) * 100).toFixed(2),
        guaranteed:  Math.round(guaranteedValue),
        total:       totalStake,
        bets: [
          { outcome: "local",     house: bestLocalEntry.house,     odds: bestLocal, stake: Math.round(localStake), link: bestLocalEntry.link },
          { outcome: "empate",    house: bestDrawEntry.house,      odds: bestDraw,  stake: Math.round(drawStake),  link: bestDrawEntry.link },
          { outcome: "visitante", house: bestVisitanteEntry.house, odds: bestAway,  stake: Math.round(awayStake),  link: bestVisitanteEntry.link },
        ],
      });
    }
  }

  return opportunities.sort((a, b) => b.profitPct - a.profitPct);
}

export default { findArbitrageOpportunities };