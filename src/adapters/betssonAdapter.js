import { normalizeOddsData } from "../models/opportunity.js";

export function adaptBetssonEvent(event) {
  if (event.phase !== "Prematch") return null;

  const participants = event.participants ?? [];
  const home = participants.find(p => p.side === 1);
  const away = participants.find(p => p.side === 2);
  if (!home || !away) return null;

  const market = event.markets?.find(m => m.marketTemplateId === "MW3W" && m.sortOrder === 1);
  if (!market) return null;

  const homeSel = market.selections.find(s => s.selectionTemplateId === "HOME" && s.status === "Open");
  const drawSel = market.selections.find(s => s.selectionTemplateId === "DRAW" && s.status === "Open");
  const awaySel = market.selections.find(s => s.selectionTemplateId === "AWAY" && s.status === "Open");

  if (!homeSel?.odds || !drawSel?.odds || !awaySel?.odds) return null;

  const date = event.startDate?.split("T")[0];
  if (!date) return null;

  return normalizeOddsData({
    match: `${home.label} vs ${away.label}`,
    date,
    house: "Betsson",
    odds: { local: homeSel.odds, empate: drawSel.odds, visitante: awaySel.odds },
    link: `https://www.betsson.co/apuestas-deportivas/futbol/${event.neutralPath ?? event.id}`,
  });
}
