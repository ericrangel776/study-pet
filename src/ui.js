// UI: connects the engine, storage, renderer and alerts to the page.

import { PERSONAL, NOTES, LENGTHS } from "./config.js";
import { STAGES, migrate, createState, heartsNow, stageIndex, streakNow, mood, startFocus, stopFocus, tickState, unlockNotes, unreadNotes, exportBackup, importBackup, dayKey } from "./engine.js";
import { localStore } from "./storage.js";
import { draw, HATCH_MS } from "./render.js";
import { unlockAudio, playChime, notifySupported, requestNotify, sendNotification, flashTitle, stopFlash, isFlashing } from "./alerts.js";

const $ = id => document.getElementById(id);
const store = localStore;
let state = migrate(store.load(), Date.now());
const save = () => store.save(state);

const canvas = $("screen"), ctx = canvas.getContext("2d");
const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
let testMode = false, patAt = 0, hatchAt = 0, growAt = 0, stopArmed = 0, resetArmed = 0;
let downloads = null, notesSig = "";
const unitMs = () => (testMode ? 1000 : 60000);

const MOOD_TEXT = {
  egg: "Study once to hatch", happy: "Happy", hungry: "Hungry, time to study",
  sleepy: "Sleepy, misses you", focus: "Studying with you", break: "Break time, play!"
};
const nameOr = () => state.name || "Your pet";
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function ago(t) {
  if (!t) return null;
  const days = Math.floor((Date.now() - t) / 86400e3);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
const say = t => { $("msg").textContent = t; };

/* ---------- Timer events ---------- */
function alertUser(title, body, tones) {
  if (state.settings.sound) playChime(tones);
  if (document.hidden) {
    if (state.settings.notify) sendNotification(title, body);
    flashTitle(title, "Study Pet");
  }
}
function handleEvent(ev) {
  if (!ev) return;
  if (ev.type === "focusDone") {
    let text;
    if (ev.grewTo === 1) { hatchAt = Date.now(); text = `${nameOr()} hatched!`; }
    else if (ev.grewTo) { growAt = Date.now(); text = `${nameOr()} grew into a ${STAGES[ev.grewTo].name}!`; }
    else text = `Session done. ${nameOr()} had a snack.`;
    if (ev.notes.length) text += ` You unlocked ${ev.notes.length === 1 ? "a note" : ev.notes.length + " notes"} from ${PERSONAL.from}.`;
    if (!ev.breakSkipped) text += ` Enjoy a ${ev.breakMinutes}-minute break.`;
    say(text);
    alertUser("Session complete!", text, [660, 880, 1320]);
  } else if (ev.type === "breakDone") {
    const text = `Break's over. ${nameOr()} is ready when you are.`;
    say(text);
    alertUser("Break's over", text, [880, 660]);
  }
  save();
}

/* ---------- Rendering ---------- */
function renderNotes() {
  const sig = JSON.stringify(state.notes);
  if (sig === notesSig) return;      // only rebuild when notes change, so buttons keep focus
  notesSig = sig;
  $("notesTitle").textContent = `Notes from ${PERSONAL.from}`;
  const ul = $("notesList");
  ul.innerHTML = "";
  NOTES.forEach(n => {
    const li = document.createElement("li"), got = state.notes[n.id];
    if (got) {
      const b = document.createElement("button");
      b.className = "note-btn";
      const label = document.createElement("span");
      label.textContent = n.hint;
      b.appendChild(label);
      if (!got.read) { const nb = document.createElement("span"); nb.className = "new"; nb.textContent = "New"; b.appendChild(nb); }
      b.addEventListener("click", () => openNote(n));
      li.appendChild(b);
    } else {
      const s = document.createElement("span");
      s.className = "locked";
      s.textContent = `Locked: ${n.hint.toLowerCase()}`;
      li.appendChild(s);
    }
    ul.appendChild(li);
  });
}

function render() {
  const now = Date.now(), m = mood(state, now), st = stageIndex(state);
  const unread = unreadNotes(state, NOTES);
  draw(ctx, { now, mood: m, stage: st, hearts: heartsNow(state, now), unread, hatchAt, growAt, patAt, rm: RM });
  canvas.setAttribute("aria-label", `${nameOr()}, ${STAGES[st].name}, ${MOOD_TEXT[m].toLowerCase()}${unread ? ", new note waiting" : ""}`);

  let title = "Study Pet";
  if (state.active) {
    const left = fmt(state.active.endAt - now);
    $("big").textContent = left; title = `${left} Study Pet`;
  } else if (state.onBreak) {
    const left = fmt(state.onBreak.endAt - now);
    $("big").textContent = left; title = `${left} Break`;
  } else {
    $("big").textContent = nameOr();
  }
  if (!isFlashing()) document.title = title;
  $("small").textContent = now - hatchAt < HATCH_MS ? "Hatching!" : MOOD_TEXT[m];

  $("focusLbl").textContent = state.active ? (now < stopArmed ? "Sure?" : "Stop")
                            : state.onBreak ? "Next round" : "Focus";
  $("keyLength").disabled = !!state.active;
  document.querySelectorAll("#chips input").forEach(i => { i.disabled = !!state.active; i.checked = +i.value === state.length; });

  $("petName").textContent = nameOr();
  $("stStreak").textContent = streakNow(state, now);
  $("stSessions").textContent = state.sessions;
  const hrs = Math.floor(state.minutes / 60), mins = state.minutes % 60;
  $("stTime").textContent = hrs ? `${hrs}h ${mins}m` : `${mins}m`;
  const nx = STAGES[st + 1], left = nx ? nx.at - state.sessions : 0;
  $("next").textContent = nx
    ? (st === 0 ? "One finished session hatches the egg."
       : `${left} more ${left === 1 ? "session" : "sessions"} until ${nameOr()} grows.`)
    : `${nameOr()} is fully grown. Keep the streak going.`;

  const last = ago(state.settings.lastBackupAt);
  $("backupHint").textContent = last ? `Last backed up ${last}.` : "Not backed up yet. Your progress only lives in this browser.";
  $("resetBtn").textContent = now < resetArmed ? "Tap again to erase everything" : "Start over";
  $("testTag").hidden = !testMode;
  renderNotes();
}

/* ---------- Dialogs ---------- */
const show = d => (d.showModal ? d.showModal() : d.setAttribute("open", ""));
const hide = d => (d.close ? d.close() : d.removeAttribute("open"));
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => hide(b.closest("dialog"))));

