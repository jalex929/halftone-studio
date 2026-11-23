/** Stable 0..1 random number for a grid cell, so a dot keeps its jitter while other settings change. */
export function cellRandom(i: number, j: number, seed: number, channel = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1);
  h ^= Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(channel | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
