import test from "node:test";
import assert from "node:assert/strict";
import { holidayAt, HOLIDAYS } from "../src/holidays.js";

process.env.TZ = "America/Chicago";
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const on = (y, m, d, h) => (holidayAt(at(y, m, d, h)) || {}).id || null;

test("an ordinary day has no holiday", () => {
  assert.equal(on(2026, 10, 12), null);
  assert.equal(on(2026, 6, 1), null);
});

test("Halloween lasts its whole week, by the local calendar", () => {
  assert.equal(on(2026, 10, 24, 23), null);
  assert.equal(on(2026, 10, 25, 0), "halloween");
  assert.equal(on(2026, 10, 31, 23), "halloween");
  assert.equal(on(2026, 11, 1, 0), null);                   // the clocks change that night, too
});

test("New Year's crosses into January, and Christmas runs Dec 20 to 26", () => {
  assert.equal(on(2026, 12, 19), null);
  assert.equal(on(2026, 12, 20), "christmas");
  assert.equal(on(2026, 12, 26), "christmas");
  assert.equal(on(2026, 12, 31), "newyear");
  assert.equal(on(2027, 1, 1), "newyear");
  assert.equal(on(2027, 1, 2), null);
});

test("Easter and Thanksgiving move each year", () => {
  assert.equal(on(2026, 4, 3), "easter");                   // Easter 2026 is April 5
  assert.equal(on(2026, 4, 5), "easter");
  assert.equal(on(2026, 4, 6), null);
  assert.equal(on(2027, 3, 28), "easter");
  assert.equal(on(2026, 11, 26), "thanksgiving");           // fourth Thursdays
  assert.equal(on(2026, 11, 27), "thanksgiving");
  assert.equal(on(2027, 11, 25), "thanksgiving");
  assert.equal(on(2027, 11, 24), null);
});

test("Hanukkah counts its nights, and gives way to Christmas when they overlap", () => {
  assert.equal(on(2026, 12, 3), null);
  assert.equal(holidayAt(at(2026, 12, 4)).day, 0);          // first candle
  assert.equal(holidayAt(at(2026, 12, 11)).day, 7);         // eighth candle
  assert.equal(on(2026, 12, 12), null);
  assert.equal(on(2027, 12, 25), "christmas");              // 2027 starts Dec 24
  const h = holidayAt(at(2027, 12, 27));
  assert.equal(h.id, "hanukkah");
  assert.equal(h.day, 3);
});

test("Lunar New Year comes from the table, and the rest are fixed dates", () => {
  assert.equal(on(2027, 2, 6), "lunarnewyear");
  assert.equal(on(2027, 2, 8), "lunarnewyear");
  assert.equal(on(2027, 2, 9), null);
  assert.equal(on(2040, 2, 12), null);                      // past the table: just no holiday
  assert.equal(on(2026, 2, 13), "valentine");
  assert.equal(on(2026, 3, 17), "stpatrick");
  assert.equal(on(2026, 7, 4), "july4");
});

test("every holiday has a greeting and a name", () => {
  for (const h of HOLIDAYS) assert.ok(h.greet && h.name && h.id, h.id);
});
