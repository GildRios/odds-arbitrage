import { normalizeOddsData } from "../models/opportunity.js";

export function adaptCodereEvent(event) {
  if (event.isLive || !event.ParticipantHome || !event.ParticipantAway) return null;

  const games = event.Games;
  if (!games || games.length === 0) return null;

  const results = games[0].Results;
  if (!results || results.length !== 3) return null;

  const sorted = [...results].sort((a, b) => a.SortOrder - b.SortOrder);
  const [r1, rX, r2] = sorted;

  if (!r1?.Odd || !rX?.Odd || !r2?.Odd) return null;

  // StartDateFormatted: "DD/MM/YYYY HH:MM:SS"
  const parts = event.StartDateFormatted?.split(" ")[0]?.split("/");
  if (!parts || parts.length < 3) return null;
  const date = `${parts[2]}-${parts[1]}-${parts[0]}`;

  return normalizeOddsData({
    match: `${event.ParticipantHome} vs ${event.ParticipantAway}`,
    date,
    house: "Codere",
    odds: {
      local: r1.Odd,
      empate: rX.Odd,
      visitante: r2.Odd,
    },
    link: `https://www.codere.com.co/eventos-deportivos/${event.SportHandle}/${event.NodeId}`,
  });
}
