// Pet engine: all the rules, no screen code.
// Every function takes the state (and the current time) as arguments,
// so the same code can run in the browser, in tests, or later on a server.

export const SAVE_VERSION = 3;
export const USER_NAME_MAX = 24;
export const HEART_MS = 12 * 3600e3;   // one heart fades every 12 hours
export const MAX_HEARTS = 4;
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
export const LONG_EVERY = 4;           // every 4th session earns a long break
export const STAGES = [
  { name: "egg", at: 0 }, { name: "baby", at: 1 }, { name: "kid", at: 4 },
  { name: "teen", at: 10 }, { name: "grown-up", at: 20 }
];

/* ---------- Dates ---------- */
// Local calendar day, e.g. "2026-10-5". Streaks follow the user's own calendar.
export function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
// Step back one calendar day with setDate (not "minus 24 hours"),
// so days that are 23 or 25 hours long (daylight saving changes) still work.
export function prevDayKey(t) {
  const d = new Date(t);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}
// Calendar days between two times: 11pm yesterday is 1 day ago at 9am today.
// Rounding absorbs the extra or missing hour on daylight saving days.
export function daysAgo(t, now) {
  const midnight = x => { const d = new Date(x); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  return Math.round((midnight(now) - midnight(t)) / 86400e3);
}

/* ---------- State ---------- */
export function createState(now, random = Math.random) {
  return {
    version: SAVE_VERSION,
    name: "", sessions: 0, minutes: 0,
    seed: newSeed(random),          // decides how this pet looks as it grows (see Looks)
    hearts: 3, heartsAt: now,
    streak: 0, lastDay: null, lastStudyAt: null,
    bestStreak: 0, firstStudyAt: null, grownAt: null,   // for the certificate
    userName: "", certSeen: false,     // userName: the person, used across the app and on the certificate
    length: 25, active: null, onBreak: null,
    notes: {},
    invite: null,          // extras from the person who invited them (see Invites below)
    days: {},              // minutes studied per calendar day, keyed by dayKey()
    settings: { sound: true, notify: false, awake: false, lastBackupAt: null }
  };
}

// Upgrade any older save to the current shape. Version 1 saves had no
// version number, no break mode, and no settings. Version 2 saves had no daily
// history, so their history starts empty (the totals are kept).
export function migrate(raw, now) {
  if (!raw || typeof raw !== "object") return createState(now);
  const s = Object.assign(createState(now), raw);
  s.notes = raw.notes && typeof raw.notes === "object" ? raw.notes : {};
  if (!Number.isInteger(s.seed) || s.seed < 0) s.seed = newSeed();   // older pets get their own look once
  s.invite = cleanInvite(raw.invite);
  // Saves from before the certificate: the best streak is at least the current one,
  // and an already grown pet counts as grown at its last session.
  s.bestStreak = Math.max(Number.isFinite(raw.bestStreak) ? raw.bestStreak : 0, Number.isFinite(raw.streak) ? raw.streak : 0);
  if (!Number.isFinite(s.firstStudyAt)) s.firstStudyAt = null;
  if (!Number.isFinite(s.grownAt)) s.grownAt = s.sessions >= STAGES[STAGES.length - 1].at ? (s.lastStudyAt || now) : null;
  // Older saves kept a name only on the certificate, or got one from an invite.
  const userName = [raw.userName, raw.certName, raw.invite && raw.invite.to].find(v => typeof v === "string" && v.trim());
  s.userName = userName ? userName.trim().slice(0, USER_NAME_MAX) : "";
  delete s.certName;
  s.days = {};
  if (raw.days && typeof raw.days === "object")
    for (const [k, v] of Object.entries(raw.days)) if (Number.isFinite(v) && v > 0) s.days[k] = v;
  s.settings = Object.assign(createState(now).settings, raw.settings || {});
  if (!raw.version) s.onBreak = null;
  s.version = SAVE_VERSION;
  return s;
}

/* ---------- Derived values (computed, never stored) ---------- */
export function heartsNow(s, now) {
  const faded = Math.floor((now - s.heartsAt) / HEART_MS);
  return Math.max(0, Math.min(MAX_HEARTS, s.hearts - faded));
}
export function stageIndex(s) {
  let i = 0;
  STAGES.forEach((st, k) => { if (s.sessions >= st.at) i = k; });
  return i;
}
// The streak counts if the last study day was today or yesterday.
export function streakNow(s, now) {
  if (!s.lastDay) return 0;
  return (s.lastDay === dayKey(now) || s.lastDay === prevDayKey(now)) ? s.streak : 0;
}
export function mood(s, now) {
  if (s.active) return "focus";
  if (s.onBreak) return "break";
  if (stageIndex(s) === 0) return "egg";
  const idle = s.lastStudyAt ? now - s.lastStudyAt : 0;
  const h = heartsNow(s, now);
  if (h === 0 || idle > 2 * 86400e3) return "sleepy";
  if (h === 1) return "hungry";
  return "happy";
}
/* ---------- Looks ---------- */
// Every pet gets a random seed when it's created. The seed picks one option per
// trait, and each growth stage shows off a new trait, so no two pets grow up the
// same way. The first option of each trait is the original look.
export const TRAITS = {
  shape:  ["round", "wide", "tall"],                         // from hatching
  marks:  ["plain", "spots", "belly", "stripes", "patch"],   // from hatching
  ears:   ["pointy", "round", "bunny", "antennae"],          // kid
  tail:   ["none", "curl", "fluffy", "zigzag"],              // teen
  topper: ["sprout", "leaves", "star", "curl"]               // grown-up
};
export const newSeed = (random = Math.random) => Math.floor(random() * 2 ** 32) >>> 0;

// mulberry32: a tiny seeded random generator, so a seed always gives the same pet.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function petLook(s) {
  const r = seeded(s.seed);
  const look = {};
  for (const [trait, options] of Object.entries(TRAITS)) look[trait] = options[Math.floor(r() * options.length)];
  return look;
}

