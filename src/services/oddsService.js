import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";

const STAKE_URL = "https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json?path=football&date=2026-06-17&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1";


const BETPLAY_URL = "https://us.offering-api.kambicdn.com/offering/v2018/betplay/event/live/open.json?lang=es_CO&market=CO&client_id=200&channel_id=1";


export async function getBetplayOdds() {
  const response = await fetch(BETPLAY_URL);
  const data = await response.json();

  const odds = data.liveEvents
    .map(event => adaptBetplayEvent(event))
    .filter(odd => odd !== null);

  return odds;
}

export async function getStakeOdds() {  
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
export default { getBetplayOdds, getStakeOdds };