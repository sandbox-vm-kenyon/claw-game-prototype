// ─── Core canvas handles + shared primitives ────────────────────────────────
//
// The one place the game reaches into the DOM for its canvas. Everything else
// imports `ctx`, `W`, `H` from here. The lookups are guarded so the pure-logic
// modules that transitively import this file (physics, rng, claw AI, …) can
// still be imported in a non-browser environment (e.g. the test runner) without
// a canvas — in that case `canvas`/`ctx` are null and W/H fall back to the
// game's fixed internal resolution. In the browser this behaves exactly as the
// original `const canvas = document.getElementById('canvas')` did.

const canvas =
  typeof document !== 'undefined' ? document.getElementById('canvas') : null;

export const ctx = canvas ? canvas.getContext('2d') : null;

export const btnPlayAgain =
  typeof document !== 'undefined' ? document.getElementById('btnPlayAgain') : null;

// Fixed internal resolution (index.html declares the canvas at 480×520).
export const W = canvas ? canvas.width : 480;
export const H = canvas ? canvas.height : 520;

export function easeOutQuad(t) { return 1 - Math.pow(1 - t, 2); }
