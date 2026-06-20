import { normalizeOddsData } from "../models/opportunity.js";

export function parseWplayDOM(events) {
  return events
    .filter(e => e.date && e.date !== "unknown")
    .map(e => normalizeOddsData({
      match: e.name.replace(" v ", " vs "),
      date: e.date,
      house: "Wplay",
      odds: { local: e.local, empate: e.empate, visitante: e.visitante },
      link: `https://apuestas.wplay.co/es/e/${e.evId}`,
    }));
}
