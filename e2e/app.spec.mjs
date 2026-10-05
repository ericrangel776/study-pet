// Browser tests: drive the built app the way a person would.
// Time is controlled with Playwright's clock, so a 15-minute session takes no real time.
import { test, expect } from "@playwright/test";

const KEY = "studypet.v1";
const MORNING = new Date("2026-10-05T09:00:00-05:00");   // a Monday, Chicago time

// Open the app with the clock frozen at `time`, optionally starting from a saved pet.
async function open(page, { save, time = MORNING } = {}) {
  await page.clock.install({ time });
  await page.goto("./");
  if (save) {
    await page.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, save]);
    await page.reload();
  }
}
async function nameThePet(page, name = "Pip") {
  await expect(page.locator("#nameDlg")).toBeVisible();
  await page.locator("#nameInput").fill(name);
  await page.locator("#nameSave").click();
  await expect(page.locator("#nameDlg")).toBeHidden();
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const petSave = (extra = {}) => ({
  version: 3, name: "Pip", sessions: 9, minutes: 225, hearts: 3, heartsAt: MORNING.getTime(),
  streak: 1, lastDay: "2026-10-5", lastStudyAt: MORNING.getTime(), length: 25,
  active: null, onBreak: null, notes: {}, days: {}, settings: { sound: false, notify: false, lastBackupAt: null }, ...extra
});

test("a first visit asks for the pet's name", async ({ page }) => {
  await open(page);
  await nameThePet(page, "Mochi");
  await expect(page.locator("#petName")).toHaveText("Mochi");
  await expect(page.locator("#small")).toHaveText("Study once to hatch");
});

test("a finished session hatches the egg, logs the time and is saved", async ({ page }) => {
  await open(page);
  await nameThePet(page);
  await page.getByRole("radio", { name: "15 min" }).check();
  await page.locator("#keyFocus").click();
  await expect(page.locator("#focusLbl")).toHaveText("Stop");

  await page.clock.fastForward("15:01");
  await expect(page.locator("#msg")).toContainText("Pip hatched!");
  await expect(page.locator("#msg")).toContainText("5-minute break");
  await expect(page.locator("#stSessions")).toHaveText("1");
  await expect(page.locator("#weekTotal")).toHaveText("15m");

  await page.reload();
  await expect(page.locator("#stSessions")).toHaveText("1");
  expect((await saved(page)).days).toEqual({ "2026-10-5": 15 });
});

test("stopping early takes a second tap and gives no credit", async ({ page }) => {
  await open(page, { save: petSave() });
  await page.locator("#keyFocus").click();
  await page.locator("#keyFocus").click();
  await expect(page.locator("#focusLbl")).toHaveText("Sure?");
  await page.locator("#keyFocus").click();
  await expect(page.locator("#msg")).toContainText("Stopped early");
  await expect(page.locator("#stSessions")).toHaveText("9");
});

test("test mode practice never touches the real save", async ({ page }) => {
  await open(page);
  await nameThePet(page);
  await page.keyboard.press("t");
  await expect(page.locator("#testTag")).toBeVisible();
  await expect(page.locator("#backupBtn")).toBeDisabled();

  await page.getByRole("radio", { name: "15 min" }).check();
  await page.locator("#keyFocus").click();
  await page.clock.fastForward(16000);                    // "15 minutes" is 15 seconds here
  await expect(page.locator("#msg")).toContainText("hatched");
  await expect(page.locator("#stSessions")).toHaveText("1");
  expect((await saved(page)).sessions).toBe(0);

  await page.keyboard.press("t");
  await expect(page.locator("#testTag")).toBeHidden();
  await expect(page.locator("#msg")).toContainText("Back to Pip's real progress");
  await expect(page.locator("#stSessions")).toHaveText("0");
  await expect(page.locator("#notesList")).toContainText("Locked: hatch the egg");
});

test("notes unlock, open, and lose their New badge", async ({ page }) => {
  await open(page, { save: petSave({ sessions: 0, minutes: 0 }) });
  await page.getByRole("radio", { name: "15 min" }).check();
  await page.locator("#keyFocus").click();
  await page.clock.fastForward("15:01");
  const note = page.locator(".note-btn", { hasText: "Hatch the egg" });
  await expect(note).toContainText("New");
  await note.click();
  await expect(page.locator("#noteText")).toContainText("You hatched me!");
  await page.locator("#noteDlg [data-close]").click();
  await expect(note).not.toContainText("New");
});

test("naming the pet Lila or Daisy turns it into a puppy", async ({ page }) => {
  await open(page, { save: petSave() });
  await page.clock.pauseAt(new Date(MORNING.getTime() + 60000));   // freeze time so frames are comparable
  const frame = () => page.locator("#screen").evaluate(c => c.toDataURL());
  const rename = async name => {
    await page.locator("#renameBtn").click();
    await page.locator("#nameInput").fill(name);
    await page.locator("#nameSave").click();
  };
  const blob = await frame();
  await rename("LILA");
  const puppy = await frame();
  expect(puppy).not.toBe(blob);
  await rename("daisy");
  expect(await frame()).toBe(puppy);
  await rename("Lilac");
  expect(await frame()).toBe(blob);
});

test.describe("notes for a friend", () => {
  // Write notes in one browser, then open the link in a fresh one, like a friend would.
  async function writeNotes(page, from, notes) {
    await page.locator("#giftOpen").click();
    if (from !== null) await page.locator("#giftFrom").fill(from);
    for (const [id, text] of Object.entries(notes)) await page.locator(`#giftFields textarea[data-note="${id}"]`).fill(text);
    await page.locator("#giftMake").click();
  }

  test("a friend's link brings their notes to a new pet", async ({ page, browser }) => {
    await open(page, { save: petSave() });
    await expect(page.locator("#notesTitle")).toHaveText("Notes from Pip");   // the pet's own notes by default
    await writeNotes(page, "Eric", { hatch: "So proud of you! 🎉", five: "Five down!" });
    await expect(page.locator("#giftStatus")).toContainText("2 of 6 notes");
    const link = await page.locator("#giftLink").inputValue();
    expect(link).toMatch(/#gift=[\w-]+$/);

    const friend = await browser.newPage();
    await friend.clock.install({ time: MORNING });
    await friend.goto(link);
    await expect(friend.locator("#msg")).toContainText("Eric left you 2 notes");
    expect(friend.url()).not.toContain("#gift");                              // removed from the address bar
    await nameThePet(friend, "Bo");
    await expect(friend.locator("#notesTitle")).toHaveText("Notes from Eric");

    await friend.getByRole("radio", { name: "15 min" }).check();
    await friend.locator("#keyFocus").click();
    await friend.clock.fastForward("15:01");
    await expect(friend.locator("#msg")).toContainText("You unlocked a note from Eric");
    await friend.locator(".note-btn", { hasText: "Hatch the egg" }).click();
    await expect(friend.locator("#noteTitle")).toHaveText("A note from Eric");
    await expect(friend.locator("#noteText")).toHaveText("So proud of you! 🎉");
    await friend.close();
  });

  test("a pet with progress asks before switching notes", async ({ page }) => {
    await open(page, { save: petSave({ notes: { hatch: { at: 1, read: true } } }) });
    await writeNotes(page, "Sam", { hatch: "Hi from Sam" });
    const link = await page.locator("#giftLink").inputValue();
    await page.locator("#giftDlg [data-close]").click();

    await page.goto(link);
    await expect(page.locator("#giftGotTitle")).toHaveText("Sam wrote you notes");
    await page.locator("#giftAccept").click();
    await expect(page.locator("#notesTitle")).toHaveText("Notes from Sam");
    await expect(page.locator(".note-btn", { hasText: "Hatch the egg" })).toContainText("New");   // rewritten, so new again
  });

  test("the builder needs a name and at least one note", async ({ page }) => {
    await open(page, { save: petSave() });
    await writeNotes(page, null, { hatch: "Hello" });
    await expect(page.locator("#giftStatus")).toHaveText("Add your name so they know who the notes are from.");
    await page.locator("#giftFrom").fill("Eric");
    await page.locator('#giftFields textarea[data-note="hatch"]').fill("   ");
    await page.locator("#giftMake").click();
    await expect(page.locator("#giftStatus")).toHaveText("Write at least one note.");
    await expect(page.locator("#giftOut")).toBeHidden();
  });

  test("a notes link can be pasted in, for apps a link can't open", async ({ page }) => {
    await open(page, { save: petSave() });
    await writeNotes(page, "Ana", { five: "Cinco!" });
    const link = await page.locator("#giftLink").inputValue();
    await page.locator("#giftDlg [data-close]").click();

    await page.locator("#giftPasteOpen").click();
    await page.locator("#giftPasteInput").fill("hello");
    await page.locator("#giftPasteGo").click();
    await expect(page.locator("#giftPasteStatus")).toContainText("isn't a notes link");
    await page.locator("#giftPasteInput").fill(`Check this out: ${link}`);
    await page.locator("#giftPasteGo").click();
    await page.locator("#giftAccept").click();
    await expect(page.locator("#notesTitle")).toHaveText("Notes from Ana");
  });

  test("a damaged link explains itself and changes nothing", async ({ page }) => {
    await open(page, { save: petSave() });
    await page.goto("./#gift=eyJ2IjoxLCJmcm9tIjoiRX");
    await expect(page.locator("#msg")).toContainText("This notes link looks incomplete");
    await expect(page.locator("#notesTitle")).toHaveText("Notes from Pip");
  });
});

test("a backup restores the pet after starting over", async ({ page }) => {
  await open(page, { save: petSave({ settings: { sound: false, notify: false, lastBackupAt: null } }) });
  await page.locator("#backupBtn").click();
  const code = await page.locator("#backupCode").inputValue();
  await page.locator("#backupDlg [data-close]").click();

  await page.locator("#resetBtn").click();
  await page.locator("#resetBtn").click();
  await nameThePet(page, "Bo");
  await page.locator("#soundToggle").check();
  await expect(page.locator("#stSessions")).toHaveText("0");

  await page.locator("#restoreBtn").click();
  await page.locator("#restoreCode").fill(code);
  await page.locator("#restoreGo").click();
  await expect(page.locator("#petName")).toHaveText("Pip");
  await expect(page.locator("#stSessions")).toHaveText("9");
  await expect(page.locator("#soundToggle")).not.toBeChecked();   // settings follow the backup
});

test("a bad backup code is rejected with a clear message", async ({ page }) => {
  await open(page, { save: petSave() });
  await page.locator("#restoreBtn").click();
  await page.locator("#restoreCode").fill("not a backup");
  await page.locator("#restoreGo").click();
  await expect(page.locator("#restoreStatus")).toContainText("doesn't look like a Study Pet backup");
  await expect(page.locator("#stSessions")).toHaveText("9");
});

test("the weekly chart shows each day, with details on tap or hover", async ({ page }) => {
  const days = { "2026-9-29": 25, "2026-10-1": 50, "2026-10-2": 90, "2026-10-3": 15, "2026-10-5": 45 };
  await open(page, { save: petSave({ days }) });
  await expect(page.locator(".week-day")).toHaveCount(7);
  await expect(page.locator("#weekTotal")).toHaveText("3h 45m");
  await expect(page.locator(".week-cap")).toHaveText("1h 30m");          // only the best day is labeled
  await expect(page.locator(".week-day.today .week-lbl")).toHaveText("Today");

  await page.locator(".week-day").nth(3).click();
  await expect(page.locator("#weekTip")).toHaveText("Friday, Oct 2: 1h 30m");
  await expect(page.getByRole("table")).toContainText("Friday, Oct 2");
});

test.describe("keeping progress safe", () => {
  const refuseStorage = page => page.addInitScript(() => {
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => false;
  });

  test("nudges for a backup when the browser won't promise to keep the pet", async ({ page }) => {
    await refuseStorage(page);
    await open(page, { save: petSave() });
    await expect(page.locator("#backupHint")).toContainText("worth backing up");
    await expect(page.locator("#backupBtn")).toHaveClass(/nudge/);

    await page.locator("#backupBtn").click();
    await page.evaluate(() => { document.execCommand = () => true; });   // stand-in for the clipboard
    await page.locator("#copyBtn").click();
    await page.locator("#backupDlg [data-close]").click();
    await expect(page.locator("#backupHint")).toHaveText("Last backed up today.");
    await expect(page.locator("#backupBtn")).not.toHaveClass(/nudge/);
  });

  test("doesn't nudge before there's any progress", async ({ page }) => {
    await refuseStorage(page);
    await open(page);
    await nameThePet(page);
    await expect(page.locator("#backupBtn")).not.toHaveClass(/nudge/);
  });

  test.describe("on an iPhone in Safari", () => {
    test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });

    test("warns about the 7-day rule and suggests the Home Screen", async ({ page }) => {
      await open(page, { save: petSave({ settings: { sound: false, notify: false, lastBackupAt: MORNING.getTime() } }) });
      await expect(page.locator("#backupHint")).toContainText("Safari can erase website data after 7 days");
      await expect(page.locator("#installHint")).toContainText("Add to Home Screen");
    });
  });
});

