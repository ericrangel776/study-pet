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
// Fills the first-visit dialog. The person's name is only typed if it isn't already there.
async function nameThePet(page, name = "Pip", user = "Alex") {
  await expect(page.locator("#nameDlg")).toBeVisible();
  if (!(await page.locator("#userInput").inputValue())) await page.locator("#userInput").fill(user);
  await page.locator("#nameInput").fill(name);
  await page.locator("#nameSave").click();
  await expect(page.locator("#nameDlg")).toBeHidden();
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const petSave = (extra = {}) => ({
  version: 3, name: "Pip", userName: "Alex", sessions: 9, minutes: 225, hearts: 3, heartsAt: MORNING.getTime(),
  streak: 1, lastDay: "2026-10-5", lastStudyAt: MORNING.getTime(), length: 25,
  active: null, onBreak: null, notes: {}, days: {}, settings: { sound: false, notify: false, lastBackupAt: null }, ...extra
});

test("a first visit asks for the pet's name", async ({ page }) => {
  await open(page);
  await nameThePet(page, "Mochi");
  await expect(page.locator("#petName")).toHaveText("Mochi");
  await expect(page.locator("#small")).toHaveText("Study once to hatch");
});

test("a first visit needs the person's name, and greets them by it", async ({ page }) => {
  await open(page);
  await page.locator("#nameInput").fill("Mochi");
  await page.locator("#nameSave").click();
  await expect(page.locator("#nameStatus")).toHaveText("What should we call you?");
  await expect(page.locator("#nameDlg")).toBeVisible();
  await page.locator("#userInput").fill("Jordan");
  await page.locator("#nameSave").click();
  await expect(page.locator("#nameDlg")).toBeHidden();
  await expect(page.locator("#msg")).toHaveText("Nice to meet you, Jordan! Mochi is waiting in the egg.");
  await page.reload();
  await expect(page.locator("#msg")).toHaveText("Hi, Jordan! Mochi is ready when you are.");
  await page.locator("#invOpen").click();
  await expect(page.locator("#invFrom")).toHaveValue("Jordan");               // invites are from them by default
});

test("an older save without the person's name asks for it once", async ({ page }) => {
  await open(page, { save: petSave({ userName: undefined }) });
  await expect(page.locator("#nameDlg")).toBeVisible();
  await expect(page.locator("#nameInput")).toHaveValue("Pip");
  await page.locator("#userInput").fill("Sam");
  await page.locator("#nameSave").click();
  await page.reload();
  await expect(page.locator("#nameDlg")).toBeHidden();
});

test("starting over keeps the person's name", async ({ page }) => {
  await open(page, { save: petSave() });
  await page.locator("#resetBtn").click();
  await page.locator("#resetBtn").click();
  await expect(page.locator("#userInput")).toHaveValue("Alex");
  await expect(page.locator("#nameInput")).toHaveValue("");
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

test.describe("every pet is different", () => {
  const frameFor = async (browser, seed) => {
    const page = await browser.newPage();
    await open(page, { save: petSave({ seed }) });
    await page.clock.pauseAt(new Date(MORNING.getTime() + 60000));
    const url = await page.locator("#screen").evaluate(c => c.toDataURL());
    await page.close();
    return url;
  };

  test("pets with different seeds look different, and a seed always looks the same", async ({ browser }) => {
    const a = await frameFor(browser, 11), b = await frameFor(browser, 44);
    expect(a).not.toBe(b);
    expect(await frameFor(browser, 11)).toBe(a);
  });

  test("growing up announces what's new, and the certificate describes the pet", async ({ page }) => {
    // Seed 11: a chubby pet with a belly patch, bunny ears, a fluffy tail and a curl on top.
    await open(page, { save: petSave({ seed: 11, sessions: 3, minutes: 75 }) });
    await page.getByRole("radio", { name: "15 min" }).check();
    await page.locator("#keyFocus").click();
    await page.clock.fastForward("15:01");
    await expect(page.locator("#msg")).toContainText("Pip grew into a kid and has long bunny ears!");

    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.sessions = 20; s.grownAt = s.lastStudyAt; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await page.reload();
    await page.locator("#sealOpen").click();
    await expect(page.locator("#certLook")).toHaveText("A chubby pet with a belly patch, long bunny ears, a fluffy tail and a curl on top.");
  });

  test("hatching says what kind of pet came out", async ({ page }) => {
    await open(page, { save: petSave({ seed: 22, sessions: 0, minutes: 0 }) });
    await page.getByRole("radio", { name: "15 min" }).check();
    await page.locator("#keyFocus").click();
    await page.clock.fastForward("15:01");
    await expect(page.locator("#msg")).toContainText("Pip hatched! It's a spotted chubby one.");
  });
});

test.describe("sharing a picture", () => {
  test("makes a 1080x1350 picture of the pet and saves it", async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = undefined; });     // a browser without file sharing
    await open(page, { save: petSave({ name: "Mochi" }) });
    await expect(page.locator("#cardOpen")).toHaveText("Share a picture of Mochi");
    await page.locator("#cardOpen").click();
    await expect(page.locator("#cardImg")).toHaveJSProperty("naturalWidth", 1080);
    await expect(page.locator("#cardImg")).toHaveJSProperty("naturalHeight", 1350);
    await expect(page.locator("#cardShare")).toBeHidden();
    const download = page.waitForEvent("download");
    await page.locator("#cardSave").click();
    expect((await download).suggestedFilename()).toBe("study-pet-mochi.png");
  });

  test("uses the share sheet where the browser can share files", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async data => { window.shared = { name: data.files[0].name, type: data.files[0].type, size: data.files[0].size, text: data.text }; };
    });
    await open(page, { save: petSave({ name: "Mochi" }) });
    await page.locator("#cardOpen").click();
    await page.locator("#cardShare").click();
    const shared = await page.waitForFunction(() => window.shared).then(h => h.jsonValue());
    expect(shared).toMatchObject({ name: "study-pet-mochi.png", type: "image/png", text: "Studying with Mochi on Study Pet." });
    expect(shared.size).toBeGreaterThan(5000);
  });
});

