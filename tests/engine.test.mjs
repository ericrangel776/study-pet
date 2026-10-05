import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js";
import { NOTES } from "../src/config.js";

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
