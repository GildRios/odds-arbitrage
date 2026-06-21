import { normalizeOddsData } from "../models/opportunity.js";

export function adaptBwinFixture(fixture) {
  const parts = (fixture.participants ?? []).slice(0, 2);
  if (parts.length < 2) return null;

  const home = parts[0].name?.value;
  const away = parts[1].name?.value;
  if (!home || !away) return null;

  const date = fixture.startDate?.split("T")[0];
  if (!date) return null;

  const mkt1x2 = (fixture.optionMarkets ?? [])
    .find(m => m.name?.value === "Resultado del partido");
  if (!mkt1x2) return null;

  const opts = mkt1x2.options ?? [];
  const localOpt = opts.find(o => o.sourceName?.value === "1" && o.status === "Visible");
  const empateOpt = opts.find(o => o.name?.value === "X" && o.status === "Visible");
  const visOpt = opts.find(o => o.sourceName?.value === "2" && o.status === "Visible");

  if (!localOpt || !empateOpt || !visOpt) return null;

  const local = localOpt.price?.odds;
  const empate = empateOpt.price?.odds;
  const visitante = visOpt.price?.odds;
  if (!local || !empate || !visitante) return null;

  const homeSlug = home.toLowerCase().replace(/\s+/g, "-");
  const awaySlug = away.toLowerCase().replace(/\s+/g, "-");
  const link = `https://www.bwin.co/es/sports/eventos/${homeSlug}-${awaySlug}-${fixture.id}`;

  return normalizeOddsData({
    match: home + " vs " + away,
    date,
    house: "Bwin",
    odds: { local, empate, visitante },
    link,
  });
}
