import { STATE, game } from './state.js';
import { H, W, easeOutQuad } from './core.js';
import { circleRectOverlap, resolveObstacle } from './physics.js';
import { GRABBABLE_KINDS } from './entities/registry.js';
import { BOTTOM_DWELL_DURATION, CEILING_Y, CLAW_BODY_H, CLAW_BODY_W, CLAW_CLOSED_JAW, CLAW_LOCK_Y, CLAW_SPAWN_Y, DROP_CHANCE, FALL_BASE, FALL_GROWTH, FALL_MAX, FLOOR_Y, GROUND_Y, HOMING_BASE, HOMING_GROWTH, HOMING_MAX, HOVER_CLAW_MAX_X, HOVER_CLAW_MIN_ONSCREEN_X, HOVER_CLAW_Y, HOVER_PATROL_AMPLITUDE, HOVER_PATROL_SPEED, HOVER_SWOOP_COOLDOWN, HOVER_SWOOP_DURATION, HOVER_SWOOP_TRIGGER_RANGE, RETRACT_SPEED } from './tuning.js';

function secondsElapsed() {
  return (performance.now() - game.runStartTime) / 1000;
}

export function spawnClaw() {
  if (game.claws.length > 0) return; // enforce a single claw instance at a time
  const lane = 48 + Math.floor(Math.random() * 8) * 48;
  game.claws.push({
    x: lane,
    y: -40,
    vy: FALL_BASE,
    armLen: 30,
    jawOpen: 18,
    grabbing: false,
    grabbedObstacle: null,
    grabbedIsPlayer: false,
    willDrop: false, // whether this claw's grab (once it happens) will let go mid-retract
    dropY: null,     // the y height (rolled at grab time) to release its catch at, if willDrop
    retracting: false,
    dwelling: false, // paused at the bottom, jaws closed, for BOTTOM_DWELL_DURATION before retracting
    dwellElapsed: 0,
    stoodOn: false, // whether the player is currently standing on its body
    color: '#e44',
  });
}

