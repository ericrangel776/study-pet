// Ways to get attention when a timer ends: a chime, a desktop
// notification, and a flashing tab title. Each one fails quietly if the
// browser doesn't allow it, so the app never breaks because of an alert.

let audioCtx = null;

// Browsers only allow sound after the user has clicked something,
// so this is called from a button click to "unlock" audio.
export function unlockAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

// Generates square-wave beeps in code: no sound files needed.
export function playChime(freqs) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = t + i * 0.14;
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.08, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.13);
      o.connect(g).connect(audioCtx.destination);
      o.start(s); o.stop(s + 0.15);
    });
  } catch (e) {}
}

export const notifySupported = () => typeof Notification !== "undefined";

export async function requestNotify() {
  if (!notifySupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch (e) { return "denied"; }
}

export function sendNotification(title, body) {
  if (!notifySupported() || Notification.permission !== "granted") return false;
  try { new Notification(title, { body }); return true; } catch (e) { return false; }
}

// Alternates the tab title so a hidden tab catches the eye.
let flashTimer = null;
export function flashTitle(text, baseTitle) {
  stopFlash();
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? text : baseTitle; }, 1000);
}
export function stopFlash() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
}
export const isFlashing = () => flashTimer !== null;
