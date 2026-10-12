// Holidays: which one (if any) is on, by the person's own calendar.
// The look for each one lives in render.js; this only knows the dates.

// Dates that follow the moon come from a table. Past the last year listed the
// holiday just doesn't show, so add new years here when they're published.
const LUNAR_NEW_YEAR = {   // [month, day]
  2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
  2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8]
};
const HANUKKAH = {         // the evening the first candle is lit
  2026: [12, 4], 2027: [12, 24], 2028: [12, 12], 2029: [12, 1], 2030: [12, 20]
};

// Western Easter Sunday (the anonymous Gregorian algorithm).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
// US Thanksgiving: the fourth Thursday of November.
function thanksgiving(y) {
  const first = new Date(y, 10, 1).getDay();
  return new Date(y, 10, 1 + ((4 - first + 7) % 7) + 21);
}
const fromTable = (table, y) => table[y] && new Date(y, table[y][0] - 1, table[y][1]);

// Each holiday shows from `from` days before its date to `to` days after.
// When two overlap, the first one listed wins.
export const HOLIDAYS = [
  { id: "newyear",      name: "New Year",         greet: "Happy New Year!",       date: y => new Date(y, 0, 1),   from: 1, to: 0 },
  { id: "christmas",    name: "Christmas",        greet: "Merry Christmas!",      date: y => new Date(y, 11, 25), from: 5, to: 1 },
  { id: "hanukkah",     name: "Hanukkah",         greet: "Happy Hanukkah!",       date: y => fromTable(HANUKKAH, y), from: 0, to: 7 },
  { id: "lunarnewyear", name: "Lunar New Year",   greet: "Happy Lunar New Year!", date: y => fromTable(LUNAR_NEW_YEAR, y), from: 0, to: 2 },
  { id: "valentine",    name: "Valentine's Day",  greet: "Happy Valentine's!",    date: y => new Date(y, 1, 14),  from: 1, to: 0 },
  { id: "stpatrick",    name: "St. Patrick's Day", greet: "Happy St. Patrick's!", date: y => new Date(y, 2, 17),  from: 0, to: 0 },
  { id: "easter",       name: "Easter",           greet: "Happy Easter!",         date: easter,                   from: 2, to: 0 },
  { id: "july4",        name: "the Fourth of July", greet: "Happy Fourth!",       date: y => new Date(y, 6, 4),   from: 1, to: 0 },
  { id: "halloween",    name: "Halloween",        greet: "Happy Halloween!",      date: y => new Date(y, 9, 31),  from: 6, to: 0 },
  { id: "thanksgiving", name: "Thanksgiving",     greet: "Happy Thanksgiving!",   date: thanksgiving,             from: 0, to: 1 }
];

// Calendar days from a to b, rounded so daylight saving days still count as one.
const dayDiff = (a, b) => Math.round((b - a) / 86400e3);

// The holiday on at time `now`, with how many days into it we are, or null.
// Windows can cross New Year's Day, so last year's and next year's dates are checked too.
export function holidayAt(now) {
  const d = new Date(now), today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  for (const h of HOLIDAYS) {
    for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
      const date = h.date(y);
      if (!date) continue;
      const off = dayDiff(date, today);
      if (off >= -h.from && off <= h.to) return { ...h, day: off + h.from };
    }
  }
  return null;
}
