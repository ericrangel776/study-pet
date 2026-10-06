// UI: connects the engine, storage, renderer and alerts to the page.

import { NOTES, LENGTHS, DOG_NAMES } from "./config.js";
import { STAGES, migrate, createState, heartsNow, stageIndex, streakNow, mood, startFocus, stopFocus, tickState, pauseFocus, resumeFocus, focusLeft, pauseLeft, PAUSE_MAX, THEMES, unlockNotes, unreadNotes, exportBackup, importBackup, dayKey, daysAgo, lastWeek, needsBackup, goalToday, tryCatch, GOALS, REST_EVERY, INVITE_LIMITS, cleanInvite, encodeInvite, decodeInvite, sameInvite, applyInvite, notePS, isPuppy, accessory, certificate, petLook, STAGE_TRAIT, newFeature, describeLook, startNewPet, lifetime } from "./engine.js";
import { localStore, askToKeepData } from "./storage.js";
import { draw, HATCH_MS } from "./render.js";
import { drawCard } from "./card.js";
import { qrEncode, QR_MAX_BYTES } from "./qr.js";
import { encodeMove, decodeMove } from "./move.js";
import { unlockAudio, playChime, notifySupported, requestNotify, sendNotification, flashTitle, stopFlash, isFlashing, wakeLockSupported, keepAwake, vibrateSupported, buzz } from "./alerts.js";
import { registerServiceWorker, watchInstall, promptInstall, isIOS, isInstalled } from "./pwa.js";

const $ = id => document.getElementById(id);
const store = localStore;
let state = migrate(store.load(), Date.now());

const canvas = $("screen"), ctx = canvas.getContext("2d");
const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
let catchAt = 0, testMode = false, patAt = 0, hatchAt = 0, growAt = 0, stopArmed = 0, resetArmed = 0;
let downloads = null, notesSig = "";
const unitMs = () => (testMode ? 1000 : 60000);
// Test mode plays with a copy that is never saved, so practice runs can't
// add sessions, streak days or notes to the real pet.
const save = () => (testMode ? true : store.save(state));

// Once there's progress, ask the browser to keep it. dataKept is true when it agrees.
let dataKept = false;
function protectProgress() {
  if (dataKept || testMode || state.sessions === 0) return;
  askToKeepData().then(ok => { dataKept = ok; });
}

const MOOD_TEXT = {
  egg: "Study once to hatch", happy: "Happy", hungry: "Hungry, time to study",
  sleepy: "Sleepy, misses you", focus: "Studying with you", break: "Break! Catch the ball", paused: "Paused, waiting for you"
};
const nameOr = () => state.name || "Your pet";
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function ago(t) {
  if (!t) return null;
  const days = daysAgo(t, Date.now());
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
const say = t => { $("msg").textContent = t; };
function fmtMinutes(total) {
  const hrs = Math.floor(total / 60), mins = total % 60;
  return hrs ? `${hrs}h ${mins}m` : `${mins}m`;
}

/* ---------- Timer events ---------- */
function alertUser(title, body, tones) {
  if (state.settings.sound) playChime(tones);
  if (state.settings.vibrate && vibrateSupported()) buzz([200, 100, 200]);
  if (document.hidden) {
    if (state.settings.notify) sendNotification(title, body);
    flashTitle(title, "Study Pet");
  }
}
function handleEvent(ev) {
  if (!ev) return;
  if (ev.type === "focusDone") {
    let text;
    const isNew = ev.grewTo ? newFeature(petLook(state), ev.grewTo, isPuppy(state, DOG_NAMES)) : "";   // each stage shows off something new
    if (ev.grewTo === 1) { hatchAt = Date.now(); text = `${nameOr()} hatched! It's ${isNew}.`; }
    else if (ev.grewTo) {
      const why = ev.growReason && !(isPuppy(state, DOG_NAMES) && STAGE_TRAIT[ev.grewTo] === "ears") ? `, ${ev.growReason}` : "";   // puppies keep floppy ears
      growAt = Date.now(); text = `${nameOr()} grew into a ${STAGES[ev.grewTo].name}${isNew ? ` and has ${isNew}${why}` : ""}!`;
      if (ev.grewTo === STAGES.length - 1) text += " Your certificate is unsealed. Find it under Notes.";
    }
    else text = `Session done. ${nameOr()} had a snack.`;
    if (ev.notes.length) text += ` You unlocked ${ev.notes.length === 1 ? "a note" : ev.notes.length + " notes"}.`;
    if (ev.goalMet) { text += ` Daily goal reached! ${nameOr()} is so proud of you.`; if (!ev.grewTo) growAt = Date.now(); }
    if (ev.restUsed) text += ` A rest day kept your ${state.streak}-day streak going.`;
    if (ev.restEarned) text += ` ${REST_EVERY} days in a row earned you a rest day for a day you miss.`;
    if (!ev.breakSkipped) text += ` Enjoy a ${ev.breakMinutes}-minute break.`;
    say(text);
    alertUser("Session complete!", text, [660, 880, 1320]);
    protectProgress();
  } else if (ev.type === "pauseOver") {
    const text = `The ${PAUSE_MAX}-${testMode ? "second" : "minute"} pause is over, so the timer is running again.`;
    say(text);
    alertUser("Back to it", text, [660, 880]);
  } else if (ev.type === "breakDone") {
    const text = `Break's over. ${nameOr()} is ready when you are.`;
    say(text);
    alertUser("Break's over", text, [880, 660]);
  }
  save();
}

/* ---------- Rendering ---------- */
function renderNotes() {
  const sig = JSON.stringify([state.notes, state.invite, state.name]);
  if (sig === notesSig) return;      // only rebuild when notes change, so buttons keep focus
  notesSig = sig;
  $("notesTitle").textContent = `Notes from ${nameOr()}`;
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
      if (notePS(state, n)) {   // a teaser: something from the inviter waits here
        const tag = document.createElement("span");
        tag.className = "ps-tag"; tag.textContent = `P.S. from ${state.invite.from}`;
        s.appendChild(tag);
      }
      li.appendChild(s);
    }
    ul.appendChild(li);
  });
}

