// A picture of the pet to share: 1080x1350 (fits feeds and phone screens),
// with the pet big on its LCD, its name, who's raising it, and a few stats.

import { draw } from "./render.js";

export const CARD_W = 1080, CARD_H = 1350;
const C = { bg: "#EEEAF8", shell: "#8F7FD0", bezel: "#3B335F", lcd: "#B9C79A", ink: "#2A2440", muted: "#635B80", panel: "#FFFFFF", line: "#D8D1EE" };

function roundRect(g, x, y, w, h, r, fill) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fillStyle = fill; g.fill();
}
// Shrink the font until the text fits the width.
function fitText(g, text, size, weight, family, maxW) {
  do g.font = `${weight} ${size}px ${family}`; while (g.measureText(text).width > maxW && (size -= 4) > 24);
}

// d = { petName, userName, stageName, sessions, focus, streak, url, pet: view for draw() }
export async function drawCard(canvas, d) {
  try { await Promise.all(['600 96px "Fredoka"', '500 40px "Fredoka"', '32px "Silkscreen"'].map(f => document.fonts.load(f))); }
  catch (e) { /* offline without cached fonts: the fallbacks still look fine */ }
  canvas.width = CARD_W; canvas.height = CARD_H;
  const g = canvas.getContext("2d");
  const sans = '"Fredoka", ui-rounded, "Segoe UI", system-ui, sans-serif', pixel = '"Silkscreen", "Courier New", monospace';
  g.fillStyle = C.bg; g.fillRect(0, 0, CARD_W, CARD_H);

  // The screen: bezel, LCD, and the pet scaled up with hard pixel edges.
  roundRect(g, 120, 90, 840, 660, 56, C.shell);
  roundRect(g, 150, 120, 780, 600, 40, C.bezel);
  roundRect(g, 174, 144, 732, 552, 28, C.lcd);
  const sprite = document.createElement("canvas");
  sprite.width = 64; sprite.height = 48;
  draw(sprite.getContext("2d"), d.pet);
  g.imageSmoothingEnabled = false;
  g.drawImage(sprite, 0, 6, 64, 42, 188, 164, 704, 462);   // skip the empty top rows; 11x scale

  // Name and who's raising it.
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.fillStyle = C.ink; fitText(g, d.petName, 104, 600, sans, 900);
  g.fillText(d.petName, CARD_W / 2, 880);
  g.fillStyle = C.muted; fitText(g, `${d.stageName}, studying with ${d.userName}`, 44, 500, sans, 900);
  g.fillText(`${d.stageName}, studying with ${d.userName}`, CARD_W / 2, 950);

  // Three stats.
  const stats = [["Sessions", String(d.sessions)], ["Focus time", d.focus], ["Day streak", String(d.streak)]];
  stats.forEach(([label, value], i) => {
    const x = 90 + i * 310;
    roundRect(g, x, 1010, 280, 170, 32, C.line);
    roundRect(g, x + 3, 1013, 274, 164, 30, C.panel);
    g.fillStyle = C.ink; g.font = `600 64px ${sans}`; g.fillText(value, x + 140, 1105);
    g.fillStyle = C.muted; g.font = `500 32px ${sans}`; g.fillText(label, x + 140, 1150);
  });

  // Where to get one.
  g.fillStyle = C.ink; g.font = `32px ${pixel}`; g.fillText("STUDY PET", CARD_W / 2, 1255);
  g.fillStyle = C.muted; g.font = `500 32px ${sans}`; g.fillText(d.url, CARD_W / 2, 1300);
  return canvas;
}
