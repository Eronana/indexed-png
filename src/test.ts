import fs = require('fs');
import { createPNG } from './';
const palette:number[] = [];
for (let r = 0; r < 6; r++) {
  for (let g = 0; g < 6; g++) {
    for (let b = 0; b < 6; b++) {
      palette.push((r * 0x33) | ((g * 0x33) << 8) | ((b * 0x33) << 16));
    }
  }
}

(async () => {
  const width = 36;
  const height = 6
  const data = Buffer.from(Array(width * height).fill(0).map((_, i) => i % (6 * 6 * 6)));
  fs.writeFileSync('test.png', (await createPNG(data, palette, width, height)));
})();
