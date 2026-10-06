// Pixel renderer: draws one frame of the LCD from a "view" object.
// It reads state but never changes it.

const W = 64, H = 48, GROUND = 45;
const INK = "#28331F", BODY = "#AAB98C", SPOT = "#93A276", GHOST = "rgba(40,51,31,.17)", LCD = "#B9C79A";
export const HATCH_MS = 3600, GROW_MS = 1800, PAT_MS = 1200;

let cx = null;   // the canvas context for the frame being drawn

/* ---------- Low-level drawing ---------- */
function sprite(rows, x, y, c) {
  x = Math.round(x); y = Math.round(y); cx.fillStyle = c;
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") cx.fillRect(x + i, y + j, 1, 1); });
}
const spriteC = (rows, centerX, y, c) => sprite(rows, centerX - rows[0].length / 2, y, c);

function inEllipse(x, y, e) {
  const dx = (x + .5 - e.x) / e.rx, dy = (y + .5 - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}
// A mask is a 64x48 grid of 0/1 marking which pixels belong to a shape.
function makeMask(parts, keep) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (keep && !keep(x, y)) continue;
    for (const p of parts) if (inEllipse(x, y, p)) { m[y * W + x] = 1; break; }
  }
  return m;
}
// Edge pixels (an empty neighbor) get ink; inside pixels get the fill color.
function paintMask(m, fill, dx = 0, dy = 0) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m[i]) continue;
    const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W];
    cx.fillStyle = edge ? INK : fill;
    cx.fillRect(x + dx, y + dy, 1, 1);
  }
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
function paintMarks(kind, mask, x, cy, rx, ry, dog) {
  if (kind === "plain") return;
  const { ex, ey } = eyeAt(rx, ry, cy, dog);
  const SPOTS = [[-.58, .28], [.6, -.48], [.4, .55], [-.25, -.66], [-.62, -.3]];
  const inMark = {
    spots:   (px, py) => SPOTS.some(([dx, dy]) => Math.abs(px + .5 - (x + dx * rx)) <= 1 && Math.abs(py + .5 - (cy + dy * ry)) <= 1),
    belly:   (px, py) => py > ey + (dog ? 7 : 5) && ((px + .5 - x) / (rx * .5)) ** 2 + ((py + .5 - (cy + ry * .66)) / (ry * .36)) ** 2 <= 1,
    stripes: (px, py) => py + .5 < cy - ry * .5 && [-3, 0, 3].includes(Math.floor(px - x + .5)),
    patch:   (px, py) => ((px + .5 - (x + ex)) / 3) ** 2 + ((py + .5 - (ey + .5)) / 2.7) ** 2 <= 1
  }[kind];
  cx.fillStyle = SPOT;
  for (let y = 1; y < H - 1; y++) for (let px = 1; px < W - 1; px++) {
    const i = y * W + px;
    if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - W] && mask[i + W] && inMark(px, y)) cx.fillRect(px, y, 1, 1);
  }
}

const ANTENNA_L = ["##..", "##..", "..#.", "..#."], ANTENNA_R = ["..##", "..##", ".#..", ".#.."];
const TAILS = { curl: [".##.", "#..#", "#.#.", ".#.."], zigzag: ["#..", ".#.", "..#", ".#.", "#.."] };
const TOPPERS = {
  sprout: ["..##", ".#.#", "#.#.", ".#.."],
  leaves: ["##...##", "#+#.#+#", ".##.##.", "...#..."],
  star:   ["..#..", "..#..", "#####", ".###.", ".#.#."],
  curl:   [".##.", "#..#", "...#", "..#."]
};

