import { normalizeOddsData } from "../models/opportunity.js";


export function adaptBetplayEvent(liveEvent) {
  const { homeName, awayName, start } = liveEvent.event;

  if (!liveEvent.mainBetOffer?.outcomes) {
    return null;
  }

  const outcomes = liveEvent.mainBetOffer.outcomes;

  const local = outcomes.find(o => o.label === "1");
  const empate = outcomes.find(o => o.label === "X");
  const visitante = outcomes.find(o => o.label === "2");

  if (!local?.odds || !empate?.odds || !visitante?.odds) {
    return null;
  }


 return normalizeOddsData({
    match: `${homeName} vs ${awayName}`,
    date: start.split("T")[0],
    house: "Betplay",
    odds: {
      local: local.odds / 1000,
      empate: empate.odds / 1000,
      visitante: visitante.odds / 1000,
    },
    link: "https://betplay.com.co",
  });

}