import { normalizeOddsData } from "../models/opportunity.js";

export function adaptRivaloFixture(fixture) {
  if (fixture.live || fixture.status !== "Active") return null;

  const competitors = fixture.competitors;
  if (!competitors || competitors.length < 2) return null;

  const market = fixture.markets?.find(m => m.type === "FOOTBALL_WINNER");
  if (!market) return null;

  const outcomes = market.outcomes ?? [];
  const homeOut = outcomes.find(o => o.value === "HOME" && o.status === "Active");
  const drawOut = outcomes.find(o => o.value === "DRAW" && o.status === "Active");
  const awayOut = outcomes.find(o => o.value === "AWAY" && o.status === "Active");

  if (!homeOut?.odds || !drawOut?.odds || !awayOut?.odds) return null;

  const homeName = competitors[0].name;
  const awayName = competitors[1].name;
  const date = fixture.startTime.split("T")[0];

  return normalizeOddsData({
    match: `${homeName} vs ${awayName}`,
    date,
    house: "Rivalo",
    odds: { local: homeOut.odds, empate: drawOut.odds, visitante: awayOut.odds },
    link: `https://www.rivalo.co/es/sportsbook/football/${fixture.id}`,
  });
}