test.describe("moving to another device", () => {
  // Read the QR code off the screen with a real QR reader, like a phone camera would.
  async function scanMoveCode(page) {
    await page.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
    return page.locator("#moveQR").evaluate(c => {
      const g = c.getContext("2d"), img = g.getImageData(0, 0, c.width, c.height);
      const r = window.jsQR(img.data, c.width, c.height);
      return r && r.data;
    });
  }
  const album = [{ earned: true, name: "Sprout", seed: 7, accessory: "hat", sessions: 21, minutes: 540, bestStreak: 5, notes: 6, totalNotes: 6,
                   since: MORNING.getTime() - 40 * 864e5, grownAt: MORNING.getTime() - 20 * 864e5, letter: "", letterFrom: "" }];

  test("scanning the code on a new device moves the pet over", async ({ page, browser }) => {
    await open(page, { save: petSave({ name: "Mochi", seed: 44, album, days: { "2026-10-5": 45 } }) });
    await page.locator("#moveBtn").click();
    await expect(page.locator("#moveQR")).toBeVisible();
    const link = await scanMoveCode(page);
    expect(link).toMatch(/^http:\/\/localhost:\d+\/#move=[\w-]+$/);

    const other = await (await browser.newContext()).newPage();   // a different device: nothing saved yet
    await other.clock.install({ time: MORNING });
    await other.goto(link);
    await expect(other.locator("#moveAskTitle")).toHaveText("Move Mochi here?");
    await expect(other.locator("#moveAskText")).toHaveText("Mochi has 9 sessions, with 1 more in the album, raised by Alex.");
    await expect(other.locator("#nameDlg")).toBeHidden();                  // no name prompt over it
    expect(other.url()).not.toContain("#move");                             // the link is gone from the address bar
    await other.locator("#moveAccept").click();
    await expect(other.locator("#msg")).toHaveText("Mochi moved over with all your progress. Welcome back, Alex!");
    await expect(other.locator("#petName")).toHaveText("Mochi");
    await expect(other.locator("#album li")).toContainText("Sprout");
    await expect(other.locator("#weekTotal")).toHaveText("45m");
    await expect(other.locator("#nameDlg")).toBeHidden();
    await other.reload();
    await expect(other.locator("#petName")).toHaveText("Mochi");
  });

  test("a device that already has a pet warns before replacing it", async ({ page }) => {
    await open(page, { save: petSave({ name: "Mochi" }) });
    await page.locator("#moveBtn").click();
    const link = await scanMoveCode(page);
    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.name = "Bean"; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await page.reload();
    await page.goto(link);
    await expect(page.locator("#moveAskText")).toContainText("This replaces Bean on this device.");
    await page.locator("#moveAskDlg [data-close]").click();
    await expect(page.locator("#petName")).toHaveText("Bean");             // cancelling changes nothing
  });

  test("a move link can be pasted, and a damaged one changes nothing", async ({ page }) => {
    await open(page, { save: petSave({ name: "Mochi" }) });
    await page.locator("#moveBtn").click();
    const link = await scanMoveCode(page);
    await page.locator("#moveDlg [data-close]").click();
    await page.goto("./#move=zAAAA");
    await expect(page.locator("#msg")).toContainText("This move link looks incomplete");
    await page.locator("#invPasteOpen").click();
    await page.locator("#invPasteInput").fill(link);
    await page.locator("#invPasteGo").click();
    await expect(page.locator("#moveAskTitle")).toHaveText("Move Mochi here?");
  });
});

test.describe("the album", () => {
  const grown = (extra = {}) => petSave({ name: "Mochi", seed: 11, sessions: 20, minutes: 500, bestStreak: 6,
    firstStudyAt: MORNING.getTime() - 20 * 864e5, grownAt: MORNING.getTime() - 864e5, ...extra });

  test("a grown pet moves into the album and a new egg arrives", async ({ page }) => {
    await open(page, { save: grown() });
    await expect(page.locator("#album")).toBeHidden();
    await page.locator("#sealNewPet").click();
    await expect(page.locator("#newPetLead")).toContainText("Mochi moves into your album");
    await page.locator("#newPetName").fill("Bean");
    await page.locator("#newPetGo").click();

    await expect(page.locator("#msg")).toContainText("Mochi is in your album now. Say hello to Bean, your 2nd pet!");
    await expect(page.locator("#petName")).toHaveText("Bean");
    await expect(page.locator("#small")).toHaveText("Study once to hatch");
    await expect(page.locator("#sealCount")).toHaveText("0 of 20 sessions");
    await expect(page.locator("#stSessions")).toHaveText("20");             // lifetime totals carry on
    await expect(page.locator("#album li")).toHaveCount(1);
    await expect(page.locator("#album li")).toContainText("Mochi");
    await expect(page.locator("#album li")).toContainText("20 sessions, 8h 20m");

    await page.reload();
    await page.getByRole("button", { name: "Mochi's certificate" }).click();
    await expect(page.locator("#certFor")).toContainText("for raising Mochi");
    await expect(page.locator("#certLook")).toHaveText("A chubby pet with a belly patch, long bunny ears, a fluffy tail and a curl on top.");
    await expect(page.locator("#certNewPet")).toBeHidden();                 // only the current pet can move on
  });

  test("the new pet only offers to move on once it's grown too", async ({ page }) => {
    await open(page, { save: grown() });
    await expect(page.locator("#sealNewPet")).toBeVisible();
    await page.locator("#sealOpen").click();
    await expect(page.locator("#certNewPet")).toBeVisible();
    await page.locator("#certNewPet").click();
    await page.locator("#newPetGo").click();
    await expect(page.locator("#petName")).toHaveText("Pip");               // a default name if left blank
    await expect(page.locator("#sealNewPet")).toBeHidden();
  });
});

test.describe("the sealed certificate", () => {
  test("shows progress, unseals at full growth, and names the person", async ({ page }) => {
    await open(page, { save: petSave({ sessions: 19, minutes: 475, bestStreak: 5, firstStudyAt: MORNING.getTime() - 20 * 864e5 }) });
    await expect(page.locator("#sealCount")).toHaveText("19 of 20 sessions");
    await expect(page.locator("#sealMeter")).toHaveAttribute("aria-valuenow", "19");
    await expect(page.locator("#sealOpen")).toBeHidden();

    await page.getByRole("radio", { name: "15 min" }).check();
    await page.locator("#keyFocus").click();
    await page.clock.fastForward("15:01");
    await expect(page.locator("#msg")).toContainText("Your certificate is unsealed");
    await expect(page.locator("#sealLocked")).toBeHidden();
    await expect(page.locator("#sealNew")).toBeVisible();

    await page.locator("#sealOpen").click();
    await expect(page.locator("#certFor")).toContainText("for raising Pip from an egg to a grown-up");
    await expect(page.locator("#certStats")).toContainText("Focus sessions20");
    await expect(page.locator("#certStats")).toContainText("Focus time8h 10m");
    await expect(page.locator("#certStats")).toContainText("Longest streak5 days");
    await expect(page.locator("#certName")).toHaveText("Alex");                // the person's own name
    await page.locator("#certDlg [data-close]").click();
    await expect(page.locator("#sealNew")).toBeHidden();
  });

  test("prints only the certificate", async ({ page }) => {
    await open(page, { save: petSave({ sessions: 20, grownAt: MORNING.getTime() }) });
    await page.locator("#sealOpen").click();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator(".cert")).toBeVisible();
    await expect(page.locator("#certPrint")).toBeHidden();
  });
});

