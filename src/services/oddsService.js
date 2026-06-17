import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";

const BETPLAY_URL = "https://us.offering-api.kambicdn.com/offering/v2018/betplay/event/live/open.json?lang=es_CO&market=CO&client_id=200&channel_id=1";

export async function getBetplayOdds() {
  const response = await fetch(BETPLAY_URL);
  const data = await response.json();

  const odds = data.liveEvents
    .map(event => adaptBetplayEvent(event))
    .filter(odd => odd !== null);

  return odds;
}