function drawFace(x, cy, rx, ry, face, blush) {
  const { ex, ey } = eyeAt(rx, ry, cy, false);
  const lower = (face.eyes === "blink" || face.eyes === "down") ? 1 : 0;
  spriteC(EYES[face.eyes], x - ex, ey + lower, INK);
  spriteC(EYES[face.eyes], x + ex, ey + lower, INK);
  spriteC(MOUTHS[face.mouth], x, ey + 4, INK);
  if (blush) { spriteC(["##"], x - ex - 2, ey + 3, SPOT); spriteC(["##"], x + ex + 2, ey + 3, SPOT); }
}
// The puppy look: floppy ears over the sides of the head, a nose, and a dog mouth.
const NOSE = ["###", ".#."];
const DOG_MOUTHS = { smile: ["#.#.#", ".#.#."], open: ["#.#.#", ".###.", ".###."], flat: ["#.#"], small: ["#"], grin: ["#.#.#", ".###.", "..#.."] };
function drawDogEars(x, cy, rx, ry, st) {
  const er = { rx: 2.2 + st * .35, ry: 3.6 + st * .55 }, ey = cy - ry * .55 + er.ry * .4;   // above the arms
  paintMask(makeMask([{ x: x - rx + er.rx * .2, y: ey, ...er }, { x: x + rx - er.rx * .2, y: ey, ...er }]), SPOT);
}
function drawDogFace(x, cy, rx, ry, face, blush) {
  const { ex, ey } = eyeAt(rx, ry, cy, true);
  const lower = (face.eyes === "blink" || face.eyes === "down") ? 1 : 0;
  spriteC(EYES[face.eyes], x - ex, ey + lower, INK);
  spriteC(EYES[face.eyes], x + ex, ey + lower, INK);
  spriteC(NOSE, x, ey + 3, INK);
  spriteC(DOG_MOUTHS[face.mouth], x, ey + 5, INK);
  if (blush) { spriteC(["##"], x - ex - 2, ey + 4, SPOT); spriteC(["##"], x + ex + 2, ey + 4, SPOT); }
}
// Gifts from an invite. In these sprites "#" is ink, "+" the darker body color, "." empty.
const ACCESSORY_SPRITES = {
  bow:    ["##...##", "#+#.#+#", "#++#++#", "#+#.#+#", "##...##"],
  flower: [".#.#.", "#+#+#", ".###.", "#+#+#", ".#.#."],
  hat:    ["..#..", ".###.", "..#..", ".#+#.", ".#+#.", "#+++#", "#####"]
};
function sprite2(rows, x, y) {
  x = Math.round(x); y = Math.round(y);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== ".") { cx.fillStyle = r[i] === "#" ? INK : SPOT; cx.fillRect(x + i, y + j, 1, 1); } });
}
function drawAccessory(kind, x, cy, rx, ry) {
  const rows = ACCESSORY_SPRITES[kind], top = cy - ry;
  if (kind === "hat") sprite2(rows, x - 2, top - rows.length + 1);          // on top of the head
  else if (kind === "bow") sprite2(rows, x + rx * .45 - 3, top - 1);         // off to one side, clear of the topper
  else sprite2(rows, x - rx * .4 - 2, top - 1);                              // tucked behind an ear
}
function drawPet(st, o) {
  const look = o.look || DEFAULT_LOOK;
  const P = petParts(st, o.x, o.ground, o.squash || 0, o.dog, look);
  const top = P.cy - P.ry;
  if (st >= 3 && TAILS[look.tail]) sprite(TAILS[look.tail], o.x + P.rx - .5, P.cy + P.ry * .38, INK);   // behind the body
  const mask = makeMask(P.parts);
  paintMask(mask, BODY);
  paintMarks(look.marks, mask, o.x, P.cy, P.rx, P.ry, o.dog);
  if (o.dog) drawDogEars(o.x, P.cy, P.rx, P.ry, st);
  else if (st >= 2 && look.ears === "antennae") { sprite(ANTENNA_L, o.x - 6, top - 3, INK); sprite(ANTENNA_R, o.x + 2, top - 3, INK); }
  if (st === 4 && o.accessory !== "hat") { const t = TOPPERS[look.topper]; sprite2(t, o.x - Math.floor(t[0].length / 2), top - t.length); }
  if (o.accessory) drawAccessory(o.accessory, o.x, P.cy, P.rx, P.ry);
  (o.dog ? drawDogFace : drawFace)(o.x, P.cy, P.rx, P.ry, o.face, o.blush);
  return P;
}

/* ---------- The egg ---------- */
const EGG = { rx: 8, ry: 10.5 };
const CRACK = [0, -1, -2, -1, 0, 1, 0, -1, -2, -1, 0, 1, 0, -1, -2, -1, 0];   // dy for dx = -8..8
const eggCY = () => GROUND - EGG.ry;
const crackDy = dx => CRACK[Math.max(0, Math.min(16, Math.round(dx) + 8))];
function drawEgg(x, crackLen, keep, ox = 0, oy = 0) {
  const cy = eggCY();
  paintMask(makeMask([{ x, y: cy, rx: EGG.rx, ry: EGG.ry }], keep), BODY, ox, oy);
  if (!keep) {
    sprite(["##", "##"], x - 4, cy - 6, SPOT); sprite(["##"], x + 3, cy - 2, SPOT); sprite(["##", "##"], x + 1, cy + 5, SPOT);
    cx.fillStyle = INK;
    for (let k = 0; k < crackLen; k++) cx.fillRect(Math.round(x) + k - 8, Math.round(cy) + CRACK[k], 1, 1);
  }
}

