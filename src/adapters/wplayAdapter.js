import { normalizeOddsData } from "../models/opportunity.js";

export function parseWplayData(data) {
  const events = {};

  for (const objects of Object.values(data.upds)) {
    const E = objects.find(o => o.obj_type === "E");
    const D = objects.find(o => o.obj_type === "D");
    const M = objects.find(o => o.obj_type === "M");
    const S = objects.find(o => o.obj_type === "S");
    const P = objects.find(o => o.obj_type === "P");

    if (!E || !D || !M || !S || !P) continue;

    const sport = E.data.find(d => d[0] === 12)?.[1];
    const period = D.data.find(d => d[0] === 5)?.[1];
    const mktType = M.data.find(d => d[0] === 13)?.[1];

    if (sport !== "FOOT" || period !== "pre_match" || mktType !== "MRES") continue;

    const eventId = E.data.find(d => d[0] === 6)?.[1];
    const eventName = E.data.find(d => d[0] === 7)?.[1];
    const eventDate = E.data.find(d => d[0] === 13)?.[1];
    const outcomeLabel = S.data.find(d => d[0] === 11)?.[1];
    const price = parseFloat(P.data.find(d => d[0] === 1)?.[1]);

    if (!eventId || !outcomeLabel || isNaN(price)) continue;

    if (!events[eventId]) {
      events[eventId] = { name: eventName, date: eventDate, prices: {} };
    }
    events[eventId].prices[outcomeLabel] = price;
  }

  return Object.entries(events)
    .filter(([, ev]) => ev.prices["1"] && ev.prices["X"] && ev.prices["2"])
    .map(([id, ev]) => {
      const match = ev.name.replace(" v ", " vs ");
      const date = ev.date.split(" ")[0];
      return normalizeOddsData({
        match,
        date,
        house: "Wplay",
        odds: {
          local: ev.prices["1"],
          empate: ev.prices["X"],
          visitante: ev.prices["2"],
        },
        link: `https://apuestas.wplay.co/es/e/${id}`,
      });
    });
}
