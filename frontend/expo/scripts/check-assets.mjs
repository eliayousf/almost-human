import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const cast = JSON.parse(await readFile(new URL('../assets/cast/cast.json', import.meta.url)));
assert.equal(cast.length, 25);
for (const face of cast) for (const mode of ['idle', 'talk', 'smile', 'poster']) {
  assert(face[mode].endsWith('.webp'));
  const bytes = await readFile(new URL('../assets/cast/' + face[mode], import.meta.url));
  assert(bytes.length > 0 && bytes.length <= 96 * 1024);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  if (mode !== 'poster') {
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
    assert(bytes[20] & 2, 'Animation flag must be present');
    assert.equal(bytes.readUIntLE(24, 3) + 1, 256);
    assert.equal(bytes.readUIntLE(27, 3) + 1, 256);
    let frameCount = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = bytes.toString('ascii', offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      assert(offset + 8 + size <= bytes.length);
      if (chunk === 'ANIM') assert.equal(bytes.readUInt16LE(offset + 12), 0, 'Loop forever');
      if (chunk === 'ANMF') frameCount++;
      offset += 8 + size + (size % 2);
    }
    assert(frameCount > 1, 'Animation must contain multiple frames');
  }
}
console.log('All 100 WebP assets passed (75 animated, each under 96 KiB).');
