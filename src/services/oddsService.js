import { adaptBetplayEvent } from "../adapters/betplayAdapter.js";
import { adaptStakeEvent } from "../adapters/stakeAdapter.js";
import { parseWplayDOM } from "../adapters/wplayAdapter.js";
import { adaptZambaEvent } from "../adapters/zambaAdapter.js";
import { parseLuckiaDOM } from "../adapters/luckiaAdapter.js";
import { adaptCodereEvent } from "../adapters/codereAdapter.js";
import { adaptRivaloFixture } from "../adapters/rivaloAdapter.js";
import { adaptBetssonEvent } from "../adapters/betssonAdapter.js";
import { adaptSportiumMarket } from "../adapters/sportiumAdapter.js";
import { adaptBwinFixture } from "../adapters/bwinAdapter.js";
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
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 12000));

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

const BETSSON_URL = "https://www.betsson.co/api/sb/v1/events?categoryId=1";
const BETSSON_HEADERS = {
  "correlationid": "betsson-odds-fetch",
  "x-obg-channel": "Web",
  "x-sb-device-type": "Desktop",
  "x-sb-type": "b2b",
  "brandid": "6a6d80b9-16ac-4387-a413-244d93a74deb",
  "x-sb-jurisdiction": "Coljuegos",
  "x-sb-content-id": "2d543995-acff-41c1-bc73-9ec46bd70602",
  "x-sb-segment-id": "1a68008c-4da6-4f77-acbc-0614cb030d7d",
  "x-sb-currency-code": "COP",
  "x-sb-static-context-id": "stc--55774027",
  "x-sb-user-context-id": "stc--55774027",
  "x-sb-language-code": "co",
  "x-sb-channel": "Web",
  "marketcode": "co",
  "sessiontoken": "ew0KICAiYWxnIjogIkhTMjU2IiwNCiAgInR5cCI6ICJKV1QiDQp9.ew0KICAianVyaXNkaWN0aW9uIjogIlVua25vd24iLA0KICAidXNlcklkIjogIjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsDQogICJsb2dpblNlc3Npb25JZCI6ICIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiDQp9.yuBO_qNKJHtbCWK3z04cEqU59EKU8pZb2kXHhZ7IeuI",
  "x-sb-country-code": "CO",
  "x-sb-identifier": "EVENTS_REQUEST",
  "x-obg-device": "Desktop",
  "accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
  "Referer": "https://www.betsson.co/apuestas-deportivas",
};

async function fetchBetssonPage(n) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetch(`${BETSSON_URL}&pageNumber=${n}`, { headers: BETSSON_HEADERS })
        .then(r => r.json());
      if (data.events) return data.events;
    } catch {}
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  return [];
}

export async function getBetssonOdds() {
  const first = await fetch(BETSSON_URL, { headers: BETSSON_HEADERS }).then(r => r.json());
  const totalPages = first.totalPages ?? 1;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchBetssonPage(i + 2))
  );

  const allEvents = [...(first.events ?? []), ...remaining.flat()];
  return allEvents.map(adaptBetssonEvent).filter(Boolean);
}

export async function getRivaloOdds() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes("/api/offer/v4/competitions") && r.status() === 200,
        { timeout: 60000 }
      ),
      page.goto("https://www.rivalo.co/es/sportsbook/football", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }),
    ]);

    const data = await response.json();
    const competitions = data?.enriched ?? [];
    const fixtures = competitions.flatMap(comp => comp.fixtures ?? []);
    return fixtures.map(adaptRivaloFixture).filter(Boolean);
  } finally {
    await browser.close();
  }
}

const BWIN_ACCESSID = "NzAyNGFhZmYtY2UyNy00NWNjLThmODUtNWYwZDI1OGVmYWU0";
const BWIN_BASE = "https://www.bwin.co/cds-api/bettingoffer/fixtures";
const BWIN_QS = `?x-bwin-accessid=${BWIN_ACCESSID}&lang=es-419&country=CO&userCountry=CO` +
  "&fixtureTypes=Standard&state=PreMatch&offerMapping=Filtered&offerCategories=Gridable" +
  "&sportIds=4&statisticsModes=None&sortBy=StartDate";
const BWIN_HEADERS = {
  "Referer": "https://www.bwin.co/es/sports/futbol-4",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
};
const BWIN_PAGE_SIZE = 50;

async function fetchBwinPage(skip) {
  const url = `${BWIN_BASE}${BWIN_QS}&skip=${skip}&take=${BWIN_PAGE_SIZE}`;
  return fetch(url, { headers: BWIN_HEADERS }).then(r => r.json()).catch(() => ({ fixtures: [] }));
}

export async function getBwinOdds() {
  const now = new Date().toISOString();
  const first = await fetchBwinPage(0);
  const totalCount = first.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / BWIN_PAGE_SIZE);

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchBwinPage((i + 1) * BWIN_PAGE_SIZE))
  );

  const allFixtures = [...(first.fixtures ?? []), ...remaining.flatMap(p => p.fixtures ?? [])];

  return allFixtures
    .filter(f => f.startDate > now)
    .map(adaptBwinFixture)
    .filter(Boolean);
}

const SPORTIUM_WS_URL = "wss://sports.sportium.com.co/api/websocket";
const SPORTIUM_WS_HEADERS = {
  "Origin": "https://sports.sportium.com.co",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
  "Sec-WebSocket-Protocol": "v12.stomp, v11.stomp, v10.stomp",
};

