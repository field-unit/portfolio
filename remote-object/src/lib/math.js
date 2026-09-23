/* Small numeric helpers.

   Everything that eases here is frame-rate independent: `damp` is an
   exponential approach, not a fixed lerp, so the object settles at the
   same speed on a 60Hz laptop and a 144Hz monitor. A fixed-alpha lerp
   would make the halo feel heavier on slow machines, which is exactly
   the wrong way round. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Exponential approach. `lambda` is roughly "how sharply", 1..30. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Signed shortest way from `a` to `b` around a circle. */
export function shortAngle(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(current, target, lambda, dt) {
  return current + shortAngle(current, target) * (1 - Math.exp(-lambda * dt));
}

/** Wrap into [0, TAU). */
export const wrap = (a) => ((a % TAU) + TAU) % TAU;

/**
 * Seeded PRNG (mulberry32).
 *
 * Every scratch, screw rotation and moulding flaw on this object is
 * placed with this. The object is a specific recovered thing, not a
 * different one each visit -- if you send someone the link, the scuff
 * by the battery door has to be in the same place on their screen as
 * it is on yours.
 */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds as m:ss, the way a small display would. */
export function clock(sec) {
  if (!isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}