test.describe("invites", () => {
  // Build an invite in one browser, then open it in a fresh one, like a friend would.
  async function buildInvite(page, { from, to, welcome, accessory, ps = {}, letter } = {}) {
    await page.locator("#invOpen").click();
    if (from !== undefined) await page.locator("#invFrom").fill(from);
    if (to) await page.locator("#invTo").fill(to);
    if (welcome) await page.locator("#invWelcome").fill(welcome);
    if (accessory) await page.locator("#invAccessories").getByRole("radio", { name: accessory }).check();
    if (Object.keys(ps).length) {
      await page.locator(".ps-block summary").click();
      for (const [id, text] of Object.entries(ps)) await page.locator(`#invPS textarea[data-note="${id}"]`).fill(text);
    }
    if (letter) await page.locator("#invLetter").fill(letter);
    await page.locator("#invMake").click();
    return page.locator("#invLink").inputValue();
  }
  const frame = page => page.locator("#screen").evaluate(c => c.toDataURL());

  test("a full invite welcomes a new friend and follows them to the certificate", async ({ page, browser }) => {
    await open(page, { save: petSave() });
    const link = await buildInvite(page, { from: "Jamie", to: "Riley", welcome: "Made this for you 💜", accessory: "Bow",
      ps: { hatch: "So proud of you!" }, letter: "You did it. Dinner's on me." });
    await expect(page.locator("#invStatus")).toContainText("Link ready with 3 extras");
    expect(link).toMatch(/#invite=[\w-]+$/);

    const friend = await browser.newPage();
    await friend.clock.install({ time: MORNING });
    await friend.goto(link);
    await expect(friend.locator("#welcomeTitle")).toHaveText("For Riley, from Jamie");
    await expect(friend.locator("#welcomeMsg")).toHaveText("Made this for you 💜");
    await expect(friend.locator("#welcomeExtras")).toContainText("Your pet wears a bow.");
    await expect(friend.locator("#welcomeExtras")).toContainText("Jamie sealed a message inside your certificate.");
    expect(friend.url()).not.toContain("#invite");                          // removed from the address bar
    await friend.locator("#welcomeDlg [data-close]").click();
    await expect(friend.locator("#userInput")).toHaveValue("Riley");         // the name prompt comes after the welcome, pre-filled
    await nameThePet(friend, "Bo");
    await expect(friend.locator("#dedication")).toHaveText("For Riley, from Jamie");
    await expect(friend.locator("#sealHint")).toContainText("Jamie left a message inside");
    await expect(friend.locator(".locked", { hasText: "hatch the egg" })).toContainText("P.S. from Jamie");

    await friend.getByRole("radio", { name: "15 min" }).check();
    await friend.locator("#keyFocus").click();
    await friend.clock.fastForward("15:01");
    await friend.locator(".note-btn", { hasText: "Hatch the egg" }).click();
    await expect(friend.locator("#noteText")).toHaveText("You hatched me! I'll keep you company while you study.");
    await expect(friend.locator("#notePS")).toHaveText("P.S. from Jamie: So proud of you!");
    await friend.locator("#noteDlg [data-close]").click();

    // Jump to a grown pet to read the certificate.
    await friend.evaluate(k => {
      const s = JSON.parse(localStorage.getItem(k));
      s.sessions = 20; s.grownAt = s.lastStudyAt;
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY);
    await friend.reload();
    await friend.locator("#sealOpen").click();
    await expect(friend.locator("#certName")).toHaveText("Riley");
    await expect(friend.locator("#certMsg")).toHaveText("“You did it. Dinner's on me.”\nFrom Jamie");
    await friend.close();
  });

  test("an invite's gifts change how the pet looks", async ({ page }) => {
    await open(page, { save: petSave() });
    const link = await buildInvite(page, { from: "Sam", accessory: "Party hat" });
    await page.locator("#inviteDlg [data-close]").click();
    await page.clock.pauseAt(new Date(MORNING.getTime() + 60000));
    const before = await frame(page);
    await page.goto(link);
    await page.locator("#invAccept").click();
    await page.locator("#welcomeDlg [data-close]").click();
    expect(await frame(page)).not.toBe(before);
  });

  test("a plain invite only needs a name", async ({ page }) => {
    await open(page, { save: petSave() });
    await buildInvite(page, { from: "" });
    await expect(page.locator("#invStatus")).toHaveText("Add your name so they know who the invite is from.");
    await expect(page.locator("#invOut")).toBeHidden();
    await page.locator("#invFrom").fill("Sam");
    await page.locator("#invMake").click();
    await expect(page.locator("#invStatus")).toContainText("Link ready.");
    expect((await page.locator("#invLink").inputValue()).length).toBeLessThan(100);
  });

  test("a pet with progress asks before taking an invite", async ({ page }) => {
    await open(page, { save: petSave({ notes: { hatch: { at: 1, read: true } } }) });
    const link = await buildInvite(page, { from: "Sam", ps: { hatch: "Hi from Sam" } });
    await page.locator("#inviteDlg [data-close]").click();
    await page.goto(link);
    await expect(page.locator("#invAskTitle")).toHaveText("Sam sent you an invite");
    await expect(page.locator("#invAskText")).toContainText("Your progress stays the same");
    await page.locator("#invAccept").click();
    await page.locator("#welcomeDlg [data-close]").click();
    await expect(page.locator("#dedication")).toHaveText("Invited by Sam");
    await expect(page.locator("#stSessions")).toHaveText("9");
    await expect(page.locator(".note-btn", { hasText: "Hatch the egg" })).toContainText("New");   // gained a P.S.
  });

  test("an invite link can be pasted in, for apps a link can't open", async ({ page }) => {
    await open(page, { save: petSave() });
    const link = await buildInvite(page, { from: "Ana" });
    await page.locator("#inviteDlg [data-close]").click();
    await page.locator("#invPasteOpen").click();
    await page.locator("#invPasteInput").fill("hello");
    await page.locator("#invPasteGo").click();
    await expect(page.locator("#invPasteStatus")).toContainText("isn't a Study Pet invite or move link");
    await page.locator("#invPasteInput").fill(`Check this out: ${link}`);
    await page.locator("#invPasteGo").click();
    await page.locator("#invAccept").click();
    await expect(page.locator("#welcomeTitle")).toHaveText("Ana invited you");
  });

  test("the certificate invites the next person, from them by name", async ({ page }) => {
    await open(page, { save: petSave({ sessions: 20, grownAt: MORNING.getTime(),
      invite: { from: "Jamie", to: "Riley", welcome: "", ps: {}, letter: "", accessory: null } }) });
    await page.locator("#sealOpen").click();
    await page.locator("#certInvite").click();
    await expect(page.locator("#inviteDlg")).toBeVisible();
    await expect(page.locator("#invFrom")).toHaveValue("Alex");               // from the person, by name
  });

  test("a damaged link explains itself and changes nothing", async ({ page }) => {
    await open(page, { save: petSave() });
    await page.goto("./#invite=eyJ2IjoyLCJmIjoiRX");
    await expect(page.locator("#msg")).toContainText("This invite link looks incomplete");
    await expect(page.locator("#dedication")).toBeHidden();
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
