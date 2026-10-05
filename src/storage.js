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

// Ask the browser not to clear this site's data when space runs low or, in
// Safari, after 7 days without a visit. Chrome and Safari decide quietly based
// on how the site is used; Firefox asks the person. Resolves true when granted.
export async function askToKeepData() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (e) { return false; }
}