export function updateClaws(dt) {
  const t = secondsElapsed();
  const homingSpeed = Math.min(HOMING_BASE + t * HOMING_GROWTH, HOMING_MAX);
  const fallSpeed = Math.min(FALL_BASE + t * FALL_GROWTH, FALL_MAX);

  for (let c of game.claws) {
    const prevY = c.y; // used below to carry a rider standing on the claw's body

    if (!c.retracting && !c.dwelling) {
      // AI pursuit: steer horizontally toward the bunny's current position —
      // but only until the claw reaches the 2/3-down lock point, after which
      // it commits to a straight-down descent with no more side-to-side motion.
      if (c.y < CLAW_LOCK_Y) {
        const dx = game.player.x - c.x;
        const step = Math.min(Math.abs(dx), homingSpeed * dt);
        c.x += Math.sign(dx) * step;
        c.x = Math.max(24, Math.min(W - 24, c.x));
      }

      // Descend — speed increases the longer the bunny survives.
      c.vy = fallSpeed;
      c.y += c.vy * dt;

      // Reached the bottom of the box, or clipped a non-player obstacle
      // (turtle, crate, ball, bear) on the way down — either way, come to a
      // stop and dwell there briefly (see BOTTOM_DWELL_DURATION below)
      // before starting the retract back up, instead of continuing to
      // descend/vanish or reversing direction instantly.
      if (clawTipY(c) >= FLOOR_Y || clawHitsObstacle(c)) {
        c.dwelling = true;
        c.dwellElapsed = 0;
        c.retractFromY = c.y;
        // Size the ease's total duration off the old constant retract speed,
        // so a claw that starts retracting further down still takes
        // proportionally longer, same as before — only the speed *curve*
        // along the way changes from constant to eased. Computed now since
        // c.y stays put for the rest of the dwell.
        c.retractDuration = Math.max(0.15, (c.retractFromY - CLAW_SPAWN_Y) / RETRACT_SPEED);

        // Right as it comes to a stop, check whether it's fully lined up (in
        // x) over the bunny herself — same "fully aligned" idea as grabbing
        // a wide obstacle, mirrored since the bunny is narrower than the
        // jaws (her bounds must sit inside the jaw span, rather than the
        // jaw span sitting inside the item's bounds). Catching the bunny
        // takes priority over grabbing whatever object she happens to be
        // standing on/near.
        if (playerGrabAligned(c)) {
          c.grabbing = true;
          c.grabbedIsPlayer = true;
          c.stoodOn = false; // now held by the jaws, not standing on the body
        } else {
          const target = findGrabTarget(c);
          if (target) {
            c.grabbing = true;
            c.grabbedObstacle = target;
            game.obstacles = game.obstacles.filter(ob => ob !== target);
          }
        }

        // Every catch is a coin flip: roll it the instant the grab happens,
        // and if it's a drop, pick the height it'll be let go at right now
        // too — somewhere between this grab point and a full retract.
        if (c.grabbing) {
          c.willDrop = Math.random() < DROP_CHANCE;
          c.dropY = c.willDrop
            ? CLAW_SPAWN_Y + Math.random() * (c.retractFromY - CLAW_SPAWN_Y)
            : null;
        }

        // Snap the jaws shut now that the grab has (or hasn't) been decided —
        // this happens regardless of the outcome, so an empty grab still
        // closes on nothing, same as a real claw machine's cycle.
        c.jawOpen = CLAW_CLOSED_JAW;
      }
    } else if (c.dwelling) {
      // Sit still at the bottom, jaws already closed, for one beat before
      // the retract begins.
      c.dwellElapsed += dt;
      if (c.dwellElapsed >= BOTTOM_DWELL_DURATION) {
        c.dwelling = false;
        c.retracting = true;
        c.retractElapsed = 0;
      }
    } else {
      // Ease-out retract: starts its climb a little more slowly, then
      // smoothly slows again as it nears the top of its travel, instead of
      // moving at one fixed speed the whole way up.
      c.retractElapsed = Math.min(c.retractElapsed + dt, c.retractDuration);
      const progress = easeOutQuad(c.retractElapsed / c.retractDuration);
      c.y = c.retractFromY + (CLAW_SPAWN_Y - c.retractFromY) * progress;

      // If this catch was rolled to be a drop, let go the moment the claw
      // climbs up to the height picked at grab time, rather than hauling it
      // all the way up. The bunny simply resumes falling under her own
      // physics (see the `grabbedBefore` check in loop()); a dropped
      // obstacle is handed back to updateObstacles() to fall to the floor.
      if (c.grabbing && c.willDrop && c.y <= c.dropY) {
        if (c.grabbedObstacle) {
          const item = c.grabbedObstacle;
          if (item.kind !== 'ball') item.falling = true; // ball already falls under its own gravity once airborne
          item.vy = 0;
          game.obstacles.push(item);
        }
        c.grabbing = false;
        c.grabbedIsPlayer = false;
        c.grabbedObstacle = null;
        c.willDrop = false;
      }

      // Haul whatever's grabbed up along with the claw, held right at the
      // jaws — the bunny herself if she's the one caught, otherwise the
      // grabbed obstacle.
      if (c.grabbing && c.grabbedIsPlayer) {
        game.player.x = c.x;
        game.player.y = clawTipY(c) - game.player.r;
      } else if (c.grabbing && c.grabbedObstacle) {
        const item = c.grabbedObstacle;
        item.x = c.x - item.w / 2;
        item.y = clawTipY(c) - item.h;
      }

      // Fully retracted with something in its grip. Catching the bunny ends
      // the run — the same fade-to-black-and-game-over used for a fatal
      // finger touch — since there's no "resuming play" once she's the one
      // that's been hauled off. Grabbing an ordinary obstacle, on the other
      // hand, simply makes that object vanish (it was already pulled out of
      // the obstacles list at grab time): let go of the grip so the empty
      // claw finishes leaving the scene, with NO screen-wide fade-to-black
      // and no interruption — play continues uninterrupted in STATE.PLAYING.
      if (c.grabbing && c.retractElapsed >= c.retractDuration) {
        if (c.grabbedIsPlayer) {
          game.state = STATE.FADING;
        } else if (c.grabbedObstacle) {
          c.grabbing = false;
          c.grabbedObstacle = null;
        }
      }
    }

    // If the player is currently standing on this claw's body, carry them
    // along with exactly however far it just moved (up while retracting,
    // down while still descending) — same approach as the turtle carrying
    // its rider horizontally in updateObstacles — so standing on the hook
    // isn't fought against by gravity as it climbs away underneath them.
    if (c.stoodOn) game.player.y += c.y - prevY;

    // Pulsing jaw while still descending — once it's dwelling at the bottom
    // or retracting the jaws stay closed (see CLAW_CLOSED_JAW above) instead
    // of resuming the open pulse.
    if (!c.retracting && !c.dwelling) c.jawOpen = 16 + Math.sin(Date.now() / 220) * 6;
  }
  // Remove claws once they've either left the screen while falling, or have
  // fully retracted back up past the spawn point. The retract completion is
  // judged by retractElapsed reaching retractDuration (exact, since it's
  // clamped with Math.min) rather than by comparing c.y to CLAW_SPAWN_Y —
  // the eased position calculation can leave c.y a hair above CLAW_SPAWN_Y
  // due to floating-point rounding even once progress reaches 1, which let
  // a fully-retracted claw sit stuck forever and silently blocked all future
  // spawns (since spawnClaw() only fires once claws.length reaches 0). A claw
  // that grabbed an ordinary obstacle releases its grip the instant it finishes
  // retracting (above), so the object simply vanishes with it and the claw is
  // removed here like any other fully-retracted claw — no fade, no pause.
  game.claws = game.claws.filter(c => c.retracting ? (c.retractElapsed < c.retractDuration || c.grabbing) : c.y < H + 60);
}