function openNote(n) {
  $("noteTitle").textContent = `A note from ${PERSONAL.from}`;
  $("noteText").textContent = n.text;
  state.notes[n.id].read = true;
  save(); show($("noteDlg")); render();
}

const nameDlg = $("nameDlg");
function openName() { $("nameInput").value = state.name; show(nameDlg); $("nameInput").focus(); }
function saveName() {
  state.name = $("nameInput").value.trim() || state.name || "Pip";
  save(); hide(nameDlg); render();
}
$("nameSave").addEventListener("click", saveName);
$("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") saveName(); });
nameDlg.addEventListener("cancel", e => { if (!state.name) e.preventDefault(); });
$("renameBtn").addEventListener("click", openName);

/* ---------- Device buttons ---------- */
$("keyFocus").addEventListener("click", () => {
  unlockAudio();
  const now = Date.now();
  if (state.active) {
    if (now < stopArmed) {
      stopFocus(state); stopArmed = 0; save();
      say("Stopped early, so no snack this time. A shorter session might fit better.");
    } else stopArmed = now + 3000;
  } else {
    startFocus(state, now, unitMs()); save();
    say(`${state.length} minutes of focus. ${nameOr()} is studying with you.`);
  }
  render();
});
$("keyLength").addEventListener("click", () => {
  if (state.active) return;
  state.length = LENGTHS[(LENGTHS.indexOf(state.length) + 1) % LENGTHS.length] || 25;
  save(); render();
});
$("keyPat").addEventListener("click", () => {
  unlockAudio();
  patAt = Date.now();
  if (stageIndex(state) === 0) say("The egg wiggles. Something is in there.");
  render();
});