function render() {
  const now = Date.now(), m = mood(state, now), st = stageIndex(state);
  const unread = unreadNotes(state, NOTES);
  draw(ctx, { now, mood: m, stage: st, hearts: heartsNow(state, now), unread, hatchAt, growAt, patAt, catchAt, rm: RM, dog: isPuppy(state, DOG_NAMES), accessory: accessory(state), look: petLook(state) });
  canvas.setAttribute("aria-label", `${nameOr()}, ${STAGES[st].name}, ${MOOD_TEXT[m].toLowerCase()}${unread ? ", new note waiting" : ""}`);

  let title = "Study Pet";
  if (state.active) {
    const left = fmt(focusLeft(state, now));
    $("big").textContent = left; title = state.active.pausedAt ? `Paused ${left}` : `${left} Study Pet`;
  } else if (state.onBreak) {
    const left = fmt(state.onBreak.endAt - now);
    $("big").textContent = left; title = `${left} Break`;
  } else {
    $("big").textContent = nameOr();
  }
  if (!isFlashing()) document.title = title;
  $("small").textContent = now - hatchAt < HATCH_MS ? "Hatching!"
    : m === "paused" ? `Paused, resumes in ${fmt(pauseLeft(state, now))}`
    : m === "break" && state.onBreak.catches ? `${state.onBreak.catches} in a row!` : MOOD_TEXT[m];
  $("patLbl").textContent = m === "break" ? "Catch" : "Pat";

  $("focusLbl").textContent = state.active ? (now < stopArmed ? "Sure?" : "Stop")
                            : state.onBreak ? "Next round" : "Focus";
  // During a session the middle key pauses (once) and resumes.
  $("lengthLbl").textContent = !state.active ? "Length" : state.active.pausedAt ? "Resume" : "Pause";
  $("keyLength").disabled = !!state.active && state.active.pauseUsed && !state.active.pausedAt;
  document.querySelectorAll("#chips input").forEach(i => { i.disabled = !!state.active; i.checked = +i.value === state.length; });

  $("petName").textContent = nameOr();
  $("cardOpen").textContent = `Share a picture of ${nameOr()}`;
  const inv = state.invite;
  $("dedication").textContent = inv ? (inv.to ? `For ${inv.to}, from ${inv.from}` : `Invited by ${inv.from}`) : "";
  $("dedication").hidden = !inv;
  $("stStreak").textContent = streakNow(state, now);
  $("stRest").textContent = state.restDays ? `${state.restDays} rest ${state.restDays === 1 ? "day" : "days"} saved` : "";
  $("stRest").hidden = !state.restDays;
  renderGoal(now);
  const total = lifetime(state);   // across every pet raised
  $("stSessions").textContent = total.sessions;
  $("stTime").textContent = fmtMinutes(total.minutes);
  const nx = STAGES[st + 1], left = nx ? nx.at - state.sessions : 0;
  $("next").textContent = nx
    ? (st === 0 ? "One finished session hatches the egg."
       : `${left} more ${left === 1 ? "session" : "sessions"} until ${nameOr()} grows.`)
    : `${nameOr()} is fully grown. Keep the streak going.`;

  renderBackupHint(now);
  $("backupBtn").disabled = $("restoreBtn").disabled = testMode;
  $("resetBtn").textContent = now < resetArmed ? "Tap again to erase everything" : "Start over";
  $("testTag").hidden = !testMode;
  renderNotes();
  renderWeek(now);
  renderSeal();
  renderAlbum();
}

/* ---------- Certificate ---------- */
// Sealed card with progress until the pet is fully grown; then a button that opens it.
function renderSeal() {
  const c = certificate(state, NOTES);
  $("sealLocked").hidden = c.earned;
  $("sealOpen").hidden = !c.earned;
  $("sealNewPet").hidden = !c.earned;
  if (c.earned) { $("sealNew").hidden = state.certSeen; return; }
  $("sealHint").textContent = `Opens when ${nameOr()} is fully grown` + (state.invite && state.invite.letter ? `. ${state.invite.from} left a message inside.` : "");
  $("sealFill").style.width = (c.progress / c.goal * 100) + "%";
  $("sealMeter").setAttribute("aria-valuemax", c.goal);
  $("sealMeter").setAttribute("aria-valuenow", c.progress);
  $("sealCount").textContent = `${c.progress} of ${c.goal} sessions`;
}

