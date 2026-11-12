// Build figure modules into static HTML, a PNG preview (headless Chrome / Edge) and a JSON
// primitive list (input of to_visio.py). Prints size, crossing count, long tracks and warnings.
//
// Usage:
//   node build.mjs <figure.mjs> [more.mjs ...] [--out DIR] [--name BASE] [--export FN]
//                  [--chrome PATH] [--scale N] [--no-png] [--strict]
//
//   --out DIR     output directory (default: the directory of the figure module)
//   --name BASE   output base name (default: module file name; only with a single module)
//   --export FN   exported function that returns the Fig (default: `default`, then `fig`)
//   --chrome PATH browser used for the PNG (default: $CHROME, then common install paths)
//   --scale N     PNG device scale factor (default 4, about 384 dpi)
//   --no-png      write HTML and JSON only
//   --strict      exit with code 1 when any figure has crossings or warnings
//
// A figure module exports a function that returns a Fig:
//   export default function () { const f = new Fig(w, h, 'title'); ...; return f; }
// Sub-figures: a module may also export
//   export const parts = { a: () => Fig, b: () => Fig, ... }
// Each part is a self-contained figure, written as <base>_<key>.html/.png/.json.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const args = process.argv.slice(2);
const opt = { out: null, name: null, export: null, chrome: process.env.CHROME || null, scale: 4, png: true, strict: false };
const sources = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--name') opt.name = args[++i];
  else if (a === '--export') opt.export = args[++i];
  else if (a === '--chrome') opt.chrome = args[++i];
  else if (a === '--scale') opt.scale = Number(args[++i]);
  else if (a === '--no-png') opt.png = false;
  else if (a === '--strict') opt.strict = true;
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); }
  else sources.push(a);
}
if (!sources.length) { console.error('usage: node build.mjs <figure.mjs> [...] [--out DIR] [--name BASE] [--export FN] [--chrome PATH] [--scale N] [--no-png] [--strict]'); process.exit(2); }
if (opt.name && sources.length > 1) { console.error('--name needs a single figure module'); process.exit(2); }

function findBrowser() {
  if (opt.chrome) return opt.chrome;
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const cands = [
    ...pf.map(p => path.join(p, 'Google/Chrome/Application/chrome.exe')),
    ...pf.map(p => path.join(p, 'Microsoft/Edge/Application/msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return cands.find(c => fs.existsSync(c)) || null;
}
const browser = opt.png ? findBrowser() : null;
if (opt.png && !browser) console.log('no Chrome / Edge found: PNG skipped (pass --chrome PATH or set CHROME)');

let bad = 0;
function emit(f, outDir, name) {
  const html = path.join(outDir, `${name}.html`);
  fs.writeFileSync(html, f.html(), 'utf8');
  fs.writeFileSync(path.join(outDir, `${name}.json`), f.json(), 'utf8');
  const cr = f.crossings(), tr = f.tracks(), wn = f.warnings || [];
  console.log(`${name}: ${f.w} x ${f.h} mm, crossings=${cr.length} ${JSON.stringify(cr)}, long horizontal tracks=${tr.length} ${JSON.stringify(tr)}`);
  wn.forEach(w => console.log(`${name}: warning: ${w}`));
  if (cr.length || wn.length) bad++;
  if (!browser) return;
  const png = path.join(outDir, `${name}.png`);
  const pxW = Math.ceil(f.w * 96 / 25.4), pxH = Math.ceil(f.h * 96 / 25.4);
  try {
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${pxW},${pxH}`,
      `--force-device-scale-factor=${opt.scale}`, `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
  } catch (e) { console.log(`${name}: screenshot failed: ${e.message}`); }
}

for (const src of sources) {
  const modPath = path.resolve(src);
  if (!fs.existsSync(modPath)) { console.error(`${src}: not found`); bad++; continue; }
  const outDir = path.resolve(opt.out || path.dirname(modPath));
  fs.mkdirSync(outDir, { recursive: true });
  const name = opt.name || path.basename(modPath).replace(/\.m?js$/, '');
  const mod = await import(pathToFileURL(modPath).href);
  const make = opt.export ? mod[opt.export] : (mod.default || mod.fig);
  if (typeof make !== 'function') { console.error(`${src}: no exported figure function (${opt.export || 'default / fig'})`); bad++; continue; }
  emit(make(), outDir, name);
  for (const [key, part] of Object.entries(mod.parts || {})) emit(part(), outDir, `${name}_${key}`);
}
if (opt.strict && bad) process.exit(1);
