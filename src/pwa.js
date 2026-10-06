// Installing the app and working offline.

// The build switches this on. In `npm run dev` a service worker would keep
// serving old files while you edit, so it stays off there.
const SW_ENABLED = false;

// onUpdate runs when a new version takes over this page. Not on the very first
// install: then there was no older version running.
export function registerServiceWorker(onUpdate) {
  if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
  const hadOlder = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadOlder && onUpdate) onUpdate(); });
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (!reg) return;   // some browsers (and test setups) block service workers
    // An installed app can stay open for days, so look for a new version hourly and whenever it's shown again.
    const check = () => reg.update().catch(() => {});
    setInterval(check, 3600e3);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  }).catch(() => {});   // e.g. opened as a file: the app still works
}

// Browsers that support installing (Chrome, Edge, Android) fire this event when
// the app can be installed. onChange(true) means an install button should show.
let installEvent = null;
export function watchInstall(onChange) {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; onChange(true); });
  window.addEventListener("appinstalled", () => { installEvent = null; onChange(false); });
}
export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  return outcome === "accepted";
}

// iPhone and iPad have no install event; people use Share, then Add to Home Screen.
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
