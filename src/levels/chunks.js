import { GROUND_Y } from '../tuning.js';

export const CHUNK_PATTERNS = [
  {
    gapX: 520, gapW: 85,
    platforms: [
      { x: 150, y: GROUND_Y - 70, w: 90, h: 16 },
      { x: 360, y: GROUND_Y - 90, w: 90, h: 16 },
    ],
  },
  {
    gapX: 620, gapW: 75,
    platforms: [
      { x: 180, y: GROUND_Y - 75, w: 90, h: 16 },
      { x: 400, y: GROUND_Y - 85, w: 90, h: 16 },
    ],
  },
  {
    gapX: 720, gapW: 80,
    platforms: [
      { x: 200, y: GROUND_Y - 65, w: 90, h: 16 },
      { x: 420, y: GROUND_Y - 100, w: 90, h: 16 },
    ],
  },
  {
    gapX: 570, gapW: 90,
    platforms: [
      { x: 170, y: GROUND_Y - 80, w: 90, h: 16 },
      { x: 380, y: GROUND_Y - 70, w: 90, h: 16 },
    ],
  },
  {
    gapX: 640, gapW: 85,
    platforms: [
      { x: 190, y: GROUND_Y - 90, w: 90, h: 16 },
      { x: 410, y: GROUND_Y - 75, w: 90, h: 16 },
    ],
  },
  {
    gapX: 500, gapW: 80,
    platforms: [
      { x: 140, y: GROUND_Y - 85, w: 90, h: 16 },
      { x: 350, y: GROUND_Y - 95, w: 90, h: 16 },
    ],
  },
  {
    gapX: 680, gapW: 75,
    platforms: [
      { x: 210, y: GROUND_Y - 70, w: 90, h: 16 },
      { x: 430, y: GROUND_Y - 80, w: 90, h: 16 },
    ],
  },
  {
    gapX: 600, gapW: 90,
    platforms: [
      { x: 160, y: GROUND_Y - 75, w: 90, h: 16 },
      { x: 370, y: GROUND_Y - 100, w: 90, h: 16 },
    ],
  },
  {
    gapX: 550, gapW: 85,
    platforms: [
      { x: 130, y: GROUND_Y - 95, w: 90, h: 16 },
      { x: 340, y: GROUND_Y - 65, w: 90, h: 16 },
    ],
  },
  {
    gapX: 660, gapW: 80,
    platforms: [
      { x: 220, y: GROUND_Y - 80, w: 90, h: 16 },
      { x: 440, y: GROUND_Y - 90, w: 90, h: 16 },
    ],
  },
];

                     // but internally-consistent — layout (mulberry32)

// Small seeded PRNG. Given the same seed it returns the same stream, so a
// single level run has a stable layout (platforms/pits don't shift under the
// player) while different runs get genuinely different, randomized layouts —
// unlike the previous `chunkCount % 10` selection, which produced the exact
// same sequence every single run and so was only random in appearance.
