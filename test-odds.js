import { getBetplayOdds } from "./src/services/oddsService.js";

const odds = await getBetplayOdds();
console.log(`Partidos encontrados: ${odds.length}`);
console.log(odds);