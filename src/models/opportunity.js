export function normalizeOddsData({ match, date, house, odds, link }) {
  const matchKey = match
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "") + "-" + date;

  return {
    matchKey,
    match,
    date,
    house,
    odds,
    link,
  };
}