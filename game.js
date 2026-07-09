// Claw Game — Game Over on Claw Contact: Fade to Black + Show Game Over

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const W = canvas.width;
const H = canvas.height;

// ─── State ────────────────────────────────────────────────────────────────────

const STATE = { PLAYING: 0, FADING: 1, GAME_OVER: 2, POPOUT: 3, PLATFORM: 4, PLATFORM_FADING: 5, GRAB_FADE_OUT: 6, GRAB_FADE_IN: 7 };

let state, player, claws, obstacles, score, fadeAlpha, fadeSpeed, gameOverAlpha;
let runStartTime;

// Grab-and-carry: when the claw comes to a stop fully aligned (in x) over a
// crate/turtle/ball, it grabs that item and hauls it up with the retract.
// Once fully retracted, play briefly pauses for a fade-to-black-and-back —
// on the way back in, the item is gone for good.
//
// Every grab is a gamble, though: the instant something is caught, there's
// only a 50% chance the claw actually keeps its grip all the way up. If it
// doesn't, a drop height is rolled right then (somewhere between the grab
// point and a full retract) and the catch is let go the moment the claw
// climbs up to that height — the item/bunny falls back rather than being
// hauled off.
let grabFadeAlpha, grabFadeClaw;
const DROP_CHANCE = 0.5; // odds a grab is let go mid-retract instead of held all the way up

// Pop-out transition (riding a retracting claw all the way to the box's
// ceiling no longer kills the player — it launches them up and out of the
// top of the machine into a second, platformer-style level).
let popoutStartY, popoutElapsed;
const POPOUT_DURATION = 30;  // dt-units (~0.5s at 60fps)
const POPOUT_RISE = 140;     // extra px the player visibly rises during the pop

// ─── Platformer physics tuning ─────────────────────────────────────────────
const MOVE_SPEED = 3.2;
const GRAVITY = 0.6;
const JUMP_VELOCITY = -11;
const MAX_FALL_SPEED = 14;

function init() {
  state = STATE.PLAYING;
  fadeAlpha = 0;
  gameOverAlpha = 0;
  fadeSpeed = 0.018;
  score = 0;
  runStartTime = performance.now();

  grabFadeAlpha = 0;
  grabFadeClaw = null;

  if (btnPlayAgain) btnPlayAgain.classList.remove('visible');

  player = {
    x: W / 2,
    y: H - 14,   // start standing on the ground
    r: 14,
    speed: MOVE_SPEED,
    vx: 0,
    vy: 0,
    grounded: false,
  };

  claws = [];
  spawnClaw();

  initObstacles();
}

// ─── Obstacles (other animals/objects in the box) ─────────────────────────
// Static bodies the bunny can jump on top of (platforms) or must jump over
// (obstacles). Collision is resolved as a circle (player) vs. axis-aligned
// box (obstacle), so this works the same whether the bunny approaches from
// the side (blocked → jump over) or lands from above (supported → jump on).

const FLOOR_Y = H - 6; // resting line for items sitting in the bottom of the box

// Which obstacle kinds the claw can grab and carry off. The bear is left out
// on purpose — only the crate, turtle and ball are up for grabs.
const GRABBABLE_KINDS = ['turtle', 'block', 'ball'];

// Beach-ball rolling tuning — the ball is the only obstacle that reacts to
// contact by rolling instead of just blocking/supporting the player.
const BALL_ROLL_ACCEL = 0.9;  // nudge applied to ball speed per frame of contact (px/frame)
const BALL_CARRY_FACTOR = 0.35; // how much of the player's own speed is imparted while stood on
const BALL_MAX_SPEED = 4;     // cap on rolling speed so it stays controllable
const BALL_FRICTION = 0.93;   // per-frame decay so the ball rolls to a stop
const BALL_BOUNDS_PAD = 4;    // keep the ball from rolling off the box edges

// Beach-ball bounce tuning — being light, the ball also pops up a little
// and bounces (loses some height each bounce, then settles) any time it's
// freshly hit, whether landed on from above or bumped from the side.
const BALL_GRAVITY = 0.5;           // downward acceleration pulling the ball back to the floor (px/frame^2)
const BALL_BOUNCE_RESTITUTION = 0.5; // fraction of impact speed kept on each bounce off the floor
const BALL_POP_LAND = -6;           // upward pop applied when the player lands on top of it (px/frame)
const BALL_POP_SIDE = -3;           // smaller upward pop applied when bumped from the side (px/frame)
const BALL_MIN_BOUNCE_VY = 0.6;     // once a floor bounce would be slower than this, just settle instead

