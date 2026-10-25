/**
 * Deterministic PRNG and integer arithmetic utilities.
 * Zero external dependencies.
 */

/**
 * 32-bit mulberry32 PRNG.
 * Pure function: takes current 32-bit integer state, returns pseudo-random [0, 1) float and next state.
 */
export function mulberry32(state: number): { value: number; state: number } {
  state |= 0;
  state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state };
}

/**
 * Round half away from zero.
 * 2.5 -> 3, 2.4 -> 2, -2.5 -> -3.
 */
export function roundHalfAwayFromZero(x: number): number {
  if (x >= 0) {
    return Math.floor(x + 0.5);
  } else {
    return Math.ceil(x - 0.5);
  }
}
