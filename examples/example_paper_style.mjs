// Optional personal presentation style: grey modules, bold labels and Chinese font.
// Netlist: input register -> processing unit -> result register, scalar arrows.
import { Fig, stylePreset } from '../lib/figlib.mjs';

export default function examplePaperStyle() {
  stylePreset('paper-bold');
  const f = new Fig(120, 35, 'Optional bold paper style');
  f.module(3, 3, 114, 28);
  f.mem(8, 13, 25, 10, '输入 / Input');
  f.unit(48, 13, 25, 10, '处理 / Compute');
  f.mem(88, 13, 25, 10, '结果 / Result');
  f.line([[33, 18], [48, 18]], { arrow: 'end' });
  f.line([[73, 18], [88, 18]], { arrow: 'end' });
  return f;
}
