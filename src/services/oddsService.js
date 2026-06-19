import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";

const BETPLAY_URL = "https://us.offering-api.kambicdn.com/offering/v2018/betplay/listView/football/all/all/all/matches.json?lang=es_CO&market=CO&client_id=200&channel_id=1";
const STAKE_BASE_URL = "https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json?path=football&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1";
const STAKE_HEADERS = {
  "Referer": "https://stake.com.co/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

export async function getBetplayOdds() {
  const response = await fetch(BETPLAY_URL);
  const data = await response.json();

  return data.events
    .map(event => adaptBetplayEvent(event))
    .filter(odd => odd !== null);
}

export async function getStakeOdds() {
  const today = new Date();
  const dates = [0, 1, 2].map(offset => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().split("T")[0];
  });

  const pages = await Promise.all(
    dates.map(date =>
      fetch(`${STAKE_BASE_URL}&date=${date}`, { headers: STAKE_HEADERS })
        .then(r => r.json())
        .then(data => data.events ?? [])
    )
  );

  const seen = new Set();
  const allEvents = pages.flat().filter(event => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  return allEvents
    .map(event => adaptStakeEvent(event))
    .filter(odd => odd !== null);
}