const longDate = t => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
const shortDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// The grown pet from a certificate (or album entry), standing still, on any canvas.
function drawPortrait(canvas, c) {
  const pet = { name: c.name, seed: c.seed, traits: c.traits };
  draw(canvas.getContext("2d"), { now: 1300, mood: "happy", stage: STAGES.length - 1, hearts: 0, unread: 0,
    hatchAt: -1e12, growAt: -1e12, patAt: -1e12, rm: true, portrait: true,
    dog: isPuppy(pet, DOG_NAMES), accessory: c.accessory, look: petLook(pet) });
}

// Shows a certificate: the current pet's, or one from the album.
function openCertificate(c) {
  const pet = c.name || "Your pet", puppy = isPuppy({ name: c.name }, DOG_NAMES);
  $("certName").textContent = state.userName;
  $("certFor").textContent = c.since
    ? `for raising ${pet} from an egg to a grown-up, one focus session at a time, from ${longDate(c.since)} to ${longDate(c.grownAt)}.`
    : `for raising ${pet} from an egg to a grown-up, one focus session at a time. Fully grown on ${longDate(c.grownAt)}.`;
  const stats = [["Focus sessions", c.sessions], ["Focus time", fmtMinutes(c.minutes)],
                 ["Longest streak", `${c.bestStreak} ${c.bestStreak === 1 ? "day" : "days"}`], ["Notes unlocked", `${c.notes} of ${c.totalNotes}`]];
  $("certStats").innerHTML = "";
  stats.forEach(([label, value]) => {
    const div = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = value;
    div.append(dt, dd); $("certStats").appendChild(div);
  });
  $("certSigned").textContent = `Signed, ${pet}${puppy ? " (woof!)" : ""}`;
  $("certInvited").textContent = c.invitedBy ? `Invited to Study Pet by ${c.invitedBy}` : "";
  $("certInvited").hidden = !c.invitedBy;
  $("certMsg").textContent = c.letter ? `“${c.letter}”\nFrom ${c.letterFrom}` : "";
  $("certMsg").hidden = !c.letter;
  drawPortrait($("certPet"), c);
  $("certLook").textContent = describeLook(petLook({ seed: c.seed, traits: c.traits }), puppy);
  const current = c.seed === state.seed && !state.album.includes(c);
  $("certNewPet").hidden = !current;                 // only the current pet can move into the album
  if (current) { state.certSeen = true; save(); }
  show($("certDlg"));
  render();
}
$("sealOpen").addEventListener("click", () => openCertificate(certificate(state, NOTES)));
$("certPrint").addEventListener("click", () => window.print());

/* ---------- Shareable picture ---------- */
let cardBlob = null;
const cardFile = () => `study-pet-${(state.name || "pet").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
async function openCard() {
  const now = Date.now(), st = stageIndex(state);
  $("cardTitle").textContent = `Share a picture of ${nameOr()}`;
  $("cardStatus").textContent = "";
  $("cardImg").alt = `${nameOr()}, ${STAGES[st].name}, with ${state.sessions} sessions`;
  show($("cardDlg"));
  const canvas = await drawCard(document.createElement("canvas"), {
    petName: nameOr(), userName: state.userName || "you", stageName: st === 0 ? "Still an egg" : `A ${STAGES[st].name}`,
    sessions: state.sessions, focus: fmtMinutes(state.minutes), streak: streakNow(state, now),
    url: (location.host + location.pathname).replace(/\/$/, ""),
    pet: { now: 1300, mood: st === 0 ? "egg" : "happy", stage: st, hearts: 0, unread: 0, hatchAt: -1e12, growAt: -1e12, patAt: -1e12,
           rm: true, portrait: true, dog: isPuppy(state, DOG_NAMES), accessory: accessory(state), look: petLook(state) }
  });
  render();   // the renderer was just pointed at the card's canvas; redraw the screen
  cardBlob = await new Promise(r => canvas.toBlob(r, "image/png"));
  $("cardImg").src = URL.createObjectURL(cardBlob);
  const file = new File([cardBlob], cardFile(), { type: "image/png" });
  $("cardShare").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
}
$("cardOpen").addEventListener("click", openCard);
$("cardShare").addEventListener("click", () => {
  const file = new File([cardBlob], cardFile(), { type: "image/png" });
  navigator.share({ files: [file], title: `${nameOr()} on Study Pet`, text: `Studying with ${nameOr()} on Study Pet.` })
    .catch(() => {});   // closing the share sheet isn't an error
});
$("cardSave").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cardBlob); a.download = cardFile();
  document.body.appendChild(a); a.click(); a.remove();
  $("cardStatus").textContent = "Saved. Look for it in your downloads.";
});

/* ---------- Album ---------- */
// A new egg: the grown pet moves into the album, keeping its certificate.
function openNewPet() {
  $("newPetLead").textContent = `${nameOr()} moves into your album, certificate and all. A new egg arrives with its own look.`;
  $("newPetName").value = "";
  hide($("certDlg"));
  show($("newPetDlg"));
  $("newPetName").focus();
}
function hatchNewPet() {
  if (!state.grownAt) return;
  const old = nameOr(), name = $("newPetName").value.trim() || "Pip";
  startNewPet(state, name, Date.now(), NOTES);
  save(); hide($("newPetDlg")); notesSig = ""; albumSig = "";
  say(`${old} is in your album now. Say hello to ${name}, your ${ordinal(state.album.length + 1)} pet! One finished session hatches the egg.`);
  render();
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
$("sealNewPet").addEventListener("click", openNewPet);
$("certNewPet").addEventListener("click", openNewPet);
$("newPetGo").addEventListener("click", hatchNewPet);
$("newPetName").addEventListener("keydown", e => { if (e.key === "Enter") hatchNewPet(); });

let albumSig = "";
function renderAlbum() {
  const sig = JSON.stringify(state.album.map(e => e.seed));
  if (sig === albumSig) return;
  albumSig = sig;
  $("album").hidden = !state.album.length;
  const ul = $("albumList");
  ul.innerHTML = "";
  state.album.slice().reverse().forEach(e => {
    const li = document.createElement("li"), canvas = document.createElement("canvas"), info = document.createElement("div");
    const name = document.createElement("strong"), when = document.createElement("span"), btn = document.createElement("button");
    canvas.width = 64; canvas.height = 48; canvas.setAttribute("aria-hidden", "true");
    drawPortrait(canvas, e);
    name.textContent = e.name;
    when.textContent = `${e.since ? shortDate(e.since) + " to " : "Grown "}${shortDate(e.grownAt)}, ${e.sessions} sessions, ${fmtMinutes(e.minutes)}`;
    btn.className = "link"; btn.textContent = "Certificate";
    btn.setAttribute("aria-label", `${e.name}'s certificate`);
    btn.addEventListener("click", () => openCertificate(e));
    info.append(name, when, btn);
    li.append(canvas, info);
    ul.appendChild(li);
  });
}

