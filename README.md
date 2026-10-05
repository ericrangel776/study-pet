# Study Pet

A virtual pet that grows when you finish focused study sessions.

## Project layout

```
src/
  config.js    Personal notes and session lengths (edit these)
  engine.js    Pet rules: hearts, stages, streaks, breaks, notes, backups. No screen code.
  storage.js   Saving and loading behind a load()/save() interface
  render.js    Draws the LCD screen on a canvas
  alerts.js    Chime, desktop notifications, flashing tab title
  ui.js        Connects everything to the page
tests/
  engine.test.mjs   Tests for the engine
index.html, styles.css   Page structure and styles
build.mjs    Bundles everything into dist/study-pet.html
```

## Commands

Requires Node.js 20 or newer.

- `npm test` runs the engine tests.
- `npm run build` creates `dist/study-pet.html`, a single file you can open directly or publish.
- `npm run dev` serves the project locally. Open the address it prints.
  (ES modules don't load from a double-clicked file, so the unbundled version needs a local server.)

## Live site

https://ericrangel776.github.io/study-pet/

Every push to `main` runs the tests, builds `dist/study-pet.html` and publishes it to GitHub Pages
(see `.github/workflows/pages.yml`). If the tests fail, the site isn't updated.

## Tips

- Press **T** in the app to switch to test mode, where sessions last seconds instead of minutes. Nothing done in test mode is saved, and pressing **T** again returns to your real progress.
- Edit `src/config.js` to change the notes before sharing.
- Run `npm test` before every commit.
