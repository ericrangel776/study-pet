import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import * as E from "../src/engine.js";
import { NOTES } from "../src/config.js";
import { encodeMove, decodeMove } from "../src/move.js";
import QRCode from "qrcode";
import { qrEncode, qrMaxBytes, QR_MAX_BYTES } from "../src/qr.js";

// Draw a QR matrix as pixels (4 per module, with the required quiet border) and read it back.
function scan(matrix) {
  const S = 4, border = 4, n = matrix.length, w = (n + border * 2) * S;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x])
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const i = (((y + border) * S + dy) * w + (x + border) * S + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  const r = jsQR(px, w, w);
  return r && r.data;
}

// A well-used save: a pet, three in the album, months of history.
function busySave() {
  const s = E.createState(Date.UTC(2026, 0, 1), () => 0.5);
  s.name = "Mochi"; s.userName = "Riley"; s.sessions = 14; s.minutes = 390;
  for (let i = 0; i < 3; i++) s.album.push({ earned: true, name: "Pet " + i, seed: 1000 + i, accessory: null, sessions: 20, minutes: 520,
    bestStreak: 6, notes: 6, totalNotes: 6, since: 1e12, grownAt: 1.0017e12, letter: "", letterFrom: "" });
  for (let d = 1; d <= 120; d++) s.days[`2026-${1 + Math.floor(d / 31)}-${1 + d % 28}`] = 25 + (d % 4) * 15;
  s.invite = E.cleanInvite({ from: "Jamie", to: "Riley", welcome: "Hi!", ps: { hatch: "Proud of you" }, letter: "Dinner's on me." }, NOTES);
  return s;
}

test("a pet survives the move link intact", async () => {
  const s = busySave();
  const restored = E.importBackup(await decodeMove(await encodeMove(s)), Date.now());
  assert.equal(restored.name, "Mochi");
  assert.equal(restored.userName, "Riley");
  assert.deepEqual(restored.album, s.album);
  assert.deepEqual(restored.days, s.days);
  assert.deepEqual(restored.invite, s.invite);
});

test("a busy save is small enough for a QR code, and the code scans back to the same link", async () => {
  const link = "https://ericrangel776.github.io/study-pet/#move=" + await encodeMove(busySave());
  assert.ok(link.length < QR_MAX_BYTES, `${link.length} characters`);
  assert.equal(scan(qrEncode(new TextEncoder().encode(link))), link);
});

test("QR codes of every size scan correctly", () => {
  for (const len of [1, 30, 150, 600, 1500, 2900]) {
    const text = "x".repeat(len - 1) + "!";
    assert.equal(scan(qrEncode(new TextEncoder().encode(text))), text, `${len} bytes`);
  }
  assert.throws(() => qrEncode(new Uint8Array(QR_MAX_BYTES + 1)), /Too much data/);
});

test("QR codes match a widely used library, module for module, at every version", () => {
  for (let ver = 1; ver <= 40; ver++) {
    if (ver === 23) continue;                              // skipped on purpose; see below
    const text = "studypet".repeat(400).slice(0, qrMaxBytes(ver)), mask = ver % 8;
    const mine = qrEncode(new TextEncoder().encode(text), mask);
    const ref = QRCode.create(text, { errorCorrectionLevel: "L", version: ver, maskPattern: mask }).modules;
    assert.equal(mine.length, ref.size, `version ${ver} size`);
    let diff = 0;
    for (let y = 0; y < ref.size; y++) for (let x = 0; x < ref.size; x++) if (mine[y][x] !== !!ref.get(y, x)) diff++;
    assert.equal(diff, 0, `version ${ver}: ${diff} modules differ`);
  }
});

test("data that would need version 23 gets version 24, which every scanner reads", () => {
  const text = "studypet".repeat(400).slice(0, qrMaxBytes(23));
  const m = qrEncode(new TextEncoder().encode(text));
  assert.equal((m.length - 17) / 4, 24);
  assert.equal(scan(m), text);
});

test("a damaged move link is rejected", async () => {
  const good = await encodeMove(busySave());
  for (const bad of ["", "q123", "zAAAA", good.slice(0, -20)]) {
    await assert.rejects(decodeMove(bad), /looks incomplete/, bad.slice(0, 10));
  }
});
