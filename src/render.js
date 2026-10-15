// Pixel renderer: draws one frame of the LCD from a "view" object.
// It reads state but never changes it.

import { ballHeight } from "./engine.js";

const W = 64, H = 48, GROUND = 45;
// Screen colors. Each device shell has its own (see SHELLS in config.js); the
// screen behind the canvas is styled to match in styles.css.
export const PALETTES = {
  classic: { ink: "#28331F", body: "#AAB98C", spot: "#93A276", ghost: "rgba(40,51,31,.17)", lcd: "#B9C79A" },
  glacier: { ink: "#133A40", body: "#A3CFC9", spot: "#86B8B2", ghost: "rgba(19,58,64,.17)", lcd: "#BFE0DC" },
  sweet:   { ink: "#4A2238", body: "#F2BACD", spot: "#E59AB5", ghost: "rgba(74,34,56,.17)", lcd: "#F6E6D6" },
  quest:   { ink: "#1A1640", body: "#C9BFFF", spot: "#A496F0", ghost: "rgba(26,22,64,.16)", lcd: "#E6EAFF" }
};
let INK, BODY, SPOT, GHOST, LCD;
export function setPalette(id) {
  ({ ink: INK, body: BODY, spot: SPOT, ghost: GHOST, lcd: LCD } = PALETTES[id] || PALETTES.classic);
}
setPalette("classic");
export const HATCH_MS = 3600, GROW_MS = 1800, PAT_MS = 1200, TREAT_MS = 1800;

let cx = null;          // the canvas context for the frame being drawn
let fillNow = null;     // its current fill color: setting the same color again still costs a parse

/* ---------- Low-level drawing ---------- */
function fill(c) {
  if (c !== fillNow) { cx.fillStyle = c; fillNow = c; }
}
function rect(x, y, w, h, c) { fill(c); cx.fillRect(x, y, w, h); }

// Pixel art from strings: "#" is `ink` (INK unless given), "+" the darker body color, "." empty.
// Each row is drawn as runs of one color rather than pixel by pixel.
function sprite(rows, x, y, ink = INK) {
  x = Math.round(x); y = Math.round(y);
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length;) {
      let k = i + 1;
      while (k < r.length && r[k] === r[i]) k++;
      if (r[i] !== ".") rect(x + i, y + j, k - i, 1, r[i] === "#" ? ink : SPOT);
      i = k;
    }
  });
}
const spriteC = (rows, centerX, y, ink) => sprite(rows, centerX - rows[0].length / 2, y, ink);

/* ---------- Shapes ---------- */
// Round shapes (the body, ears, the egg) are built from ellipses on a 64x48 grid:
// edge pixels (an empty neighbor) get ink, inside pixels a fill color. Building
// one tests every pixel, so each finished shape is kept as runs of one color
// and reused; a pet only takes a handful of poses.
const INK_C = 1, BODY_C = 2, SPOT_C = 3;   // color codes in a grid; the palette picks the colors when drawn
const colorOf = code => (code === INK_C ? INK : code === BODY_C ? BODY : SPOT);

function inEllipse(x, y, e) {
  const dx = (x + .5 - e.x) / e.rx, dy = (y + .5 - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}
// A mask marks which pixels belong to a shape (1) and which don't (0).
function makeMask(parts, keep) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (keep && !keep(x, y)) continue;
    if (parts.some(p => inEllipse(x, y, p))) m[y * W + x] = 1;
  }
  return m;
}
const inside = (m, i) => m[i - 1] && m[i + 1] && m[i - W] && m[i + W];
// Mask -> grid of color codes, written over `grid` (a new one when not given).
function paintMask(m, fillCode, grid = new Uint8Array(W * H)) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!m[i]) continue;
    const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1 || !inside(m, i);
    grid[i] = edge ? INK_C : fillCode;
  }
  return grid;
}
// Grid -> runs of one color, grouped by color: { code: [x, y, length, ...] }.
function toRuns(grid) {
  const runs = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
    const c = grid[y * W + x];
    let k = x + 1;
    while (k < W && grid[y * W + k] === c) k++;
    if (c) (runs[c] = runs[c] || []).push(x, y, k - x);
    x = k;
  }
  return runs;
}
function drawRuns(runs, dx = 0, dy = 0) {
  for (const code in runs) {
    const r = runs[code];
    fill(colorOf(+code));
    for (let i = 0; i < r.length; i += 3) cx.fillRect(r[i] + dx, r[i + 1] + dy, r[i + 2], 1);
  }
}
const shapes = new Map();
function cachedShape(key, build) {
  let runs = shapes.get(key);
  if (!runs) {
    if (shapes.size >= 200) shapes.clear();   // more than any session uses; just a safety cap
    shapes.set(key, runs = toRuns(build()));
  }
  return runs;
}

