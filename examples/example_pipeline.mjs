// Example figure: a small control block that dispatches work to three workers.
// Build:  node ../lib/build.mjs example_pipeline.mjs --out out
//
// Netlist (fixed before layout; layout rounds must not change it)
//   blocks   Filter (unit), Dispatch (unit), state (memory), hold (flag register),
//            OR, NOR (gates), Worker 0-2 (units)
//   regions  Control = Filter, Dispatch, state, hold, OR, NOR;  Workers = Worker 0-2
//   from        to           kind
//   Filter      Dispatch     bus      work items
//   Filter      state        write
//   state       OR           read
//   hold        OR (inv.)    read
//   OR          Dispatch     control  go
//   Dispatch    Worker 0-2   bus      one bus, three taps
//   Worker 0-2  NOR          control  done[2:0], one bit per worker
//   NOR         hold         write
// Wiring plan: spine on the left (Filter -> Dispatch -> worker bus). Everything stored sits to
// the right of the spine in the top row. The done bus runs below the workers and returns on
// the right edge, so it never meets the work bus.
import { Fig, C, theme } from '../lib/figlib.mjs';

const CTRL = { fill: '#fff4d6', stroke: '#8a6d1f' };     // Control region
const WORK = { fill: '#e4eef9', stroke: '#2f6fb2' };     // Workers region
const LEG = [[CTRL, 'Control'], [WORK, 'Workers'], ['mem', 'memory'], ['op', 'unit'], ['ctl', 'flags'],
  ['read', 'read'], ['write', 'write'], ['ctrl', 'control'], ['bus', 'bus']];

const W = 130;
const XS = 24;                                // spine
const FT = 6, FH = 7, FX = 6, FW = 36;        // Filter
const YM = FT + FH / 2;                       // centre line of the stored items
const SX = 52, SW = 28;                       // state memory
const HX = 88, HW = 26;                       // hold flags
const XO = 70, GT = 19.5, GL = 5, GW = 6;     // OR gate: centre x, top, length, width
const YR = 15;                                // track of the hold read
const XN = 104, NB = 24;                      // NOR gate: centre x, back edge
const DT = 30, DH = 7, DX = 6, DW = 90;       // Dispatch
const BUS = 40.5;                             // work bus
const WT = 45, WH = 7, WW = 24, WXS = [24, 54, 84];   // workers
const DONE = 57, XD = 110, YD = 28;           // done bus: track, return column, entry track
const LT = 59.5;                              // legend top

function drawControl(f) {
  const rd = { dash: true, arrow: 'end' }, wr = { arrow: 'end' };
  const ct = { dash: true, arrow: 'end', color: C.ctlLine, w: 0.3 };
  const bus = { w: 0.8, color: C.bus, arrow: 'end' };

  f.module(2, 1, 118, 38, CTRL);
  f.unit(FX, FT, FW, FH, 'Filter');
  f.unit(DX, DT, DW, DH, 'Dispatch');
  f.line([[XS, FT + FH], [XS, DT]], bus);

  // state: written by Filter, read by the OR gate
  f.mem(SX, YM - 3, SW, 6, 'state');
  f.line([[FX + FW, YM], [SX, YM]], wr);
  // hold: one flag per worker, written by the NOR gate, read (inverted) by the OR gate
  f.rect(HX, YM - 3, HW, 6, { fill: C.ctl, stroke: C.ctlStroke });
  f.text(HX + 2, YM + 0.8, 'hold');
  f.bits(HX + 12, YM - 1.45, 3, 3.6, 2.9, [1]);

  // go = state OR NOT(hold)
  const or = f.gate(XO, GT + GL / 2, 'or', 'down', GL, GW);
  const a = or.inAt(0.5), b = or.inAt(-0.5);
  f.line([[a[0], YM + 3], a], rd);
  f.line([[HX + 6, YM + 3], [HX + 6, YR], [b[0], YR], [b[0], b[1] - 1]], rd);
  f.bubble(b[0], b[1] - 0.5);
  f.line([or.out, [XO, DT]], ct);
  f.text(XO + 0.9, 28, 'go', { fill: C.ctlLine });

  // hold <- NOR(done[2:0])
  const nor = f.gate(XN, NB - GL / 2, 'or', 'up', GL, GW);
  f.bubble(nor.out[0], nor.out[1] - 0.5);
  f.line([[XN, nor.out[1] - 1], [XN, YM + 3]], wr);
  return nor.inAt(0);
}

function drawWorkers(f, norIn) {
  const bus = { w: 0.8, color: C.bus, arrow: 'end' };
  const cl = { dash: true, color: C.ctlLine, w: 0.3 };
  const cb = { dash: true, arrow: 'end', color: C.ctlLine, w: 0.6 };
  const last = WXS[WXS.length - 1];

  f.module(10, WT - 1, 88, WH + 2, WORK);
  // one work bus with a tap per worker
  f.line([[XS, DT + DH], [XS, BUS], [last, BUS], [last, WT]], bus);
  WXS.slice(0, -1).forEach(x => { f.line([[x, BUS], [x, WT]], bus); f.dot(x, BUS, 0.6, C.bus); });
  WXS.forEach((x, k) => f.unit(x - WW / 2, WT, WW, WH, `Worker ${k}`));
  // done[2:0]: one bit per worker, bus below the workers, back on the right to the NOR gate
  f.line([[WXS[0], DONE], [XD, DONE], [XD, YD], [norIn[0], YD], norIn], cb);
  WXS.forEach((x, k) => {
    f.line([[x, WT + WH], [x, DONE]], cl);
    f.text(x + 0.9, DONE - 0.6, `[${k}]`, { size: 2.0, fill: C.ctlLine });
  });
  f.tick(XD, 49, true, '3', { color: C.ctlLine });
  f.text(XD + 1.1, 45, 'done', { fill: C.ctlLine });
}

export default function examplePipeline() {
  theme('mono');
  const f = new Fig(W, LT + 5 + 1.5, 'Example: control block with three workers');
  drawWorkers(f, drawControl(f));
  f.legendBar(1.5, LT, W - 3, LEG);
  return f;
}
