# Study Pet

A virtual pet that grows when you finish focused study sessions.
It's a progressive web app: it runs in the browser, can be installed like an app, and works offline.

## Project layout

```
src/
  config.js    Personal notes and session lengths (edit these)
  engine.js    Pet rules: hearts, stages, streaks, breaks, notes, backups. No screen code.
  storage.js   Saving and loading behind a load()/save() interface
  render.js    Draws the LCD screen on a canvas
  alerts.js    Chime, desktop notifications, flashing tab title
  pwa.js       Service worker registration and the install button
  ui.js        Connects everything to the page
tests/
  engine.test.mjs   Tests for the engine
e2e/
  app.spec.mjs      Browser tests for the built app (Playwright)
scripts/
  icons.mjs    Draws the app icons from the pet's pixel art
  serve.mjs    Small static server the browser tests use
icons/         App icons (generated, committed)
index.html, styles.css   Page structure and styles
manifest.webmanifest     App name, colors and icons for installing
sw.js        Service worker: caches the app and fonts for offline use
build.mjs    Builds the installable app into dist/
```

## Commands

Requires Node.js 20 or newer.

- `npm test` runs the engine tests.
- `npm run test:browser` builds the app and runs the browser tests in `e2e/` (desktop and phone sizes).
  The first time, run `npm install` and then `npx playwright install chromium`.
- `npm run dev` serves the source files locally. Open the address it prints.
  (ES modules don't load from a double-clicked file, so the unbundled version needs a local server.)
  The service worker is off here, so edits always show up on reload.
- `npm run build` builds `dist/`: the whole app in `index.html`, plus the service worker, manifest and icons.
- `npm run preview` builds and serves `dist/`, so you can try installing and offline mode.
- `npm run icons` redraws the icons after changing the pet's look in `render.js`.

## Live site

https://ericrangel776.github.io/study-pet/

Every pull request runs the engine and browser tests (`.github/workflows/checks.yml`).
Every push to `main` runs the same checks, builds `dist/` and publishes it to GitHub Pages
(see `.github/workflows/pages.yml`). If the tests fail, the site isn't updated.

## Installing

- Chrome, Edge and Android: use the **Install app** button in Settings, or the install icon in the address bar.
- iPhone and iPad: in Safari, tap Share, then Add to Home Screen.

After the first visit, the app opens without an internet connection.

## Tips

- Press **T** in the app to switch to test mode, where sessions last seconds instead of minutes. Nothing done in test mode is saved, and pressing **T** again returns to your real progress.
- Edit `src/config.js` to change the notes before sharing.
- Run `npm test` and `npm run test:browser` before every commit.