// Words for the growth messages and the certificate.
const WORDS = {
  shape:  { round: "round", wide: "chubby", tall: "tall" },
  marks:  { plain: "", spots: "spotted", belly: "with a belly patch", stripes: "striped", patch: "with an eye patch" },
  ears:   { pointy: "pointy ears", round: "round ears", bunny: "long bunny ears", antennae: "little antennae" },
  tail:   { none: "", curl: "a curly tail", fluffy: "a fluffy tail", zigzag: "a zigzag tail" },
  topper: { sprout: "a sprout on top", leaves: "two leaves on top", star: "a star on top", curl: "a curl on top" }
};
// What's new at a stage, as a short phrase ("long bunny ears"), or "" when there's nothing to show.
export function newFeature(look, stage, puppy) {
  if (stage === 1) {
    const marks = WORDS.marks[look.marks];
    const adj = marks && !marks.startsWith("with") ? `${marks} ` : "";
    return `a ${adj}${WORDS.shape[look.shape]} ${puppy ? "puppy" : "one"}${marks.startsWith("with") ? " " + marks : ""}`;
  }
  if (stage === 2) return puppy ? "floppy ears" : WORDS.ears[look.ears];
  if (stage === 3) return WORDS.tail[look.tail];
  if (stage === 4) return WORDS.topper[look.topper];
  return "";
}
// The whole pet in one sentence, for the certificate: "A chubby, spotted pet with long bunny ears and a curly tail."
export function describeLook(look, puppy) {
  const marks = WORDS.marks[look.marks];
  const adjs = [WORDS.shape[look.shape], marks && !marks.startsWith("with") ? marks : ""].filter(Boolean).join(", ");
  const parts = [marks.startsWith("with") ? marks.slice(5) : "", puppy ? "floppy ears" : WORDS.ears[look.ears], WORDS.tail[look.tail], WORDS.topper[look.topper]].filter(Boolean);
  const list = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
  return `A ${adjs} ${puppy ? "puppy" : "pet"} with ${list}.`;
}

