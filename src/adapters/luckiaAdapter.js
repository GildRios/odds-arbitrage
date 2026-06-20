import { normalizeOddsData } from "../models/opportunity.js";

const MONTHS = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12 };

function parseDate(text) {
  const m = text.trim().match(/(\d{1,2})\s+([a-z]+)/i);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  const now = new Date();
  const year = mon < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  return year + "-" + String(mon).padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

export function parseLuckiaDOM(events) {
  return events
    .map(({ home, away, date, local, empate, visitante, url }) =>
      normalizeOddsData({
        match: `${home} vs ${away}`,
        date,
        house: "Luckia",
        odds: { local, empate, visitante },
        link: `https://www.luckia.co${url.split("?")[0]}`,
      })
    )
    .filter(Boolean);
}

export { parseDate };