function drawSparkles(now) {
  const on = Math.floor(now / 200) % 2;
  [[12, 14], [50, 12], [16, 30], [48, 30]].forEach(([sx, sy], k) => { if ((k + on) % 2) sprite(SPARK, sx, sy, INK); });
}

function drawHatch(t, now, rm, dog, accessory, look) {
  const x = 32, cy = eggCY(), joy = { eyes: "joy", mouth: "grin" };
  if (t < 1500) {
    const shake = rm ? 0 : (Math.floor(t / 70) % 2 ? 1 : -1);
    drawEgg(x + shake, Math.min(17, Math.floor(t / 1500 * 18)));
  } else if (t < 2600) {
    const p = (t - 1500) / 1100;
    drawPet(1, { x, ground: GROUND + Math.round((1 - p) * 8), face: joy, dog, accessory, look });
    drawEgg(x, 0, (px, py) => py >= cy + crackDy(px + .5 - x));                                         // bottom shell
    drawEgg(x, 0, (px, py) => py < cy + crackDy(px + .5 - x), -Math.round(p * 6), -Math.round(p * 14)); // top shell flies off
  } else {
    const hop = rm ? 0 : Math.round(Math.abs(Math.sin((t - 2600) / 1000 * Math.PI * 2)) * 3);
    drawPet(1, { x, ground: GROUND - hop, face: joy, blush: true, dog, accessory, look });
    drawSparkles(now);
  }
}

/* ---------- One frame ---------- */
// v = { now, mood, stage, hearts, unread, hatchAt, growAt, patAt, catchAt, rm, dog, accessory, look, portrait }
export function draw(ctx, v) {
  cx = ctx;
  const { now, mood: m, stage: st, rm } = v;
  cx.clearRect(0, 0, W, H);
  if (!v.portrait) for (let k = 0; k < 4; k++) sprite(HEART, 2 + k * 6, 2, k < v.hearts ? INK : GHOST);   // portrait: just the pet, for the certificate
  if (v.unread && !v.portrait && Math.floor(now / 500) % 2) sprite(ENVELOPE, 55, 2, INK);

  if (now - v.hatchAt < HATCH_MS) { drawHatch(now - v.hatchAt, now, rm, v.dog, v.accessory, v.look); return; }

  const tp = now - v.patAt, patting = tp < PAT_MS, growing = now - v.growAt < GROW_MS;
  const beat = rm ? 0 : Math.floor(now / 600) % 2;

  if (st === 0) {
    const wob = patting && !rm ? (Math.floor(tp / 90) % 2 ? 1 : -1) : 0;
    drawEgg(32 + wob, 0);
    if (patting) sprite(HEART, 38, 14 - Math.min(4, Math.floor(tp / 250)), INK);
    return;
  }

  let x = 32, ground = GROUND, squash = 0, face, blush = false;
  if (patting || growing) {
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

  const P = drawPet(st, { x, ground, squash, face, blush, dog: v.dog, accessory: v.accessory, look: v.look });

  if (m === "break" && !patting) {
    const bounce = rm ? 6 : Math.round(Math.abs(Math.cos(now / 350)) * 12);   // matches ballHeight() in engine.js
    sprite(BALL, 49, GROUND - 5 - bounce, INK);
    if (now - (v.catchAt || -1e12) < 350) sprite(SPARK, 55, GROUND - 9 - bounce, INK);   // a catch
  }
  if (m === "focus" && !patting) {
    const bx = x - 5.5, by = Math.round(P.cy + P.ry * .45);
    cx.fillStyle = LCD; cx.fillRect(Math.round(bx), by, 11, 5);
    sprite(BOOK[!rm && Math.floor(now / 2500) % 2 ? 1 : 0], bx, by, INK);
  }
  if (m === "sleepy" && !patting) sprite(ZED, 48, 12 - (rm ? 0 : Math.floor(now / 700) % 3), INK);
  if (m === "happy" && !patting && !growing && beat) sprite(SPARK, 50, 18, INK);
  if (patting) sprite(HEART, x + 6, P.cy - P.ry - 6 - Math.min(4, Math.floor(tp / 250)), INK);
  if (growing) drawSparkles(now);
}
