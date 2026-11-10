import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fishingFrame } from '../src/game/fishing';
test('fishing targets start at randomized positions and narrow through three stages', () => {
  assert.notEqual(fishingFrame(0, 0, 0.1, 1).left, fishingFrame(0, 0, 0.9, 1).left);
  assert.deepEqual([0, 1, 2].map(stage => fishingFrame(stage, 0, 0.4, 1).width), [0.30, 0.22, 0.14]);
});
test('target moves slowly in either direction and stays inside the bar after bouncing', () => {
  for (const direction of [-1, 1]) {
    const first = fishingFrame(0, 0, 0.5, direction);
    const next = fishingFrame(0, 1000, 0.5, direction);
    assert.ok(Math.abs(next.left - first.left - direction * 0.045) < 1e-9);
    for (const stage of [0, 1, 2]) for (let time = 0; time <= 120000; time += 137) {
      const frame = fishingFrame(stage, time, 0.97, direction);
      assert.ok(frame.left >= 0 && frame.left + frame.width <= 1 + 1e-9);
      assert.ok(frame.pointer >= 0 && frame.pointer <= 1);
    }
  }
});

test('fish weights stay within species ranges, with smaller variance than a uniform draw', async () => {
  const { randomFishWeight, weightRanges } = await import('../src/game/fishing');
  for (const species of Object.keys(weightRanges) as (keyof typeof weightRanges)[]) {
    const [min, max] = weightRanges[species];
    assert.equal(randomFishWeight(species, [0, 0, 0]), min);
    assert.equal(randomFishWeight(species, [1, 1, 1]), max);
    assert.ok(Math.abs(randomFishWeight(species, [0, 0.5, 1]) - (min + max) / 2) <= 0.0051);
  }
});
