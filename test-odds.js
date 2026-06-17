//import { getBetplayOdds } from "./src/services/oddsService.js";
import { getStakeOdds } from "./src/services/oddsService.js";
/*
const odds = await getBetplayOdds();
console.log(`Partidos encontrados: ${odds.length}`);
console.log(odds);
*/

const odds2 = await getStakeOdds();

console.log(`Partidos encontrados: ${odds2.length}`);
console.log(odds2);