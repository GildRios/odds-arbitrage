import { getBetplayOdds, getStakeOdds, getWplayOdds } from "./oddsService.js";
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
  const [betplayOdds, stakeOdds, wplayOdds] = await Promise.all([getBetplayOdds(), getStakeOdds(), getWplayOdds()]);
  const allOdds = [...betplayOdds, ...stakeOdds, ...wplayOdds];
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