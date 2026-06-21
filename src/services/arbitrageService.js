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

export async function findArbitrageOpportunities(totalStake) {
  // Fase 1: casas vía Playwright — corren solas para no competir con las llamadas REST masivas de Betsson
  const [wplayOdds, luckiaOdds, rivaloOdds] = await Promise.all([
    getWplayOdds(), getLuckiaOdds(), getRivaloOdds(),
  ]);

  // Fase 2: casas REST/WS — sin browsers Playwright
  const [betplayOdds, rushbetOdds, stakeOdds, zambaOdds, codereOdds, betssonOdds, sportiumOdds, bwinOdds] = await Promise.all([
    getBetplayOdds(), getRushbetOdds(), getStakeOdds(), getZambaOdds(), getCodereOdds(), getBetssonOdds(), getSportiumOdds(), getBwinOdds(),
  ]);
  const allOdds = [...betplayOdds, ...rushbetOdds, ...stakeOdds, ...wplayOdds, ...zambaOdds, ...luckiaOdds, ...codereOdds, ...rivaloOdds, ...betssonOdds, ...sportiumOdds, ...bwinOdds];
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