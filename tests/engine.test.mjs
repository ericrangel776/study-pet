import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js";
import { NOTES, DOG_NAMES } from "../src/config.js";

// Run every test in a time zone with daylight saving, so date bugs show up.
process.env.TZ = "America/Chicago";

const MIN = 60000, HOUR = 3600e3;
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

// Helper: run one full focus session that ends at `endAt`.
function finishSession(s, endAt, minutes = 25) {
  s.length = minutes;
  E.startFocus(s, endAt - minutes * MIN, MIN);
  return E.tickState(s, endAt, NOTES);
}

test("a new pet is an egg with 3 hearts", () => {
  const s = E.createState(at(2026, 10, 5));
  assert.equal(E.stageIndex(s), 0);
  assert.equal(E.heartsNow(s, at(2026, 10, 5)), 3);
  assert.equal(E.mood(s, at(2026, 10, 5)), "egg");
});

test("hearts fade one per 12 hours and never go below zero", () => {
  const t = at(2026, 10, 5);
  const s = E.createState(t);
  assert.equal(E.heartsNow(s, t + 12 * HOUR), 2);
  assert.equal(E.heartsNow(s, t + 36 * HOUR), 0);
  assert.equal(E.heartsNow(s, t + 999 * HOUR), 0);
});

test("finishing a session adds two hearts, capped at four", () => {
  const s = E.createState(at(2026, 10, 5, 9));
  finishSession(s, at(2026, 10, 5, 10));
  assert.equal(E.heartsNow(s, at(2026, 10, 5, 10)), 4);
});

test("the first session hatches the egg", () => {
  const s = E.createState(at(2026, 10, 5, 9));
  const ev = finishSession(s, at(2026, 10, 5, 10));
  assert.equal(ev.type, "focusDone");
  assert.equal(ev.grewTo, 1);
});

test("stages grow at 1, 4, 10 and 20 sessions", () => {
  const s = E.createState(0);
  const expect = { 0: 0, 1: 1, 3: 1, 4: 2, 9: 2, 10: 3, 19: 3, 20: 4, 50: 4 };
  for (const [n, stage] of Object.entries(expect)) {
    s.sessions = +n;
    assert.equal(E.stageIndex(s), stage, `${n} sessions`);
  }
});

test("studying on consecutive days builds a streak", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 20));
  finishSession(s, at(2026, 10, 2, 9));
  finishSession(s, at(2026, 10, 3, 23, 50));
  assert.equal(E.streakNow(s, at(2026, 10, 3, 23, 55)), 3);
});

test("two sessions on the same day count once", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  finishSession(s, at(2026, 10, 1, 15));
  assert.equal(s.streak, 1);
  assert.equal(s.sessions, 2);
});

test("missing a day restarts the streak at 1", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  finishSession(s, at(2026, 10, 2, 10));
  finishSession(s, at(2026, 10, 4, 10));
  assert.equal(s.streak, 1);
});

test("the streak still shows the next day, then drops to 0", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  assert.equal(E.streakNow(s, at(2026, 10, 2, 22)), 1);
  assert.equal(E.streakNow(s, at(2026, 10, 3, 1)), 0);
});

test("the streak survives the start of daylight saving time", () => {
  // Clocks spring forward on Mar 8, 2026, so that day is only 23 hours long.
  // "Now minus 24 hours" from 00:30 on Mar 9 lands at 23:30 on Mar 7,
  // skipping Mar 8 entirely and wrongly breaking the streak.
  // prevDayKey() steps back with setDate(), which always lands on the previous calendar day.
  const s = E.createState(at(2026, 3, 7));
  finishSession(s, at(2026, 3, 7, 0, 30));
  finishSession(s, at(2026, 3, 8, 0, 30));
  finishSession(s, at(2026, 3, 9, 0, 30));
  assert.equal(s.streak, 3);
});

