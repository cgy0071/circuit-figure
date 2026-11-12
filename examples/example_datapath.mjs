// Netlist: operand registers A and B -> ALU -> result register, all 16-bit buses.
// Track plan: the operands enter from the left on separate rows; the result
// leaves to the right. No feedback or control connections are implied.
import { Fig, C, theme } from '../lib/figlib.mjs';

export default function exampleDatapath() {
  theme('mono');
  const f = new Fig(130, 52, 'Example: 16-bit register datapath');
  const left = 8, registerWidth = 28, registerHeight = 9;
  const upper = 9, lower = 30, aluX = 53, aluY = 14, aluWidth = 24, aluHeight = 22;
  const resultX = 94, resultY = 20.5;
  const bus = { w: 0.8, color: C.bus, arrow: 'end' };
  f.mem(left, upper, registerWidth, registerHeight, 'Operand A');
  f.mem(left, lower, registerWidth, registerHeight, 'Operand B');
  f.unit(aluX, aluY, aluWidth, aluHeight, 'ALU');
  f.mem(resultX, resultY, registerWidth, registerHeight, 'Result');
  const inputX = left + registerWidth;
  const upperY = upper + registerHeight / 2, lowerY = lower + registerHeight / 2;
  const upperTrack = 44, lowerTrack = 46;
  f.line([[inputX, upperY], [upperTrack, upperY], [upperTrack, aluY + 5], [aluX, aluY + 5]], bus);
  f.line([[inputX, lowerY], [lowerTrack, lowerY], [lowerTrack, aluY + aluHeight - 5], [aluX, aluY + aluHeight - 5]], bus);
  const outputY = resultY + registerHeight / 2;
  f.line([[aluX + aluWidth, outputY], [resultX, outputY]], bus);
  f.tick(40, upperY, false, '16');
  f.tick(40, lowerY, false, '16');
  f.tick(85, outputY, false, '16');
  f.legendBar(8, 44, 114, [['mem', 'register'], ['op', 'compute'], ['bus', '16-bit data']]);
  return f;
}
