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

const fullInvite = {
  from: "Jamie", to: "Riley", welcome: "Made this for you 💜", ps: { hatch: "¡Lo lograste! 🎉", streak3: "Proud of you." },
  letter: "You did it. Dinner's on me.", accessory: "bow"
};

test("an invite survives the trip through a link, in any language", () => {
  const code = E.encodeInvite(fullInvite);
  assert.match(code, /^[A-Za-z0-9_-]+$/);                  // safe to put in a URL as-is
  assert.deepEqual(E.decodeInvite(code, NOTES), fullInvite);
});

test("a plain invite needs only the sender's name, and stays short", () => {
  const plain = E.cleanInvite({ from: "Sam" }, NOTES);
  assert.deepEqual(plain, { from: "Sam", to: "", welcome: "", ps: {}, letter: "", accessory: null });
  const code = E.encodeInvite(plain);
  assert.ok(code.length < 40, `${code.length} characters`);
  assert.deepEqual(E.decodeInvite(code, NOTES), plain);
});

test("a damaged or nameless invite link is rejected", () => {
  const good = E.encodeInvite(fullInvite);
  for (const bad of ["", "abc", good.slice(0, -8), E.encodeInvite({ ...fullInvite, from: "  " })]) {
    assert.throws(() => E.decodeInvite(bad, NOTES), /looks incomplete/, JSON.stringify(bad));
  }
});

test("invites are trimmed to the limits, and unknown extras are dropped", () => {
  const inv = E.cleanInvite({ from: "E".repeat(40), letter: "x".repeat(900), ps: { hatch: "y".repeat(300), made_up: "hi" },
                              puppy: true, accessory: "crown" }, NOTES);
  assert.equal(inv.from.length, E.INVITE_LIMITS.name);
  assert.equal(inv.letter.length, E.INVITE_LIMITS.letter);
  assert.equal(inv.ps.hatch.length, E.INVITE_LIMITS.ps);
  assert.equal(inv.ps.made_up, undefined);
  assert.equal("puppy" in inv, false);                     // only the dog names make a puppy
  assert.equal(inv.accessory, null);
});

test("accepting an invite adds P.S. lines, gifts and the person's name", () => {
  const s = E.createState(at(2026, 10, 1));
  s.name = "Pip";
  finishSession(s, at(2026, 10, 1, 10));
  s.notes.hatch.read = true;
  const hatch = NOTES.find(n => n.id === "hatch"), five = NOTES.find(n => n.id === "five");
  assert.equal(E.notePS(s, hatch), "");
  assert.equal(E.isPuppy(s, DOG_NAMES), false);

  E.applyInvite(s, fullInvite);
  assert.equal(E.notePS(s, hatch), "¡Lo lograste! 🎉");
  assert.equal(E.notePS(s, five), "");
  assert.equal(s.notes.hatch.read, false);                 // gained a P.S., so it's new again
  assert.equal(s.userName, "Riley");
  assert.equal(E.isPuppy(s, DOG_NAMES), false);             // invites never make a puppy
  assert.equal(E.accessory(s), "bow");
  const restored = E.importBackup(E.exportBackup(s, at(2026, 10, 1, 11)), at(2026, 10, 2));
  assert.deepEqual(restored.invite, s.invite);             // backups keep the invite
});

test("an invite doesn't overwrite the person's own name", () => {
  const s = E.createState(0);
  s.userName = "Ri";
  E.applyInvite(s, fullInvite);
  assert.equal(s.userName, "Ri");
});