/* ---------- Sprites ---------- */
const EYES = { open: ["##", "##"], blink: ["##"], down: ["##"], closed: [".##.", "#..#"], joy: [".#.", "#.#"] };
const MOUTHS = { smile: ["#..#", ".##."], open: [".##.", "#..#", ".##."], flat: ["##"], small: ["##"], grin: ["#....#", ".####."] };
const HEART = [".#.#.", "#####", ".###.", "..#.."];
const ENVELOPE = ["#######", "##...##", "#.#.#.#", "#..#..#", "#######"];
const BOOK = [
  [".####.####.", "#....#....#", "#.##.#.##.#", "#....#....#", "###########"],
  [".####.##...", "#....#..#..", "#.##.#.#.#.", "#....#..#..", "###########"]
];
const BALL = [".###.", "#..##", "#.#.#", "##..#", ".###."];
const ZED = ["###", "..#", ".#.", "#..", "###"];
const SPARK = [".#.", "###", ".#."];
const BLUSH = ["++"];

/* ---------- The pet ---------- */
// How a pet looks comes from its traits (see petLook in engine.js). Without
// traits it gets the original look: round, plain, pointy ears, no tail, a sprout.
const DEFAULT_LOOK = { shape: "round", marks: "plain", ears: "pointy", tail: "none", topper: "sprout" };
const SIZES = [null, [9, 7.5], [10, 9], [10.5, 10.5], [11.5, 11.5]];   // body radii per stage
const SHAPES = { round: [1, 1], wide: [1.12, .93], tall: [.9, 1.1] };   // width and height multipliers
function petParts(st, x, ground, squash, dog, look) {
  const [mw, mh] = SHAPES[look.shape];
  const rx = SIZES[st][0] * mw + squash, ry = SIZES[st][1] * mh - squash;
  const cy = ground - ry - (st >= 2 ? 1.5 : 0);
  const parts = [{ x, y: cy, rx, ry }];
  if (st >= 2) {
    if (!dog) parts.push(...earParts(look.ears, x, cy, rx, ry));
    parts.push({ x: x - rx * .45, y: cy + ry - .5, rx: 3, ry: 2.2 }, { x: x + rx * .45, y: cy + ry - .5, rx: 3, ry: 2.2 });    // feet
  }
  if (st >= 3) {
    parts.push({ x: x - rx - .3, y: cy + 2, rx: 2.8, ry: 2 }, { x: x + rx + .3, y: cy + 2, rx: 2.8, ry: 2 });  // arms
    if (look.tail === "fluffy") parts.push({ x: x + rx + .8, y: cy + ry * .62, rx: 3.3, ry: 2.7 });
  }
  return { parts, cy, rx, ry };
}
function earParts(kind, x, cy, rx, ry) {
  const pair = (dx, y, erx, ery) => [{ x: x - dx, y, rx: erx, ry: ery }, { x: x + dx, y, rx: erx, ry: ery }];
  if (kind === "pointy") return pair(rx * .55, cy - ry + 1.5, 2.6, 4);
  if (kind === "round") return pair(rx * .62, cy - ry + 1.4, 2.9, 2.9);
  if (kind === "bunny") return pair(rx * .42, cy - ry - 2.4, 1.9, 5.4);
  return [];                                     // antennae are drawn as sprites
}
// Eye position, shared by the faces and the eye patch.
const eyeAt = (rx, ry, cy, dog) => ({ ex: Math.max(3, Math.round(rx * .4)), ey: Math.round(cy - ry * (dog ? .25 : .2)) });

