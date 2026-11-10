import weightRanges from '../data/fish-weights.json';
import type { FishType } from './types';
export { weightRanges };
// Average three uniform draws: ordinary sizes are common, extremes are uncommon.
export function randomFishWeight(type: FishType, rolls: number[]): number {
  const [min, max] = weightRanges[type];
  const fraction = rolls.reduce((sum, roll) => sum + Math.max(0, Math.min(1, roll)), 0) / rolls.length;
  return Math.round((min + (max - min) * fraction) * 100) / 100;
}
// Positions are fractions of the bar. The target bounces slowly inside its bounds.
export function fishingFrame(stage: number, elapsedMs: number, start: number, direction: number) {
  const index = Math.max(0, Math.min(2, Math.floor(stage)));
  const width = [0.30, 0.22, 0.14][index];
  const travel = 1 - width;
  const distance = start * travel + direction * Math.max(0, elapsedMs) / 1000 * 0.045;
  const phase = ((distance % (travel * 2)) + travel * 2) % (travel * 2);
  const left = phase <= travel ? phase : travel * 2 - phase;
  const speed = 1800 - index * 180;
  const pointerPhase = (Math.max(0, elapsedMs) % (speed * 2)) / speed;
  return { left, width, pointer: pointerPhase <= 1 ? pointerPhase : 2 - pointerPhase };
}
