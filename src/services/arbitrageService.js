import { getBetplayOdds, getRushbetOdds, getStakeOdds, getWplayOdds, getZambaOdds, getLuckiaOdds, getCodereOdds, getRivaloOdds, getBetssonOdds } from "./oddsService.js";
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

export async function findArbitrageOpportunities(totalStake) {
  // Fase 1: casas vía Playwright — corren solas para no competir con las llamadas REST masivas de Betsson
  const [wplayOdds, luckiaOdds, rivaloOdds] = await Promise.all([
    getWplayOdds(), getLuckiaOdds(), getRivaloOdds(),
  ]);

  // Fase 2: casas REST — Betsson en paralelo completo sin interferir con browsers
  const [betplayOdds, rushbetOdds, stakeOdds, zambaOdds, codereOdds, betssonOdds] = await Promise.all([
    getBetplayOdds(), getRushbetOdds(), getStakeOdds(), getZambaOdds(), getCodereOdds(), getBetssonOdds(),
  ]);
  const allOdds = [...betplayOdds, ...rushbetOdds, ...stakeOdds, ...wplayOdds, ...zambaOdds, ...luckiaOdds, ...codereOdds, ...rivaloOdds, ...betssonOdds];
  const groupedOdds = groupByMatchKey(allOdds);
  const opportunities = [];

  for (const matchKey in groupedOdds) {
    const oddsArray = groupedOdds[matchKey];

    if (oddsArray.length < 2) continue;

    const bestLocal = Math.max(...oddsArray.map(o => o.odds.local));
    const bestDraw = Math.max(...oddsArray.map(o => o.odds.empate));
    const bestAway = Math.max(...oddsArray.map(o => o.odds.visitante));

    if (hasArbitrage(bestLocal, bestDraw, bestAway)) {
      const distribution = calculateStakeDistribution(bestLocal, bestDraw, bestAway, totalStake);
      opportunities.push({ matchKey, bestLocal, bestDraw, bestAway, ...distribution });
    }
  }

  return opportunities;
}

export default { findArbitrageOpportunities };