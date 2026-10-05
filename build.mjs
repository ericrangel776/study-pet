// Bundles the project into one self-contained file: dist/study-pet.html.
// It inlines styles.css and concatenates the modules in dependency order,
// stripping import/export lines. That works because every top-level name
// across the modules is unique, which the build checks. A real bundler (esbuild, Vite) does this
// more robustly, but this keeps the project dependency-free.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORDER = ["config", "engine", "storage", "render", "alerts", "ui"];

const js = ORDER.map(name => {
  let src = readFileSync(`src/${name}.js`, "utf8");
  src = src.replace(/^import .*;\s*$/gm, "");
  src = src.replace(/^export (?=(async )?function |const |let |class )/gm, "");
  return `// ----- ${name}.js -----\n${src}`;
}).join("\n");

if (/^\s*(import|export)\s/m.test(js)) throw new Error("An import/export line was not bundled. Keep imports on one line.");

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

mkdirSync("dist", { recursive: true });
writeFileSync("dist/study-pet.html", html);
console.log(`Built dist/study-pet.html (${(html.length / 1024).toFixed(1)} KB)`);