// Markings sit inside the body outline, in the darker body color.
const SPOTS = [[-.58, .28], [.6, -.48], [.4, .55], [-.25, -.66], [-.62, -.3]];
function paintMarks(kind, mask, grid, x, cy, rx, ry, dog) {
  if (kind === "plain") return;
  const { ex, ey } = eyeAt(rx, ry, cy, dog);
  const inMark = {
    spots:   (px, py) => SPOTS.some(([dx, dy]) => Math.abs(px + .5 - (x + dx * rx)) <= 1 && Math.abs(py + .5 - (cy + dy * ry)) <= 1),
    belly:   (px, py) => py > ey + (dog ? 7 : 5) && ((px + .5 - x) / (rx * .5)) ** 2 + ((py + .5 - (cy + ry * .66)) / (ry * .36)) ** 2 <= 1,
    stripes: (px, py) => py + .5 < cy - ry * .5 && [-3, 0, 3].includes(Math.floor(px - x + .5)),
    patch:   (px, py) => ((px + .5 - (x + ex)) / 3) ** 2 + ((py + .5 - (ey + .5)) / 2.7) ** 2 <= 1
  }[kind];
  for (let y = 1; y < H - 1; y++) for (let px = 1; px < W - 1; px++) {
    const i = y * W + px;
    if (mask[i] && inside(mask, i) && inMark(px, y)) grid[i] = SPOT_C;
  }
}
// The puppy's floppy ears hang over the sides of the head, above the arms.
function paintDogEars(grid, x, cy, rx, ry, st) {
  const er = { rx: 2.2 + st * .35, ry: 3.6 + st * .55 }, ey = cy - ry * .55 + er.ry * .4;
  const ears = makeMask([{ x: x - rx + er.rx * .2, y: ey, ...er }, { x: x + rx - er.rx * .2, y: ey, ...er }]);
  const over = paintMask(ears, SPOT_C);
  over.forEach((c, i) => { if (c) grid[i] = c; });
}
// Body, markings and floppy ears: everything round about the pet, in one cached shape.
function petBody(st, P, o, look) {
  const key = ["pet", st, o.x, o.ground, o.squash || 0, o.dog ? 1 : 0, look.shape, look.marks, look.ears, look.tail].join();
  return cachedShape(key, () => {
    const mask = makeMask(P.parts), grid = paintMask(mask, BODY_C);
    paintMarks(look.marks, mask, grid, o.x, P.cy, P.rx, P.ry, o.dog);
    if (o.dog) paintDogEars(grid, o.x, P.cy, P.rx, P.ry, st);
    return grid;
  });
}

const ANTENNA_L = ["##..", "##..", "..#.", "..#."], ANTENNA_R = ["..##", "..##", ".#..", ".#.."];
const TAILS = { curl: [".##.", "#..#", "#.#.", ".#.."], zigzag: ["#..", ".#.", "..#", ".#.", "#.."] };
const TOPPERS = {
  sprout: ["..##", ".#.#", "#.#.", ".#.."],
  leaves: ["##...##", "#+#.#+#", ".##.##.", "...#..."],
  star:   ["..#..", "..#..", "#####", ".###.", ".#.#."],
  curl:   [".##.", "#..#", "...#", "..#."]
};

