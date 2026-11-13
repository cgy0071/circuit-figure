// Netlist: a, b -> AND; AND output, c -> OR; OR output -> y.
// Boolean function: y = (a AND b) OR c. These are scalar signals.
// Track plan: a/b enter the AND from the left; c joins the OR from below.
import { Fig, theme } from '../lib/figlib.mjs';

export default function exampleLogic() {
  theme('mono');
  const f = new Fig(106, 49, 'Example: combinational logic');
  const andX = 35, andY = 16, orX = 70, orY = 23;
  const length = 10, width = 10, inputX = 12, outputX = 95;
  const and = f.gate(andX, andY, 'and', 'right', length, width);
  const or = f.gate(orX, orY, 'or', 'right', length, width);
  const wire = { arrow: 'end' };
  for (const [offset, name] of [[-0.5, 'a'], [0.5, 'b']]) {
    const input = and.inAt(offset);
    f.line([[inputX, input[1]], input], wire);
    f.text(inputX - 4, input[1] + 0.8, name);
  }
  const top = or.inAt(-0.5), bottom = or.inAt(0.5);
  const upperTrack = 52, lowerTrack = 59, lowerY = 36;
  f.line([and.out, [upperTrack, and.out[1]], [upperTrack, top[1]], top], wire);
  f.line([[inputX, lowerY], [lowerTrack, lowerY], [lowerTrack, bottom[1]], bottom], wire);
  f.text(inputX - 4, lowerY + 0.8, 'c');
  f.line([or.out, [outputX, or.out[1]]], wire);
  f.text(outputX + 2, or.out[1] + 0.8, 'y');
  f.text(53, 44, 'y = (a AND b) OR c', { anchor: 'middle' });
  return f;
}