// True if the claw's jaw span (between its two tips) substantially overlaps
// a grabbable obstacle's x bounds — i.e. it's squarely lined up over the
// item, not just brushing an edge of it. This used to require the jaw span
// to sit *fully* inside the item's bounds, but the jaw span (up to 44px
// wide, oscillating) is wider than or comparable to most grabbable objects
// (32-34px), so that full-containment rule was geometrically almost never
// satisfiable — the claw could look perfectly centered over a crate or ball
// and still never register a grab. Requiring most (not all) of the smaller
// of the two widths to overlap keeps the "squarely lined up" spirit while
// actually being achievable.

function findGrabTarget(c) {
  const left = clawTipLeft(c), right = clawTipRight(c);
  const jawSpan = right - left;
  for (const ob of game.obstacles) {
    if (!GRABBABLE_KINDS.includes(ob.kind)) continue;
    const overlap = Math.min(right, ob.x + ob.w) - Math.max(left, ob.x);
    if (overlap >= Math.min(jawSpan, ob.w) * 0.6) return ob;
  }
  return null;
}

// True if the claw's jaw span overlaps at least 30% of the bunny's
// horizontal width — a partial-overlap "in bounds" rule rather than the
// full-containment check findGrabTarget uses for wide obstacles: the claw
// no longer needs to be squarely, fully lined up over her, just clipping
// enough of her to plausibly grab hold.
//
// Also requires the bunny to actually be down inside the jaws' grab zone, not
// sitting ON TOP of the claw. The jaws close between the head (c.y) and the
// tips (c.y + c.armLen); when the bunny is riding above the claw her whole
// body is above c.y, so the jaws never got hold of her — grabbing her from
// underneath in that case is the bug. She counts as grabbable only if some of
// her body reaches down to at least the head level (her bottom edge is at or
// below c.y), which lets her keep riding the claw up to finish the level.

function playerGrabAligned(c) {
  const left = clawTipLeft(c), right = clawTipRight(c);
  const playerLeft = game.player.x - game.player.r, playerRight = game.player.x + game.player.r;
  const overlap = Math.min(right, playerRight) - Math.max(left, playerLeft);
  if (overlap < (playerRight - playerLeft) * 0.3) return false;
  // Reject when the bunny is above the claw (riding on its body): her lowest
  // point must reach down into the jaw zone (>= the claw head y) to be caught.
  return game.player.y + game.player.r >= c.y;
}

// ─── Collision ────────────────────────────────────────────────────────────────

export function clawTipY(c) { return c.y + c.armLen; }

export function clawTipLeft(c) { return c.x - c.jawOpen; }

export function clawTipRight(c) { return c.x + c.jawOpen; }

// Circle (jaw tip) vs axis-aligned rectangle (obstacle) overlap test —
// same closest-point approach used for player/obstacle collision above.

function clawHitsObstacle(c) {
  const tipY = clawTipY(c);
  const tipR = 6; // matches the drawn jaw-tip circles (r=4) plus a small margin
  for (const ob of game.obstacles) {
    if (circleRectOverlap(clawTipLeft(c), tipY, tipR, ob)) return true;
    if (circleRectOverlap(clawTipRight(c), tipY, tipR, ob)) return true;
  }
  return false;
}

// Only the two jaw/finger tips are ever grabby — the arm and body block
// ("the top of the claw") are safe to touch and are handled as a standable
// platform instead (see resolveClawBodies below). Merely brushing a finger
// tip is harmless on its own; it's shared here (FINGER_HIT_R) purely as the
// hit-radius used by the hover claw's swoop-catch check below — the box
// claw itself no longer has any touch-based instant-death check, since
// death now only comes from being grabbed and hauled all the way up
// without a drop (see the grab/retract logic in updateClaws).

