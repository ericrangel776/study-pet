// Builds the installable app into dist/:
//   index.html             the whole app in one file (styles and code inlined)
//   sw.js                  service worker for offline use, stamped with this build's version
//   manifest.webmanifest   app name, colors and icons for installing
//   icons/                 app icons (regenerate with `npm run icons`)
//
// The code is bundled by concatenating the modules in dependency order and
// stripping import/export lines. That works because every top-level name
// across the modules is unique, which the build checks. A real bundler (esbuild, Vite) does this
// more robustly, but this keeps the project dependency-free.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORDER = ["config", "engine", "storage", "render", "alerts", "pwa", "ui"];

let js = ORDER.map(name => {
  let src = readFileSync(`src/${name}.js`, "utf8");
  src = src.replace(/^import .*;\s*$/gm, "");
  src = src.replace(/^export (?=(async )?function |const |let |class )/gm, "");
  return `// ----- ${name}.js -----\n${src}`;
}).join("\n");

if (/^\s*(import|export)\s/m.test(js)) throw new Error("An import/export line was not bundled. Keep imports on one line.");

// The service worker only runs in the built app.
const swOff = "const SW_ENABLED = false;";
if (!js.includes(swOff)) throw new Error(`src/pwa.js no longer contains "${swOff}".`);
js = js.replace(swOff, "const SW_ENABLED = true;");

// Parse the combined code as a module without running it. If two files declare
// the same top-level name, this fails here instead of in the browser.
const checkFile = join(tmpdir(), `study-pet-check-${process.pid}.mjs`);
writeFileSync(checkFile, js);
try {
  execFileSync(process.execPath, ["--check", checkFile], { stdio: "pipe" });
} catch (e) {
  const detail = String(e.stderr).split("\n").find(l => /Error/.test(l)) || "unknown error";
  throw new Error(`The bundled code doesn't parse (${detail.trim()}). Two files may declare the same top-level name.`);
} finally {
  rmSync(checkFile, { force: true });
}

let html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const cssTag = '<link rel="stylesheet" href="styles.css">';
const jsTag = '<script type="module" src="src/ui.js"></script>';
if (!html.includes(cssTag) || !html.includes(jsTag)) throw new Error("index.html is missing the stylesheet or script tag.");

// Function replacements, so "$" characters in the code aren't treated as patterns.
html = html.replace(cssTag, () => `<style>\n${css}</style>`);
html = html.replace(jsTag, () => `<script type="module">\n${js}\n</script>`);

// Stamp the service worker with a version taken from the app's contents, so
// browsers fetch the new release, and with the font stylesheet it should cache.
const fontCss = (html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/) || [])[1];
if (!fontCss) throw new Error("index.html no longer loads its fonts from Google Fonts; update sw.js.");
const swSource = readFileSync("sw.js", "utf8");
const version = createHash("sha256").update(html).update(swSource).digest("hex").slice(0, 10);
const sw = swSource
  .replace('"__VERSION__"', () => JSON.stringify(version))
  .replace('"__FONT_CSS__"', () => JSON.stringify(fontCss.replace(/&amp;/g, "&")));
if (/"__[A-Z_]+__"/.test(sw)) throw new Error("sw.js has a placeholder the build didn't fill in.");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
writeFileSync("dist/index.html", html);
writeFileSync("dist/sw.js", sw);
cpSync("manifest.webmanifest", "dist/manifest.webmanifest");
cpSync("icons", "dist/icons", { recursive: true });
console.log(`Built dist/ (index.html ${(html.length / 1024).toFixed(1)} KB, version ${version})`);