test("the streak survives the end of daylight saving time", () => {
  // Clocks fall back on Nov 1, 2026, so that day is 25 hours long.
  const s = E.createState(at(2026, 10, 31));
  finishSession(s, at(2026, 10, 31, 0, 30));
  finishSession(s, at(2026, 11, 1, 0, 30));
  finishSession(s, at(2026, 11, 2, 0, 30));
  assert.equal(s.streak, 3);
});

test("a break starts after each session, with a long break every 4th", () => {
  const s = E.createState(at(2026, 10, 5, 8));
  const lengths = [];
  for (let i = 0; i < 4; i++) {
    const ev = finishSession(s, at(2026, 10, 5, 9 + i));
    lengths.push(ev.breakMinutes);
    E.endBreak(s);
  }
  assert.deepEqual(lengths, [5, 5, 5, 15]);
});

test("a break ends on its own", () => {
  const s = E.createState(at(2026, 10, 5, 8));
  finishSession(s, at(2026, 10, 5, 9));
  assert.equal(E.mood(s, at(2026, 10, 5, 9, 1)), "break");
  assert.equal(E.tickState(s, at(2026, 10, 5, 9, 2), NOTES), null);
  assert.equal(E.tickState(s, at(2026, 10, 5, 9, 5), NOTES).type, "breakDone");
  assert.equal(s.onBreak, null);
});

test("stopping early gives no credit", () => {
  const s = E.createState(at(2026, 10, 5, 8));
  E.startFocus(s, at(2026, 10, 5, 9), MIN);
  E.stopFocus(s);
  assert.equal(E.tickState(s, at(2026, 10, 5, 11), NOTES), null);
  assert.equal(s.sessions, 0);
});

test("a session that ends while the laptop is closed counts on the day it ended", () => {
  const s = E.createState(at(2026, 10, 5, 8));
  s.length = 25;
  E.startFocus(s, at(2026, 10, 5, 23, 30), MIN);          // ends 23:55 on Oct 5
  const ev = E.tickState(s, at(2026, 10, 6, 9), NOTES);    // opened the next morning
  assert.equal(s.lastDay, E.dayKey(at(2026, 10, 5)));
  assert.equal(ev.breakSkipped, true);                     // the break is long over
  assert.equal(s.onBreak, null);
});

test("notes unlock at their milestones, once", () => {
  const s = E.createState(at(2026, 10, 1));
  let ev = finishSession(s, at(2026, 10, 1, 10));
  assert.deepEqual(ev.notes.map(n => n.id), ["hatch"]);
  ev = finishSession(s, at(2026, 10, 1, 11));
  assert.deepEqual(ev.notes, []);
  finishSession(s, at(2026, 10, 2, 10));
  ev = finishSession(s, at(2026, 10, 3, 10));
  assert.ok(ev.notes.some(n => n.id === "streak3"));
  assert.equal(E.unreadNotes(s, NOTES), 2);
});

test("old version 1 saves upgrade cleanly", () => {
  const v1 = { name: "Pip", sessions: 6, minutes: 150, hearts: 2, heartsAt: 1, streak: 2,
               lastDay: "2026-10-4", lastStudyAt: 1, length: 25, active: null };
  const s = E.migrate(v1, at(2026, 10, 5));
  assert.equal(s.version, E.SAVE_VERSION);
  assert.equal(s.name, "Pip");
  assert.equal(s.sessions, 6);
  assert.deepEqual(s.notes, {});
  assert.equal(s.settings.sound, true);
  assert.equal(s.onBreak, null);
});

test("a backup restores the same progress", () => {
  const s = E.createState(at(2026, 10, 1));
  s.name = "Pip";
  finishSession(s, at(2026, 10, 1, 10));
  const restored = E.importBackup(E.exportBackup(s, at(2026, 10, 1, 11)), at(2026, 10, 2));
  assert.equal(restored.name, "Pip");
  assert.equal(restored.sessions, 1);
  assert.deepEqual(restored.notes, s.notes);
  assert.equal(restored.onBreak, null);
});

