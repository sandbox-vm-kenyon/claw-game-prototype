import { game } from '../state.js';
import { W } from '../core.js';
import { resolveBallObstacleCollisions } from '../physics.js';
import { BALL_BOUNCE_RESTITUTION, BALL_BOUNDS_PAD, BALL_FRICTION, BALL_GRAVITY, BALL_MIN_BOUNCE_VY, FLOOR_Y, PUSH_DRIFT_FRICTION, PUSH_MAX_DRIFT, PUSH_MAX_TILT, PUSH_RETURN, PUSH_SLIDE_SPEED, PUSH_TILT_DAMPING, PUSH_TILT_STIFFNESS, TURTLE_BOUNDS_PAD, TURTLE_SPEED } from '../tuning.js';
import { PUSH_ANIMAL_KINDS, ENTITY_TYPES, OBSTACLE_SPAWN_ORDER } from './registry.js';

export function initObstacles() {
  // The box-stage roster is now driven by the entity-type registry: sizes and
  // spawn positions come from ENTITY_TYPES rather than a spec list inlined here,
  // so a new grabbable/pushable animal is added by registering one entry there.
  const specs = OBSTACLE_SPAWN_ORDER.map(kind => ({
    kind,
    w: ENTITY_TYPES[kind].size.w,
    h: ENTITY_TYPES[kind].size.h,
    xFrac: ENTITY_TYPES[kind].xFrac,
  }));
  game.obstacles = specs.map(s => ({
    kind: s.kind,
    w: s.w,
    h: s.h,
    x: W * s.xFrac - s.w / 2,
    y: FLOOR_Y - s.h,
    vx: 0,     // rolling velocity (beach ball only)
    vy: 0,     // vertical bounce velocity (beach ball only)
    angle: 0,  // rotation angle for the rolling animation (beach ball only)
    dir: 1,        // crawl direction (turtle only)
    stoodOn: false, // whether the player is standing on it this frame (turtle only)
    touching: false,    // whether the player is touching it this frame (beach ball only)
    wasTouching: false, // touching state from the previous frame, used to detect a fresh impact (beach ball only)
    falling: false, // set true if the claw grabs then drops this item mid-retract, until it lands again
    homeX: W * s.xFrac - s.w / 2, // resting x the animal eases back toward after being pushed (push animals)
    pushed: false,  // whether the player pushed into it (from the side) this frame (push animals)
    driftVX: 0,     // slow horizontal drift velocity from being pushed (push animals)
    tilt: 0,        // current rocking/tilt angle in radians (push animals)
    tiltVel: 0,     // angular velocity of the rocking spring (push animals)
    sliding: 0,     // once rocked to full tilt, the push direction (-1/+1) it's now sliding along the floor; 0 = not sliding (push animals)
  }));
}

// Resolve collision between the circular player and a single rectangular
// obstacle. Pushes the player out along the shortest escape direction, so
// landing on top behaves like a platform (grounded = true) while hitting a
// side simply blocks movement, letting the player instead jump over it.

// Slide a pushed animal horizontally by `delta` px, but no further than the
// first thing in its way. It's blocked by a box wall or by any other obstacle
// whose body it would overlap (vertically level with it), coming to rest flush
// against that blocker. Returns the distance actually moved (0 if blocked
// immediately), so the caller can tell when the slide has hit something and
// should stop. Sets ob.x to the resting position and returns true if the slide
// was blocked short of the full requested delta (hit a wall or object), false
// if it moved the whole way unobstructed.
function slideAnimal(ob, delta) {
  const startX = ob.x;
  const wantX = ob.x + delta;
  let targetX = wantX;

  // Box walls.
  targetX = Math.max(0, Math.min(W - ob.w, targetX));

  // Other obstacles: only those sharing vertical space with this animal can
  // block it. Whichever is nearest in the slide direction sets the limit.
  for (const other of game.obstacles) {
    if (other === ob) continue;
    const overlapY = Math.min(ob.y + ob.h, other.y + other.h) - Math.max(ob.y, other.y);
    if (overlapY <= 0) continue; // not level with this animal, can't collide

    if (delta > 0 && startX + ob.w <= other.x) {
      // Moving right toward an obstacle on the right: stop flush against it.
      if (targetX + ob.w > other.x) targetX = other.x - ob.w;
    } else if (delta < 0 && startX >= other.x + other.w) {
      // Moving left toward an obstacle on the left: stop flush against it.
      if (targetX < other.x + other.w) targetX = other.x + other.w;
    }
  }

  ob.x = targetX;
  // Blocked if it couldn't reach where it was trying to go this frame.
  return Math.abs(targetX - wantX) > 1e-6;
}