export function touchesCeiling() { return game.player.y - game.player.r <= CEILING_Y; }

// ─── Claw body ("top") — standable, non-harmful ───────────────────────────
// The boxy mechanism above the jaws (drawn in drawClaw as the red block) is
// treated exactly like a static obstacle: landing on it supports the player
// (standable top) and bumping its sides just blocks movement — never harm.

function clawBodyRect(c) {
  return { x: c.x - CLAW_BODY_W / 2, y: c.y - 14, w: CLAW_BODY_W, h: CLAW_BODY_H, kind: 'clawBody', claw: c };
}

export function resolveClawBodies() {
  for (const c of game.claws) c.stoodOn = false; // recomputed below each frame
  for (const c of game.claws) resolveObstacle(game.player, clawBodyRect(c));
}

// ─── Platform Level (Phase 2): Mario-style side-scroller ───────────────────
// Popping out of the top of the claw machine drops the bunny into a fresh
// rightward-scrolling platforming stage. This is a from-scratch rebuild of
// an earlier, broken attempt: that version computed a follow-camera value
// (cameraX) but never actually applied it anywhere when drawing, so every
// world-space object (ground, platforms, the player) was rendered at its
// raw world coordinate — the bunny visually ran straight off the right edge
// of the canvas within a couple of steps and the "level" was unplayable.
// It has been scrubbed entirely rather than patched.
//
// This rebuild keeps everything (ground, platforms, enemies, the player) in
// one continuous world-space coordinate system, and funnels every
// world-space draw call through exactly one camera translation
// (drawPlatformWorld, below), so what's rendered can never drift from what's
// simulated again. On top of that base, the stage is a genuine Mario-style
// run: the ground is broken up by jumpable pits (falling in one is fatal,
// just like being caught by a claw), a couple of floating platforms per
// chunk add vertical variety, and a patrolling enemy per chunk must be
// jumped over — or stomped from above, Goomba-style, to clear it.

export function initHoverClaw() {
  game.hoverClaw = {
    x: 300, y: HOVER_CLAW_Y,
    patrolCenter: 300, patrolT: 0,
    armLen: 14, jawOpen: 18,
    swooping: false, swoopElapsed: 0, cooldown: 0,
    swoopStartX: 0, swoopEndX: 0, swoopDiveY: 0, swoopTargetY: 0,
  };
}