test("history records minutes on the day each session ended", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10), 25);
  finishSession(s, at(2026, 10, 1, 15), 45);
  finishSession(s, at(2026, 10, 2, 0, 10), 15);   // started Oct 1, ended after midnight
  assert.deepEqual(s.days, { "2026-10-1": 70, "2026-10-2": 15 });
});

test("the last week is 7 calendar days ending today, even across a clock change", () => {
  const s = E.createState(at(2026, 11, 1));
  finishSession(s, at(2026, 10, 31, 20), 25);
  finishSession(s, at(2026, 11, 3, 9), 60);
  const week = E.lastWeek(s, at(2026, 11, 3, 0, 30));    // clocks fell back on Nov 1
  assert.deepEqual(week.map(d => d.key), ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-1", "2026-11-2", "2026-11-3"]);
  assert.deepEqual(week.map(d => d.minutes), [0, 0, 0, 25, 0, 0, 60]);
});

test("older saves get an empty history, and bad history entries are dropped", () => {
  const v2 = { version: 2, sessions: 3, minutes: 75, hearts: 2, heartsAt: 1 };
  assert.deepEqual(E.migrate(v2, at(2026, 10, 5)).days, {});
  const messy = { ...v2, days: { "2026-10-4": 25, "2026-10-5": "lots", "2026-10-6": -5 } };
  assert.deepEqual(E.migrate(messy, at(2026, 10, 5)).days, { "2026-10-4": 25 });
});

test("history survives a backup and restore", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  const restored = E.importBackup(E.exportBackup(s, at(2026, 10, 1, 11)), at(2026, 10, 2));
  assert.deepEqual(restored.days, s.days);
});

test("a backup nudge appears only when progress could be lost", () => {
  const now = at(2026, 10, 12);
  const s = E.createState(at(2026, 10, 1));
  assert.equal(E.needsBackup(s, now, false), false);               // nothing to lose yet
  finishSession(s, at(2026, 10, 1, 10));
  assert.equal(E.needsBackup(s, now, false), true);                // never backed up
  assert.equal(E.needsBackup(s, now, true), false);                // the browser keeps the data
  s.settings.lastBackupAt = at(2026, 10, 6, 20);
  assert.equal(E.needsBackup(s, now, false), false);               // 6 days ago
  s.settings.lastBackupAt = at(2026, 10, 5, 8);
  assert.equal(E.needsBackup(s, now, false), true);                // 7 days ago
});

test("a friend's notes survive the trip through a link, in any language", () => {
  const gift = { from: "Eric", notes: { hatch: "You did it! 🎉", streak3: "¡Tres días seguidos!" } };
  const code = E.encodeGift(gift);
  assert.match(code, /^[A-Za-z0-9_-]+$/);                  // safe to put in a URL as-is
  assert.deepEqual(E.decodeGift(code, NOTES), gift);
});

test("a damaged or empty notes link is rejected", () => {
  const good = E.encodeGift({ from: "Eric", notes: { hatch: "Hi" } });
  for (const bad of ["", "abc", good.slice(0, -6), E.encodeGift({ from: "", notes: { hatch: "Hi" } }),
                     E.encodeGift({ from: "Eric", notes: { hatch: "   " } })]) {
    assert.throws(() => E.decodeGift(bad, NOTES), /looks incomplete/, JSON.stringify(bad));
  }
});

test("gift notes are trimmed to the limits and unknown milestones are dropped", () => {
  const raw = { from: "  " + "E".repeat(40), notes: { hatch: "x".repeat(400), made_up: "hello" } };
  const gift = E.cleanGift(raw, NOTES);
  assert.equal(gift.from.length, E.GIFT_LIMITS.from);
  assert.equal(gift.notes.hatch.length, E.GIFT_LIMITS.note);
  assert.equal(gift.notes.made_up, undefined);
});

