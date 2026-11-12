---
name: circuit-figure
description: Draw block, circuit, datapath or hardware/system architecture diagrams for a paper as code-generated vector figures (HTML/SVG + PNG) with an editable Visio (.vsdx) export. Use when asked to draw, redraw, revise or lay out a block diagram, circuit schematic, module/architecture figure, memory-and-datapath figure or control-logic figure for a manuscript, especially when wires must be orthogonal and crossing-free, when several figures must share one style, or when the author needs a Visio file.
---

# Circuit figure

Figures are drawn by code in millimetres with the bundled library (`lib/figlib.mjs`). Every mark is stored as data, so one source gives HTML/SVG, a PNG preview, a crossing count and a Visio file. Call list: `reference/api.md`. Worked example: `examples/example_pipeline.mjs`.

Most errors in these figures are wrong connections, not ugly layout. So fix what is connected to what before deciding where anything goes, and never let a layout round change it.

## Workflow

1. **Brief first.** Per figure, write what it must convey and what must not be drawn wrongly (for example "X is written by A only", "the bus has one bit per worker"). Say what to convey, not how to draw it. Write the caption draft now, alongside the figure.
2. **Measure the reference.** If the author has a hand-drawn or existing figure, measure its font and font size, line weights (outline, inner cell, bus), dash pattern, corner style and module fill colours. Reuse these values in every other figure. Scale line weights by the ratio of text sizes (reference 10 pt text with 1.5 pt lines becomes 0.35 mm lines at 6.5 pt text). Set them once with `setStyle()` and `theme()`. Do not edit the author's own figure.
3. **Fix the netlist before layout.** List blocks, regions (which module owns which block) and a table of connections: from, to, kind (read / write / control / bus), width if a bus. Verify each row against the design source (code, RTL, spec), not against an older figure. Keep the netlist as a comment at the top of the figure source. Layout rounds never change it. A netlist change is a separate, stated step.
4. **Layout candidates for layout problems.** When the figure has empty areas or bad proportions, get about five image-model candidates from text-only prompts that differ in arrangement (stacked, spine, ring, two-column, ...). Take only block placement and proportions from them. Never take wiring or field contents: generated circuits are usually wrong. If no image tool is available, skip this step and say so in the report.
5. **Plan wiring separately from placement.** Write the track plan before coding it:
   - one spine for the main data path, few long tracks;
   - the same kind of wire on the same side of the blocks (for example reads above, control below, feedback on the outer edge);
   - orthogonal segments only, zero crossings, no detours;
   - the last segment before an arrowhead at least 3.5 mm at the default arrowhead size, so the head does not swallow the wire.
6. **Draw in code.** One function per panel; the combined figure and the sub-figures call the same functions, so they cannot drift. Name every coordinate constant (`XS` spine, `BUS` track, ...); no bare numbers repeated across calls. Every round: build, read the crossing count and the warnings, then open the PNG and look at it.
7. **Export.** HTML/PNG/JSON from `build.mjs`, Visio from `to_visio.py`. Put each round in a new output folder and keep a backup copy of the previous source.
8. **Check the manuscript against the final figure.** Figure numbers, module names, signal names, and that the caption explains every word and symbol that appears in the figure.

## Commands

```
node <skill>/lib/build.mjs <figure.mjs> [more.mjs ...] --out <dir> [--name BASE] [--export FN] [--chrome PATH] [--scale N] [--no-png] [--strict]
python <skill>/lib/to_visio.py <dir>/<name>.json [more.json ...] [--out DIR] [--visio PATH] [--require-version 16] [--dash-pattern N] [--dpi N] [--no-png]
```

- A figure module imports `figlib.mjs` and exports a function returning a `Fig` (`export default`, or name it with `--export`). An optional `export const parts = { a: () => Fig, ... }` gives sub-figures `<name>_a` etc.
- `build.mjs` prints size, `crossings=N` with their coordinates, long horizontal tracks and warnings (short arrow segments, legend overflow). `--strict` exits 1 on any crossing or warning. PNG needs Chrome or Edge (`--chrome` or `$CHROME`).
- `to_visio.py` needs Windows, Visio and a Python with `pywin32`. If the default `python` lacks it, use another interpreter that has it. With several Visio versions installed, pass `--visio` and `--require-version`. If Visio is unavailable, deliver HTML/PNG and say the Visio export was not made.
- Copy `lib/` next to the figure sources of a project (or import it by path) so the figure can be rebuilt later.

## Drawing rules

- **Little text.** Use symbols and small pictograms (bit rows, grids, cell lists) in the figure; put explanations in the caption.
- **Module ownership.** Show which module owns a block with a tint plus dashed outline (`module()`) and a legend entry or title.
- **Stored items.** Every memory, register or flag shows who writes it and who reads it. Draw each stored item once.
- **Standard symbols.** Gates, mux and comparator as circuit symbols (`gate()`, `muxL()`, `cmp()`); a bubble for inversion; a slash with the width for a bus (`tick()`).
- **Buses.** A multi-bit signal is a bus with taps, each tap labelled with its bit. Never draw scalar wires joined at a dot to mean a bus.
- **Not a flowchart.** Arrange by structure (what holds state, what computes, what controls), not as a left-to-right chain of steps.
- **Real wires.** Connect things with wires. Do not replace a connection with named terminals or ports.
- **One name per thing** across all figures, captions and text.
- **Line kinds.** Keep one meaning per line style in all figures (for example solid = write, dashed = read, coloured dashed = control, thick = bus) and show it in the legend.

## Common failures

- Arrowheads overlapping or hiding the wire on short segments (build warning; lengthen the segment or move the block).
- Legend entries overflowing the legend bar (build warning; shorten labels or widen the bar).
- Text sitting on a region border or on a wire.
- A sub-figure that shows elements with nothing connected to them, because their partner is in another panel.
- Labels in the figure that differ from the caption or the text.
- A wire that ends inside a gate body or short of its concave back (use `gate().inAt(u)`).
- Zero crossings reached by a long detour: re-place the blocks instead.