// The puppy look has a nose and a dog mouth, set a little lower.
const NOSE = ["###", ".#."];
const DOG_MOUTHS = { smile: ["#.#.#", ".#.#."], open: ["#.#.#", ".###.", ".###."], flat: ["#.#"], small: ["#"], grin: ["#.#.#", ".###.", "..#.."] };
function drawFace(x, cy, rx, ry, face, blush, dog) {
  const { ex, ey } = eyeAt(rx, ry, cy, dog);
  const lower = face.eyes === "blink" || face.eyes === "down" ? 1 : 0;
  spriteC(EYES[face.eyes], x - ex, ey + lower);
  spriteC(EYES[face.eyes], x + ex, ey + lower);
  if (dog) spriteC(NOSE, x, ey + 3);
  spriteC((dog ? DOG_MOUTHS : MOUTHS)[face.mouth], x, ey + (dog ? 5 : 4));
  if (blush) { spriteC(BLUSH, x - ex - 2, ey + (dog ? 4 : 3)); spriteC(BLUSH, x + ex + 2, ey + (dog ? 4 : 3)); }
}
// Gifts from an invite.
const ACCESSORY_SPRITES = {
  bow:    ["##...##", "#+#.#+#", "#++#++#", "#+#.#+#", "##...##"],
  flower: [".#.#.", "#+#+#", ".###.", "#+#+#", ".#.#."],
  hat:    ["..#..", ".###.", "..#..", ".#+#.", ".#+#.", "#+++#", "#####"]
};
function drawAccessory(kind, x, cy, rx, ry) {
  const rows = ACCESSORY_SPRITES[kind], top = cy - ry;
  if (kind === "hat") sprite(rows, x - 2, top - rows.length + 1);          // on top of the head
  else if (kind === "bow") sprite(rows, x + rx * .45 - 3, top - 1);         // off to one side, clear of the topper
  else sprite(rows, x - rx * .4 - 2, top - 1);                              // tucked behind an ear
}
// o = { x, ground, squash, face, blush, dog, accessory, look, holiday }
function drawPet(st, o) {
  const look = o.look || DEFAULT_LOOK;
  const P = petParts(st, o.x, o.ground, o.squash || 0, o.dog, look);
  const top = P.cy - P.ry;
  if (st >= 3 && TAILS[look.tail]) sprite(TAILS[look.tail], o.x + P.rx - .5, P.cy + P.ry * .38);   // behind the body
  drawRuns(petBody(st, P, o, look));
  if (!o.dog && st >= 2 && look.ears === "antennae") { sprite(ANTENNA_L, o.x - 6, top - 3); sprite(ANTENNA_R, o.x + 2, top - 3); }
  // A holiday hat sits where the topper goes; an invite's party hat stays on instead.
  const hat = o.holiday && o.accessory !== "hat" ? HOLIDAY_HATS[o.holiday.id] : null;
  if (hat) hat.forEach(([rows, dx]) => sprite(rows, o.x + dx, top - rows.length + 1));
  else if (st === 4 && o.accessory !== "hat") { const t = TOPPERS[look.topper]; sprite(t, o.x - Math.floor(t[0].length / 2), top - t.length); }
  if (o.accessory) drawAccessory(o.accessory, o.x, P.cy, P.rx, P.ry);
  drawFace(o.x, P.cy, P.rx, P.ry, o.face, o.blush, o.dog);
  return P;
}
// A heart floating up from the pet's head, `lift` pixels so far (at most 4).
const heartAbove = (x, P, lift) => sprite(HEART, x + 6, P.cy - P.ry - 6 - Math.min(4, lift));