test("using a friend's notes swaps the text and marks rewritten notes as new", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  s.notes.hatch.read = true;
  const hatch = NOTES.find(n => n.id === "hatch"), five = NOTES.find(n => n.id === "five");
  assert.equal(E.noteText(s, hatch), hatch.text);

  E.applyGift(s, { from: "Eric", notes: { hatch: "Proud of you!" } });
  assert.equal(E.noteText(s, hatch), "Proud of you!");
  assert.equal(E.noteText(s, five), five.text);            // blank notes fall back to the pet's own
  assert.equal(s.notes.hatch.read, false);
  const restored = E.importBackup(E.exportBackup(s, at(2026, 10, 1, 11)), at(2026, 10, 2));
  assert.deepEqual(restored.gift, s.gift);                 // backups keep the friend's notes
});

test("pets named Lila or Daisy, in any capitalization, are puppies", () => {
  const s = E.createState(0);
  for (const [name, puppy] of [["Lila", true], ["DAISY", true], ["  daisy ", true], ["Lilac", false], ["Pip", false], ["", false]]) {
    s.name = name;
    assert.equal(E.isPuppy(s, DOG_NAMES), puppy, JSON.stringify(name));
  }
});

test("the certificate stays sealed until the pet is fully grown", () => {
  const s = E.createState(at(2026, 10, 1));
  for (let i = 0; i < 19; i++) finishSession(s, at(2026, 10, 1 + Math.floor(i / 3), 9 + (i % 3)));
  let c = E.certificate(s, NOTES);
  assert.equal(c.earned, false);
  assert.equal(c.progress, 19);
  assert.equal(c.goal, 20);

  finishSession(s, at(2026, 10, 8, 9));
  c = E.certificate(s, NOTES);
  assert.equal(c.earned, true);
  assert.equal(c.grownAt, at(2026, 10, 8, 9));
  assert.equal(c.since, at(2026, 10, 1, 9) - 25 * MIN);   // when the first session started
  assert.equal(c.sessions, 20);
  assert.equal(c.bestStreak, 8);
  assert.equal(c.notes, 6);                               // 20 sessions, 500 minutes and 8 days unlock them all
});

test("the best streak is kept after a streak ends", () => {
  const s = E.createState(at(2026, 10, 1));
  [1, 2, 3, 4].forEach(d => finishSession(s, at(2026, 10, d, 10)));
  finishSession(s, at(2026, 10, 9, 10));
  assert.equal(s.streak, 1);
  assert.equal(s.bestStreak, 4);
});

test("saves from before the certificate get sensible values", () => {
  const grown = E.migrate({ version: 3, sessions: 25, minutes: 600, hearts: 2, heartsAt: 1, streak: 3, lastStudyAt: 1234 }, at(2026, 10, 5));
  assert.equal(grown.grownAt, 1234);
  assert.equal(grown.bestStreak, 3);
  assert.equal(E.certificate(grown, NOTES).earned, true);
  const young = E.migrate({ version: 3, sessions: 4, minutes: 100, hearts: 2, heartsAt: 1 }, at(2026, 10, 5));
  assert.equal(young.grownAt, null);
});

test("days ago counts calendar days, not 24-hour periods", () => {
  assert.equal(E.daysAgo(at(2026, 10, 5, 9), at(2026, 10, 5, 22)), 0);
  assert.equal(E.daysAgo(at(2026, 10, 4, 23), at(2026, 10, 5, 9)), 1);
  assert.equal(E.daysAgo(at(2026, 3, 7, 12), at(2026, 3, 9, 12)), 2);    // across spring forward
  assert.equal(E.daysAgo(at(2026, 10, 31, 12), at(2026, 11, 2, 12)), 2); // across fall back
});

test("anything that isn't a backup is rejected", () => {
  for (const bad of ["", "hello", "{}", '{"app":"study-pet","data":{"sessions":"lots"}}', "[1,2,3]"]) {
    assert.throws(() => E.importBackup(bad, 0), /doesn't look like/);
  }
});