// Turtle tuning — the turtle is the only obstacle that walks on its own,
// and only while the player is currently standing on top of it.
const TURTLE_SPEED = 0.5;     // slow crawl speed while ridden (px/frame)
const TURTLE_BOUNDS_PAD = 4;  // keep the turtle from crawling off the box edges

function initObstacles() {
  const specs = [
    { kind: 'turtle', w: 46, h: 24, xFrac: 0.16 },
    { kind: 'block',  w: 32, h: 32, xFrac: 0.38 },
    { kind: 'ball',   w: 34, h: 34, xFrac: 0.60 },
    { kind: 'bear',   w: 36, h: 38, xFrac: 0.82 },
  ];
  obstacles = specs.map(s => ({
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
  }));
}

// Resolve collision between the circular player and a single rectangular
// obstacle. Pushes the player out along the shortest escape direction, so
// landing on top behaves like a platform (grounded = true) while hitting a
// side simply blocks movement, letting the player instead jump over it.
function resolveObstacle(p, ob) {
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

  // Turtle only crawls while it's currently being stood on — see updateObstacles.
  if (ob.kind === 'turtle' && stoodOn) ob.stoodOn = true;

  // Claw body only records the rider so updateClaws can carry the player
  // along with its own vertical movement (descending or retracting) — see
  // updateClaws, which mirrors the turtle's horizontal-carry approach above.
  if (ob.kind === 'clawBody' && stoodOn) ob.claw.stoodOn = true;
}

function resolveObstacles() {
  player.grounded = player.y >= H - player.r - 0.5; // resting on box floor
  for (const ob of obstacles) {
    if (ob.kind === 'turtle') ob.stoodOn = false; // recomputed below each frame
    if (ob.kind === 'ball') { ob.wasTouching = ob.touching; ob.touching = false; } // recomputed below each frame
  }
  for (const ob of obstacles) resolveObstacle(player, ob);
}

