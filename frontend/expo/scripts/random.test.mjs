import assert from 'node:assert/strict';
import { animationModes, nextAnimation, randomCharacterId, animationDelay } from '../src/random.ts';
for (const current of animationModes) {
  const next = [nextAnimation(current, () => 0), nextAnimation(current, () => 0.999999)];
  assert.equal(new Set(next).size, 2);
  assert(!next.includes(current));
  assert(next.every(mode => animationModes.includes(mode)));
}
assert.equal(randomCharacterId(() => 0), 1);
assert.equal(randomCharacterId(() => 0.999999), 25);
assert.equal(animationDelay(() => 0), 4000);
assert.equal(animationDelay(() => 0.999999), 7999);
console.log('Random showcase, animation alternatives and staggered delays passed.');
