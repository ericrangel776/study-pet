# Study Pet

A virtual pet that grows when you finish focused study sessions.
It's a progressive web app: it runs in the browser, can be installed like an app, and works offline.

## Project layout

```
src/
  config.js    Milestones, the pet's own notes, stickers, session lengths, and the puppy names
  engine.js    Pet rules: hearts, stages, streaks, breaks, notes, stickers, treats, backups. No screen code.
  holidays.js  Which holiday (if any) is on today
  storage.js   Saving and loading behind a load()/save() interface
  render.js    Draws the LCD screen on a canvas
  card.js      Draws the shareable 1080x1350 picture of the pet
  qr.js        A small QR code encoder (byte mode, levels 1 to 40)
  move.js      Packs the whole save into a compressed link for moving devices
  alerts.js    Chime, desktop notifications, flashing tab title
  pwa.js       Service worker registration and the install button
  ui.js        Connects everything to the page
tests/
  engine.test.mjs   Tests for the engine
  holidays.test.mjs Tests for the holiday dates
  move.test.mjs     Tests for move links and QR codes (read back with jsQR)
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

- `npm test` runs the engine and holiday tests.
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
  In test mode, **H** steps through the holiday looks.
- **Invite a friend** (under Notes, and on the certificate) makes a link that sends someone their own pet with
  extras: a welcome message, a P.S. under any milestone note, a message sealed in their certificate, the puppy look,
  and an accessory (bow, flower or party hat). It all rides after the `#` in the link, which browsers never send to
  a server, so nothing personal lives in this code. On iPhone, links open in Safari, which keeps separate data from the
  Home Screen app; use **Paste an invite link** there.
- Every pet gets a random seed when it is created that picks its shape, markings, ears, tail and topper,
  revealed one stage at a time, so no two pets grow up alike (see `TRAITS` in `src/engine.js`).
  Study habits can decide the later traits as they arrive: long or quick sessions shape the ears, a 5-day
  streak gives a fluffy tail, and a 7-day streak or 10 hours of focus decides the topper (`habitTrait`).
  A pet named Lila or Daisy is a puppy (`DOG_NAMES` in `src/config.js`).
- The pet dresses up for New Year, Lunar New Year, Valentine's Day, St. Patrick's Day, Easter, the Fourth of July,
  Halloween (the whole week, with a dimmer screen), Thanksgiving, Hanukkah (a menorah with the night's candles) and
  Christmas. The dates are in `src/holidays.js`; Lunar New Year and Hanukkah come from tables (through 2035 and 2030),
  so add years there as they get close. Settings can turn holiday looks off.
- Breaks can be 5, 10 or 15 minutes (under Break length). Every 4th session earns a long break of 15, 20 or
  30 minutes, set in Settings, where it can also be turned off.
- Meeting the daily goal earns a treat (up to 5 saved). Giving one adds a heart and plays a little snack on the screen.
- Stickers are lifetime milestones (sessions, hours, best streak, pets grown, treats given). They count every pet in
  the Album, so they keep coming after the certificate. The list is `STICKERS` in `src/config.js`.
- The certificate unseals when the pet is fully grown (20 sessions) and can be printed or saved as a PDF.
  After that, **Raise a new pet** moves the grown pet into the Album (with its certificate) and brings a new egg.
- **Move to another device** (Settings) shows a QR code; scanning it opens the app there and moves the pet
  after confirming. "Copy link" and "Paste a link" cover devices that can't scan, like moving between
  Safari and the Home Screen app on iPhone.
- During a session the middle key pauses it once, for up to 5 minutes. On a keyboard: Space starts or stops,
  P pauses, L changes the length. Settings has a theme switch and, on phones, vibration.
- Run `npm test` and `npm run test:browser` before every commit.