// Stops the beach ball from rolling/bouncing straight through the other box
// objects (turtle, crate, bear): resolves rectangle-vs-rectangle overlap
// between the ball and every other obstacle, pushing the ball out along
// whichever axis has the smaller penetration so a side hit halts its roll
// (like bumping into a wall) and landing on top rests it there instead of
// clipping into the object beneath.
function resolveBallObstacleCollisions(ball) {
  for (const ob of obstacles) {
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
function updateObstacles(dt) {
  for (const ob of obstacles) {
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
      for (const other of obstacles) {
        if (other === ob) continue;
        const overlapY = Math.min(ob.y + ob.h, other.y + other.h) - Math.max(ob.y, other.y);
        if (overlapY <= 0) continue;
        if (ob.x + ob.w > other.x && ob.x < other.x + other.w) {
          if (ob.dir > 0) { ob.x = other.x - ob.w; ob.dir = -1; }
          else { ob.x = other.x + other.w; ob.dir = 1; }
        }
      }

      player.x += ob.x - startX; // carry the rider exactly as far as it actually moved
    }
  }
}

// ─── Claw AI ──────────────────────────────────────────────────────────────────
// The claw actively hunts the bunny: every frame it steers itself toward the
// bunny's current x position while it descends. Both the homing (horizontal
// chase) speed and the descent speed ramp up the longer the run lasts, so the
// hook gets more relentless over time regardless of score.

const HOMING_BASE = 0.45;    // starting horizontal pursuit speed (px/frame)
const HOMING_GROWTH = 0.03;  // added per second survived
const HOMING_MAX = 3.25;     // cap so it stays beatable

const FALL_BASE = 1.2;       // starting descent speed (px/frame)
const FALL_GROWTH = 0.035;   // added per second survived
const FALL_MAX = 7;          // cap on descent speed

const RETRACT_SPEED = 3.5;   // reference speed used to size the eased retract's duration (px/frame)
                              // lower value = longer duration = slower upward retract overall

const CLAW_CLOSED_JAW = 2; // jawOpen value the claw snaps to the instant it hits bottom (floor or
                            // obstacle) — the jaws close together whether or not anything was
                            // actually caught, same as a real claw machine's grab-and-release cycle.

// Ease-out cubic: fast at the start, smoothly decelerating toward the end —
// used so the claw's upward retract slows into its finish instead of moving
// at one constant speed the whole way up.
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function secondsElapsed() {
  return (performance.now() - runStartTime) / 1000;
}

function spawnClaw() {
  if (claws.length > 0) return; // enforce a single claw instance at a time
  const lane = 48 + Math.floor(Math.random() * 8) * 48;
  claws.push({
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
    stoodOn: false, // whether the player is currently standing on its body
    color: '#e44',
  });
}

const CLAW_SPAWN_Y = -40;
// Once a claw has descended 2/3 of the way from its spawn point to the box
// floor, it locks onto a straight-down drop: horizontal pursuit stops so the
// final third of the descent is a plain vertical strike.
const CLAW_LOCK_Y = CLAW_SPAWN_Y + (H - CLAW_SPAWN_Y) * (2 / 3);

function updateClaws(dt) {
  const t = secondsElapsed();
  const homingSpeed = Math.min(HOMING_BASE + t * HOMING_GROWTH, HOMING_MAX);
  const fallSpeed = Math.min(FALL_BASE + t * FALL_GROWTH, FALL_MAX);

  for (let c of claws) {
    const prevY = c.y; // used below to carry a rider standing on the claw's body

    if (!c.retracting) {
      // AI pursuit: steer horizontally toward the bunny's current position —
      // but only until the claw reaches the 2/3-down lock point, after which
      // it commits to a straight-down descent with no more side-to-side motion.
      if (c.y < CLAW_LOCK_Y) {
        const dx = player.x - c.x;
        const step = Math.min(Math.abs(dx), homingSpeed * dt);
        c.x += Math.sign(dx) * step;
        c.x = Math.max(24, Math.min(W - 24, c.x));
      }

      // Descend — speed increases the longer the bunny survives.
      c.vy = fallSpeed;
      c.y += c.vy * dt;

      // Reached the bottom of the box, or clipped a non-player obstacle
      // (turtle, crate, ball, bear) on the way down — either way, snap into
      // a quick retract back up instead of continuing to descend/vanish.
      if (clawTipY(c) >= FLOOR_Y || clawHitsObstacle(c)) {
        c.retracting = true;
        c.retractFromY = c.y;
        c.retractElapsed = 0;
        // Size the ease's total duration off the old constant retract speed,
        // so a claw that starts retracting further down still takes
        // proportionally longer, same as before — only the speed *curve*
        // along the way changes from constant to eased.
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
            obstacles = obstacles.filter(ob => ob !== target);
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
    } else {
      // Ease-out retract: climbs quickly at first, then smoothly slows as it
      // nears the top of its travel, instead of moving at one fixed speed.
      c.retractElapsed = Math.min(c.retractElapsed + dt, c.retractDuration);
      const progress = easeOutCubic(c.retractElapsed / c.retractDuration);
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
          obstacles.push(item);
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
        player.x = c.x;
        player.y = clawTipY(c) - player.r;
      } else if (c.grabbing && c.grabbedObstacle) {
        const item = c.grabbedObstacle;
        item.x = c.x - item.w / 2;
        item.y = clawTipY(c) - item.h;
      }

      // Fully retracted with something in its grip. Catching the bunny ends
      // the run — the same fade-to-black-and-game-over used for a fatal
      // finger touch — rather than the fade-to-black-and-back used when it's
      // just an obstacle, since there's no "resuming play" once she's the
      // one that's been hauled off.
      if (c.grabbing && c.retractElapsed >= c.retractDuration) {
        if (c.grabbedIsPlayer) {
          state = STATE.FADING;
        } else if (c.grabbedObstacle) {
          state = STATE.GRAB_FADE_OUT;
          grabFadeAlpha = 0;
          grabFadeClaw = c;
        }
      }
    }

    // If the player is currently standing on this claw's body, carry them
    // along with exactly however far it just moved (up while retracting,
    // down while still descending) — same approach as the turtle carrying
    // its rider horizontally in updateObstacles — so standing on the hook
    // isn't fought against by gravity as it climbs away underneath them.
    if (c.stoodOn) player.y += c.y - prevY;

    // Pulsing jaw while still descending — once it's retracting the jaws stay
    // closed (see CLAW_CLOSED_JAW above) instead of resuming the open pulse.
    if (!c.retracting) c.jawOpen = 16 + Math.sin(Date.now() / 220) * 6;
  }
  // Remove claws once they've either left the screen while falling, or have
  // fully retracted back up past the spawn point. The retract completion is
  // judged by retractElapsed reaching retractDuration (exact, since it's
  // clamped with Math.min) rather than by comparing c.y to CLAW_SPAWN_Y —
  // the eased position calculation can leave c.y a hair above CLAW_SPAWN_Y
  // due to floating-point rounding even once progress reaches 1, which let
  // a fully-retracted claw sit stuck forever and silently blocked all future
  // spawns (since spawnClaw() only fires once claws.length reaches 0). A
  // claw that just finished retracting with something in its grip is kept
  // around a little longer — it's removed once the grab fade sequence lets
  // go of it (see GRAB_FADE_IN in the main loop) rather than vanishing here.
  claws = claws.filter(c => c.retracting ? (c.retractElapsed < c.retractDuration || c.grabbing) : c.y < H + 60);
}

// True if the claw's jaw span (between its two tips) sits fully inside a
// grabbable obstacle's x bounds — i.e. it's squarely lined up over the item,
// not just brushing an edge of it.
function findGrabTarget(c) {
  const left = clawTipLeft(c), right = clawTipRight(c);
  for (const ob of obstacles) {
    if (!GRABBABLE_KINDS.includes(ob.kind)) continue;
    if (left >= ob.x && right <= ob.x + ob.w) return ob;
  }
  return null;
}

// True if the claw's jaw span overlaps at least 30% of the bunny's
// horizontal width — a partial-overlap "in bounds" rule rather than the
// full-containment check findGrabTarget uses for wide obstacles: the claw
// no longer needs to be squarely, fully lined up over her, just clipping
// enough of her to plausibly grab hold.
function playerGrabAligned(c) {
  const left = clawTipLeft(c), right = clawTipRight(c);
  const playerLeft = player.x - player.r, playerRight = player.x + player.r;
  const overlap = Math.min(right, playerRight) - Math.max(left, playerLeft);
  return overlap >= (playerRight - playerLeft) * 0.3;
}

// ─── Collision ────────────────────────────────────────────────────────────────

function clawTipY(c) { return c.y + c.armLen; }
function clawTipLeft(c) { return c.x - c.jawOpen; }
function clawTipRight(c) { return c.x + c.jawOpen; }

// Circle (jaw tip) vs axis-aligned rectangle (obstacle) overlap test —
// same closest-point approach used for player/obstacle collision above.
function circleRectOverlap(cx, cy, cr, ob) {
  const left = ob.x, right = ob.x + ob.w, top = ob.y, bottom = ob.y + ob.h;
  const closestX = Math.max(left, Math.min(cx, right));
  const closestY = Math.max(top, Math.min(cy, bottom));
  const dx = cx - closestX, dy = cy - closestY;
  return (dx * dx + dy * dy) < cr * cr;
}

// True once either jaw tip touches any non-player obstacle (turtle, crate,
// ball, bear) while descending — used to trigger the same quick retract
// that normally only fires on reaching the box floor.
function clawHitsObstacle(c) {
  const tipY = clawTipY(c);
  const tipR = 6; // matches the drawn jaw-tip circles (r=4) plus a small margin
  for (const ob of obstacles) {
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
const FINGER_HIT_R = 8; // matches the drawn 4px tip plus a small margin

// The box's open top (y = 0) — the only way to ever reach it is by riding a
// retracting claw all the way up, since normal jumping can't get anywhere
// close. Getting crushed against it there is just as fatal as the claw's
// fingers themselves, so a rider needs to hop off before it climbs that far.
const CEILING_Y = 0;
function touchesCeiling() { return player.y - player.r <= CEILING_Y; }

// ─── Claw body ("top") — standable, non-harmful ───────────────────────────
// The boxy mechanism above the jaws (drawn in drawClaw as the red block) is
// treated exactly like a static obstacle: landing on it supports the player
// (standable top) and bumping its sides just blocks movement — never harm.
const CLAW_BODY_W = 28;
const CLAW_BODY_H = 18;

function clawBodyRect(c) {
  return { x: c.x - CLAW_BODY_W / 2, y: c.y - 14, w: CLAW_BODY_W, h: CLAW_BODY_H, kind: 'clawBody', claw: c };
}

function resolveClawBodies() {
  for (const c of claws) c.stoodOn = false; // recomputed below each frame
  for (const c of claws) resolveObstacle(player, clawBodyRect(c));
}

// ─── Platform Level (Phase 2) ──────────────────────────────────────────────
// Popping out of the top of the claw machine drops the bunny onto its roof,
// a small platformer stage with a few floating platforms to jump between.
// Reuses the same move/jump physics and the existing generic obstacle
// collision (resolveObstacle) — a plain rectangle with no special "kind"
// just supports landing on top / blocks from the side, exactly like the box
// obstacles do.

let platforms;

function initPlatformLevel() {
  platforms = [
    { x: 0,   y: H - 20,  w: W,   h: 20 },  // the machine's rooftop (safety-net ground)
    { x: 40,  y: H - 120, w: 100, h: 16 },
    { x: 330, y: H - 150, w: 110, h: 16 },
    { x: 190, y: H - 230, w: 100, h: 16 },
    { x: 90,  y: H - 330, w: 90,  h: 16 },
    { x: 300, y: H - 340, w: 90,  h: 16 },
  ];

  player.x = W / 2;
  player.y = H - 20 - player.r;
  player.vx = 0;
  player.vy = 0;
  player.grounded = true;

  initHoverClaw();
}

function updatePlatformLevel(dt) {
  handleInput();

  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.grounded = false;

  for (const plat of platforms) resolveObstacle(player, plat);

  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  // The rooftop ground spans the full width, so this is just a safety net —
  // it should never actually trigger.
  if (player.y > H + 60) { player.y = H - 20 - player.r; player.vy = 0; }
}

function drawPlatformBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#6ec6ff');
  grd.addColorStop(1, '#bfe8ff');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Sun
  ctx.fillStyle = '#ffe066';
  ctx.beginPath(); ctx.arc(W - 60, 60, 30, 0, Math.PI * 2); ctx.fill();

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  drawCloud(90, 90);
  drawCloud(260, 150);
}

function drawCloud(cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.arc(cx + 18, cy - 8, 20, 0, Math.PI * 2);
  ctx.arc(cx + 38, cy, 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatforms() {
  for (const plat of platforms) {
    const isRoof = plat.y >= H - 20;
    ctx.fillStyle = isRoof ? '#8a6d3b' : '#7cbf5c';
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = isRoof ? '#a9895a' : '#9adf78';
    ctx.fillRect(plat.x, plat.y, plat.w, 5);
  }
}

function drawPlatformHUD() {
  ctx.fillStyle = '#2a2a2a';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${score}`, 12, 24);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#3a3a3a';
  ctx.fillText('OUT OF THE MACHINE!', 12, 44);
}

// ─── Platform-level hovering claw ──────────────────────────────────────────
// A second claw haunts the rooftop level — unlike the box's claw, it has no
// cable/arm running up off the top of the screen; it just hovers, drifting
// slowly back and forth, then swoops down in a fast arc to try to catch the
// bunny whenever they run underneath it while moving right, before rising
// back up to resume hovering (further along, tracking the bunny's progress).
const HOVER_CLAW_Y = 70;              // altitude (px from top) the claw hovers/returns to
const HOVER_PATROL_SPEED = 0.02;      // radians of drift per dt-unit while hovering
const HOVER_PATROL_AMPLITUDE = 90;    // px either side of the current patrol center
const HOVER_SWOOP_TRIGGER_RANGE = 70; // px — how close (in x) the bunny must be, moving right, to provoke a dive
const HOVER_SWOOP_ADVANCE = 120;      // px the claw's hover point shifts forward after each swoop
const HOVER_SWOOP_DURATION = 34;      // dt-units for a full dive-and-rise arc (~0.55s)
const HOVER_SWOOP_COOLDOWN = 50;      // dt-units of hovering required before it can dive again

let hoverClaw;

function initHoverClaw() {
  hoverClaw = {
    x: 300, y: HOVER_CLAW_Y,
    patrolCenter: 300, patrolT: 0,
    armLen: 14, jawOpen: 18,
    swooping: false, swoopElapsed: 0, cooldown: 0,
    swoopStartX: 0, swoopEndX: 0, swoopDiveY: 0,
  };
}

function updateHoverClaw(dt) {
  const c = hoverClaw;
  c.jawOpen = 16 + Math.sin(Date.now() / 220) * 6; // pulsing jaw, same look as the box claw

  if (c.swooping) {
    // One continuous arc: dives from hover height down toward the bunny's
    // position at trigger time, then rises back up to hover height further
    // along, tracing a smooth curve (fast down, fast back up) rather than a
    // straight line.
    c.swoopElapsed = Math.min(c.swoopElapsed + dt, HOVER_SWOOP_DURATION);
    const t = c.swoopElapsed / HOVER_SWOOP_DURATION;
    c.x = c.swoopStartX + (c.swoopEndX - c.swoopStartX) * t;
    c.y = HOVER_CLAW_Y + (c.swoopDiveY - HOVER_CLAW_Y) * Math.sin(Math.PI * t);
    if (t >= 1) {
      c.swooping = false;
      c.y = HOVER_CLAW_Y;
      c.patrolCenter = c.swoopEndX;
      c.patrolT = 0;
      c.cooldown = HOVER_SWOOP_COOLDOWN;
    }
    return;
  }

  if (c.cooldown > 0) c.cooldown -= dt;

  // Hover/patrol: drift slowly side to side at a fixed altitude while
  // watching for the bunny to run underneath it moving right.
  c.patrolT += dt * HOVER_PATROL_SPEED;
  c.x = c.patrolCenter + Math.sin(c.patrolT) * HOVER_PATROL_AMPLITUDE;
  c.x = Math.max(40, Math.min(W - 40, c.x));
  c.y = HOVER_CLAW_Y;

  if (c.cooldown <= 0 && player.vx > 0 && Math.abs(player.x - c.x) < HOVER_SWOOP_TRIGGER_RANGE) {
    c.swooping = true;
    c.swoopElapsed = 0;
    c.swoopStartX = c.x;
    c.swoopEndX = Math.max(40, Math.min(W - 40, c.x + HOVER_SWOOP_ADVANCE));
    c.swoopDiveY = Math.min(player.y - 6, H - 40);
  }
}

function drawHoverClaw(c) {
  // Body block — floats freely with no cable/arm running up off the top of
  // the screen, unlike the box's claw (see drawClaw).
  ctx.fillStyle = '#c33';
  ctx.fillRect(c.x - 14, c.y - 14, 28, 18);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 14, c.y - 14, 28, 18);

  const tipY = clawTipY(c);

  ctx.strokeStyle = '#e44';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipLeft(c), tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipRight(c), tipY); ctx.stroke();

  ctx.fillStyle = '#f88';
  ctx.beginPath(); ctx.arc(clawTipLeft(c),  tipY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(clawTipRight(c), tipY, 4, 0, Math.PI * 2); ctx.fill();
}

// Same finger-tip-only hit test used for the box claw's finger tips — only
// the jaw tips are harmful, so a near-miss on the body doesn't count.
function checkHoverClawCollision(c) {
  const tipY = clawTipY(c);
  for (const tipX of [clawTipLeft(c), clawTipRight(c)]) {
    const dx = player.x - tipX;
    const dy = player.y - tipY;
    const rr = player.r + FINGER_HIT_R;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

// ─── Input ────────────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'r' || e.key === 'R') && state === STATE.GAME_OVER) init();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// "Play Again" button on the game-over screen — restarts the run the same
// way pressing R does.
if (btnPlayAgain) {
  btnPlayAgain.addEventListener('click', () => {
    if (state === STATE.GAME_OVER) init();
  });
}

function handleInput() {
  // Platformer-style horizontal movement
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) player.vx = -player.speed;
  else if (keys['ArrowRight'] || keys['d'] || keys['D']) player.vx = player.speed;
  else player.vx = 0;

  // Jump — only while grounded, so holding the key won't re-trigger mid-air
  const jumpPressed = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '];
  if (jumpPressed && player.grounded) {
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
  }
}

function updatePlayerPhysics() {
  // Gravity
  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);

  // Apply velocity
  player.x += player.vx;
  player.y += player.vy;

  // Ground collision (floor of the box)
  const groundY = H - player.r;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  // Keep player within the box horizontally
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
}

// ─── Score ────────────────────────────────────────────────────────────────────

let spawnTimer = 0;
const SPAWN_INTERVAL = 120; // frames

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawBackground() {
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawObstacle(ob) {
  const cx = ob.x + ob.w / 2;
  const cy = ob.y + ob.h / 2;

  if (ob.kind === 'turtle') {
    // Shell
    ctx.fillStyle = '#3a7d3a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.55, ob.w / 2, ob.h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#255425';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head
    ctx.fillStyle = '#5cb85c';
    ctx.beginPath();
    ctx.arc(ob.x + ob.w + 4, ob.y + ob.h * 0.55, 7, 0, Math.PI * 2);
    ctx.fill();
    // Feet
    ctx.fillStyle = '#4a9a4a';
    ctx.fillRect(ob.x + 4, ob.y + ob.h - 4, 8, 6);
    ctx.fillRect(ob.x + ob.w - 12, ob.y + ob.h - 4, 8, 6);

  } else if (ob.kind === 'block') {
    // Wooden crate
    ctx.fillStyle = '#b5793a';
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = '#7a4e21';
    ctx.lineWidth = 2;
    ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    ctx.beginPath();
    ctx.moveTo(ob.x, ob.y); ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
    ctx.moveTo(ob.x + ob.w, ob.y); ctx.lineTo(ob.x, ob.y + ob.h);
    ctx.stroke();

  } else if (ob.kind === 'ball') {
    const r = ob.w / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ob.angle || 0); // spins to visualize rolling when touched/stood on
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#eee';
    ctx.fill();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Beach-ball stripes
    const stripeColors = ['#e44', '#4af', '#fc4'];
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (Math.PI * 2 / 6) * (i * 2), (Math.PI * 2 / 6) * (i * 2 + 1));
      ctx.closePath();
      ctx.fillStyle = stripeColors[i];
      ctx.fill();
    }
    ctx.restore();

  } else if (ob.kind === 'bear') {
    // Ears
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath(); ctx.arc(ob.x + 6, ob.y + 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 6, ob.y + 6, 6, 0, Math.PI * 2); ctx.fill();
    // Head/body
    ctx.fillStyle = '#a9713f';
    ctx.beginPath();
    ctx.arc(cx, cy, ob.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Face
    ctx.fillStyle = '#6b4423';
    ctx.beginPath(); ctx.arc(cx - 5, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 6, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawObstacles() {
  for (const ob of obstacles) drawObstacle(ob);
}

function drawPlayer(p) {
  const r = p.r;

  // Soft glow
  const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.2);
  grd.addColorStop(0, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  const furColor = '#f7f0e6';
  const furShadow = '#d8c9b0';
  const innerEar = '#f3b6c2';

  // Ears (drawn behind the head, tipped slightly outward)
  const earW = r * 0.6;
  const earH = r * 1.9;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(p.x + side * r * 0.45, p.y - r * 0.6);
    ctx.rotate(side * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, -earH / 2, earW / 2, earH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = furColor;
    ctx.fill();
    ctx.strokeStyle = furShadow;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -earH / 2 + 2, earW / 2 - 4, earH / 2 - 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = innerEar;
    ctx.fill();
    ctx.restore();
  }

  // Head/body
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = furColor;
  ctx.fill();
  ctx.strokeStyle = furShadow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cheeks
  ctx.fillStyle = 'rgba(243,182,194,0.5)';
  ctx.beginPath(); ctx.arc(p.x - r * 0.5, p.y + r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + r * 0.5, p.y + r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(p.x - r * 0.32, p.y - r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + r * 0.32, p.y - r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();

  // Nose
  ctx.fillStyle = '#e07a92';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + r * 0.18);
  ctx.lineTo(p.x - r * 0.12, p.y + r * 0.32);
  ctx.lineTo(p.x + r * 0.12, p.y + r * 0.32);
  ctx.closePath();
  ctx.fill();
}

function drawClaw(c) {
  // Arm / cable
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x, 0);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();

  // Body block
  ctx.fillStyle = '#c33';
  ctx.fillRect(c.x - 14, c.y - 14, 28, 18);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 14, c.y - 14, 28, 18);

  const tipY = clawTipY(c);

  // Left jaw
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 4);
  ctx.lineTo(clawTipLeft(c), tipY);
  ctx.stroke();

  // Right jaw
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 4);
  ctx.lineTo(clawTipRight(c), tipY);
  ctx.stroke();

  // Jaw tips
  ctx.fillStyle = '#f88';
  ctx.beginPath(); ctx.arc(clawTipLeft(c),  tipY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(clawTipRight(c), tipY, 4, 0, Math.PI * 2); ctx.fill();
}

// Draws every active claw, plus whatever item it's currently grabbed onto
// (drawn first so the claw's jaws read as gripping it, not floating beside
// it) — used anywhere claws are drawn so a carried item is never dropped
// from the scene mid-retract.
function drawClaws() {
  for (const c of claws) {
    if (c.grabbing && c.grabbedObstacle) drawObstacle(c.grabbedObstacle);
    drawClaw(c);
  }
}

function drawHUD() {
  ctx.fillStyle = '#4af';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${score}`, 12, 24);
}

// ─── Fade to Black ────────────────────────────────────────────────────────────

function drawFadeOverlay() {
  ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
  ctx.fillRect(0, 0, W, H);
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────

function drawGameOver() {
  // After fade is complete, reveal game over text by fading it in
  ctx.globalAlpha = gameOverAlpha;

  // "GAME OVER" heading
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px monospace';
  ctx.fillStyle = '#e44';
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 24;
  ctx.fillText('GAME OVER', W / 2, H / 2 - 40);

  ctx.shadowBlur = 0;

  // Score line
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 12);

  // Restart prompt
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
  ctx.globalAlpha = gameOverAlpha * pulse;
  ctx.font = '16px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText('Press  R  to restart', W / 2, H / 2 + 56);

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let lastTime = 0;
let frame = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3); // ~60 fps units
  lastTime = ts;
  frame++;

  drawBackground();

  if (state === STATE.PLAYING) {
    // While a claw is actively hauling the bunny up in its jaws, she's fully
    // caught — freeze her own movement/physics (same idea as freezing the
    // player during FADING) so the claw's retract is the only thing moving
    // her, instead of gravity/input fighting the carry each frame.
    const grabbedBefore = claws.some(c => c.grabbing && c.grabbedIsPlayer);
    if (!grabbedBefore) {
      handleInput();
      updatePlayerPhysics();
      resolveObstacles();
      resolveClawBodies();
    }
    updateObstacles(dt);
    updateClaws(dt);

    // Spawn a new claw only once the current one is gone, so only one
    // claw is ever active in the game at a time.
    if (claws.length === 0) {
      spawnTimer++;
      if (spawnTimer >= SPAWN_INTERVAL) {
        spawnTimer = 0;
        spawnClaw();
        score++;
      }
    } else {
      spawnTimer = 0;
    }

    // Draw scene
    drawObstacles();
    drawClaws();
    drawPlayer(player);
    drawHUD();

    // Merely touching the claw's fingers is no longer fatal on its own — the
    // bunny only dies if she's actually grabbed (see playerGrabAligned in
    // updateClaws) and the claw hauls her all the way up to a full retract
    // without rolling a drop (state = FADING is set there once that
    // carry-to-the-top completes). Riding a retracting claw all the way up
    // to the ceiling instead pops the bunny out of the top of the machine
    // into the platform level. Skipped while a claw just grabbed the bunny
    // this same frame (updateClaws may have already set state = FADING
    // itself once that grab's retract completes) — the ceiling check would
    // otherwise misfire the instant she's hauled up near the top.
    const grabbedNow = claws.some(c => c.grabbing && c.grabbedIsPlayer);
    if (!grabbedNow && touchesCeiling()) {
      state = STATE.POPOUT;
      popoutStartY = player.y;
      popoutElapsed = 0;
    }

  } else if (state === STATE.GRAB_FADE_OUT) {
    // Scene stays visible underneath the fade — the claw and its catch sink
    // into black together.
    drawObstacles();
    drawClaws();
    drawPlayer(player);
    drawHUD();

    grabFadeAlpha = Math.min(1, grabFadeAlpha + fadeSpeed);
    ctx.fillStyle = `rgba(0,0,0,${grabFadeAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (grabFadeAlpha >= 1) {
      // The item is gone for good — let go of it so only the empty claw
      // fades back in.
      grabFadeClaw.grabbing = false;
      grabFadeClaw.grabbedObstacle = null;
      state = STATE.GRAB_FADE_IN;
    }

  } else if (state === STATE.GRAB_FADE_IN) {
    // Fade back in on the same scene, minus the item the claw just made off
    // with.
    drawObstacles();
    drawClaws();
    drawPlayer(player);
    drawHUD();

    grabFadeAlpha = Math.max(0, grabFadeAlpha - fadeSpeed);
    ctx.fillStyle = `rgba(0,0,0,${grabFadeAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (grabFadeAlpha <= 0) {
      // The claw's done its job — let it finish leaving the scene like any
      // other fully-retracted claw, and resume normal play.
      claws = claws.filter(c => c !== grabFadeClaw);
      grabFadeClaw = null;
      state = STATE.PLAYING;
    }

  } else if (state === STATE.POPOUT) {
    // Scene stays visible underneath the pop-out flash while the player
    // launches further upward and out of frame.
    drawObstacles();
    drawClaws();

    popoutElapsed = Math.min(popoutElapsed + dt, POPOUT_DURATION);
    const progress = popoutElapsed / POPOUT_DURATION;
    player.y = popoutStartY - progress * POPOUT_RISE;

    drawPlayer(player);
    drawHUD();

    // Bright flash (contrasted with the fade-to-black on death) sells the
    // "pop" of bursting out through the top of the machine.
    ctx.fillStyle = `rgba(255,255,255,${progress * 0.9})`;
    ctx.fillRect(0, 0, W, H);

    if (progress >= 1) {
      initPlatformLevel();
      state = STATE.PLATFORM;
    }

  } else if (state === STATE.PLATFORM) {
    updatePlatformLevel(dt);
    updateHoverClaw(dt);

    drawPlatformBackground();
    drawPlatforms();
    drawHoverClaw(hoverClaw);
    drawPlayer(player);
    drawPlatformHUD();

    // Caught by the hovering claw's swoop — fade to game over, same as
    // getting caught by the box's claw.
    if (checkHoverClawCollision(hoverClaw)) {
      state = STATE.PLATFORM_FADING;
    }

  } else if (state === STATE.PLATFORM_FADING) {
    drawPlatformBackground();
    drawPlatforms();
    drawHoverClaw(hoverClaw);
    drawPlayer(player);
    drawPlatformHUD();

    fadeAlpha = Math.min(1, fadeAlpha + fadeSpeed);
    drawFadeOverlay();

    if (fadeAlpha >= 1) {
      state = STATE.GAME_OVER;
    }

  } else if (state === STATE.FADING) {
    // Scene stays visible underneath fade
    drawObstacles();
    drawClaws();
    drawPlayer(player);
    drawHUD();

    // Advance fade
    fadeAlpha = Math.min(1, fadeAlpha + fadeSpeed);
    drawFadeOverlay();

    // Once fully black, switch to GAME_OVER
    if (fadeAlpha >= 1) {
      state = STATE.GAME_OVER;
    }

  } else if (state === STATE.GAME_OVER) {
    // Keep it fully black underneath
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Fade in the game over text
    gameOverAlpha = Math.min(1, gameOverAlpha + 0.025);
    drawGameOver();

    // Reveal the Play Again button once the game-over text has fully faded in
    if (gameOverAlpha >= 1 && btnPlayAgain) btnPlayAgain.classList.add('visible');
  }

  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
requestAnimationFrame(loop);
