// Pet engine: all the rules, no screen code.
// Every function takes the state (and the current time) as arguments,
// so the same code can run in the browser, in tests, or later on a server.

export const SAVE_VERSION = 2;
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

/* ---------- State ---------- */
export function createState(now) {
  return {
    version: SAVE_VERSION,
    name: "", sessions: 0, minutes: 0,
    hearts: 3, heartsAt: now,
    streak: 0, lastDay: null, lastStudyAt: null,
    length: 25, active: null, onBreak: null,
    notes: {},
    settings: { sound: true, notify: false, lastBackupAt: null }
  };
}

// Upgrade any older save to the current shape. Version 1 saves had no
// version number, no break mode, and no settings.
export function migrate(raw, now) {
  if (!raw || typeof raw !== "object") return createState(now);
  const s = Object.assign(createState(now), raw);
  s.notes = raw.notes && typeof raw.notes === "object" ? raw.notes : {};
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
  if (s.lastDay !== today) {
    s.streak = s.lastDay === prevDayKey(t) ? s.streak + 1 : 1;
    s.lastDay = today;
  } else if (!s.streak) s.streak = 1;
  s.lastStudyAt = t;
  const breakMinutes = breakLength(s.sessions);
  s.onBreak = { minutes: breakMinutes, endAt: t + breakMinutes * (a.unitMs || 60000) };
  const after = stageIndex(s);
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

/* ---------- Backup ---------- */
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
