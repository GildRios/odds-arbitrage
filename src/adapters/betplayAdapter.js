import { normalizeOddsData } from "../models/opportunity.js";

export function adaptBetplayEvent(event, house = "Betplay") {
  const { homeName, awayName, start, id, path, state } = event.event;

  if (state !== "NOT_STARTED") {
    return null;
  }

  if (path?.some(p => p.termKey === "esports_football")) {
    return null;
  }

  const betOffer = event.betOffers?.find(
    bo => bo.criterion?.label === "Resultado Final"
  );

  if (!betOffer?.outcomes) {
    return null;
  }

  const outcomes = betOffer.outcomes;
  const local = outcomes.find(o => o.label === "1");
  const empate = outcomes.find(o => o.label === "X");
  const visitante = outcomes.find(o => o.label === "2");

  if (!local?.odds || !empate?.odds || !visitante?.odds) {
    return null;
  }

  return normalizeOddsData({
    match: `${homeName} vs ${awayName}`,
    date: start.split("T")[0],
    house,
    odds: {
      local: local.odds / 1000,
      empate: empate.odds / 1000,
      visitante: visitante.odds / 1000,
    },
    link: house === "Rushbet"
      ? `https://rushbet.co/?page=sportsbook#/event/${id}`
      : `https://betplay.com.co/deportes#/event/${id}`,
  });
}
