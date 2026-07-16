export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Max horizontal reach of a full jump is ~220px (JUMP_VELOCITY/GRAVITY/MOVE_SPEED
// with the 1.92× airborne horizontal boost); cap generated pit widths well inside
// that so every pit is comfortably clearable and no chunk is an impossible dead-end.