// A puppy only when the pet has one of the dog names.
export function isPuppy(s, dogNames) {
  return dogNames.includes(s.name.trim().toLowerCase());
}
export const accessory = s => (s.invite && s.invite.accessory) || null;
export function breakLength(sessions) {
  return sessions % LONG_EVERY === 0 ? LONG_BREAK : SHORT_BREAK;
}

/* ---------- Actions ---------- */
// unitMs is 60000 normally; test mode passes 1000 so "25 minutes" lasts 25 seconds.
export function startFocus(s, now, unitMs) {
  s.onBreak = null;
  s.active = { minutes: s.length, startedAt: now, endAt: now + s.length * unitMs, unitMs };
}
export function stopFocus(s) { s.active = null; }
export function endBreak(s) { s.onBreak = null; }

// Credit a finished session. Uses the session's own end time, so a session
// that finished while the laptop was closed still counts on the right day.
export function completeFocus(s, notesList) {
  const a = s.active;
  if (!a) return null;
  const t = a.endAt, before = stageIndex(s);
  s.active = null;
  s.sessions += 1;
  s.minutes += a.minutes;
  s.hearts = Math.min(MAX_HEARTS, heartsNow(s, t) + 2);
  s.heartsAt = t;
  const today = dayKey(t);
  s.days[today] = (s.days[today] || 0) + a.minutes;
  if (s.lastDay !== today) {
    s.streak = s.lastDay === prevDayKey(t) ? s.streak + 1 : 1;
    s.lastDay = today;
  } else if (!s.streak) s.streak = 1;
  s.lastStudyAt = t;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  if (!s.firstStudyAt) s.firstStudyAt = a.startedAt;
  const breakMinutes = breakLength(s.sessions);
  s.onBreak = { minutes: breakMinutes, endAt: t + breakMinutes * (a.unitMs || 60000) };
  const after = stageIndex(s);
  if (after === STAGES.length - 1 && !s.grownAt) s.grownAt = t;
  return { grewTo: after > before ? after : null, notes: unlockNotes(s, t, notesList), breakMinutes };
}

// Called many times a second. Returns an event when a timer runs out, else null.
export function tickState(s, now, notesList) {
  if (s.active && now >= s.active.endAt) {
    const r = completeFocus(s, notesList);
    r.breakSkipped = false;
    if (s.onBreak && now >= s.onBreak.endAt) { s.onBreak = null; r.breakSkipped = true; }
    return { type: "focusDone", ...r };
  }
  if (s.onBreak && now >= s.onBreak.endAt) {
    s.onBreak = null;
    return { type: "breakDone" };
  }
  return null;
}

