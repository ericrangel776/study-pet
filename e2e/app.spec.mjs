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
  await expect(page.locator("#noteText")).toContainText("You hatched it!");
  await page.locator("#noteDlg [data-close]").click();
  await expect(note).not.toContainText("New");
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
