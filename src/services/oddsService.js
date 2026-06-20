import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";
import { parseWplayDOM } from "../adapters/wplayAdapter.js";
import { adaptZambaEvent } from "../adapters/zambaAdapter.js";
import { parseLuckiaDOM } from "../adapters/luckiaAdapter.js";
import { adaptCodereEvent } from "../adapters/codereAdapter.js";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
chromium.use(stealth());

const KAMBI_QS = "?lang=es_CO&market=CO&client_id=200&channel_id=1";

const STAKE_BASE_URL = "https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json?path=football&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1";
const STAKE_HEADERS = {
  "Referer": "https://stake.com.co/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

function kambiBase(client) {
  return `https://us.offering-api.kambicdn.com/offering/v2018/${client}`;
}

function extractCompetitionPaths(events) {
  const paths = new Set();
  events.forEach(e => {
    const path = e.event?.path ?? [];
    const level1 = path[1]?.termKey;
    const level2 = path[2]?.termKey;
    if (!level1 || level1.startsWith("esports")) return;
    paths.add(level2 ? `${level1}/${level2}` : level1);
  });
  return [...paths];
}

async function getKambiOdds(client, house) {
  const base = kambiBase(client);
  const allUrl = `${base}/listView/football/all/all/all/matches.json${KAMBI_QS}`;
  const aggregateData = await fetch(allUrl).then(r => r.json());
  const competitionPaths = extractCompetitionPaths(aggregateData.events ?? []);

  const competitionPages = await Promise.all(
    competitionPaths.map(compPath => {
      const segments = compPath.split("/").length === 1
        ? `${compPath}/all/all`
        : `${compPath}/all`;
      return fetch(`${base}/listView/football/${segments}/matches.json${KAMBI_QS}`)
        .then(r => r.json())
        .then(data => data.events ?? [])
        .catch(() => []);
    })
  );

  const seen = new Set();
  const allEvents = competitionPages.flat().filter(event => {
    if (seen.has(event.event?.id)) return false;
    seen.add(event.event?.id);
    return true;
  });

  return allEvents
    .map(event => adaptBetplayEvent(event, house))
    .filter(odd => odd !== null);
}

export async function getBetplayOdds() {
  return getKambiOdds("betplay", "Betplay");
}

export async function getRushbetOdds() {
  return getKambiOdds("rsico", "Rushbet");
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

const ZAMBA_ENDPOINT = "https://online-nio3-sportsbook-zamba.orenes.tech/offermanager/graphql";
const ZAMBA_HEADERS = {
  "Content-Type": "application/json",
  "X-API-Key": "h640tsLa4fUxEucHUBr3v88mEd",
  "x-tenant": "031a9bbf-eaa5-4ae3-9668-8a01db9464a3",
};
const ZAMBA_TENANT = "031a9bbf-eaa5-4ae3-9668-8a01db9464a3";

const ZAMBA_QUERY = `
  query ($after: String) {
    events(
      filter: {
        tenantId: "${ZAMBA_TENANT}"
        status: Prematch
        types: [Fixture]
        ended: false
        isOffered: true
        sportKeys: [1]
      }
      first: 100
      after: $after
    ) {
      edges {
        node {
          ... on Fixture {
            eventId
            utcStartDate
            hasEnded
            isLive
            offerActive
            competitors { homeAway competitorName }
            markets {
              marketDefaultName
              selections { selectionDefaultName price status }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function getZambaOdds() {
  const allNodes = [];
  let cursor = null;

  do {
    const body = JSON.stringify({ query: ZAMBA_QUERY, variables: { after: cursor } });
    const data = await fetch(ZAMBA_ENDPOINT, { method: "POST", headers: ZAMBA_HEADERS, body })
      .then(r => r.json());
    const eventsPage = data?.data?.events;
    if (!eventsPage) break;
    allNodes.push(...eventsPage.edges.map(e => e.node));
    cursor = eventsPage.pageInfo.hasNextPage ? eventsPage.pageInfo.endCursor : null;
  } while (cursor);

  return allNodes.map(adaptZambaEvent).filter(Boolean);
}

const CODERE_NAV = "https://m.codere.com.co/NavigationService/Home/GetCountriesByDate";
const CODERE_SBS = "https://codere-sbs-co.azurewebsites.net/leagues";
const CODERE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://m.codere.com.co/deportesCol/",
};

export async function getCodereOdds() {
  const today = new Date();
  const dates = Array.from({ length: 9 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });

  // Step 1: collect all unique league NodeIds across all dates
  const leagueIdPages = await Promise.all(
    dates.map(date =>
      fetch(`${CODERE_NAV}?sportHandle=soccer&date=${date}`, { headers: CODERE_HEADERS })
        .then(r => r.json())
        .then(countries => countries.flatMap(c => c.Leagues?.map(l => l.NodeId) ?? []))
        .catch(() => [])
    )
  );
  const leagueIds = [...new Set(leagueIdPages.flat())];

  // Step 2: fetch events for each league in parallel
  const leagueResults = await Promise.all(
    leagueIds.map(id =>
      fetch(`${CODERE_SBS}/${id}/1/GetEventsByLeagueAndMarketId`, { headers: CODERE_HEADERS })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  );

  // Step 3: dedup by NodeId and adapt
  const seen = new Set();
  const allEvents = leagueResults.flat().filter(e => {
    if (seen.has(e.NodeId)) return false;
    seen.add(e.NodeId);
    return true;
  });

  return allEvents.map(adaptCodereEvent).filter(Boolean);
}

export async function getLuckiaOdds() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://www.luckia.co/apuestas/futbol/51/?date=sve", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const events = await page.evaluate(() => {
      const MONTHS = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12 };
      const now = new Date();

      function parseDate(text) {
        const m = text.trim().match(/(\d{1,2})\s+([a-z]+)/i);
        if (!m) return null;
        const mon = MONTHS[m[2].toLowerCase()];
        if (!mon) return null;
        const year = mon < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
        return year + "-" + String(mon).padStart(2, "0") + "-" + m[1].padStart(2, "0");
      }

      const results = [];
      for (const el of document.querySelectorAll("[data-event-url]")) {
        const url = el.getAttribute("data-event-url");
        const teamEls = el.querySelectorAll(".lp-event__team-name-text");
        if (teamEls.length < 2) continue;
        const home = teamEls[0].innerText.trim();
        const away = teamEls[1].innerText.trim();

        const dateEl = el.querySelector(".lp-event__extra-date");
        const date = dateEl ? parseDate(dateEl.innerText) : null;

        const pick1 = el.querySelector("[data-pick=\"1\"] .lp-event__pick-content");
        const pickX = el.querySelector("[data-pick=\"X\"] .lp-event__pick-content");
        const pick2 = el.querySelector("[data-pick=\"2\"] .lp-event__pick-content");

        const parseOdd = e => e ? parseFloat(e.innerText.trim().replace(",", ".")) : null;
        const local = parseOdd(pick1);
        const empate = parseOdd(pickX);
        const visitante = parseOdd(pick2);

        if (!local || !empate || !visitante || !date) continue;
        results.push({ home, away, date, local, empate, visitante, url });
      }
      return results;
    });

    return parseLuckiaDOM(events);
  } finally {
    await browser.close();
  }
}

export async function getWplayOdds() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://apuestas.wplay.co/es/s/FOOT/F%C3%BAtbol", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 10000));

    const events = await page.evaluate(() => {
      const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
                       Ene:1,Abr:4,Mayo:5,Ago:8,Dic:12 };

      function parseDate(text) {
        const m = text.match(/(\d{1,2})\s+([A-Za-z]+)/);
        if (!m) return null;
        const mon = MONTHS[m[2]] || MONTHS[m[2].slice(0,3)];
        if (!mon) return null;
        return "2026-" + String(mon).padStart(2,"0") + "-" + m[1].padStart(2,"0");
      }

      // Collect dates and names from event containers
      const evInfo = {};
      for (const el of document.querySelectorAll('[class*="ev ev-"]')) {
        const evMatch = el.className.match(/ev-(\d+)/);
        if (!evMatch) continue;
        const evId = evMatch[1];
        const dateEl = el.querySelector("span.date");
        const linkEl = el.querySelector('a[href*="/es/e/"]');
        if (!evInfo[evId]) {
          evInfo[evId] = {
            date: dateEl ? parseDate(dateEl.innerText.trim()) : "unknown",
            name: linkEl?.innerText?.trim() || null,
          };
        }
      }

      // Collect prices from non-inplay price buttons
      const evPrices = {};
      for (const el of document.querySelectorAll('[class*="ev-"][class*="mkt-"]')) {
        if (el.className.includes("inplay")) continue;
        const evMatch = el.className.match(/ev-(\d+)/);
        if (!evMatch) continue;
        const evId = evMatch[1];
        const lines = (el.innerText || "").trim().split("\n").map(l => l.trim()).filter(Boolean);
        const label = lines.find(l => !/^\d+[.,]?\d*$/.test(l));
        const priceStr = lines.find(l => /^\d+[.,]?\d*$/.test(l));
        if (!label || !priceStr) continue;
        if (!evPrices[evId]) evPrices[evId] = [];
        if (!evPrices[evId].find(e => e.label === label)) {
          evPrices[evId].push({ label, price: parseFloat(priceStr.replace(",", ".")) });
        }
      }

      // Combine: find home/draw/away by "Empate" separator
      const results = [];
      for (const [evId, prices] of Object.entries(evPrices)) {
        const empIdx = prices.findIndex(p => /empate/i.test(p.label));
        if (empIdx < 1 || empIdx >= prices.length - 1) continue;
        const local = prices[empIdx - 1];
        const draw = prices[empIdx];
        const visitante = prices[empIdx + 1];
        if (isNaN(local.price) || isNaN(draw.price) || isNaN(visitante.price)) continue;
        const info = evInfo[evId] || {};
        results.push({
          evId,
          name: info.name || (local.label + " vs " + visitante.label),
          date: info.date || "unknown",
          local: local.price,
          empate: draw.price,
          visitante: visitante.price,
        });
      }
      return results;
    });

    return parseWplayDOM(events);
  } finally {
    await browser.close();
  }
}