// Safari erases a website's data after 7 days without a visit unless it's on
// the Home Screen, so iPhone users in the browser always see that risk.
function renderBackupHint(now) {
  const last = ago(state.settings.lastBackupAt);
  const lastText = last ? `Last backed up ${last}.` : "Not backed up yet.";
  const safariRisk = isIOS() && !isInstalled() && state.sessions > 0;
  const nudge = !testMode && (safariRisk || needsBackup(state, now, dataKept || isInstalled()));
  $("backupHint").textContent = testMode ? "Backup and restore are off in test mode."
    : safariRisk ? `${lastText} Safari can erase website data after 7 days without a visit. Add Study Pet to your Home Screen, or back up.`
    : nudge ? `${lastText} Your progress only lives in this browser, so it's worth backing up.`
    : dataKept && !last ? "Your browser will keep your progress. A backup helps if you switch devices."
    : lastText;
  $("backupBtn").classList.toggle("nudge", nudge);
}

// One column per day. Only the best day gets a value on its cap; the tooltip
// and the screen-reader table carry the rest.
let weekSig = "";
const BAR_MAX = 64;   // px; the column leaves room above for the cap label
function renderWeek(now) {
  const week = lastWeek(state, now);
  const sig = dayKey(now) + JSON.stringify(week.map(d => [d.minutes, d.sessions])) + state.settings.goal;
  if (sig === weekSig) return;
  weekSig = sig;

  const total = week.reduce((a, d) => a + d.minutes, 0);
  $("weekTotal").textContent = fmtMinutes(total);
  const top = Math.max(...week.map(d => d.minutes));
  const scale = Math.max(60, top);   // an hour fills the chart; light weeks don't look maxed out
  const chart = $("weekChart"), rows = $("weekTable");
  chart.innerHTML = ""; rows.innerHTML = "";
  week.forEach((d, i) => {
    const today = i === 6;
    const short = today ? "Today" : new Date(d.time).toLocaleDateString(undefined, { weekday: "short" });
    const long = today ? "Today" : new Date(d.time).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

    const day = document.createElement("div");
    day.className = "week-day" + (today ? " today" : "");
    day.dataset.tip = `${long}: ${d.minutes ? fmtMinutes(d.minutes) : "no focus time"}${state.settings.goal && d.sessions >= state.settings.goal ? ", goal met" : ""}`;
    const col = document.createElement("div");
    col.className = "week-col";
    if (d.minutes) {
      if (d.minutes === top) {
        const cap = document.createElement("span");
        cap.className = "week-cap"; cap.textContent = fmtMinutes(d.minutes);
        col.appendChild(cap);
      }
      const bar = document.createElement("div");
      bar.className = "week-bar";
      bar.style.height = Math.max(3, Math.round(d.minutes / scale * BAR_MAX)) + "px";
      col.appendChild(bar);
    }
    const lbl = document.createElement("span");
    lbl.className = "week-lbl"; lbl.textContent = short;
    day.append(col, lbl);
    chart.appendChild(day);

    const tr = document.createElement("tr");
    const th = document.createElement("th"), td = document.createElement("td");
    th.scope = "row"; th.textContent = long; td.textContent = fmtMinutes(d.minutes);
    tr.append(th, td); rows.appendChild(tr);
  });
}