/* ---------- Holidays ---------- */
// Each holiday (see holidays.js) can bring a hat, a prop standing at the left
// of the ground, and something moving in the sky at the top left. They all stay
// in the space the pet and the ball never use.
const BOPPER = [".#.#.", "#+#+#", ".###.", "..#..", "..#..", "..#.."];
const HOLIDAY_HATS = {   // a list of [sprite, x offset from the pet's center]
  newyear:      [[ACCESSORY_SPRITES.hat, -2]],
  christmas:    [[["....##...", "...#++#..", "..#+++#.#", ".#++++#.#", "#########", "#.#.#.#.#", "#########"], -4]],
  valentine:    [[BOPPER, -7], [BOPPER, 2]],
  stpatrick:    [[["..###..", "..#+#..", "###+###", "#+++++#", "###+###", "...#...", "..#...."], -3]],
  july4:        [[["..#####..", "..#+#+#..", "..#####..", "..#+#+#..", "..#####..", "#########"], -4]],
  halloween:    [[["....#....", "...##....", "...#+#...", "..#++#...", "..#+++#..", ".#+++++#.", "#########"], -4]],
  thanksgiving: [[["..#####..", "..#+++#..", "..#+++#..", "..#####..", "..#+#+#..", "#########"], -4]]
};
const HOLIDAY_PROPS = {
  christmas:    ["....#....", "...###...", "..#+++#..", "...#+#...", "..#+++#..", ".#+++++#.", "#########", "....#....", "...###..."],
  lunarnewyear: ["...#...", ".#####.", "#+#+#+#", "#+#+#+#", "#+#+#+#", ".#####.", "...#...", "..#.#.."],
  stpatrick:    [".#.#.#.", "#######", ".#+++#.", "#+++++#", "#+++++#", ".#####."],
  easter:       ["..###..", ".#+++#.", "#.#.#.#", "#+++++#", "#.#.#.#", ".#+++#.", "..###.."],
  halloween:    ["....#....", ".###.###.", "#+++++++#", "#+.+++.+#", "#+++++++#", "#+.+.+.+#", ".#######."],
  thanksgiving: ["..#####..", ".#+.+.+#.", "#########", "#+++++++#", ".#######."]
};
const BURST = ["#...#...#", ".#.....#.", "...#.#...", "#.#...#.#", "...#.#...", ".#.....#.", "#...#...#"];
const FIREWORKS = [[SPARK, 4, 12], [BURST, 2, 10], [SPARK, 9, 15], [BURST, 5, 17]];   // one per frame
const BAT = [["#.....#", "##...##", ".##.##.", "..###..", "...#..."], ["..#.#..", ".#####.", "##.#.##", "#.....#"]];

// Hanukkah: a menorah with tonight's candles lit; the tall one in the middle lights the rest.
function drawMenorah(nights, now, rm) {
  const x0 = 1, base = GROUND;
  for (let k = 0; k < 9; k++) {
    const shamash = k === 4, lit = shamash || (k > 4 ? 9 - k : 8 - k) <= nights;   // one more each night, filling in from the right
    const x = x0 + k, top = base - 5 - (shamash ? 1 : 0);
    rect(x, top, 1, 3, lit ? INK : SPOT);   // the candles touch, so lit ones are dark
    if (lit && (rm || (Math.floor(now / 300) + k) % 3)) rect(x, top - 1, 1, 1, INK);
  }
  rect(x0, base - 2, 9, 1, INK); rect(x0 + 4, base - 1, 1, 1, INK); rect(x0 + 2, base, 5, 1, INK);
}
// Snow falls behind the pet, so it's drawn first.
function drawSnow(now, rm) {
  for (let k = 0; k < 14; k++) {
    const x = (k * 23 + 7) % W, speed = 1 + (k % 3);
    const y = rm ? (k * 13) % H : Math.floor(now / 160 * speed / 3 + k * 17) % H;
    rect(x, y, 1, 1, GHOST);
  }
}
function drawHoliday(h, now, rm) {
  if (h.id === "christmas") drawSnow(now, rm);
  const prop = HOLIDAY_PROPS[h.id];
  if (prop) sprite(prop, 1, GROUND - prop.length + 1);
  if (h.id === "hanukkah") drawMenorah(Math.min(8, h.day + 1), now, rm);
  if (h.id === "newyear" || h.id === "july4") {
    const [rows, x, y] = FIREWORKS[rm ? 1 : Math.floor(now / 400) % 4];
    sprite(rows, x, y);
  }
  if (h.id === "halloween") {                           // a bat flapping in the corner
    const f = rm ? 0 : Math.floor(now / 250) % 2, bob = rm ? 0 : Math.round(Math.sin(now / 700) * 2);
    sprite(BAT[f], 3, 13 + bob);
  }
  if (h.id === "valentine") {                           // hearts floating up
    [0, 1].forEach(k => {
      const t = rm ? 0.5 : ((now / 3000) + k / 2) % 1;
      sprite(HEART, 3 + k * 5, Math.round(30 - t * 20));
    });
  }
}

