// Storage behind a small interface: load() and save(state).
// Today it uses the browser's localStorage. Later, an API-backed store
// with the same two methods can replace it without touching the rest of the app.

const STORAGE_KEY = "studypet.v1";   // kept the same so existing progress carries over

export const localStore = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
    catch (e) { return null; }
  },
  save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }
};
