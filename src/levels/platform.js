import { STATE, game } from '../state.js';
import { initHoverClaw, updateHoverClaw } from '../claw.js';
import { H, W } from '../core.js';
import { applyPlayerJumpPhysics } from '../input.js';
import { CHUNK_PATTERNS } from './chunks.js';
import { resolveObstacle } from '../physics.js';
import { makeRng } from '../rng.js';
import { CHUNK_W, DESPAWN_BEHIND, DOOR_H, DOOR_W, DOOR_X_FROM_END, GENERATE_AHEAD, GROUND_Y, MAX_PIT_W, NUM_CHUNKS } from '../tuning.js';

export function initPlatformLevel(level = game.platformLevel) {
  game.platformLevel = level;
  game.groundSegments = [];
  game.stagePlatforms = [];
  game.enemies = [];
  game.cameraX = 0;
  game.generatedUpToX = 0;
  game.chunkCount = 0;
  // Fresh random seed each time the platform level starts, so the layout is
  // genuinely randomized between runs (but consistent within a single run).
  game.levelRng = makeRng((Date.now() ^ (Math.random() * 0x100000000)) >>> 0);
  generateChunksUpTo(W + GENERATE_AHEAD);

  game.player.x = 40;
  game.player.y = GROUND_Y - game.player.r;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.grounded = true;

  // Door at the end of 10 chunks
  const doorWorldX = NUM_CHUNKS * CHUNK_W + DOOR_X_FROM_END;
  game.door = {
    x: doorWorldX,
    y: GROUND_Y - DOOR_H,
    w: DOOR_W,
    h: DOOR_H,
  };
  game.doorAlpha = 0;
  game.doorTouchElapsed = 0;

  initHoverClaw();
}

// Generates chunks by picking, at random, one of the pattern templates for
// each chunk. Selection is driven by the per-run seeded PRNG (levelRng) rather
// than `chunkCount % 10`, so layouts differ genuinely between runs while
// staying stable within a single run. Two fairness guarantees keep every
// generated layout traversable:
//   • The FIRST chunk is always pit-free, giving the bunny a safe runway right
//     after popping out of the machine (so simply starting to walk right can
//     never drop you into a pit "for no reason").
//   • Every pit is clamped to MAX_PIT_W, comfortably inside the ~115px max jump
//     reach, so no gap is impossible and no chunk becomes a dead-end.

function generateChunksUpTo(targetX) {
  while (game.generatedUpToX < targetX) {
    const base = game.generatedUpToX;
    const patternIdx = Math.floor(game.levelRng() * CHUNK_PATTERNS.length) % CHUNK_PATTERNS.length;
    const pattern = CHUNK_PATTERNS[patternIdx];

    if (game.chunkCount === 0) {
      // Safe opening chunk: solid ground the whole way across, no pit, so the
      // player always has firm footing immediately after entering the stage.
      game.groundSegments.push({ x: base, y: GROUND_Y, w: CHUNK_W, h: 40 });
    } else {
      // Ground: solid segment before pit, solid segment after pit. Pit width is
      // clamped so it is always jumpable.
      const gapW = Math.min(pattern.gapW, MAX_PIT_W);
      game.groundSegments.push(
        { x: base, y: GROUND_Y, w: pattern.gapX, h: 40 },
        { x: base + pattern.gapX + gapW, y: GROUND_Y, w: CHUNK_W - (pattern.gapX + gapW), h: 40 },
      );
    }

    // Two floating platforms from the pattern.
    for (const plat of pattern.platforms) {
      game.stagePlatforms.push({
        x: base + plat.x,
        y: plat.y,
        w: plat.w,
        h: plat.h,
      });
    }

    game.generatedUpToX = base + CHUNK_W;
    game.chunkCount++;
  }
}

export function updatePlatformLevel(dt) {
  // Movement, gravity, and jumping come from the shared, level-agnostic helper
  // — identical to the box stage and to any future level — so the bunny's jump
  // mechanic carries over automatically with no per-stage re-wiring.
  applyPlayerJumpPhysics(dt);
  game.player.grounded = false;

  for (const seg of game.groundSegments) resolveObstacle(game.player, seg);
  for (const plat of game.stagePlatforms) resolveObstacle(game.player, plat);

  // Only the very start of the stage blocks movement — there's no
  // right-hand bound, since it keeps extending as the bunny advances.
  game.player.x = Math.max(game.player.r, game.player.x);

  // Falling into a pit is just as fatal as being caught by a claw.
  if (game.player.y > H + 60) {
    game.state = STATE.PLATFORM_FADING;
    return;
  }

  updateHoverClaw(dt);

  // Check if player has reached the exit door. door.{x,y} is the door rect's
  // top-left corner (y is the top, not the center), so overlap is tested by
  // clamping the player's center into the door rect and comparing distance to
  // the player radius. The previous check compared player.y - door.y against
  // ±door.h/2 as if door.y were the center, which — with the door sitting on
  // the ground and the bunny running along it — never registered a touch, so
  // the exit door was effectively unreachable and the stage un-completable.
  if (game.door) {
    const cx = Math.max(game.door.x, Math.min(game.player.x, game.door.x + game.door.w));
    const cy = Math.max(game.door.y, Math.min(game.player.y, game.door.y + game.door.h));
    const dx = game.player.x - cx, dy = game.player.y - cy;
    if (dx * dx + dy * dy <= game.player.r * game.player.r) {
      // Player touched the door — start the END_LEVEL sequence
      game.state = STATE.END_LEVEL;
      game.doorTouchElapsed = 0;
      return;
    }
  }

  // Side-scrolling camera: follow the player once they pass the screen's
  // center (never scrolls left past the start of the stage), and keep
  // generating/dropping chunks so the stage extends ahead of the camera
  // without the world-object lists growing without bound.
  game.cameraX = Math.max(0, game.player.x - W / 2);
  generateChunksUpTo(game.cameraX + W + GENERATE_AHEAD);
  game.groundSegments = game.groundSegments.filter(s => s.x + s.w > game.cameraX - DESPAWN_BEHIND);
  game.stagePlatforms = game.stagePlatforms.filter(p => p.x + p.w > game.cameraX - DESPAWN_BEHIND);
}
