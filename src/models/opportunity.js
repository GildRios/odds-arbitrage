// Parenthetical qualifiers added by some houses: (KWT), (KUW), (ARG), (W), (F), (Chivilcoy)…
const STRIP_PARENS = /\([^)]*\)/g;

// Club-type abbreviations that some houses include and others omit
const CLUB_ABBREVS = /\b(ac|afc|cd|cf|ca|cs|fk|fc|sc|sd|ud|ad|rc|rcd|ce|as|us|ss|dc|bk|if|ik|sk|sfc|lfc|af|ap)\b/gi;

// Generic words whose presence varies between sources
const NOISE_WORDS = /\b(club|deportes|deportivo|deportiva|de|del|da|do|dos)\b/gi;

function buildMatchKey(match, date) {
  return match
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics (Bélgica → Belgica)
    .replace(STRIP_PARENS, " ")         // remove (KWT), (ARG), (F), (Chivilcoy)…
    .replace(/[-''’]/g, " ")       // hyphen / apostrophe → space
    .replace(CLUB_ABBREVS, " ")         // FC, CA, CS, CD, SC, AS… → space
    .replace(NOISE_WORDS, " ")          // club, de, del, deportes… → space
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")        // strip any remaining non-alphanumeric
    .replace(/\s+/g, "")               // collapse all whitespace
    + "-" + date;
}

export function normalizeOddsData({ match, date, house, odds, link }) {
  return {
    matchKey: buildMatchKey(match, date),
    match,
    date,
    house,
    odds,
    link,
  };
}
