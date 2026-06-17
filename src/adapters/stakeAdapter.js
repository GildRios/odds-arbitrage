import { normalizeOddsData } from "../models/opportunity.js";

export function adaptStakeEvent(event) {




  const { teams: { home: homeTeam, away: awayTeam }, date_start: eventDate } = event;

  if (!event.main_odds.main) {
    return null;
  }
  const outcomes = Object.values(event.main_odds.main);

  const local = outcomes.find(o => o.odd_code === "ODD_S1");
  const empate = outcomes.find(o => o.odd_code === "ODD_SX");
  const visitante = outcomes.find(o => o.odd_code === "ODD_S2");


 if (!local?.odd_value || !empate?.odd_value || !visitante?.odd_value) {
    return null;
  }
  return normalizeOddsData({
    match: `${homeTeam} vs ${awayTeam}`,
    date: eventDate.split("T")[0],
    house: "Stake",
    odds: {
      local: local.odd_value,
      empate: empate.odd_value,
      visitante: visitante.odd_value,
    },
    link: "https://stake.com",
  });   
}