import { normalizeOddsData } from "../models/opportunity.js";

export function adaptSportiumMarket({ eventId, startTime, home, away, local, empate, visitante }) {
  const date = startTime.split("T")[0];
  return normalizeOddsData({
    match: home + " vs " + away,
    date,
    house: "Sportium",
    odds: { local, empate, visitante },
    link: "https://sports.sportium.com.co/sports/soccer/events/" + eventId,
  });
}