test("older saves keep the person's name from the certificate or an invite", () => {
  const base = { version: 3, sessions: 2, minutes: 50, hearts: 2, heartsAt: 1 };
  assert.equal(E.migrate({ ...base, certName: " Riley " }, 0).userName, "Riley");
  assert.equal(E.migrate({ ...base, invite: { ...fullInvite, to: "Ri" } }, 0).userName, "Ri");
  assert.equal(E.migrate({ ...base, userName: "H", certName: "Other" }, 0).userName, "H");
  assert.equal(E.migrate(base, 0).userName, "");
  assert.equal("certName" in E.migrate({ ...base, certName: "x" }, 0), false);
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

test("the same seed always grows the same pet", () => {
  assert.deepEqual(E.petLook({ seed: 12345 }), E.petLook({ seed: 12345 }));
  const a = E.createState(0, () => 0.1), b = E.createState(0, () => 0.1);
  assert.equal(a.seed, b.seed);
});

test("pets come out in every variety, and differ from each other", () => {
  const seen = Object.fromEntries(Object.keys(E.TRAITS).map(k => [k, new Set()]));
  const looks = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const look = E.petLook({ seed: seed * 2654435761 >>> 0 });
    for (const [k, v] of Object.entries(look)) seen[k].add(v);
    looks.add(JSON.stringify(look));
  }
  for (const [k, options] of Object.entries(E.TRAITS)) assert.equal(seen[k].size, options.length, `every ${k} shows up`);
  assert.ok(looks.size > 250, `${looks.size} different pets out of 400`);
});

test("older pets get a look once, and keep it", () => {
  const old = E.migrate({ version: 3, sessions: 5, minutes: 125, hearts: 2, heartsAt: 1 }, 0);
  assert.ok(Number.isInteger(old.seed));
  assert.equal(E.migrate(JSON.parse(JSON.stringify(old)), 0).seed, old.seed);
});

test("each stage has words for what's new, and the certificate describes the whole pet", () => {
  const look = { shape: "wide", marks: "spots", ears: "bunny", tail: "curl", topper: "star" };
  assert.equal(E.newFeature(look, 1, false), "a spotted chubby one");
  assert.equal(E.newFeature(look, 2, false), "long bunny ears");
  assert.equal(E.newFeature(look, 2, true), "floppy ears");
  assert.equal(E.newFeature(look, 3, false), "a curly tail");
  assert.equal(E.newFeature(look, 4, false), "a star on top");
  assert.equal(E.newFeature({ ...look, tail: "none" }, 3, false), "");
  assert.equal(E.newFeature({ ...look, marks: "belly" }, 1, false), "a chubby one with a belly patch");
  assert.equal(E.describeLook(look, false), "A chubby, spotted pet with long bunny ears, a curly tail and a star on top.");
  assert.equal(E.describeLook({ ...look, marks: "patch", tail: "none" }, true), "A chubby puppy with an eye patch, floppy ears and a star on top.");
});

function grownPet() {
  const s = E.createState(at(2026, 10, 1), () => 0.25);
  s.name = "Mochi"; s.userName = "Riley";
  for (let i = 0; i < 20; i++) finishSession(s, at(2026, 10, 1 + Math.floor(i / 2), 9 + (i % 2)));
  return s;
}

test("a grown pet moves into the album and a new egg starts fresh", () => {
  const s = grownPet();
  const firstSeed = s.seed;
  E.startNewPet(s, "Bean", at(2026, 10, 11), NOTES, () => 0.75);
  assert.equal(s.album.length, 1);
  assert.equal(s.album[0].name, "Mochi");
  assert.equal(s.album[0].seed, firstSeed);
  assert.equal(s.album[0].sessions, 20);
  assert.equal(s.album[0].notes, 6);
  assert.equal(s.name, "Bean");
  assert.notEqual(s.seed, firstSeed);                    // a new look
  assert.equal(E.stageIndex(s), 0);                      // an egg again
  assert.deepEqual(s.notes, {});                         // notes can be earned again
  assert.equal(E.certificate(s, NOTES).earned, false);
  assert.equal(s.userName, "Riley");                     // the person, streak and history stay
  assert.equal(s.streak, 10);
  assert.ok(Object.keys(s.days).length > 0);
  assert.deepEqual(E.lifetime(s), { sessions: 20, minutes: 500 });
});

test("only a fully grown pet can move into the album", () => {
  const s = E.createState(0);
  assert.throws(() => E.startNewPet(s, "Bean", 0, NOTES), /fully grown/);
});

test("an inviter's P.S. and sealed message stay with the first pet's certificate", () => {
  const s = grownPet();
  E.applyInvite(s, fullInvite);
  E.startNewPet(s, "Bean", at(2026, 10, 11), NOTES);
  assert.equal(s.album[0].letter, fullInvite.letter);
  assert.equal(s.album[0].letterFrom, "Jamie");
  assert.equal(s.album[0].accessory, "bow");
  assert.deepEqual(s.invite.ps, {});
  assert.equal(s.invite.letter, "");
  assert.equal(E.accessory(s), "bow");                   // the gift accessory stays
});

test("the album survives saving and backups, and bad entries are dropped", () => {
  const s = grownPet();
  E.startNewPet(s, "Bean", at(2026, 10, 11), NOTES);
  const restored = E.importBackup(E.exportBackup(s, at(2026, 10, 12)), at(2026, 10, 12));
  assert.deepEqual(restored.album, s.album);
  const messy = E.migrate({ ...JSON.parse(JSON.stringify(s)), album: [s.album[0], { name: "x" }, null, "hi"] }, 0);
  assert.equal(messy.album.length, 1);
});

test("the daily goal counts today's sessions and says when it's reached", () => {
  const s = E.createState(at(2026, 10, 5, 8));
  assert.deepEqual(E.goalToday(s, at(2026, 10, 5, 9)), { goal: 2, done: 0, met: false });
  let ev = finishSession(s, at(2026, 10, 5, 10));
  assert.equal(ev.goalMet, false);
  ev = finishSession(s, at(2026, 10, 5, 11));
  assert.equal(ev.goalMet, true);                          // reached with this session
  ev = finishSession(s, at(2026, 10, 5, 12));
  assert.equal(ev.goalMet, false);                         // only celebrated once
  assert.deepEqual(E.goalToday(s, at(2026, 10, 5, 13)), { goal: 2, done: 3, met: true });
  assert.equal(E.goalToday(s, at(2026, 10, 6, 9)).done, 0);  // a new day starts at zero
  s.settings.goal = 0;
  assert.equal(E.goalToday(s, at(2026, 10, 5, 13)).met, false);
});

test("every 7 days in a row earns a rest day, up to 2", () => {
  const s = E.createState(at(2026, 10, 1));
  let earned = [];
  for (let d = 1; d <= 21; d++) earned.push(finishSession(s, at(2026, 10, d, 10)).restEarned);
  assert.deepEqual(earned.map((e, i) => (e ? i + 1 : 0)).filter(Boolean), [7, 14]);   // the 21st day would be a 3rd
  assert.equal(s.restDays, 2);
});

test("a rest day covers a missed day and keeps the streak going", () => {
  const s = E.createState(at(2026, 10, 1));
  for (let d = 1; d <= 7; d++) finishSession(s, at(2026, 10, d, 10));
  assert.equal(s.restDays, 1);
  assert.equal(E.streakNow(s, at(2026, 10, 9, 10)), 7);   // missed Oct 8, but a rest day is saved
  const ev = finishSession(s, at(2026, 10, 9, 10));
  assert.equal(ev.restUsed, 1);
  assert.equal(s.streak, 8);
  assert.equal(s.restDays, 0);
  finishSession(s, at(2026, 10, 12, 10));                 // missed two more with none saved
  assert.equal(s.streak, 1);
});

test("without rest days a missed day still ends the streak", () => {
  const s = E.createState(at(2026, 10, 1));
  finishSession(s, at(2026, 10, 1, 10));
  finishSession(s, at(2026, 10, 2, 10));
  assert.equal(E.streakNow(s, at(2026, 10, 4, 10)), 0);
  assert.equal(finishSession(s, at(2026, 10, 4, 10)).restUsed, 0);
  assert.equal(s.streak, 1);
});

test("long sessions grow bunny ears, and quick ones antennae, whatever the seed", () => {
  for (const [minutes, ears] of [[60, "bunny"], [15, "antennae"]]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = E.createState(at(2026, 10, 1)); s.seed = seed;
      for (let i = 0; i < 4; i++) finishSession(s, at(2026, 10, 1, 8 + i * 2), minutes);
      assert.equal(E.petLook(s).ears, ears, `${minutes}-minute sessions, seed ${seed}`);
    }
  }
});

