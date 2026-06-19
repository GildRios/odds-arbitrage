import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";


const BETPLAY_URL = "https://us.offering-api.kambicdn.com/offering/v2018/betplay/listView/football/all/all/all/matches.json?lang=es_CO&market=CO&client_id=200&channel_id=1";

export async function getBetplayOdds() {
  const response = await fetch(BETPLAY_URL);
  const data = await response.json();

  const odds = data.events
    .map(event => adaptBetplayEvent(event))
    .filter(odd => odd !== null);

  return odds;
}

export async function getStakeOdds() {  
    const today = new Date().toISOString().split("T")[0];
    const STAKE_URL = `https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json?path=football&date=${today}&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1`;
    const response = await fetch(STAKE_URL, {
  headers: {
    "Referer": "https://stake.com.co/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  }
});
    const data = await response.json();
   

    const odds = data.events
      .map(event => adaptStakeEvent(event))
      .filter(odd => odd !== null);

    return odds;
}