test("keeps the screen on only while a timer runs, when the setting is on", async ({ page }) => {
  // Record wake lock requests and releases instead of really locking the screen.
  await page.addInitScript(() => {
    window.wakeLog = [];
    navigator.wakeLock.request = async () => {
      window.wakeLog.push("on");
      const lock = new EventTarget();
      lock.release = async () => { window.wakeLog.push("off"); lock.dispatchEvent(new Event("release")); };
      return lock;
    };
  });
  await open(page, { save: petSave() });
  const log = () => page.evaluate(() => window.wakeLog);

  await page.getByRole("radio", { name: "15 min" }).check();
  await page.locator("#keyFocus").click();
  await page.clock.runFor(500);
  expect(await log()).toEqual([]);                    // off by default

  await page.locator("#awakeToggle").check();
  await page.clock.runFor(500);
  expect(await log()).toEqual(["on"]);                // asks once, not every tick

  await page.clock.fastForward("15:01");              // session done, break starts: still on
  await page.clock.runFor(500);
  expect(await log()).toEqual(["on"]);
  await page.clock.fastForward("05:01");               // break over: screen may sleep again
  await page.clock.runFor(500);
  expect(await log()).toEqual(["on", "off"]);
  await page.reload();
  await expect(page.locator("#awakeToggle")).toBeChecked();
});

test.describe("installed app", () => {
  test.use({ serviceWorkers: "allow" });

  test("is installable and opens offline after the first visit", async ({ page, context, browserName }) => {
    await page.goto("./");
    const manifest = await page.evaluate(() => fetch("manifest.webmanifest").then(r => r.json()));
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some(i => i.purpose === "maskable")).toBe(true);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.waitForFunction(async () => (await caches.keys()).some(k => /^study-pet-[0-9a-f]{10}$/.test(k)));

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#nameDlg")).toBeVisible();
    await expect(page.locator("#screen")).toBeVisible();
  });
});
