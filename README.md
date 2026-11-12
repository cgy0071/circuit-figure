# Circuit Figure

A drawing Skill and small code library for circuit, datapath, block and system
architecture figures. Describe the design, fix its connections, and generate
HTML with inline vector SVG, a PNG preview and a JSON drawing record. An
optional Windows exporter recreates the drawing as editable Visio shapes.

## Install the Skill

Clone into your agent's skills directory, for example:

```sh
git clone https://github.com/cgy0071/circuit-figure.git ~/.claude/skills/circuit-figure
```

Ask the agent to use `circuit-figure`, describe the figure and provide its
connections or design source. [SKILL.md](SKILL.md) contains the drawing workflow.
Other agents can load that file through their own skill/context mechanism.
You can also use the library directly without an agent.

## Build the example

Use Node.js with ES module support; this release was checked with Node 24.13.1
on Windows. The JavaScript library uses Node built-ins and needs no npm install.
From the repository root:

```sh
node lib/build.mjs examples/example_pipeline.mjs --out examples/out --strict
```

The example draws a control block and three workers. Outputs are
`examples/out/example_pipeline.html`, `.json` and, when a supported browser is
available, `.png`. Open the HTML in a browser to inspect the vector drawing.
Generated outputs are ignored by Git.

PNG rendering needs Chrome or Edge. Pass `--chrome /path/to/browser` or set
`CHROME` if discovery fails. For HTML/JSON only:

```sh
node lib/build.mjs examples/example_pipeline.mjs --out examples/out --no-png --strict
```

`--strict` fails on detected wire crossings or drawing warnings. It does not
check circuit correctness, and a missing browser or failed screenshot can still
leave a successful exit status: check that the PNG exists. The CLI writes inline
SVG inside HTML; call `Fig.svg()` to obtain standalone SVG text.

## Draw your own figure

Copy `examples/example_pipeline.mjs`, preserving its library import path, then
change the fixed netlist, placement and wire tracks. Work in millimetres. Keep
connections fixed while adjusting layout, and inspect each rendered result.

[reference/api.md](reference/api.md) lists shapes, gates, wires, text, styles
and diagnostic helpers. `lib/build.mjs` documents its CLI flags. A module may
export `parts` to generate separate panels from the same drawing functions.

## Optional Visio export

Requires Windows, an installed Microsoft Visio, Python and `pywin32` in that
Python environment. These dependencies are separate from the HTML/PNG route.

```sh
python lib/to_visio.py examples/out/example_pipeline.json --out examples/out
```

This writes `.vsdx` and a Visio-rendered `_visio.png`. Use `--no-png` for only
Visio, or `--visio PATH --require-version 16` to select/check the application.
The exporter can attach to an existing Visio instance and temporarily changes
its alert/export settings. Use a separate session with your work saved. Existing
output files of the same name are replaced; choose a fresh output directory.

## Validation and limits

For this publication, the bundled example built with zero detected crossings
and no drawing warnings; its HTML/JSON and an Edge-rendered PNG were checked,
and the PNG was visually inspected. Run the portable smoke checks with:

```sh
node tests/smoke.mjs
```

The smoke checks cover the example, split-panel output, named exports, custom
output names, HTML/JSON-only mode and strict rejection of crossing wires. They
do not cover every library function, option combination, font or operating
system. Crossing checks concern recorded wires, not electrical validity or all
visual overlaps. The Visio exporter was syntax-checked but not executed for
this publication; its Python COM dependency was unavailable in the validation
environment. Existing local generated files are not used as proof of an export.

## Repository contents

- `SKILL.md`: instructions for the drawing agent.
- `lib/`: drawing library, builder and optional Visio exporter.
- `examples/`: editable example source.
- `reference/api.md`: library reference.
- `tests/smoke.mjs`: dependency-free smoke checks.

## License

No license is included in this publication.
