# figlib.mjs API

Units are millimetres, y grows downwards. Labels accept `$...$` math with `_{}` and `^{}` (`'$V_{max}$'`).
Line weights given as `sw` / `w`: values up to 0.22 map to `LW.cell`, up to 0.3 to `LW.main`, larger values are used as given.

## Exports

| Call | Purpose |
|---|---|
| `new Fig(w, h, title)` | Create a figure of w x h mm. |
| `setStyle({ fs, sub, font, dash, main, cell, uprightSubs })` | Set font size, subscript size, font, dash array, line weights, upright subscripts. Call before drawing. |
| `theme(name or object, extra)` | Set colours: `'pastel'`, `'mono'`, or an object of `C` keys. |
| `C` | Current colours (`ink, mem, memStroke, op, opStroke, ctl, ctlStroke, cmpFill, cmpStroke, region, regionStroke, panelStroke, bus, busAlt, ctlLine, bitOn, white`). |
| `LW`, `FS`, `SUB`, `FONT`, `DASH` | Current style values. |
| `MIN_ARROW_SEG` | Shortest arrow-ending segment (3.5 mm) before a warning. |
| `arrowSize(w)` | `[length, halfWidth]` of the arrowhead for a wire weight. |
| `backDepth(u)` | Depth of an OR gate's concave back at offset u (-1..1). |
| `textWidth(label, size)` | Rough label width in mm. |
| `runs(str)` | Parse a label into text runs (normal / italic / sub / super). |

## Fig: shapes

| Call | Purpose |
|---|---|
| `rect(x, y, w, h, { fill, stroke, sw, rx, layer })` | Plain rectangle. |
| `text(x, y, s, { anchor, bold, size, fill })` | Free text; y is the baseline; anchor `start` / `middle` / `end`. |
| `box(x, y, w, h, label, o)` | Rectangle with centred label (string or array of lines). |
| `mem(x, y, w, h, label, o)` | Memory block (square corners, memory colours). |
| `unit(x, y, w, h, label, o)` | Processing unit (rounded corners). |
| `ctl(x, y, w, h, label, o)` | Flag / selector block. |
| `bits(x, y, n, cw, ch, on)` | Row of n bit cells; `on` lists filled indices. |
| `memList(x, y, w, titleLines, cells, { ch, h })` | Memory with title and a list of cells; returns `{ h, ys, bottom }`. |
| `disc(x, y, r, fill, stroke)` | Circle. |
| `dot(x, y, r, color)` | Junction dot. |
| `bubble(x, y, r)` | Inversion bubble. |
| `circ(x, y, sym, r)` | Operator circle with a symbol (`'+'`). |
| `poly(pts, { fill, stroke, sw, closed })` | Polygon or open polyline (not counted as a wire). |
| `cmp(x, yc, sym, { w, h })` | Comparator triangle; returns `{ out }`. |
| `mux(x, yc, { w, h, dir })` / `muxL(x, yc, w, h, dir)` | Multiplexer trapezoid, without / with the "MUX" label. |
| `diamond(xc, yc, w, h, label)` | Decision diamond. |
| `gate(cx, cy, kind, dir, L, Wd)` | OR / AND gate symbol, output towards `dir`; returns `{ out, inAt(u) }`. Add `bubble()` for NOR / NAND. |
| `tick(x, y, vertical, label, { color })` | Bus slash across a wire with an optional width label. |

## Fig: wires and containers

| Call | Purpose |
|---|---|
| `line(pts, { w, color, arrow, dash, count, layer })` | Orthogonal wire; throws on a diagonal; `arrow` `end` / `start` / `both`; `count: false` excludes it from crossing checks. |
| `module(x, y, w, h, { fill, stroke, title })` | Module region: tint plus dashed outline. |
| `panel(x, y, w, h, title)` | Framed panel for a sub-figure. |
| `legendBar(x, y, w, items, { h, title })` | Legend row; items `[kind, label]`, kind `mem / op / ctl / cmp / read / write / ctrl / bus / busAlt`, `{ fill, stroke }` or `{ line: {...} }`. |

## Fig: checks and output

| Call | Purpose |
|---|---|
| `crossings()` | List of wire crossings `[x, y]`; must be empty. |
| `tracks(minLen)` | y positions of long horizontal tracks. |
| `warnings` | Messages recorded while drawing (short arrow segments, legend overflow). |
| `json()` | Primitive list for `to_visio.py`. |
| `svg()` / `html()` | Inline SVG / standalone HTML page. |

Draw order is by layer (`bg`, `wire`, `box`, `text`), so boxes cover wire ends and text stays on top.