export function updateObstacles(dt) {
  for (const ob of game.obstacles) {
    // A non-ball item the claw grabbed and then dropped mid-retract (see
    // updateClaws) has no other floor-seeking physics of its own (unlike the
    // ball, which already falls under its own gravity whenever airborne) —
    // let it drop straight down under gravity until it lands back at its
    // usual resting line, then leave it be like any other static obstacle.
    if (ob.falling) {
      ob.vy += BALL_GRAVITY * dt;
      ob.y += ob.vy * dt;
      const groundY = FLOOR_Y - ob.h;
      if (ob.y >= groundY) {
        ob.y = groundY;
        ob.vy = 0;
        ob.falling = false;
      }
      continue;
    }

    // Level-1 animal push response: a subtle rock/tilt plus a slow drift in the
    // push direction, easing back toward the animal's home spot once the player
    // stops pushing. Runs only for the box-stage animals (PUSH_ANIMAL_KINDS);
    // the turtle also has its own ride-crawl below, which is unaffected.
    if (PUSH_ANIMAL_KINDS.includes(ob.kind)) {
      if (ob.pushed && ob.sliding) {
        // Fully rocked over — slide slowly along the floor in the push
        // direction. Unlike the little bounded drift, the slide is free to
        // travel the whole box, but it stops the instant it hits a wall or
        // another obstacle (see slideAnimal). Its resting spot moves with it,
        // so once it stops it stays put rather than springing back home.
        const blocked = slideAnimal(ob, ob.sliding * PUSH_SLIDE_SPEED * dt);
        ob.homeX = ob.x;
        if (blocked) ob.sliding = 0; // ran into a wall/object — halt the slide
      } else if (ob.pushed) {
        // Rocking but not yet fully tilted over — the original subtle bounded
        // drift, clamped so it never wanders far before the slide kicks in.
        ob.x += ob.driftVX * dt;
        ob.x = Math.max(ob.homeX - PUSH_MAX_DRIFT, Math.min(ob.homeX + PUSH_MAX_DRIFT, ob.x));
      } else {
        // Not being pushed — stop sliding and gently ease back toward home.
        ob.sliding = 0;
        ob.x += (ob.homeX - ob.x) * PUSH_RETURN * dt;
      }
      ob.driftVX *= PUSH_DRIFT_FRICTION;
      if (Math.abs(ob.driftVX) < 0.01) ob.driftVX = 0;

      // Rocking: a damped spring pulling the tilt back upright, kept subtle.
      ob.tiltVel += -ob.tilt * PUSH_TILT_STIFFNESS * dt;
      ob.tiltVel *= PUSH_TILT_DAMPING;
      ob.tilt += ob.tiltVel * dt;
      ob.tilt = Math.max(-PUSH_MAX_TILT, Math.min(PUSH_MAX_TILT, ob.tilt));
    }

    if (ob.kind === 'ball') {
      if (ob.vx !== 0) {
        ob.x += ob.vx * dt;

        const minX = BALL_BOUNDS_PAD;
        const maxX = W - BALL_BOUNDS_PAD - ob.w;
        if (ob.x < minX) { ob.x = minX; ob.vx = 0; }
        else if (ob.x > maxX) { ob.x = maxX; ob.vx = 0; }

        ob.angle += (ob.vx / (ob.w / 2)) * dt; // rolling rotation matches travel distance

        ob.vx *= BALL_FRICTION;
        if (Math.abs(ob.vx) < 0.02) ob.vx = 0;
      }

      const groundY = FLOOR_Y - ob.h;
      if (ob.y < groundY || ob.vy !== 0) {
        ob.vy += BALL_GRAVITY * dt;
        ob.y += ob.vy * dt;
        if (ob.y >= groundY) {
          ob.y = groundY;
          if (ob.vy > BALL_MIN_BOUNCE_VY) ob.vy = -ob.vy * BALL_BOUNCE_RESTITUTION; // bounce, losing energy
          else ob.vy = 0; // settle
        }
      }

      resolveBallObstacleCollisions(ob);

    } else if (ob.kind === 'turtle') {
      if (!ob.stoodOn) continue; // only crawls while the player is riding it

      const startX = ob.x;
      ob.x += ob.dir * TURTLE_SPEED * dt;

      const minX = TURTLE_BOUNDS_PAD;
      const maxX = W - TURTLE_BOUNDS_PAD - ob.w;
      if (ob.x < minX) { ob.x = minX; ob.dir = 1; }
      else if (ob.x > maxX) { ob.x = maxX; ob.dir = -1; }

      // Also turn around at any other obstacle in its path (e.g. the wooden
      // crate sitting right next to it) instead of crawling into/through it —
      // without this, the turtle would wedge itself into its neighbor and
      // knock the rider off instead of carrying them back and forth like a
      // proper moving platform, which made the ride look like it "stopped
      // working" shortly after it started.
      for (const other of game.obstacles) {
        if (other === ob) continue;
        const overlapY = Math.min(ob.y + ob.h, other.y + other.h) - Math.max(ob.y, other.y);
        if (overlapY <= 0) continue;
        if (ob.x + ob.w > other.x && ob.x < other.x + other.w) {
          if (ob.dir > 0) { ob.x = other.x - ob.w; ob.dir = -1; }
          else { ob.x = other.x + other.w; ob.dir = 1; }
        }
      }

      game.player.x += ob.x - startX; // carry the rider exactly as far as it actually moved
      ob.homeX = ob.x; // ride crawl relocates its resting spot, so the push-return spring follows it
    }
  }
}

// ─── Claw AI ──────────────────────────────────────────────────────────────────
// The claw actively hunts the bunny: every frame it steers itself toward the
// bunny's current x position while it descends. Both the homing (horizontal
// chase) speed and the descent speed ramp up the longer the run lasts, so the
// hook gets more relentless over time regardless of score.
