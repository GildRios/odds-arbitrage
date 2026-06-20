import { getBetplayOdds, getRushbetOdds, getStakeOdds, getWplayOdds, getZambaOdds, getLuckiaOdds, getCodereOdds } from "./oddsService.js";
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
  const [betplayOdds, rushbetOdds, stakeOdds, wplayOdds, zambaOdds, luckiaOdds, codereOdds] = await Promise.all([
    getBetplayOdds(), getRushbetOdds(), getStakeOdds(), getWplayOdds(), getZambaOdds(), getLuckiaOdds(), getCodereOdds(),
  ]);
  const allOdds = [...betplayOdds, ...rushbetOdds, ...stakeOdds, ...wplayOdds, ...zambaOdds, ...luckiaOdds, ...codereOdds];
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