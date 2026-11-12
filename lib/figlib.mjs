// Drawing library for block / circuit / architecture figures.
// Units are millimetres. Every primitive is stored as data, so the same figure can be
// written as HTML (inline SVG), rendered to PNG, and replayed into Visio (to_visio.py).
// Wires must be horizontal or vertical; crossings and long tracks are counted.

// ---- style (change with setStyle before drawing) ----
export let FS = 2.3;                 // base font size in mm (6.5 pt)
export let SUB = 1.6;                // subscript / superscript size in mm
export let FONT = 'Times New Roman';
export let DASH = '1.1 0.7';         // SVG dash array in mm
// Line weights in mm. `main` = outlines and wires, `cell` = inner cells and thin marks.
// When a reference figure exists, measure its weights and scale them by the ratio of text sizes.
export const LW = { main: 0.35, cell: 0.23 };
// Subscripts that stay upright inside $...$ (words, not variables), e.g. 'max', 'ref'.
export const UPRIGHT_SUBS = new Set(['max', 'min', 'ref', 'th', 'in', 'out']);

export function setStyle(o = {}) {
  if (o.fs) FS = o.fs;
  if (o.sub) SUB = o.sub;
  if (o.font) FONT = o.font;
  if (o.dash) DASH = o.dash;
  if (o.main) LW.main = o.main;
  if (o.cell) LW.cell = o.cell;
  if (o.uprightSubs) { UPRIGHT_SUBS.clear(); o.uprightSubs.forEach(s => UPRIGHT_SUBS.add(s)); }
}

