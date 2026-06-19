const CLUB_ABBREVS = /\b(ac|afc|cd|cf|ca|fk|fc|sc|sd|ud|ad|rc|rcd|ce|as|us|ss|dc|bk|if|ik|sk)\b/gi;

export function normalizeOddsData({ match, date, house, odds, link }) {
  const matchKey = match
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(CLUB_ABBREVS, "")
    .toLowerCase()
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