function parseSportiumStompFrame(raw) {
  const str = raw.toString();
  const nullIdx = str.indexOf("\x00");
  const frameStr = nullIdx >= 0 ? str.substring(0, nullIdx) : str;
  const lines = frameStr.split("\n");
  const command = lines[0].trim();
  const headers = {};
  let bodyStart = 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "") { bodyStart = i + 1; break; }
    const colon = lines[i].indexOf(":");
    if (colon > 0) headers[lines[i].substring(0, colon)] = lines[i].substring(colon + 1).trim();
  }
  const body = lines.slice(bodyStart).join("\n").trim();
  return { command, headers, body };
}

function sportiumSub(ws, id, dest, extra = "") {
  ws.send(`SUBSCRIBE\nid:${id}\nlocale:es\n${extra}destination:${dest}\n\n\x00`);
}

export async function getSportiumOdds() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SPORTIUM_WS_URL, { headers: SPORTIUM_WS_HEADERS });
    const timeoutId = setTimeout(() => { ws.close(); reject(new Error("Sportium timeout")); }, 90000);

    const eventInfo = {};       // eventId -> { startTime }
    const marketToEvent = {};   // marketId -> eventId
    const pendingMarkets = new Set();
    const results = [];
    let eventsSubSent = false;
    let pendingEG = null; // Set of compIds, null until competitions arrive

    function finish() {
      clearTimeout(timeoutId);
      ws.close();
      resolve(results);
    }

    ws.addEventListener("open", () => {
      ws.send("CONNECT\nprotocol-version:1.5\naccept-version:1.2,1.1,1.0\nheart-beat:10000,10000\n\n\x00");
    });

    ws.addEventListener("message", e => {
      const frame = parseSportiumStompFrame(e.data);
      if (frame.command === "CONNECTED") {
        sportiumSub(ws, "rr", "/user/request-response");
        sportiumSub(ws, "/api/container/soccer-competitions", "/api/container/soccer-competitions");
        return;
      }
      if (frame.command !== "MESSAGE") return;

      const { id, type } = frame.headers;

      if (id === "/api/container/soccer-competitions") {
        const data = JSON.parse(frame.body);
        const compIds = data.items.flatMap(c => c.items.map(l => l.id));
        pendingEG = new Set(compIds);
        for (const compId of compIds) {
          const dest = `/api/eventgroups/${compId}-all-match-events`;
          sportiumSub(ws, dest, dest);
        }
        return;
      }

      if (id && id.startsWith("/api/eventgroups/")) {
        const compId = id.replace("/api/eventgroups/", "").replace("-all-match-events", "");
        pendingEG?.delete(compId);

        if (type !== "NOT_AVAILABLE" && frame.body) {
          try {
            const data = JSON.parse(frame.body);
            for (const group of (data.groups ?? [])) {
              for (const ev of (group.events ?? [])) {
                if (ev.id && ev.startTime) {
                  eventInfo[ev.id] = { startTime: ev.startTime };
                }
              }
            }
          } catch {}
        }

        if (pendingEG?.size === 0 && !eventsSubSent) {
          eventsSubSent = true;
          const allEventIds = Object.keys(eventInfo);
          if (allEventIds.length === 0) { finish(); return; }
          const mid = allEventIds.join(";") + ";";
          const key = allEventIds.join("-");
          sportiumSub(ws, "/api/events/multi", "/api/events/multi", `mid:${mid}\nkey:${key}\n`);
        }
        return;
      }

      if (id === "/api/events/multi") {
        if (!frame.body) return;
        try {
          const data = JSON.parse(frame.body);
          for (const [evId, evVal] of Object.entries(data)) {
            const mLines = evVal.s?.marketLines ?? {};
            const primaryId = mLines["0"]?.id;
            if (primaryId) {
              marketToEvent[primaryId] = evId;
              pendingMarkets.add(primaryId);
              sportiumSub(ws, `/api/markets/${primaryId}`, `/api/markets/${primaryId}`);
            }
          }
        } catch {}
        if (pendingMarkets.size === 0) finish();
        return;
      }

      if (id && id.startsWith("/api/markets/")) {
        const marketId = id.replace("/api/markets/", "");
        pendingMarkets.delete(marketId);

        if (type !== "NOT_AVAILABLE" && frame.body) {
          try {
            const data = JSON.parse(frame.body);
            if (data.typeCategory === "TEAM_HDA") {
              const sel = data.selections ?? [];
              const local = sel.find(s => s.type === "1" && s.status === "ACTIVE" && !s.disabled);
              const empate = sel.find(s => s.type === "X" && s.status === "ACTIVE" && !s.disabled);
              const visitante = sel.find(s => s.type === "2" && s.status === "ACTIVE" && !s.disabled);
              const evId = marketToEvent[marketId];
              const { startTime } = eventInfo[evId] ?? {};
              if (local && empate && visitante && startTime) {
                const adapted = adaptSportiumMarket({
                  eventId: evId,
                  startTime,
                  home: local.name,
                  away: visitante.name,
                  local: parseFloat(local.prices?.[0]?.decimalLabel),
                  empate: parseFloat(empate.prices?.[0]?.decimalLabel),
                  visitante: parseFloat(visitante.prices?.[0]?.decimalLabel),
                });
                if (adapted) results.push(adapted);
              }
            }
          } catch {}
        }

        if (pendingMarkets.size === 0) finish();
        return;
      }
    });

    ws.addEventListener("error", () => { clearTimeout(timeoutId); ws.close(); reject(new Error("Sportium WS error")); });
    ws.addEventListener("close", e => { if (e.code !== 1000 && e.code !== 1001) { clearTimeout(timeoutId); reject(new Error(`Sportium WS closed: ${e.code}`)); } });
  });
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
