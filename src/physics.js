import { game } from './state.js';
import { H, W } from './core.js';
import { applyPlayerJumpPhysics } from './input.js';
import { BALL_CARRY_FACTOR, BALL_MAX_SPEED, BALL_POP_LAND, BALL_POP_SIDE, BALL_ROLL_ACCEL, EAR_FEEDBACK_DURATION, EAR_FEEDBACK_MAX_FOLD, EAR_LENGTH_FRAC, EAR_MOUNT_ANGLES, PUSH_DRIFT_ACCEL, PUSH_TILT_ACCEL } from './tuning.js';
import { PUSH_ANIMAL_KINDS } from './entities/registry.js';

export function resolveObstacle(p, ob) {
  const left = ob.x, right = ob.x + ob.w, top = ob.y, bottom = ob.y + ob.h;
  const closestX = Math.max(left, Math.min(p.x, right));
  const closestY = Math.max(top, Math.min(p.y, bottom));
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= p.r * p.r) return; // no overlap

  let stoodOn = false;

  if (distSq > 0) {
    const dist = Math.sqrt(distSq);
    const nx = dx / dist, ny = dy / dist;
    const overlap = p.r - dist;
    p.x += nx * overlap;
    p.y += ny * overlap;
    if (ny < -0.5) { p.grounded = true; stoodOn = true; }
  } else {
    // Player center is inside the box (rare, e.g. teleport/large step) —
    // push out along whichever edge is closest.
    const dLeft = p.x - left, dRight = right - p.x;
    const dTop = p.y - top, dBottom = bottom - p.y;
    const min = Math.min(dLeft, dRight, dTop, dBottom);
    if (min === dTop) { p.y = top - p.r; p.grounded = true; stoodOn = true; }
    else if (min === dBottom) p.y = bottom + p.r;
    else if (min === dLeft) p.x = left - p.r;
    else p.x = right + p.r;
  }

  // Beach ball rolls when touched from the side (kicked away from the
  // player, whichever side was hit) or stood on (carried along with the
  // player's own horizontal movement, like walking on top of a ball).
  // Being light, it also pops up a little on a fresh hit and bounces.
  if (ob.kind === 'ball') {
    ob.touching = true;
    if (stoodOn) {
      ob.vx += p.vx * BALL_CARRY_FACTOR;
    } else {
      const cx = ob.x + ob.w / 2;
      const awayDir = cx >= p.x ? 1 : -1; // roll away from the player's side
      ob.vx += awayDir * BALL_ROLL_ACCEL;
    }
    ob.vx = Math.max(-BALL_MAX_SPEED, Math.min(BALL_MAX_SPEED, ob.vx));

    if (!ob.wasTouching) {
      // Fresh contact this frame (not still resting against the player from
      // last frame) — give it an upward pop, bigger when landed on from
      // above than when just bumped from the side.
      const pop = stoodOn ? BALL_POP_LAND : BALL_POP_SIDE;
      ob.vy = Math.min(ob.vy, pop);
    }
  }

  // Level-1 animals aren't rigid: a sideways push (not being stood on) makes
  // them rock and drift slowly away from the player. Just flag the push
  // direction here; updateObstacles integrates the gentle drift + wobble.
  if (PUSH_ANIMAL_KINDS.includes(ob.kind) && !stoodOn) {
    const cx = ob.x + ob.w / 2;
    const awayDir = cx >= p.x ? 1 : -1; // drift away from the player's side
    ob.pushed = true;
    ob.driftVX += awayDir * PUSH_DRIFT_ACCEL;
    ob.tiltVel += awayDir * PUSH_TILT_ACCEL; // rock in the push direction
  }

  // Turtle only crawls while it's currently being stood on — see updateObstacles.
  if (ob.kind === 'turtle' && stoodOn) ob.stoodOn = true;

  // Claw body only records the rider so updateClaws can carry the player
  // along with its own vertical movement (descending or retracting) — see
  // updateClaws, which mirrors the turtle's horizontal-carry approach above.
  if (ob.kind === 'clawBody' && stoodOn) ob.claw.stoodOn = true;
}

export function resolveObstacles() {
  game.player.grounded = game.player.y >= H - game.player.r - 0.5; // resting on box floor
  for (const ob of game.obstacles) {
    if (ob.kind === 'turtle') ob.stoodOn = false; // recomputed below each frame
    if (ob.kind === 'ball') { ob.wasTouching = ob.touching; ob.touching = false; } // recomputed below each frame
    if (PUSH_ANIMAL_KINDS.includes(ob.kind)) ob.pushed = false; // recomputed below each frame
  }
  for (const ob of game.obstacles) resolveObstacle(game.player, ob);
}

// Stops the beach ball from rolling/bouncing straight through the other box
// objects (turtle, crate, bear): resolves rectangle-vs-rectangle overlap
// between the ball and every other obstacle, pushing the ball out along
// whichever axis has the smaller penetration so a side hit halts its roll
// (like bumping into a wall) and landing on top rests it there instead of
// clipping into the object beneath.

