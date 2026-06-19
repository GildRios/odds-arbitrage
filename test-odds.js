import { getBetplayOdds } from "./src/services/oddsService.js";
import { getStakeOdds } from "./src/services/oddsService.js";
import {findArbitrageOpportunities} from "./src/services/arbitrageService.js";

const odds = await getBetplayOdds();
console.log(`Partidos encontrados: ${odds.length}`);
console.log(odds);


const odds2 = await getStakeOdds();

console.log(`Partidos encontrados: ${odds2.length}`);
console.log(odds2);

const opportunities = await findArbitrageOpportunities(100000);
console.log(`Oportunidades de arbitraje encontradas: ${opportunities.length}`);
console.log(opportunities);
console.log("Betplay:", getBetplayOdds.length);
console.log("Stake:", getStakeOdds.length);