import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";
import { parseWplayData } from "../adapters/wplayAdapter.js";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
chromium.use(stealth());

const KAMBI_BASE = "https://us.offering-api.kambicdn.com/offering/v2018/betplay";
const KAMBI_QS = "?lang=es_CO&market=CO&client_id=200&channel_id=1";
const BETPLAY_ALL_URL = `${KAMBI_BASE}/listView/football/all/all/all/matches.json${KAMBI_QS}`;

const STAKE_BASE_URL = "https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json?path=football&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1";
const STAKE_HEADERS = {
  "Referer": "https://stake.com.co/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

function extractCompetitionPaths(events) {
  const paths = new Set();
  events.forEach(e => {
    const path = e.event?.path ?? [];
    // path[0] = sport, path[1] = region or competition, path[2] = competition (optional)
    const level1 = path[1]?.termKey;
    const level2 = path[2]?.termKey;
    if (!level1 || level1.startsWith("esports")) return;
    // Build the URL segment: region/competition or just competition
    paths.add(level2 ? `${level1}/${level2}` : level1);
  });
  return [...paths];
}

function buildKambiCompetitionUrl(compPath) {
  // 2-level path (e.g. world_cup_2026): needs /all/all/matches.json
  // 3-level path (e.g. brazil/brasileirao): needs /all/matches.json
  const segments = compPath.split("/").length === 1
    ? `${compPath}/all/all`
    : `${compPath}/all`;
  return `${KAMBI_BASE}/listView/football/${segments}/matches.json${KAMBI_QS}`;
}

export async function getBetplayOdds() {
  // Step 1: fetch the aggregate view to discover active competitions
  const aggregateData = await fetch(BETPLAY_ALL_URL).then(r => r.json());
  const competitionPaths = extractCompetitionPaths(aggregateData.events ?? []);

  // Step 2: fetch each competition individually (gives DAILY/MONTHLY coverage)
  const competitionPages = await Promise.all(
    competitionPaths.map(path =>
      fetch(buildKambiCompetitionUrl(path))
        .then(r => r.json())
        .then(data => data.events ?? [])
        .catch(() => [])
    )
  );

  // Step 3: deduplicate by event id and adapt
  const seen = new Set();
  const allEvents = competitionPages.flat().filter(event => {
    if (seen.has(event.event?.id)) return false;
    seen.add(event.event?.id);
    return true;
  });

  return allEvents
    .map(event => adaptBetplayEvent(event))
    .filter(odd => odd !== null);
}

export async function getStakeOdds() {
  const today = new Date();
  const dates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(offset => {
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

export async function getWplayOdds() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let raw = null;
    page.on("response", async r => {
      if (r.url().includes("update_server") && r.status() === 200) {
        try { raw = await r.text(); } catch {}
      }
    });
    await page.goto("https://apuestas.wplay.co/es/football", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 10000));
    if (!raw) return [];
    return parseWplayData(JSON.parse(raw));
  } finally {
    await browser.close();
  }
}