/* ---------- Treats ---------- */
// A cookie held up to the mouth, eaten in three bites.
const COOKIE = [
  [".###.", "#+#+#", "#+++#", "#+#+#", ".###."],
  [".##..", "#+#..", "#++#.", "#+#+#", ".###."],
  ["#+#", ".##"],
  []
];

/* ---------- The egg ---------- */
const EGG = { rx: 8, ry: 10.5 };
const CRACK = [0, -1, -2, -1, 0, 1, 0, -1, -2, -1, 0, 1, 0, -1, -2, -1, 0];   // dy for dx = -8..8
const EGG_CY = GROUND - EGG.ry;
const crackDy = dx => CRACK[Math.max(0, Math.min(16, Math.round(dx) + 8))];
// The whole egg, with its spots and a crack `crackLen` pixels long.
function drawEgg(x, crackLen) {
  drawRuns(eggShell(x, "whole"));
  sprite(["++", "++"], x - 4, EGG_CY - 6); sprite(["++"], x + 3, EGG_CY - 2); sprite(["++", "++"], x + 1, EGG_CY + 5);
  for (let k = 0; k < crackLen; k++) rect(Math.round(x) + k - 8, Math.round(EGG_CY) + CRACK[k], 1, 1, INK);
}
// The egg's outline, whole or split along the crack into its "top" and "bottom".
function eggShell(x, part) {
  return cachedShape(`egg,${x},${part}`, () => {
    const below = (px, py) => py >= EGG_CY + crackDy(px + .5 - x);
    const keep = part === "bottom" ? below : part === "top" ? (px, py) => !below(px, py) : null;
    return paintMask(makeMask([{ x, y: EGG_CY, ...EGG }], keep), BODY_C);
  });
}

function drawSparkles(now) {
  const on = Math.floor(now / 200) % 2;
  [[12, 14], [50, 12], [16, 30], [48, 30]].forEach(([sx, sy], k) => { if ((k + on) % 2) sprite(SPARK, sx, sy); });
}

function drawHatch(t, now, rm, pet) {
  const x = 32, joy = { eyes: "joy", mouth: "grin" };
  if (t < 1500) {
    const shake = rm ? 0 : (Math.floor(t / 70) % 2 ? 1 : -1);
    drawEgg(x + shake, Math.min(17, Math.floor(t / 1500 * 18)));
  } else if (t < 2600) {
    const p = (t - 1500) / 1100;
    drawPet(1, { ...pet, x, ground: GROUND + Math.round((1 - p) * 8), face: joy });
    drawRuns(eggShell(x, "bottom"));
    drawRuns(eggShell(x, "top"), -Math.round(p * 6), -Math.round(p * 14));   // the top flies off
  } else {
    const hop = rm ? 0 : Math.round(Math.abs(Math.sin((t - 2600) / 1000 * Math.PI * 2)) * 3);
    drawPet(1, { ...pet, x, ground: GROUND - hop, face: joy, blush: true });
    drawSparkles(now);
  }
}