test("habits are locked in when the stage arrives, and explained", () => {
  const s = E.createState(at(2026, 10, 1)); s.seed = 3;
  let ev;
  for (let i = 0; i < 4; i++) ev = finishSession(s, at(2026, 10, 1, 8 + i * 2), 60);
  assert.equal(ev.grewTo, 2);
  assert.equal(ev.growReason, "from all those long sessions");
  for (let i = 0; i < 6; i++) finishSession(s, at(2026, 10, 2, 8 + i), 15);   // later habits change...
  assert.equal(E.petLook(s).ears, "bunny");                                   // ...nothing already grown
});

test("a long streak earns a fluffy tail and a star", () => {
  const s = E.createState(at(2026, 10, 1)); s.seed = 3;
  let tail, top;
  for (let i = 0; i < 20; i++) {
    const ev = finishSession(s, at(2026, 10, 1 + Math.floor(i / 2), 9 + (i % 2)), 25);
    if (ev.grewTo === 3) tail = ev.growReason;
    if (ev.grewTo === 4) top = ev.growReason;
  }
  assert.equal(E.petLook(s).tail, "fluffy");
  assert.equal(tail, "from studying 5 days in a row");
  assert.equal(E.petLook(s).topper, "star");
  assert.equal(top, "for that 10-day streak");
});

test("the album keeps a pet's earned traits, and a new pet starts without them", () => {
  const s = E.createState(at(2026, 10, 1)); s.seed = 3; s.name = "Mochi";
  for (let i = 0; i < 20; i++) finishSession(s, at(2026, 10, 1 + Math.floor(i / 2), 9 + (i % 2)), 45);
  const look = E.petLook(s);
  E.startNewPet(s, "Bean", at(2026, 10, 12), NOTES);
  assert.deepEqual(E.petLook(s.album[0]), look);
  assert.deepEqual(s.traits, {});
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
