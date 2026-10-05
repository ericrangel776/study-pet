// Installing the app and working offline.

// The build switches this on. In `npm run dev` a service worker would keep
// serving old files while you edit, so it stays off there.
const SW_ENABLED = false;

export function registerServiceWorker() {
  if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});   // e.g. opened as a file: the app still works
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