// Hover (or tap) a day to see its exact time. The whole column is the target, not just the bar.
function showWeekTip(e) {
  const day = e.target.closest(".week-day"), tip = $("weekTip");
  if (!day) { tip.hidden = true; return; }
  tip.textContent = day.dataset.tip;
  const plot = $("weekChart").getBoundingClientRect(), r = day.getBoundingClientRect();
  tip.hidden = false;
  const half = tip.offsetWidth / 2;   // keep the tip inside the card at the first and last day
  tip.style.left = Math.min(plot.width - half, Math.max(half, r.left - plot.left + r.width / 2)) + "px";
  // Sit just above the bar (or the baseline on an empty day), never above the chart's top.
  const mark = day.querySelector(".week-bar") || day.querySelector(".week-col");
  const anchor = mark.classList.contains("week-bar") ? mark.getBoundingClientRect().top : mark.getBoundingClientRect().bottom;
  tip.style.top = Math.max(0, anchor - plot.top - tip.offsetHeight - 6) + "px";
}
$("weekChart").addEventListener("pointerover", showWeekTip);
$("weekChart").addEventListener("pointerdown", showWeekTip);
$("weekChart").addEventListener("pointerleave", () => { $("weekTip").hidden = true; });

/* ---------- Dialogs ---------- */
const show = d => (d.showModal ? d.showModal() : d.setAttribute("open", ""));
const hide = d => (d.close ? d.close() : d.removeAttribute("open"));
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => hide(b.closest("dialog"))));

function openNote(n) {
  $("noteTitle").textContent = `A note from ${nameOr()}`;
  $("noteText").textContent = n.text;
  const ps = notePS(state, n);
  $("notePS").textContent = ps ? `P.S. from ${state.invite.from}: ${ps}` : "";
  $("notePS").hidden = !ps;
  state.notes[n.id].read = true;
  save(); show($("noteDlg")); render();
}

const nameDlg = $("nameDlg");
// Asks for the person's name and the pet's name: on a first visit, for older saves
// without a person's name, and from "Change names".
function openName() {
  const first = !state.name || !state.userName;
  $("nameTitle").textContent = first ? "Welcome to Study Pet" : "Change names";
  $("nameLead").hidden = !first;
  $("nameSave").textContent = first ? "Let's go" : "Save";
  $("userInput").value = state.userName;
  $("nameInput").value = state.name;
  $("nameStatus").textContent = "";
  show(nameDlg);
  (state.userName ? $("nameInput") : $("userInput")).focus();
}
function saveName() {
  const user = $("userInput").value.trim(), first = !state.userName;
  if (!user) { $("nameStatus").textContent = "What should we call you?"; $("userInput").focus(); return; }
  state.userName = user;
  state.name = $("nameInput").value.trim() || state.name || "Pip";
  save(); hide(nameDlg);
  if (first) say(`Nice to meet you, ${user}! ${nameOr()} is ${stageIndex(state) === 0 ? "waiting in the egg" : "happy you're here"}.`);
  render();
}
$("nameSave").addEventListener("click", saveName);
[$("userInput"), $("nameInput")].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") saveName(); }));
nameDlg.addEventListener("cancel", e => { if (!state.name || !state.userName) e.preventDefault(); });
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
  if (state.active) {
    const now = Date.now();
    if (state.active.pausedAt) { resumeFocus(state, now); say("Back to it. The timer is running again."); }
    else if (pauseFocus(state, now)) say(`Paused. You have up to ${PAUSE_MAX} ${testMode ? "seconds" : "minutes"}; the timer resumes on its own after that.`);
    save(); render();
    return;
  }
  state.length = LENGTHS[(LENGTHS.indexOf(state.length) + 1) % LENGTHS.length] || 25;
  save(); render();
});
// During a break, the Pat key (or a tap on the screen) catches the ball instead.
function catchBall() {
  const r = tryCatch(state, Date.now(), RM);
  if (!r) return false;
  if (r.caught) {
    catchAt = Date.now();
    if (state.settings.sound) playChime([1320]);
    if (r.newBest && r.catches > 1) say(`${r.catches} catches in a row, a new best!`);
  } else say(r.best ? `Missed! Catch it just as it lands. Your best is ${r.best} in a row.` : "Missed! Catch the ball just as it lands.");
  save(); render();
  return true;
}
$("screen").addEventListener("pointerdown", () => { if (state.onBreak) { unlockAudio(); catchBall(); } });
$("keyPat").addEventListener("click", () => {
  unlockAudio();
  if (state.onBreak && catchBall()) return;
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

/* ---------- Daily goal ---------- */
function renderGoal(now) {
  const g = goalToday(state, now);
  $("goalLine").hidden = !g.goal;
  if (!g.goal) return;
  const dots = $("goalDots");
  if (dots.childElementCount !== Math.max(g.goal, g.done) || dots.dataset.done !== String(g.done)) {
    dots.innerHTML = "";
    for (let i = 0; i < Math.max(g.goal, g.done); i++) {
      const dot = document.createElement("span");
      dot.className = i < g.done ? "on" : "";
      dots.appendChild(dot);
    }
    dots.dataset.done = g.done;
  }
  $("goalText").textContent = g.met ? `Today's goal done: ${g.done} of ${g.goal} sessions` : `Today: ${g.done} of ${g.goal} sessions`;
}
GOALS.forEach(n => {
  const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
  input.type = "radio"; input.name = "goal"; input.value = n;
  span.textContent = n ? `${n} a day` : "Off";
  label.append(input, span);
  input.addEventListener("change", () => { state.settings.goal = n; save(); render(); });
  $("goalChips").appendChild(label);
});

/* ---------- Settings ---------- */
// Match the checkboxes to the current state, after loading, restoring, resetting or switching test mode.
function syncSettings() {
  $("soundToggle").checked = state.settings.sound;
  if (notifySupported()) $("notifyToggle").checked = state.settings.notify && Notification.permission === "granted";
  $("awakeToggle").checked = state.settings.awake;
  $("vibrateToggle").checked = state.settings.vibrate;
  document.querySelectorAll("#themeChips input").forEach(i => { i.checked = i.value === state.settings.theme; });
  applyTheme();
  document.querySelectorAll('#goalChips input').forEach(i => { i.checked = +i.value === state.settings.goal; });
}
syncSettings();
$("soundToggle").addEventListener("change", e => {
  state.settings.sound = e.target.checked; save();
  if (e.target.checked) { unlockAudio(); playChime([880]); }
});

if (!notifySupported()) $("notifyRow").hidden = true;
else {
  $("notifyToggle").addEventListener("change", async e => {
    if (!e.target.checked) { state.settings.notify = false; save(); return; }
    const result = await requestNotify();
    state.settings.notify = result === "granted";
    e.target.checked = state.settings.notify;
    save();
    if (!state.settings.notify) say("Desktop alerts are blocked here, so the chime and a flashing tab title will let you know instead.");
  });
}

if (!wakeLockSupported()) $("awakeRow").hidden = true;
if (!vibrateSupported()) $("vibrateRow").hidden = true;
$("vibrateToggle").addEventListener("change", e => { state.settings.vibrate = e.target.checked; save(); if (e.target.checked) buzz(80); });

// Theme: follow the device, or always light or dark.
function applyTheme() {
  const t = state.settings.theme;
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
THEMES.forEach(t => {
  const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
  input.type = "radio"; input.name = "theme"; input.value = t;
  span.textContent = t === "auto" ? "Match device" : t[0].toUpperCase() + t.slice(1);
  label.append(input, span);
  input.addEventListener("change", () => { state.settings.theme = t; save(); applyTheme(); });
  $("themeChips").appendChild(label);
});
syncSettings();   // the theme choices exist now, so mark the current one
$("awakeToggle").addEventListener("change", e => {
  state.settings.awake = e.target.checked; save();
  if (e.target.checked) say("The screen will stay on while a timer runs, so you'll hear when it's done.");
});

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
    syncSettings();
    hide($("restoreDlg"));
    say(`Welcome back, ${nameOr()}! Your progress is restored.`);
    render();
  } catch (err) {
    $("restoreStatus").textContent = err.message;
  }
});