export function updateHoverClaw(dt) {
  const c = game.hoverClaw;
  c.jawOpen = 16 + Math.sin(Date.now() / 220) * 6; // pulsing jaw, same look as the box claw

  if (c.swooping) {
    // One continuous arc: dives from hover height down toward the bunny's
    // position at trigger time, then rises back up to hover height further
    // along, tracing a smooth curve (fast down, fast back up) rather than a
    // straight line.
    c.swoopElapsed = Math.min(c.swoopElapsed + dt, HOVER_SWOOP_DURATION);
    const t = c.swoopElapsed / HOVER_SWOOP_DURATION;
    c.x = c.swoopStartX + (c.swoopEndX - c.swoopStartX) * t;
    // Keep the diving claw on-screen too: if the player sprints forward mid-arc
    // and the camera scrolls past the swoop's world x, drag the arc's x forward
    // so the claw never dips off the left edge while diving.
    if (c.x < game.cameraX + HOVER_CLAW_MIN_ONSCREEN_X) {
      c.x = game.cameraX + HOVER_CLAW_MIN_ONSCREEN_X;
    }
    c.y = HOVER_CLAW_Y + (c.swoopDiveY - HOVER_CLAW_Y) * Math.sin(Math.PI * t);
    if (t >= 1) {
      c.swooping = false;
      c.y = HOVER_CLAW_Y;
      c.patrolCenter = c.swoopEndX;
      c.patrolT = 0;
      c.cooldown = HOVER_SWOOP_COOLDOWN;
    }

    // Check collision with player
    checkHoverClawCollision(c);
    return;
  }

  if (c.cooldown > 0) c.cooldown -= dt;

  // Hover/patrol: drift slowly side to side at a fixed altitude while
  // watching for the bunny to run underneath it moving right.
  c.patrolT += dt * HOVER_PATROL_SPEED;
  c.x = c.patrolCenter + Math.sin(c.patrolT) * HOVER_PATROL_AMPLITUDE;
  c.x = Math.max(40, Math.min(HOVER_CLAW_MAX_X, c.x)); // allow patrol beyond screen edges in world space
  c.y = HOVER_CLAW_Y;

  // On-screen tether: never let the claw fall so far behind the advancing
  // player that it scrolls off the left edge. The visible viewport spans world
  // x [cameraX, cameraX + W]; if the player pulls far enough right that the
  // claw's rightmost edge would leave the screen, drag its patrol center
  // forward so it stays within view (a small HOVER_CLAW_MIN_ONSCREEN_X inset
  // from the left edge). This keeps the hazard on-screen and behind the player
  // rather than disappearing off the left.
  const minCenterX = game.cameraX + HOVER_CLAW_MIN_ONSCREEN_X - HOVER_PATROL_AMPLITUDE;
  if (c.patrolCenter < minCenterX) {
    c.patrolCenter = minCenterX;
    c.x = c.patrolCenter + Math.sin(c.patrolT) * HOVER_PATROL_AMPLITUDE;
  }
  // Also hard-clamp the instantaneous x so a swing of the patrol sine never
  // dips the body off the left of the screen.
  if (c.x < game.cameraX + HOVER_CLAW_MIN_ONSCREEN_X) {
    c.x = game.cameraX + HOVER_CLAW_MIN_ONSCREEN_X;
  }

  // The bunny and the hover claw both live in world space (the camera
  // translation is applied once, at draw time). So the swoop trigger must
  // compare the bunny's world x directly against the claw's world x — a
  // previous version added cameraX to player.x, double-counting the camera
  // offset, which made the claw dive at a point ~100-200px away from where
  // the bunny actually was and then catch them "for no reason" as they
  // walked into that spot.
  // Trigger only when the bunny is APPROACHING from the left (still behind the
  // claw) and moving right, so the dive lands as a telegraphed arc ahead of the
  // bunny that they can see coming and react to — rather than firing right on
  // top of them and homing onto their position.
  if (c.cooldown <= 0 && game.player.vx > 0 &&
      game.player.x < c.x && (c.x - game.player.x) < HOVER_SWOOP_TRIGGER_RANGE) {
    c.swooping = true;
    c.swoopElapsed = 0;
    c.swoopStartX = c.x;
    // Snapshot the bunny's position (x AND y) at the exact instant the swoop
    // begins, then aim the whole arc at that captured point so the claw
    // actually descends toward where the player was at swoop-start — not a
    // fixed depth or a stale/mistargeted point. The snapshot is frozen here:
    // if the player moves during the ~1s dive, the arc still homes on the
    // spot they occupied when the swoop triggered.
    const targetX = game.player.x;
    const targetY = game.player.y;
    c.swoopTargetY = targetY;
    // Horizontal: the arc's lowest point (t=0.5) sits over the captured x, and
    // the sweep continues past it so the claw rises back up ahead of the player.
    c.swoopEndX = Math.max(40, Math.min(HOVER_CLAW_MAX_X, 2 * targetX - c.swoopStartX));
    // Vertical: dive so the harmful jaw tips (c.y + c.armLen) reach the captured
    // player y at the arc's low point, making the claw swoop down to where the
    // bunny actually was. Clamp so the tips never punch below the ground.
    const maxTipY = Math.min(game.player.y, GROUND_Y - 4);
    c.swoopDiveY = maxTipY - c.armLen;
  }

  // Check collision with player while hovering
  checkHoverClawCollision(c);
}

function checkHoverClawCollision(c) {
  // Only the jaw tips are harmful (same as box claw), so a near-miss on the
  // body doesn't count.
  const tipY = c.y + c.armLen;
  const left = clawTipLeft(c), right = clawTipRight(c);

  // Check left finger
  let dx = game.player.x - left, dy = game.player.y - tipY;
  if (dx * dx + dy * dy < game.player.r * game.player.r) {
    game.state = STATE.PLATFORM_FADING;
    return;
  }

  // Check right finger
  dx = game.player.x - right; dy = game.player.y - tipY;
  if (dx * dx + dy * dy < game.player.r * game.player.r) {
    game.state = STATE.PLATFORM_FADING;
    return;
  }
}

// Per-level claw renderers. Each level's hover-claw look is a self-contained
// function that draws over the claw's shared geometry (a body at (c.x, c.y)
// and the two harmful jaw tips at clawTipLeft/Right(c), y = c.y + c.armLen).
// The shared behavior/logic (updateHoverClaw, checkHoverClawCollision) is
// geometry-based and untouched — only the visuals are isolated per level here.
// PLATFORM_CLAWS maps each platform level to its own renderer; drawHoverClaw is
// a single lookup into it, so adding/altering one level's claw touches only
// that level's entry and function, never a shared cascade of level checks.
