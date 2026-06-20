import { normalizeOddsData } from "../models/opportunity.js";

export function adaptZambaEvent(node) {
  if (!node || node.hasEnded || node.isLive || !node.offerActive) return null;

  const homeComp = node.competitors?.find(c => c.homeAway === "Home");
  const awayComp = node.competitors?.find(c => c.homeAway === "Away");
  if (!homeComp || !awayComp) return null;

  const homeName = homeComp.competitorName;
  const awayName = awayComp.competitorName;

  const market = node.markets?.find(m =>
    m.marketDefaultName === "Match winner" && m.selections?.length === 3
  );
  if (!market) return null;

  const activeSelections = market.selections.filter(s => s.status === "Active" && s.price > 0);
  if (activeSelections.length !== 3) return null;

  const localSel = activeSelections.find(s => s.selectionDefaultName === homeName);
  const visitanteSel = activeSelections.find(s => s.selectionDefaultName === awayName);
  const empateSel = activeSelections.find(
    s => s.selectionDefaultName !== homeName && s.selectionDefaultName !== awayName
  );

  if (!localSel || !visitanteSel || !empateSel) return null;

  return normalizeOddsData({
    match: `${homeName} vs ${awayName}`,
    date: node.utcStartDate.split("T")[0],
    house: "Zamba",
    odds: {
      local: localSel.price,
      empate: empateSel.price,
      visitante: visitanteSel.price,
    },
    link: `https://www.zamba.co/es/sports/event/${node.eventId}`,
  });
}