$("resetBtn").addEventListener("click", () => {
  if (Date.now() < resetArmed) {
    const userName = state.userName;   // starting over is a new pet, not a new person
    state = createState(Date.now()); state.userName = userName; save(); resetArmed = 0; notesSig = ""; syncSettings(); say(""); render(); openName();
  } else { resetArmed = Date.now() + 4000; render(); }
});

/* Press T (outside text fields and dialogs) to toggle test mode: sessions last seconds instead of minutes */
function setTestMode(on) {
  testMode = on;
  if (!on) state = migrate(store.load(), Date.now());   // drop the practice copy, back to the real save
  hatchAt = growAt = patAt = 0; stopArmed = resetArmed = 0; notesSig = "";
  stopFlash(); syncSettings();
  say(on ? "Test mode on. Sessions last seconds, and nothing here is saved."
         : `Test mode off. Back to ${nameOr()}'s real progress.`);
  render();
}
// Keyboard shortcuts, outside text fields and dialogs (where keys already do things):
// Space starts or stops, P pauses or resumes, L changes the length, T toggles test mode.
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  const key = e.key.toLowerCase();
  if (key === " ") {
    if (e.target.closest && e.target.closest("button, a, label")) return;   // Space already presses a focused button
    e.preventDefault(); $("keyFocus").click();
  }
  else if (key === "p" && state.active) $("keyLength").click();
  else if (key === "l" && !state.active) $("keyLength").click();
  else if (key === "t" && !state.active) setTestMode(!testMode);
});

/* Downloads only exist when the page is published on claude.ai; elsewhere this stays null. */
(async () => {
  try {
    if (window.claude && typeof window.claude.use === "function") downloads = await window.claude.use("downloads");
  } catch (e) { downloads = null; }
})();

/* ---------- Invites ---------- */
// Writing: the builder keeps what's typed if it's closed and reopened.
const INVITE_ACCESSORIES = [[null, "None"], ["bow", "Bow"], ["flower", "Flower"], ["hat", "Party hat"]];
$("invFrom").maxLength = $("invTo").maxLength = INVITE_LIMITS.name;
$("invWelcome").maxLength = INVITE_LIMITS.welcome;
$("invLetter").maxLength = INVITE_LIMITS.letter;
INVITE_ACCESSORIES.forEach(([value, text]) => {
  const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
  input.type = "radio"; input.name = "invAccessory"; input.value = value || ""; input.checked = !value;
  span.textContent = text;
  label.append(input, span);
  $("invAccessories").appendChild(label);
});
NOTES.forEach(n => {
  const label = document.createElement("label"), span = document.createElement("span"), box = document.createElement("textarea");
  label.className = "field";
  span.textContent = `When they ${n.hint.charAt(0).toLowerCase() + n.hint.slice(1)}`.replace("your pet", "their pet");
  box.dataset.note = n.id; box.maxLength = INVITE_LIMITS.ps; box.placeholder = `Under: "${n.text}"`;
  label.append(span, box);
  $("invPS").appendChild(label);
});