LENGTHS.forEach(n => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "radio"; input.name = "len"; input.value = n;
  const span = document.createElement("span");
  span.textContent = `${n} min`;
  label.append(input, span);
  input.addEventListener("change", () => { state.length = n; save(); render(); });
  $("chips").appendChild(label);
});

/* ---------- Settings ---------- */
$("soundToggle").checked = state.settings.sound;
$("soundToggle").addEventListener("change", e => {
  state.settings.sound = e.target.checked; save();
  if (e.target.checked) { unlockAudio(); playChime([880]); }
});

if (!notifySupported()) $("notifyRow").hidden = true;
else {
  $("notifyToggle").checked = state.settings.notify && Notification.permission === "granted";
  $("notifyToggle").addEventListener("change", async e => {
    if (!e.target.checked) { state.settings.notify = false; save(); return; }
    const result = await requestNotify();
    state.settings.notify = result === "granted";
    e.target.checked = state.settings.notify;
    save();
    if (!state.settings.notify) say("Desktop alerts are blocked here, so the chime and a flashing tab title will let you know instead.");
  });
}

/* ---------- Backup and restore ---------- */
const backupText = () => exportBackup(state, Date.now());
function markBackedUp() { state.settings.lastBackupAt = Date.now(); save(); render(); }

$("backupBtn").addEventListener("click", () => {
  $("backupCode").value = backupText();
  $("dlBtn").hidden = !downloads;
  $("backupStatus").textContent = "";
  show($("backupDlg"));
});
$("dlBtn").addEventListener("click", async () => {
  try {
    await downloads.save({ filename: `study-pet-backup-${dayKey(Date.now())}.json`, data: backupText() });
    markBackedUp();
    $("backupStatus").textContent = "Saved. Keep the file somewhere safe.";
  } catch (e) {
    $("backupStatus").textContent = e && e.code === "declined"
      ? "Download cancelled." : "The download didn't work here. Copy the code instead.";
  }
});
$("copyBtn").addEventListener("click", async () => {
  const ta = $("backupCode");
  let ok = false;
  try { await navigator.clipboard.writeText(ta.value); ok = true; }
  catch (e) { ta.select(); try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
  if (ok) { markBackedUp(); $("backupStatus").textContent = "Copied. Paste it somewhere safe, like a note or an email to yourself."; }
  else $("backupStatus").textContent = "Select all the text in the box and copy it.";
});

$("restoreBtn").addEventListener("click", () => {
  $("restoreCode").value = ""; $("restoreFile").value = ""; $("restoreStatus").textContent = "";
  show($("restoreDlg"));
});
$("restoreFile").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0];
  if (f) $("restoreCode").value = await f.text();
});
$("restoreGo").addEventListener("click", () => {
  try {
    state = importBackup($("restoreCode").value, Date.now());
    save(); notesSig = "";
    $("soundToggle").checked = state.settings.sound;
    hide($("restoreDlg"));
    say(`Welcome back, ${nameOr()}! Your progress is restored.`);
    render();
  } catch (err) {
    $("restoreStatus").textContent = err.message;
  }
});

$("resetBtn").addEventListener("click", () => {
  if (Date.now() < resetArmed) {
    state = createState(Date.now()); save(); resetArmed = 0; notesSig = ""; say(""); render(); openName();
  } else { resetArmed = Date.now() + 4000; render(); }
});

/* Press T (outside text fields) to toggle test mode: sessions last seconds instead of minutes */
document.addEventListener("keydown", e => {
  if ((e.key === "t" || e.key === "T") && !/input|textarea/i.test(e.target.tagName) && !state.active) {
    testMode = !testMode; render();
  }
});

/* Downloads only exist when the page is published on claude.ai; elsewhere this stays null. */
(async () => {
  try {
    if (window.claude && typeof window.claude.use === "function") downloads = await window.claude.use("downloads");
  } catch (e) { downloads = null; }
})();

/* ---------- Main loop ---------- */
function tick() {
  handleEvent(tickState(state, Date.now(), NOTES));
  render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) stopFlash(); tick(); });

unlockNotes(state, Date.now(), NOTES);
save();
setInterval(tick, 100);
tick();
if (!state.name) openName();
