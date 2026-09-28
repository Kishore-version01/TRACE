export type RNG = () => number;

/**
 * Mulberry32 seeded pseudo-random number generator.
 * Produces deterministic 32-bit floats in the range [0, 1).
 */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const createRNG = mulberry32;