// ---- colours ----
export const C = {
  ink: '#1a1a1a', white: '#ffffff',
  mem: '#cfe5f6', memStroke: '#2f7cb2',          // memories
  op: '#dccbee', opStroke: '#7a4a9e',            // units, operators, registers
  ctl: '#d9ebcf', ctlStroke: '#4d8a3a',          // flags, selectors, gates
  cmpFill: '#fbe2a4', cmpStroke: '#b8851c',      // comparators, decisions
  region: '#f4f0fb', regionStroke: '#7a4a9e',    // default module region
  panelStroke: '#8497b5',                        // panels and legend frame
  bus: '#1f5fa0', busAlt: '#b0306a',             // two kinds of thick bus
  ctlLine: '#3d7a2a',                            // control wires
  bitOn: '#5b9a45',
};
const PASTEL = { ...C };
const INK = '#1a1a1a';
const THEMES = {
  pastel: PASTEL,
  // grey memories, white units, black outlines; colour is left for module regions and buses
  mono: { ...PASTEL, mem: '#d8d8d8', memStroke: INK, op: '#ffffff', opStroke: INK, ctl: '#ebf1df', ctlStroke: '#4d8a3a',
    cmpFill: '#ffffff', cmpStroke: INK, region: '#e4eef9', regionStroke: INK, panelStroke: '#404040',
    ctlLine: '#3d7a2a', bitOn: '#7fb86a', bus: '#1c4f8f', busAlt: '#c2185b' },
};
// theme('mono') or theme({ mem: '#eee', ... }) or theme('mono', { bus: '#000' })
export function theme(name, extra = {}) {
  const t = typeof name === 'string' ? THEMES[name] : name;
  if (!t) throw new Error(`unknown theme ${name}`);
  Object.assign(C, t, extra);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// '$V_{max}$ text' -> runs [{t, it, pos}] with pos 0 normal, 1 subscript, -1 superscript
export function runs(str) {
  str = String(str);
  const out = []; let math = false, i = 0;
  const emit = (t, it, pos) => { if (t) out.push({ t, it, pos }); };
  const group = () => {
    if (str[i] === '{') { const j = str.indexOf('}', i); const g = str.slice(i + 1, j); i = j + 1; return g; }
    return str[i++];
  };
  while (i < str.length) {
    const ch = str[i];
    if (ch === '$') { math = !math; i++; continue; }
    if (math && (ch === '_' || ch === '^')) {
      i++; const g = group(); const pos = ch === '_' ? 1 : -1;
      g.split(/(,)/).forEach(p => emit(p, !(p === ',' || UPRIGHT_SUBS.has(p) || /^[0-9()+\-]+$/.test(p)), pos));
      continue;
    }
    if (math) { emit(ch, /[A-Za-zα-ωφθλ]/.test(ch), 0); i++; continue; }
    let j = i; while (j < str.length && str[j] !== '$') j++;
    emit(str.slice(i, j), false, 0); i = j;
  }
  return out;
}
function runsSvg(rs) {
  let out = '', cur = 0;
  rs.forEach(r => {
    const off = r.pos === 1 ? 0.55 : r.pos === -1 ? -0.85 : 0; const dy = off - cur; cur = off;
    let a = '';
    if (r.it) a += ' font-style="italic"';
    if (off !== 0) a += ` font-size="${SUB}"`;
    if (dy !== 0) a += ` dy="${dy.toFixed(2)}"`;
    out += `<tspan${a}>${esc(r.t)}</tspan>`;
  });
  if (cur !== 0) out += `<tspan dy="${(-cur).toFixed(2)}">​</tspan>`;
  return out;
}
// rough width in mm of a plain label at the base font size (for legends and fit checks)
export function textWidth(label, size = FS) {
  const w = [...String(label).replace(/[$_^{}]/g, '')].reduce((a, ch) =>
    a + (/[mMW]/.test(ch) ? 1.8 : /[A-Z]/.test(ch) ? 1.5 : /[ iltj\/.\[\]:]/.test(ch) ? 0.62 : 1.03), 0);
  return w * size / 2.3;
}

const ORDER = ['bg', 'wire', 'box', 'text'];
const lw = s => (s <= 0.22 ? LW.cell : s <= 0.3 ? LW.main : s);

// Arrowhead geometry: [length, half width] for a wire of weight w.
export const arrowSize = w => (w > 0.5 ? [2.0, 0.95] : [1.4, 0.6]);
// Shortest last segment that still shows a wire behind its arrowhead.
export const MIN_ARROW_SEG = 3.5;

// Depth of the concave back of an OR gate at relative offset u (-1..1) across the gate.
const BACK = 1.0;
export const backDepth = u => BACK * (1 - u * u);

export class Fig {
  constructor(w, h, title = '') { this.w = w; this.h = h; this.title = title; this.prims = []; this.segs = []; this.warnings = []; }
  push(p) { this.prims.push(p); return p; }
  warn(msg) { this.warnings.push(msg); }

  // ---- shapes ----
  rect(x, y, w, h, o = {}) {
    const { fill = C.white, stroke = C.ink, sw = 0.25, rx = 0, layer = 'box' } = o;
    return this.push({ type: 'rect', layer, x, y, w, h, fill, stroke, sw: lw(sw), rx });
  }
  text(x, y, s, o = {}) {
    const { anchor = 'start', bold = false, size = FS, fill = C.ink } = o;
    return this.push({ type: 'text', layer: 'text', x, y, anchor, bold, size, fill, runs: runs(s) });
  }
  // box with centred label(s); the label belongs to the shape (one Visio shape with text)
  box(x, y, w, h, label, o = {}) {
    const p = this.rect(x, y, w, h, { fill: C.op, stroke: C.opStroke, rx: 0.5, ...o });
    p.label = (Array.isArray(label) ? label : [label]).map(runs); p.bold = o.bold !== false;
    return p;
  }
  mem(x, y, w, h, label, o = {}) { return this.box(x, y, w, h, label, { fill: C.mem, stroke: C.memStroke, rx: 0, ...o }); }
  unit(x, y, w, h, label, o = {}) { return this.box(x, y, w, h, label, { rx: 0.9, ...o }); }
  ctl(x, y, w, h, label, o = {}) { return this.box(x, y, w, h, label, { fill: C.ctl, stroke: C.ctlStroke, rx: 0.9, ...o }); }
  // row of n bit cells; `on` lists the filled indices
  bits(x, y, n, cw, ch, on = []) {
    for (let k = 0; k < n; k++) this.rect(x + k * cw, y, cw, ch, { fill: on.includes(k) ? C.bitOn : C.white, stroke: C.ctlStroke, sw: 0.15 });
  }
  disc(x, y, r, fill = C.ink, stroke = null) { return this.push({ type: 'circle', layer: 'box', x, y, r, fill, stroke, sw: stroke ? LW.cell : 0 }); }
  dot(x, y, r = 0.45, color = C.ink) { this.disc(x, y, r, color); }          // junction
  bubble(x, y, r = 0.5) { this.disc(x, y, r, C.white, C.ink); }              // inversion
  circ(x, y, sym, r = 1.8) {                                                 // operator circle, e.g. '+'
    const p = this.push({ type: 'circle', layer: 'box', x, y, r, fill: C.op, stroke: C.opStroke, sw: LW.main });
    p.label = [runs(sym)]; p.lsize = 2.4 * FS / 2.3;
    return p;
  }
  poly(pts, o = {}) {
    const { fill = C.white, stroke = C.ink, sw = 0.25, closed = true, layer = 'box' } = o;
    return this.push({ type: 'poly', layer, pts, fill: closed ? fill : null, stroke, sw: lw(sw), closed });
  }
  cmp(x, yc, sym, o = {}) { // comparator: triangle pointing right
    const { w = 4.5, h = 6 } = o;
    this.poly([[x, yc - h / 2], [x, yc + h / 2], [x + w, yc]], { fill: C.cmpFill, stroke: C.cmpStroke });
    this.text(x + w * 0.33, yc + 0.75, sym, { anchor: 'middle' });
    return { out: [x + w, yc] };
  }
  mux(x, yc, o = {}) {
    const { w = 3.5, h = 6, dir = 'right' } = o; const s = h * 0.2; let pts;
    if (dir === 'right') pts = [[x, yc - h / 2], [x + w, yc - h / 2 + s], [x + w, yc + h / 2 - s], [x, yc + h / 2]];
    else pts = [[x + w, yc - h / 2], [x, yc - h / 2 + s], [x, yc + h / 2 - s], [x + w, yc + h / 2]];
    this.poly(pts, { fill: C.ctl, stroke: C.ctlStroke });
  }
  muxL(x, yc, w, h, dir = 'right') {
    this.mux(x, yc, { w, h, dir });
    this.text(x + w / 2, yc + 0.72, 'MUX', { anchor: 'middle', bold: true, size: FS * 0.92 });
  }
  diamond(xc, yc, w, h, label) {
    this.poly([[xc - w / 2, yc], [xc, yc - h / 2], [xc + w / 2, yc], [xc, yc + h / 2]], { fill: C.cmpFill, stroke: C.cmpStroke });
    if (label) this.text(xc, yc + 0.78, label, { anchor: 'middle', bold: true });
  }
  // Logic gate as its circuit symbol. kind: 'or' | 'and'; dir: direction of the output
  // ('right' | 'left' | 'up' | 'down'); L = length along the output axis, Wd = width across it.
  // Returns { out: [x, y], inAt(u) } where inAt(u) is the point on the back of the gate at the
  // relative offset u (-1..1) across the gate: end input wires there. For NOR / NAND or an
  // inverted input, add bubble() yourself and stop the wire at the bubble.
  gate(cx, cy, kind, dir, L = 5, Wd = 6, o = {}) {
    const pts = [], N = 10, a = L / 2, b = Wd / 2;
    if (kind === 'or') {
      for (let k = 0; k <= N; k++) { const u = -1 + 2 * k / N; pts.push([-a + backDepth(u), u * b]); }       // concave back
      for (let k = 1; k <= N; k++) { const t = k / N; pts.push([(1 - t) * (1 - t) * -a + 2 * t * (1 - t) * (a * 0.45) + t * t * a, (1 - t) * (1 - t) * b + 2 * t * (1 - t) * b]); }
      for (let k = 1; k < N; k++) { const t = k / N; pts.push([(1 - t) * (1 - t) * a + 2 * t * (1 - t) * (a * 0.45) + t * t * -a, -(2 * t * (1 - t) * b + t * t * b)]); }
    } else if (kind === 'and') {
      pts.push([-a, -b], [-a, b], [0, b]);
      for (let k = 1; k < N; k++) { const th = Math.PI / 2 - Math.PI * k / N; pts.push([a * Math.cos(th), b * Math.sin(th)]); }
      pts.push([0, -b]);
    } else throw new Error(`unknown gate kind ${kind}`);
    const rot = { right: ([x, y]) => [x, y], left: ([x, y]) => [-x, y], down: ([x, y]) => [-y, x], up: ([x, y]) => [y, -x] }[dir];
    if (!rot) throw new Error(`unknown gate direction ${dir}`);
    const place = q => { const [x, y] = rot(q); return [cx + x, cy + y]; };
    this.poly(pts.map(place), { fill: o.fill || C.ctl, stroke: o.stroke || C.ctlStroke, sw: 0.3 });
    return { out: place([a, 0]), inAt: u => place([-a + (kind === 'or' ? backDepth(u) : 0), u * b]) };
  }
  // Bus tick: short slash across a wire at (x, y), with an optional width label.
  // vertical = true when the wire is vertical.
  tick(x, y, vertical = false, label = '', o = {}) {
    const color = o.color || C.ink;
    this.poly(vertical ? [[x - 0.8, y + 0.6], [x + 0.8, y - 0.6]] : [[x - 0.6, y + 0.8], [x + 0.6, y - 0.8]], { closed: false, stroke: color, sw: 0.2 });
    if (label !== '' && label != null) this.text(vertical ? x + 1.1 : x + 0.9, vertical ? y + 0.2 : y - 1, String(label), { size: FS * 0.87, fill: color });
  }

  // ---- wires ----
  // Orthogonal polyline. o: w (weight), color, arrow: 'end' | 'start' | 'both' | null, dash,
  // count (false = not a wire, skip the crossing count), layer.
  line(pts, o = {}) {
    const { w = 0.25, color = C.ink, arrow = null, count = true, layer = 'wire', dash = false } = o;
    for (let k = 1; k < pts.length; k++) {
      const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
      if (Math.abs(x1 - x2) > 1e-6 && Math.abs(y1 - y2) > 1e-6) throw new Error(`diagonal segment ${pts[k - 1]} -> ${pts[k]}`);
      if (count) this.segs.push([x1, y1, x2, y2]);
    }
    if (arrow && count) {
      const len = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); const n = pts.length;
      const short = [];
      if ((arrow === 'end' || arrow === 'both') && len(pts[n - 1], pts[n - 2]) < MIN_ARROW_SEG - 1e-6) short.push(pts[n - 1]);
      if ((arrow === 'start' || arrow === 'both') && len(pts[0], pts[1]) < MIN_ARROW_SEG - 1e-6) short.push(pts[0]);
      short.forEach(p => this.warn(`arrow segment shorter than ${MIN_ARROW_SEG} mm at (${p})`));
    }
    return this.push({ type: 'line', layer, pts: pts.map(p => p.slice()), w: lw(w), color, arrow, dash });
  }

  // ---- containers ----
  panel(x, y, w, h, title) {
    this.rect(x, y, w, h, { fill: C.white, stroke: C.panelStroke, sw: 0.3, rx: 1.2, layer: 'bg' });
    if (title) this.text(x + 2, y + 3.7, title, { bold: true, size: FS * 1.13 });
  }
  // Region owned by one architecture module: background tint plus dashed outline.
  // o: fill, stroke, title (bold, top left). Give every region a legend entry or a title.
  module(x, y, w, h, o = {}) {
    const { fill = C.region, stroke = C.regionStroke, title = '' } = o;
    this.rect(x, y, w, h, { fill, stroke: fill, sw: 0.1, layer: 'bg' });
    this.line([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { color: stroke, dash: true, count: false, layer: 'bg' });
    if (title) this.text(x + 2.5, y + 4.4, title, { bold: true });
  }
  // memory block with a title and a list of white cells; returns { h, ys (cell centre lines), bottom }
  memList(x, y, w, titleLines, cells, o = {}) {
    const { ch = 3.2, fill = C.mem, stroke = C.memStroke, h = null } = o;
    const th = titleLines.length * 2.6 + 0.8; const hh = h || th + cells.length * ch + 0.8;
    this.rect(x, y, w, hh, { fill, stroke, rx: 0 });
    titleLines.forEach((t, k) => this.text(x + w / 2, y + 2.6 + k * 2.6, t, { anchor: 'middle', bold: true }));
    const ys = [];
    cells.forEach((c, k) => { const cy = y + th + k * ch; const p = this.rect(x + 0.9, cy, w - 1.8, ch, { fill: C.white, stroke, sw: 0.18, rx: 0 }); p.label = [runs(c)]; p.bold = false; ys.push(cy + ch / 2); });
    return { h: hh, ys, bottom: y + th + cells.length * ch };
  }

  // ---- legend ----
  // One framed row, entries spread over the width w. items: [kind, label] with kind one of
  //   'mem' | 'op' | 'ctl' | 'cmp'             fill swatches of the current theme
  //   'read' | 'write' | 'ctrl' | 'bus' | 'busAlt'   line samples
  //   { fill, stroke }                          swatch of a module region
  //   { line: { w, color, dash, arrow } }       custom line sample
  // Records a warning when the entries do not fit.
  legendBar(x, y, w, items, o = {}) {
    const { h = 5, title = 'Legend' } = o;
    const lines = { read: { dash: true, arrow: 'end' }, write: { arrow: 'end' }, ctrl: { dash: true, arrow: 'end', color: C.ctlLine },
      bus: { w: 0.8, color: C.bus, arrow: 'end' }, busAlt: { w: 0.8, color: C.busAlt, arrow: 'both' } };
    const fills = { mem: [C.mem, C.memStroke], op: [C.op, C.opStroke], ctl: [C.ctl, C.ctlStroke], cmp: [C.cmpFill, C.cmpStroke] };
    const lineOf = k => (typeof k === 'string' ? lines[k] : k.line);
    const fillOf = k => (typeof k === 'string' ? fills[k] : [k.fill, k.stroke]);
    items.forEach(([k]) => { if (!lineOf(k) && !(fillOf(k) && fillOf(k)[0])) throw new Error(`unknown legend kind ${JSON.stringify(k)}`); });
    const sw = k => (lineOf(k) ? 6.6 : 4.9);
    const t0 = title ? textWidth(title) * 1.1 + 4 : 2;
    const total = items.reduce((a, [k, l]) => a + sw(k) + textWidth(l), 0);
    const gap = items.length > 1 ? (w - t0 - 2 - total) / (items.length - 1) : 0;
    if (gap < 1.5) this.warn(`legend overflow: entries need ${(total + 1.5 * (items.length - 1) + t0 + 2).toFixed(1)} mm, bar is ${w} mm`);
    this.rect(x, y, w, h, { fill: C.white, stroke: C.panelStroke, sw: 0.3, rx: 1.2, layer: 'bg' });
    if (title) this.text(x + 2, y + h / 2 + 0.8, title, { bold: true });
    let cx = x + t0; const cy = y + h / 2;
    items.forEach(([k, l]) => {
      if (lineOf(k)) this.line([[cx, cy], [cx + 5.5, cy]], { ...lineOf(k), count: false });
      else { const m = fillOf(k); this.rect(cx, cy - 1.3, 4, 2.6, { fill: m[0], stroke: m[1], rx: 0.5 }); }
      cx += sw(k);
      this.text(cx, cy + 0.8, l); cx += textWidth(l) + gap;
    });
  }

  // ---- checks ----
  // proper crossings of counted wire segments: [[x, y], ...]; must be empty
  crossings() {
    const res = []; const S = this.segs; const eps = 1e-6;
    for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
      const h = [S[a], S[b]].find(s => Math.abs(s[1] - s[3]) < eps && Math.abs(s[0] - s[2]) > eps);
      const v = [S[a], S[b]].find(s => Math.abs(s[0] - s[2]) < eps && Math.abs(s[1] - s[3]) > eps);
      if (!h || !v || h === v) continue;
      const hx1 = Math.min(h[0], h[2]), hx2 = Math.max(h[0], h[2]), vy1 = Math.min(v[1], v[3]), vy2 = Math.max(v[1], v[3]);
      if (v[0] > hx1 + eps && v[0] < hx2 - eps && h[1] > vy1 + eps && h[1] < vy2 - eps) res.push([v[0], h[1]]);
    }
    return res;
  }
  // y positions of long horizontal wire tracks; keep this list short
  tracks(minLen = 15) {
    const ys = new Set();
    this.segs.forEach(s => { if (Math.abs(s[1] - s[3]) < 1e-6 && Math.abs(s[0] - s[2]) >= minLen) ys.add(s[1].toFixed(2)); });
    return [...ys].map(Number).sort((a, b) => a - b);
  }

  // ---- output ----
  ordered() { return ORDER.flatMap(l => this.prims.filter(p => p.layer === l)); }
  json() { return JSON.stringify({ w: this.w, h: this.h, title: this.title, font: FONT, fs: FS, sub: SUB, prims: this.ordered() }); }
  svg() {
    const T = (x, y, rs, anchor, size, bold, fill) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="${fill}">${runsSvg(rs)}</text>`;
    const body = []; const labels = [];
    for (const p of this.ordered()) {
      if (p.type === 'rect') {
        body.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}"/>`);
        if (p.label) { const lh = FS * 1.09, y0 = p.y + p.h / 2 + FS * 0.33 - (p.label.length - 1) * lh / 2; p.label.forEach((rs, k) => labels.push(T(p.x + p.w / 2, y0 + k * lh, rs, 'middle', FS, p.bold, C.ink))); }
      } else if (p.type === 'circle') {
        body.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw}"` : ''}/>`);
        if (p.label) labels.push(T(p.x, p.y + p.lsize * 0.33, p.label[0], 'middle', p.lsize, false, C.ink));
      } else if (p.type === 'poly') {
        body.push(`<path d="M${p.pts.map(q => q.join(' ')).join(' L')}${p.closed ? ' Z' : ''}" fill="${p.fill || 'none'}" stroke="${p.stroke}" stroke-width="${p.sw}"/>`);
      } else if (p.type === 'text') {
        body.push(T(p.x, p.y, p.runs, p.anchor, p.size, p.bold, p.fill));
      } else if (p.type === 'line') {
        const [al, hw] = arrowSize(p.w); const q = p.pts.map(a => a.slice()); const heads = [];
        const head = (tip, from) => {
          const dx = Math.sign(tip[0] - from[0]), dy = Math.sign(tip[1] - from[1]); const bx = tip[0] - dx * al, by = tip[1] - dy * al;
          heads.push(`${tip[0]},${tip[1]} ${bx - dy * hw},${by + dx * hw} ${bx + dy * hw},${by - dx * hw}`);
          return [tip[0] - dx * al * 0.85, tip[1] - dy * al * 0.85];
        };
        const n = p.pts.length;
        if (p.arrow === 'end' || p.arrow === 'both') q[n - 1] = head(p.pts[n - 1], p.pts[n - 2]);
        if (p.arrow === 'start' || p.arrow === 'both') q[0] = head(p.pts[0], p.pts[1]);
        body.push(`<path d="M${q.map(a => a.join(' ')).join(' L')}" fill="none" stroke="${p.color}" stroke-width="${p.w}"${p.dash ? ` stroke-dasharray="${DASH}"` : ''}/>`);
        heads.forEach(h => body.push(`<polygon points="${h}" fill="${p.color}"/>`));
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}mm" height="${this.h}mm" viewBox="0 0 ${this.w} ${this.h}" font-family="'${FONT}', Times, serif" style="white-space:pre">\n${body.join('\n')}\n${labels.join('\n')}\n</svg>`;
  }
  html() {
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${esc(this.title)}</title>\n<style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>\n</head>\n<body>\n${this.svg()}\n</body>\n</html>\n`;
  }
}