function inviteFromForm() {
  const ps = {};
  document.querySelectorAll("#invPS textarea").forEach(b => { ps[b.dataset.note] = b.value; });
  return cleanInvite({
    from: $("invFrom").value, to: $("invTo").value, welcome: $("invWelcome").value, ps, letter: $("invLetter").value,
    accessory: document.querySelector('input[name="invAccessory"]:checked').value || null
  }, NOTES);
}
// Show the gifts on a teen pet as they're picked.
function drawInvitePreview() {
  draw($("invPreview").getContext("2d"), { now: 1300, mood: "happy", stage: 2, hearts: 0, unread: 0, hatchAt: -1e12, growAt: -1e12, patAt: -1e12,
    rm: true, portrait: true, accessory: document.querySelector('input[name="invAccessory"]:checked').value || null });
}
$("invAccessories").addEventListener("change", drawInvitePreview);

function openInvite() {
  $("invStatus").textContent = "";
  if (!$("invFrom").value) $("invFrom").value = state.userName;
  drawInvitePreview();
  show($("inviteDlg"));
}
$("invOpen").addEventListener("click", openInvite);
$("certInvite").addEventListener("click", () => { hide($("certDlg")); openInvite(); });

$("invMake").addEventListener("click", () => {
  const inv = inviteFromForm();
  if (!inv) { $("invOut").hidden = true; $("invStatus").textContent = "Add your name so they know who the invite is from."; return; }
  $("invLink").value = `${location.origin}${location.pathname}#invite=${encodeInvite(inv)}`;
  $("invShare").hidden = !navigator.share;
  $("invOut").hidden = false;
  const extras = inviteExtras(inv);
  $("invStatus").textContent = (extras.length ? `Link ready with ${extras.length} ${extras.length === 1 ? "extra" : "extras"}.` : "Link ready.")
    + " Anyone with the link can see what's in it.";
});
$("invCopy").addEventListener("click", async () => {
  const input = $("invLink");
  let ok = false;
  try { await navigator.clipboard.writeText(input.value); ok = true; }
  catch (e) { input.select(); try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
  $("invStatus").textContent = ok ? "Copied. Send it to your friend." : "Select the link and copy it.";
});
$("invShare").addEventListener("click", () => {
  const inv = inviteFromForm();
  navigator.share({ title: "Study Pet", text: `${inv.from} invited you to raise a study pet.`, url: $("invLink").value })
    .catch(() => {});   // closing the share sheet isn't an error
});

// What an invite adds, in plain words, for the welcome card and the builder.
function inviteExtras(inv) {
  const out = [], ps = Object.keys(inv.ps).length;
  if (inv.accessory) out.push(`Your pet wears ${{ bow: "a bow", flower: "a flower", hat: "a party hat" }[inv.accessory]}.`);
  if (ps) out.push(`${inv.from} added a P.S. to ${ps === 1 ? "a milestone note" : ps + " milestone notes"}.`);
  if (inv.letter) out.push(`${inv.from} sealed a message inside your certificate.`);
  return out;
}

// Receiving: open the app with #invite=... A brand-new pet takes it right
// away; a pet with progress (or another invite) asks first.
let pendingInvite = null;
function useInvite(inv) {
  applyInvite(state, inv); save(); notesSig = "";
  $("welcomeTitle").textContent = inv.to ? `For ${inv.to}, from ${inv.from}` : `${inv.from} invited you`;
  $("welcomeLead").textContent = `${inv.from} wants you to have a study pet. Finish focus sessions to hatch it and help it grow.`;
  $("welcomeMsg").textContent = inv.welcome;
  $("welcomeMsg").hidden = !inv.welcome;
  $("welcomeExtras").innerHTML = "";
  inviteExtras(inv).forEach(t => { const li = document.createElement("li"); li.textContent = t; $("welcomeExtras").appendChild(li); });
  render();
  show($("welcomeDlg"));
}
function receiveInvite() {
  const m = location.hash.match(/^#invite=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);   // keep it out of bookmarks and history
  let inv;
  try { inv = decodeInvite(m[1], NOTES); } catch (e) { say(e.message); return; }
  if (testMode) { say("Leave test mode (press T), then open the invite link again."); return; }
  if (sameInvite(state.invite, inv)) return;
  if (state.sessions === 0 && !state.invite) { useInvite(inv); return; }
  pendingInvite = inv;
  $("invAskTitle").textContent = `${inv.from} sent you an invite`;
  $("invAskText").textContent = `It adds ${inv.from}'s extras to ${nameOr()}. Your progress stays the same.`
    + (state.invite ? ` It replaces the extras from ${state.invite.from}.` : "");
  show($("invAskDlg"));
}
$("invAccept").addEventListener("click", () => {
  hide($("invAskDlg"));
  if (pendingInvite) useInvite(pendingInvite);
  pendingInvite = null;
});
$("welcomeDlg").addEventListener("close", () => { if (!state.name || !state.userName) openName(); });
window.addEventListener("hashchange", receiveInvite);

$("invPasteOpen").addEventListener("click", () => {
  $("invPasteInput").value = ""; $("invPasteStatus").textContent = "";
  show($("invPasteDlg")); $("invPasteInput").focus();
});
$("invPasteGo").addEventListener("click", () => {
  const m = $("invPasteInput").value.match(/#(invite|move)=([\w-]+)/);
  if (!m) { $("invPasteStatus").textContent = "That isn't a Study Pet invite or move link."; return; }
  hide($("invPasteDlg"));
  location.hash = m[1] + "=" + m[2];   // the hashchange listeners take it from here
});

/* ---------- Moving to another device ---------- */
let moveLink = "";
function drawQR(canvas, matrix) {
  const border = 4, n = matrix.length + border * 2, scale = Math.max(2, Math.floor(560 / n));
  canvas.width = canvas.height = n * scale;
  const g = canvas.getContext("2d");
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000000";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) g.fillRect((x + border) * scale, (y + border) * scale, scale, scale); }));
}
async function openMove() {
  $("moveStatus").textContent = "";
  moveLink = `${location.origin}${location.pathname}#move=${await encodeMove(state)}`;
  const bytes = new TextEncoder().encode(moveLink), fits = bytes.length <= QR_MAX_BYTES;
  if (fits) drawQR($("moveQR"), qrEncode(bytes));
  $("moveQR").hidden = !fits;
  $("moveLead").textContent = fits
    ? `Scan this with the other device's camera to open Study Pet there with ${nameOr()}.`
    : `${nameOr()} has too much history to fit in a code. Copy the link and open it on the other device.`;
  show($("moveDlg"));
}
$("moveBtn").addEventListener("click", openMove);
$("moveCopy").addEventListener("click", async () => {
  let ok = false;
  try { await navigator.clipboard.writeText(moveLink); ok = true; } catch (e) { ok = false; }
  $("moveStatus").textContent = ok ? "Copied. Open it on the other device, or paste it there with \"Paste a link\"." : "Copying didn't work here. Use Back up progress instead.";
});

// Receiving: open the app with #move=... and confirm before replacing anything.
let pendingMove = null;
async function receiveMove() {
  const m = location.hash.match(/^#move=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);   // the link holds the whole pet; keep it out of history
  if (testMode) { say("Leave test mode (press T), then open the move link again."); return; }
  try { pendingMove = importBackup(await decodeMove(m[1]), Date.now()); }
  catch (e) { say(e.message); if (!state.name || !state.userName) openName(); return; }
  const p = pendingMove, here = state.sessions || state.album.length;
  $("moveAskTitle").textContent = `Move ${p.name || "a pet"} here?`;
  $("moveAskText").textContent = `${p.name || "The pet"} has ${p.sessions} ${p.sessions === 1 ? "session" : "sessions"}`
    + (p.album.length ? `, with ${p.album.length} more in the album` : "") + (p.userName ? `, raised by ${p.userName}` : "") + "."
    + (here ? ` This replaces ${nameOr()} on this device.` : "");
  show($("moveAskDlg"));
}
$("moveAccept").addEventListener("click", () => {
  if (pendingMove) {
    state = pendingMove; save();
    notesSig = ""; albumSig = ""; weekSig = "";
    syncSettings();
    say(`${nameOr()} moved over with all your progress. Welcome back, ${state.userName || "friend"}!`);
  }
  pendingMove = null;
  hide($("moveAskDlg"));
  render();
});
$("moveAskDlg").addEventListener("close", () => { pendingMove = null; if (!state.name || !state.userName) openName(); });
window.addEventListener("hashchange", receiveMove);

/* ---------- Installing ---------- */
// When a new version takes over, offer a refresh rather than reloading mid-session.
registerServiceWorker(() => { $("updateBanner").hidden = false; });
$("updateBtn").addEventListener("click", () => { save(); location.reload(); });
watchInstall(can => { $("installBtn").hidden = !can; });
$("installBtn").addEventListener("click", async () => {
  if (await promptInstall()) say(`${nameOr()} has a home on your device now.`);
  $("installBtn").hidden = true;
});
if (isIOS() && !isInstalled()) {
  $("installHint").textContent = "To install on iPhone or iPad, tap Share, then Add to Home Screen.";
  $("installHint").hidden = false;
}

/* ---------- Main loop ---------- */
function tick() {
  handleEvent(tickState(state, Date.now(), NOTES));
  keepAwake(state.settings.awake && !!(state.active || state.onBreak));
  render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) stopFlash(); tick(); });

unlockNotes(state, Date.now(), NOTES);
save();
protectProgress();
setInterval(tick, 100);
tick();
const arrivingMove = location.hash.startsWith("#move=");   // checked first: receiving clears the address
receiveInvite();
receiveMove();   // asks first; if there's no pet here yet, the name prompt comes after
if (!$("welcomeDlg").open && !$("invAskDlg").open && !arrivingMove) {
  if (!state.name || !state.userName) openName();
  else if (!$("msg").textContent) say(`Hi, ${state.userName}! ${nameOr()} is ready when you are.`);
}
