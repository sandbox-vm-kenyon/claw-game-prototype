// ─── Level registry ─────────────────────────────────────────────────────────
//
// A platform stage used to be identified by a bare integer (`platformLevel` =
// 2/3/4) sprinkled through if/else ladders: one in drawPlatformBackground to
// pick a backdrop, one in the END_LEVEL handler to decide what comes next, and
// the PLATFORM_CLAWS table for the claw art. This registry collapses all of
// that into ONE record per level, so adding a level is additive: append a
// record naming its backdrop fn, its hover-claw fn, and the level it leads to.
//
// Keyed by the same integer the rest of the engine already uses for
// `game.platformLevel` (2 = rooftop, 3 = jungle, 4 = cavern), so it drops in
// without renumbering anything. `next` is the level to advance to on clearing
// this one, or `null` to end the run.

import { drawRooftopBackground, drawJungleBackground, drawCavernBackground } from '../render/background.js';
import { drawRedHoverClaw, drawSnakeClaw, drawBatClaw } from '../render/claws.js';

export const LEVELS = {
  2: {
    id: 'rooftop',
    type: 'platform',
    background: drawRooftopBackground,
    claw: drawRedHoverClaw,
    next: 3,
  },
  3: {
    id: 'jungle',
    type: 'platform',
    background: drawJungleBackground,
    claw: drawSnakeClaw,
    next: 4,
  },
  4: {
    id: 'cavern',
    type: 'platform',
    background: drawCavernBackground,
    claw: drawBatClaw,
    next: null, // cleared cavern = run complete
  },
};

// The first platform level the bunny pops out into from the box stage.
export const FIRST_PLATFORM_LEVEL = 2;