/* ---------- One frame ---------- */
// v = { now, mood, stage, hearts, unread, treats, hatchAt, growAt, patAt, catchAt, treatAt, rm, dog, accessory, look, holiday, portrait }
// portrait: just the pet, for the certificate and pictures.
export function draw(ctx, v) {
  cx = ctx; fillNow = null;
  const { now, mood: m, stage: st, rm, holiday } = v;
  const pet = { dog: v.dog, accessory: v.accessory, look: v.look };
  cx.clearRect(0, 0, W, H);
  if (holiday) drawHoliday(holiday, now, rm);
  if (!v.portrait) {
    for (let k = 0; k < 4; k++) sprite(HEART, 2 + k * 6, 2, k < v.hearts ? INK : GHOST);
    if (v.unread && Math.floor(now / 500) % 2) sprite(ENVELOPE, 55, 2);
    if (v.treats) sprite(COOKIE[0], 28, 2);   // a treat is waiting
  }

  if (now - v.hatchAt < HATCH_MS) { drawHatch(now - v.hatchAt, now, rm, pet); return; }

  const tt = now - (v.treatAt || -1e12), eating = st > 0 && tt < TREAT_MS;
  const tp = now - v.patAt, patting = !eating && tp < PAT_MS, growing = now - v.growAt < GROW_MS;
  const beat = rm ? 0 : Math.floor(now / 600) % 2;

  if (st === 0) {
    const wob = patting && !rm ? (Math.floor(tp / 90) % 2 ? 1 : -1) : 0;
    drawEgg(32 + wob, 0);
    if (patting) sprite(HEART, 38, 14 - Math.min(4, Math.floor(tp / 250)));
    return;
  }

  let x = 32, ground = GROUND, squash = 0, face, blush = false;
  const bite = Math.min(3, Math.floor(tt / (TREAT_MS / 4)));
  if (eating) {
    face = { eyes: "joy", mouth: bite < 3 && !rm && Math.floor(tt / 150) % 2 ? "open" : "small" }; blush = true;
  } else if (patting || growing) {
    face = { eyes: "joy", mouth: "grin" }; blush = true;
    if (!rm) {
      if (patting && tp < 120) squash = 1;
      const hopT = growing ? now - v.growAt : tp - 120;
      if (hopT > 0 && hopT < (growing ? GROW_MS : 400))
        ground -= Math.round(Math.abs(Math.sin(hopT / 400 * Math.PI)) * 3);
    }
  } else if (m === "break") {
    x = 27; face = { eyes: "open", mouth: "grin" };
    if (!rm) ground -= Math.round(Math.abs(Math.sin(now / 350)) * 2);
  } else if (m === "focus") {
    face = { eyes: "down", mouth: "flat" }; ground -= rm ? 0 : Math.floor(now / 1200) % 2;
  } else if (m === "sleepy") {
    face = { eyes: "closed", mouth: "small" }; squash = rm ? 0 : (Math.floor(now / 1400) % 2) * .6;
  } else {
    const blink = (now % 4200) < 150;
    face = { eyes: blink ? "blink" : "open", mouth: m === "hungry" ? "open" : "smile" };
    ground -= beat;
    if (m === "hungry" && !rm && (now % 3000) < 240) x += Math.floor(now / 60) % 2 ? 1 : -1;
  }

  const P = drawPet(st, { ...pet, x, ground, squash, face, blush, holiday });

  if (eating) {
    const { ey } = eyeAt(P.rx, P.ry, P.cy, v.dog);
    if (COOKIE[bite].length) sprite(COOKIE[bite], x + 2, ey + (v.dog ? 5 : 3));
    else heartAbove(x, P, Math.floor((tt - TREAT_MS * .75) / 120));   // all gone: a heart
    return;
  }
  if (patting) heartAbove(x, P, Math.floor(tp / 250));
  else if (m === "break") {
    const bounce = rm ? 6 : ballHeight(now);
    sprite(BALL, 49, GROUND - 5 - bounce);
    if (now - (v.catchAt || -1e12) < 350) sprite(SPARK, 55, GROUND - 9 - bounce);   // a catch
  } else if (m === "focus") {
    const bx = x - 5.5, by = Math.round(P.cy + P.ry * .45);
    rect(Math.round(bx), by, 11, 5, LCD);
    sprite(BOOK[!rm && Math.floor(now / 2500) % 2 ? 1 : 0], bx, by);
  } else if (m === "sleepy") sprite(ZED, 48, 12 - (rm ? 0 : Math.floor(now / 700) % 3));
  else if (m === "happy" && !growing && beat) sprite(SPARK, 50, 18);
  if (growing) drawSparkles(now);
}