export function resolveBallObstacleCollisions(ball) {
  for (const ob of game.obstacles) {
    if (ob === ball) continue;

    const overlapX = Math.min(ball.x + ball.w, ob.x + ob.w) - Math.max(ball.x, ob.x);
    const overlapY = Math.min(ball.y + ball.h, ob.y + ob.h) - Math.max(ball.y, ob.y);
    if (overlapX <= 0 || overlapY <= 0) continue; // no overlap

    if (overlapX < overlapY) {
      if (ball.x < ob.x) ball.x -= overlapX; else ball.x += overlapX;
      ball.vx = 0; // rolling halted by the side of the other object
    } else {
      if (ball.y < ob.y) { ball.y -= overlapY; ball.vy = 0; } // rests on top
      else if (ball.vy < 0) ball.vy = 0; // blocked from below
    }
  }
}

// Advances the beach ball's rolling motion: moves it by its current speed,
// spins its rotation to match (so it visibly rolls rather than slides),
// keeps it within the box, and lets friction bring it back to rest. Also
// advances its vertical pop/bounce: once popped upward by a fresh hit,
// gravity pulls it back down and it bounces off the floor, losing height
// each bounce, until it settles back at rest.

export function circleRectOverlap(cx, cy, cr, ob) {
  const left = ob.x, right = ob.x + ob.w, top = ob.y, bottom = ob.y + ob.h;
  const closestX = Math.max(left, Math.min(cx, right));
  const closestY = Math.max(top, Math.min(cy, bottom));
  const dx = cx - closestX, dy = cy - closestY;
  return (dx * dx + dy * dy) < cr * cr;
}

// True once either jaw tip touches any non-player obstacle (turtle, crate,
// ball, bear) while descending — used to trigger the same quick retract
// that normally only fires on reaching the box floor.

export function updatePlayerPhysics(dt) {
  // Movement, gravity, and jumping are handled by the shared, level-agnostic
  // helper so this stage stays in lockstep with every other level's jump feel.
  applyPlayerJumpPhysics(dt);

  // Ground collision (floor of the box)
  const groundY = H - game.player.r;
  if (game.player.y >= groundY) {
    game.player.y = groundY;
    game.player.vy = 0;
    game.player.grounded = true;
  } else {
    game.player.grounded = false;
  }

  // Keep player within the box horizontally
  game.player.x = Math.max(game.player.r, Math.min(W - game.player.r, game.player.x));
}

// ─── Score ────────────────────────────────────────────────────────────────────

function earFoldProgress(roll, angFromTop, r) {
  const earH = r * EAR_LENGTH_FRAC;
  // World "down" lives at local angle (PI/2 - roll) after the head rolls.
  const earDownAngle = Math.PI / 2 - roll;
  const downAng = (earDownAngle - angFromTop) + Math.PI / 2; // 0 => ear points straight down
  const d = Math.atan2(Math.sin(downAng), Math.cos(downAng));
  const tipDepth = earH * Math.max(0, Math.cos(d));
  return earH > r ? Math.max(0, Math.min(1, (tipDepth - r) / (earH - r))) : 0;
}

// The fold amount of the bunny's ears RIGHT NOW: the deepest fold across her two
// ears at her current head roll. Used by tryJump to require the ears be at least
// partially folded against the ground before a jump is allowed. Only meaningful
// while grounded (folding is suppressed in the air), so callers pair it with the
// grounded check.

export function playerEarFold(p) {
  if (p.roll === undefined) return 0;
  let max = 0;
  for (const a of EAR_MOUNT_ANGLES) {
    max = Math.max(max, earFoldProgress(p.roll, a, p.r));
  }
  return max;
}

// Advances the blocked-jump feedback twitch timer by dt each frame. The timer
// (p.earFeedbackT) counts down from EAR_FEEDBACK_DURATION to 0 while a twitch is
// playing; tryJump sets it to the full duration when a jump is rejected for
// un-folded ears. Called once per frame from applyPlayerJumpPhysics so every
// level ticks it uniformly.

export function updateEarFeedback(p, dt) {
  if (p.earFeedbackT === undefined) p.earFeedbackT = 0;
  if (p.earFeedbackT > 0) p.earFeedbackT = Math.max(0, p.earFeedbackT - dt);
}

// The additive fold contributed by the feedback twitch right now: a smooth
// half-fold-then-straighten pulse (0 → EAR_FEEDBACK_MAX_FOLD → 0) shaped as a
// single sine hump over the twitch's EAR_FEEDBACK_DURATION.

export function earFeedbackFoldAmount(p) {
  if (!p || !p.earFeedbackT || p.earFeedbackT <= 0) return 0;
  const progress = 1 - p.earFeedbackT / EAR_FEEDBACK_DURATION; // 0..1 over the twitch
  return Math.sin(progress * Math.PI) * EAR_FEEDBACK_MAX_FOLD;
}

// Draws one folding ear in the head's LOCAL, roll-rotated frame.
//  angFromTop  – the ear's mounting angle around the head, measured so that
//                0 is straight up. As the head rolls this rotates with it.
//  The ear is drawn as a segmented stalk so it can bend: whenever the ear
//  swings low enough that its tip would pass below the ground contact point
//  it folds/flops back against the floor instead of clipping through it.