/* ---------- History ---------- */
// The last 7 calendar days, oldest first, ending today.
export function lastWeek(s, now) {
  const out = [], d = new Date(now);
  d.setDate(d.getDate() - 6);
  for (let k = 0; k < 7; k++) {
    const key = dayKey(d.getTime());
    out.push({ key, time: d.getTime(), minutes: s.days[key] || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ---------- Notes ---------- */
export function noteMet(s, n, now) {
  const q = n.need;
  return (!q.sessions || s.sessions >= q.sessions)
      && (!q.streak   || streakNow(s, now) >= q.streak)
      && (!q.minutes  || s.minutes >= q.minutes);
}
export function unlockNotes(s, now, notesList) {
  const got = [];
  notesList.forEach(n => {
    if (!s.notes[n.id] && noteMet(s, n, now)) {
      s.notes[n.id] = { at: now, read: false };
      got.push(n);
    }
  });
  return got;
}
export function unreadNotes(s, notesList) {
  return notesList.filter(n => s.notes[n.id] && !s.notes[n.id].read).length;
}

/* ---------- Certificate ---------- */
// The long-term goal: sealed until the pet is fully grown, then a certificate
// of everything the person did to get there.
export function certificate(s, notesList) {
  const goal = STAGES[STAGES.length - 1].at;
  return {
    earned: !!s.grownAt, goal, progress: Math.min(s.sessions, goal),
    sessions: s.sessions, minutes: s.minutes, bestStreak: s.bestStreak,
    notes: notesList.filter(n => s.notes[n.id]).length, totalNotes: notesList.length,
    since: s.firstStudyAt, grownAt: s.grownAt
  };
}

/* ---------- Invites ---------- */
// An invite link brings someone to the app with extras chosen by the sender:
// a welcome card, a P.S. under any milestone note, a message sealed inside the
// certificate, and gifts for the pet. It all rides in the link's #fragment,
// which browsers never send to the server, so it stays between the two people.
export const INVITE_LIMITS = { name: 24, welcome: 280, ps: 200, letter: 400 };
export const ACCESSORIES = ["bow", "flower", "hat"];

// Keep only known fields, trimmed to the limits. With `notesList`, only P.S.
// lines for real milestones are kept. Returns null without a sender's name.
export function cleanInvite(raw, notesList) {
  if (!raw || typeof raw !== "object") return null;
  const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const from = text(raw.from, INVITE_LIMITS.name);
  if (!from) return null;
  const ps = {}, given = raw.ps && typeof raw.ps === "object" ? raw.ps : {};
  (notesList ? notesList.map(n => n.id) : Object.keys(given).slice(0, 20)).forEach(id => {
    const t = text(given[id], INVITE_LIMITS.ps);
    if (t) ps[id] = t;
  });
  return {
    from, to: text(raw.to, INVITE_LIMITS.name), welcome: text(raw.welcome, INVITE_LIMITS.welcome),
    ps, letter: text(raw.letter, INVITE_LIMITS.letter),
    accessory: ACCESSORIES.includes(raw.accessory) ? raw.accessory : null
  };
}

// Invite <-> link-safe text: base64url of UTF-8 JSON (any language and emoji
// work), with short keys and empty fields left out to keep links short.
const KEYS = [["from", "f"], ["to", "t"], ["welcome", "w"], ["ps", "p"], ["letter", "l"], ["accessory", "a"]];
export function encodeInvite(inv) {
  const short = { v: 2 };
  KEYS.forEach(([k, s]) => {
    const val = inv[k];
    if (val && !(typeof val === "object" && !Object.keys(val).length)) short[s] = val;
  });
  const bytes = new TextEncoder().encode(JSON.stringify(short));
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeInvite(code, notesList) {
  let raw = null;
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const short = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    raw = {};
    KEYS.forEach(([k, s]) => { raw[k] = short[s]; });
  } catch (e) { raw = null; }
  const inv = cleanInvite(raw, notesList);
  if (!inv) throw new Error("This invite link looks incomplete. Ask for the link again and copy all of it.");
  return inv;
}
export const sameInvite = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Accept an invite. Unlocked notes that gained a P.S. show as new again, and
// the invited person's name is filled in if they haven't given one.
export function applyInvite(s, inv) {
  s.invite = inv;
  Object.keys(inv.ps).forEach(id => { if (s.notes[id]) s.notes[id].read = false; });
  if (!s.userName && inv.to) s.userName = inv.to;
}
export const notePS = (s, n) => (s.invite && s.invite.ps[n.id]) || "";

/* ---------- Backup ---------- */
// Nudge for a backup when there's progress to lose, nothing promises to keep it
// (`kept`: the browser granted persistent storage, or the app is installed),
// and the last backup is a week old or missing.
export function needsBackup(s, now, kept) {
  if (s.sessions === 0 || kept) return false;
  return !s.settings.lastBackupAt || daysAgo(s.settings.lastBackupAt, now) >= 7;
}
export function exportBackup(s, now) {
  return JSON.stringify({ app: "study-pet", exportedAt: new Date(now).toISOString(), data: s }, null, 2);
}
function looksLikeSave(r) {
  return r && typeof r === "object"
    && [r.sessions, r.minutes, r.hearts, r.heartsAt].every(Number.isFinite)
    && r.sessions >= 0 && r.minutes >= 0;
}
export function importBackup(text, now) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { obj = null; }
  const raw = obj && obj.app === "study-pet" ? obj.data : null;
  if (!looksLikeSave(raw)) throw new Error("That doesn't look like a Study Pet backup. Check that you copied the whole thing.");
  const s = migrate(raw, now);
  s.active = null;    // never resume a half-finished timer from a backup
  s.onBreak = null;
  return s;
}
