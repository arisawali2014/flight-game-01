// A tiny seeded random generator (mulberry32). The island, the town and the clouds are laid
// out from one seed so every player — and every screenshot — sees the same harbour.

/** Return a function that yields the next pseudo-random number in [0, 1) for `seed`. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max) from the generator `next`. */
export function range(next, min, max) {
  return min + next() * (max - min);
}

/** Random integer in [min, max] inclusive from the generator `next`. */
export function intRange(next, min, max) {
  return Math.floor(range(next, min, max + 1));
}
