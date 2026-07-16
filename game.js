// Claw Game — Game Over on Claw Contact: Fade to Black + Show Game Over

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const W = canvas.width;
const H = canvas.height;

// ─── State ────────────────────────────────────────────────────────────────────

const STATE = { PLAYING: 0, FADING: 1, GAME_OVER: 2, POPOUT: 3, PLATFORM: 4, PLATFORM_FADING: 5, GRAB_FADE_OUT: 6, GRAB_FADE_IN: 7, END_LEVEL: 8, INTRO: 9 };

let state, player, claws, obstacles, score, fadeAlpha, fadeSpeed, gameOverAlpha;
let runStartTime;

// ─── Lives / checkpoint system ─────────────────────────────────────────────
// The player gets a small pool of lives. Dying (being hauled off by a claw in
// the box, falling into a pit, or being caught by the hover claw on the roof)
// no longer ends the run outright — instead it spends a life and respawns the
// player at the START of the highest stage they have reached so far:
//   • stage 1 = the box/claw-machine level (STATE.PLAYING)
//   • stage 2 = the rooftop platform level (STATE.PLATFORM)
// So a death in stage 2 restarts stage 2, not the whole game. Only once every
// life is used up does the real game-over / Play Again screen appear. Lives
// reset to the full pool on a fresh game start / Play Again.
const START_LIVES = 5;
let lives, highestStage;
// Which platform stage is currently running: 2 = the rooftop/arcade platform
// level, 3 = the jungle level (same platforming machinery, but a jungle
// backdrop and a snake-styled hover claw), 4 = the cavern level (a cave
// backdrop and a bat-styled hover claw). Set by initPlatformLevel().
let platformLevel = 2;

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

// Decorative 'Claw Mashine' logo that slowly descends from the top of the
// screen while flashing between green and pink. logoY is its current baseline
// y (world = screen space); it starts above the top edge and eases downward.
let logoY;
const LOGO_START_Y = -30;      // begins fully offscreen above the top edge
const LOGO_REST_Y = 40;        // eases down to this resting baseline
const LOGO_DESCEND_SPEED = 0.25; // px per ~60fps-unit — slow drift downward
const DROP_CHANCE = 0.5; // odds a grab is let go mid-retract instead of held all the way up

// Pop-out transition (riding a retracting claw all the way to the box's
// ceiling no longer kills the player — it launches them up and out of the
// top of the machine into a second, platformer-style level).
let popoutStartY, popoutElapsed;
const POPOUT_DURATION = 30;  // dt-units (~0.5s at 60fps)
const POPOUT_RISE = 140;     // extra px the player visibly rises during the pop

// Exit door (end of platform stage): triggers a level-complete sequence when
// the bunny reaches it. The door appears at the end of the 10 randomized chunks.
let door;  // { x, y, w, h }
let doorAlpha;  // for fade-in animation
const DOOR_FADE_DURATION = 30;  // dt-units to fade to white on door touch
let doorTouchElapsed;

// ─── Platformer physics tuning ─────────────────────────────────────────────
const MOVE_SPEED = 3.2;
const GRAVITY = 0.6;
// Vertical jump height was raised 20%. Peak height ∝ JUMP_VELOCITY²/(2·GRAVITY),
// so scaling the launch velocity by √1.20 (−14 → −15.336) raises the apex by
// exactly 20% while leaving GRAVITY (and thus fall feel) unchanged.
const JUMP_VELOCITY = -15.336231610144651; // = -14 * Math.sqrt(1.20)
const MAX_FALL_SPEED = 14;
// Airborne horizontal boost: while jumping, the bunny covers more horizontal
// ground per frame than while grounded. Raised from 1.2 to 1.92 (×1.60) so a
// full running jump now lands 60% farther without changing jump height (airtime
// is unchanged, so the extra distance comes purely from faster airborne travel).
const AIR_HORIZONTAL_BOOST = 1.92;

function init() {
  // Fresh game start / Play Again: refill the life pool and reset the
  // highest-reached checkpoint back to stage 1 (the box level).
  lives = START_LIVES;
  highestStage = 1;

  state = STATE.PLAYING;
  fadeAlpha = 0;
  gameOverAlpha = 0;
  fadeSpeed = 0.018;
  score = 0;
  runStartTime = performance.now();

  grabFadeAlpha = 0;
  grabFadeClaw = null;

  logoY = LOGO_START_Y;

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

// Reset just the box/claw-machine stage (stage 1) to its opening layout,
// WITHOUT touching the run-wide lives/score/highest-stage bookkeeping — used
// to respawn the player at the start of stage 1 after a death when stage 1 is
// still the highest stage they've reached.
function respawnBoxStage() {
  state = STATE.PLAYING;
  fadeAlpha = 0;
  fadeSpeed = 0.018;

  grabFadeAlpha = 0;
  grabFadeClaw = null;

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

// Central death handler: spend a life and either respawn at the start of the
// highest stage reached, or — once no lives remain — proceed to the real
// game-over screen. Called the moment a fatal fade-to-black completes so the
// player briefly sees the death animation before respawning.
function handleDeath() {
  lives--;
  if (lives > 0) {
    // Respawn at the beginning of the highest stage reached so far.
    if (highestStage >= 2) {
      initPlatformLevel();
      state = STATE.PLATFORM;
    } else {
      respawnBoxStage();
    }
  } else {
    // Out of lives — this is a real game over.
    state = STATE.GAME_OVER;
    gameOverAlpha = 0;
  }
}

// ─── Obstacles (other animals/objects in the box) ─────────────────────────
// Static bodies the bunny can jump on top of (platforms) or must jump over
// (obstacles). Collision is resolved as a circle (player) vs. axis-aligned
// box (obstacle), so this works the same whether the bunny approaches from
// the side (blocked → jump over) or lands from above (supported → jump on).

const FLOOR_Y = H - 6; // resting line for items sitting in the bottom of the box

// Which obstacle kinds the claw can grab and carry off. The bear, gorilla,
// giraffe and shark are left out on purpose — the crate, turtle, ball, and
// the level-1 collectible animals (hamster, walrus, dolphin) are up for grabs.
const GRABBABLE_KINDS = ['turtle', 'block', 'ball', 'hamster', 'walrus', 'dolphin'];

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

// Level-1 animal "push response" tuning — the box-stage animals below aren't
// rigid: when the player pushes into one from the side it rocks/tilts a little
// and drifts slowly in the push direction, then eases back toward where it was.
// The crate ('block') and the beach ball ('ball', which has its own rolling
// physics) are intentionally excluded, and this only ever runs on the level-1
// box obstacles, never the platforming stages (which have no `obstacles`).
const PUSH_ANIMAL_KINDS = ['turtle', 'hamster', 'gorilla', 'walrus', 'giraffe', 'bear', 'dolphin', 'shark'];
const PUSH_DRIFT_ACCEL = 0.14;  // gentle nudge added to drift speed per frame of contact (px/frame)
const PUSH_MAX_DRIFT = 10;      // how far (px) an animal may drift from its home spot
const PUSH_DRIFT_FRICTION = 0.9; // per-frame decay so the drift is slow and settles
const PUSH_RETURN = 0.02;       // gentle spring easing the animal back toward home when not pushed
const PUSH_TILT_ACCEL = 0.006;  // rocking impulse toward the push direction per frame of contact (rad/frame)
const PUSH_MAX_TILT = 0.13;     // cap on the tilt angle so the wobble stays subtle (rad, ~7.5°)
const PUSH_TILT_STIFFNESS = 0.02; // spring pulling the tilt back upright
const PUSH_TILT_DAMPING = 0.86;   // damping so the rocking settles rather than oscillating forever

function initObstacles() {
  const specs = [
    { kind: 'turtle',  w: 46, h: 24, xFrac: 0.07 },
    { kind: 'hamster', w: 30, h: 24, xFrac: 0.17 },
    { kind: 'block',   w: 32, h: 32, xFrac: 0.27 },
    { kind: 'gorilla', w: 40, h: 40, xFrac: 0.37 },
    { kind: 'ball',    w: 34, h: 34, xFrac: 0.47 },
    { kind: 'walrus',  w: 46, h: 32, xFrac: 0.57 },
    { kind: 'giraffe', w: 34, h: 52, xFrac: 0.66 },
    { kind: 'bear',    w: 36, h: 38, xFrac: 0.76 },
    { kind: 'dolphin', w: 48, h: 30, xFrac: 0.86 },
    { kind: 'shark',   w: 48, h: 30, xFrac: 0.95 },
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
    homeX: W * s.xFrac - s.w / 2, // resting x the animal eases back toward after being pushed (push animals)
    pushed: false,  // whether the player pushed into it (from the side) this frame (push animals)
    driftVX: 0,     // slow horizontal drift velocity from being pushed (push animals)
    tilt: 0,        // current rocking/tilt angle in radians (push animals)
    tiltVel: 0,     // angular velocity of the rocking spring (push animals)
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

function resolveObstacles() {
  player.grounded = player.y >= H - player.r - 0.5; // resting on box floor
  for (const ob of obstacles) {
    if (ob.kind === 'turtle') ob.stoodOn = false; // recomputed below each frame
    if (ob.kind === 'ball') { ob.wasTouching = ob.touching; ob.touching = false; } // recomputed below each frame
    if (PUSH_ANIMAL_KINDS.includes(ob.kind)) ob.pushed = false; // recomputed below each frame
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

    // Level-1 animal push response: a subtle rock/tilt plus a slow drift in the
    // push direction, easing back toward the animal's home spot once the player
    // stops pushing. Runs only for the box-stage animals (PUSH_ANIMAL_KINDS);
    // the turtle also has its own ride-crawl below, which is unaffected.
    if (PUSH_ANIMAL_KINDS.includes(ob.kind)) {
      if (ob.pushed) {
        // Drift in the push direction, clamped so it never wanders far.
        ob.x += ob.driftVX * dt;
        ob.x = Math.max(ob.homeX - PUSH_MAX_DRIFT, Math.min(ob.homeX + PUSH_MAX_DRIFT, ob.x));
      } else {
        // Not being pushed — gently ease back toward home.
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
      ob.homeX = ob.x; // ride crawl relocates its resting spot, so the push-return spring follows it
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

const BOTTOM_DWELL_DURATION = 60; // ~1 second (dt is expressed in ~1-per-frame units at 60fps) the
                                   // claw pauses at the bottom, jaws already closed, before it
                                   // begins climbing back up

const CLAW_CLOSED_JAW = 2; // jawOpen value the claw snaps to the instant it hits bottom (floor or
                            // obstacle) — the jaws close together whether or not anything was
                            // actually caught, same as a real claw machine's grab-and-release cycle.

// Ease-out quad: still decelerates toward the end like the cubic curve this
// replaced, but starts its initial rise a little more slowly (lower initial
// velocity) instead of climbing at full speed the instant the retract begins.
function easeOutQuad(t) { return 1 - Math.pow(1 - t, 2); }

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
    dwelling: false, // paused at the bottom, jaws closed, for BOTTOM_DWELL_DURATION before retracting
    dwellElapsed: 0,
    stoodOn: false, // whether the player is currently standing on its body
    color: '#e44',
  });
}

const CLAW_SPAWN_Y = -40;
// Once a claw has descended most of the way from its spawn point to the box
// floor, it locks onto a straight-down drop: horizontal pursuit stops so the
// final stretch of the descent is a plain vertical strike. This used to lock
// at 2/3 depth, but combined with the claw's intentionally slow horizontal
// homing speed (HOMING_BASE/GROWTH, tuned low elsewhere for fairness), that
// left a full third of the descent — well over a second — for the bunny to
// drift out of alignment after tracking stopped, so a catch essentially
// never landed even against a bunny that wasn't actively dodging. Locking
// much closer to the floor keeps homing pursuit active for nearly the whole
// fall, so the claw's final x actually reflects where the bunny recently
// was, while still preserving a short, readable straight-down strike at the
// very end.
const CLAW_LOCK_Y = CLAW_SPAWN_Y + (H - CLAW_SPAWN_Y) * 0.75;

function updateClaws(dt) {
  const t = secondsElapsed();
  const homingSpeed = Math.min(HOMING_BASE + t * HOMING_GROWTH, HOMING_MAX);
  const fallSpeed = Math.min(FALL_BASE + t * FALL_GROWTH, FALL_MAX);

  for (let c of claws) {
    const prevY = c.y; // used below to carry a rider standing on the claw's body

    if (!c.retracting && !c.dwelling) {
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
  // spawns (since spawnClaw() only fires once claws.length reaches 0). A
  // claw that just finished retracting with something in its grip is kept
  // around a little longer — it's removed once the grab fade sequence lets
  // go of it (see GRAB_FADE_IN in the main loop) rather than vanishing here.
  claws = claws.filter(c => c.retracting ? (c.retractElapsed < c.retractDuration || c.grabbing) : c.y < H + 60);
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
  for (const ob of obstacles) {
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
  const playerLeft = player.x - player.r, playerRight = player.x + player.r;
  const overlap = Math.min(right, playerRight) - Math.max(left, playerLeft);
  if (overlap < (playerRight - playerLeft) * 0.3) return false;
  // Reject when the bunny is above the claw (riding on its body): her lowest
  // point must reach down into the jaw zone (>= the claw head y) to be caught.
  return player.y + player.r >= c.y;
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

const CHUNK_W = 900;      // world-space width of one repeating stage chunk
const GAP_X = 620;        // x offset (within a chunk) where its ground pit starts (LEGACY — now per-pattern)
const GAP_W = 80;         // pit width — comfortably inside the bunny's ~100px max jump distance (LEGACY — now per-pattern)
const GROUND_Y = H - 20;  // world y of the ground's top surface
const GENERATE_AHEAD = W; // keep chunks generated at least this far past the camera's right edge
const DESPAWN_BEHIND = W; // drop world objects once this far behind the camera's left edge
const ENEMY_SPEED = 1.1;  // px/frame the patrol enemy walks
const ENEMY_W = 22, ENEMY_H = 18;

// Exit door (end of platform stage level)
const DOOR_W = 40;
const DOOR_H = 80;
const DOOR_X_FROM_END = 120;  // how far from the end of the 10 chunks the door sits
const NUM_CHUNKS = 10;        // number of randomized patterns before the door

// Pool of chunk pattern templates. Each pattern defines a pit position/width
// and floating-platform locations. generateChunksUpTo() picks one at RANDOM
// per chunk (seeded per level run), so a given run's layout is genuinely
// randomized rather than the same fixed sequence every time.
const CHUNK_PATTERNS = [
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

let groundSegments; // ground rects, split by pits (gaps) between chunks
let stagePlatforms;  // floating jump platforms
let enemies;         // patrolling enemies — stomp from above, deadly from the side
let cameraX;         // world-space x of the screen's left edge (the side-scroll camera)
let generatedUpToX;  // rightmost world-x that stage chunks have been generated up to
let chunkCount;      // counter for how many chunks have been generated
let levelRng;        // seeded PRNG so each level run gets a genuinely random —
                     // but internally-consistent — layout (mulberry32)

// Small seeded PRNG. Given the same seed it returns the same stream, so a
// single level run has a stable layout (platforms/pits don't shift under the
// player) while different runs get genuinely different, randomized layouts —
// unlike the previous `chunkCount % 10` selection, which produced the exact
// same sequence every single run and so was only random in appearance.
function makeRng(seed) {
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
const MAX_PIT_W = 92;

// ─── Platform-level hovering claw ──────────────────────────────────────────
// A second claw haunts the platform level — unlike the box's claw, it has no
// cable/arm running up off the top of the screen; it just hovers, drifting
// slowly back and forth, then swoops down in a fast arc to try to catch the
// bunny whenever they run underneath it while moving right, before rising
// back up to resume hovering (further along, tracking the bunny's progress).
const HOVER_CLAW_Y = 70;              // altitude (px from top) the claw hovers/returns to
const HOVER_PATROL_SPEED = 0.01;      // radians of drift per dt-unit while hovering (halved to slow the hover claw down)
const HOVER_PATROL_AMPLITUDE = 90;    // px either side of the current patrol center
const HOVER_SWOOP_TRIGGER_RANGE = 150;// px ahead of the claw at which an approaching bunny provokes a dive (telegraphed early)
const HOVER_SWOOP_ADVANCE = 120;      // px the claw's hover point shifts forward after each swoop
const HOVER_SWOOP_DURATION = 60;      // dt-units for a full dive-and-rise arc (~1.0s; slowed from 34 so the swoop is easier to dodge)
const HOVER_SWOOP_COOLDOWN = 50;      // dt-units of hovering required before it can dive again
// The swoop snapshots the bunny's position (x AND y) at the instant it
// triggers and dives toward THAT captured point: the arc's low point aims the
// harmful jaw tips at the player's y as it was when the swoop began. The dive
// depth is clamped just above the ground so the tips never punch through the
// floor. The snapshot is frozen at swoop-start, so if the player moves during
// the ~1s arc the claw still commits to where they were — a telegraphed,
// dodgeable dive rather than a stale/fixed-depth or homing catch.
const HOVER_CLAW_MIN_ONSCREEN_X = 40; // px inset from the screen's left edge the claw's body is never allowed to fall behind (keeps it on-screen behind the player)
const HOVER_CLAW_MAX_X = NUM_CHUNKS * CHUNK_W; // world x the claw may range up to (full stage width; the old W*4 cap pinned it ~1920px in and broke tracking deeper into the level)

let hoverClaw;
// level defaults to whatever platform stage is already running (so a plain
// respawn stays on the same stage); callers advancing the player pass the
// explicit stage number (2 = rooftop, 3 = jungle).
function initPlatformLevel(level = platformLevel) {
  platformLevel = level;
  groundSegments = [];
  stagePlatforms = [];
  enemies = [];
  cameraX = 0;
  generatedUpToX = 0;
  chunkCount = 0;
  // Fresh random seed each time the platform level starts, so the layout is
  // genuinely randomized between runs (but consistent within a single run).
  levelRng = makeRng((Date.now() ^ (Math.random() * 0x100000000)) >>> 0);
  generateChunksUpTo(W + GENERATE_AHEAD);

  player.x = 40;
  player.y = GROUND_Y - player.r;
  player.vx = 0;
  player.vy = 0;
  player.grounded = true;

  // Door at the end of 10 chunks
  const doorWorldX = NUM_CHUNKS * CHUNK_W + DOOR_X_FROM_END;
  door = {
    x: doorWorldX,
    y: GROUND_Y - DOOR_H,
    w: DOOR_W,
    h: DOOR_H,
  };
  doorAlpha = 0;
  doorTouchElapsed = 0;

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
  while (generatedUpToX < targetX) {
    const base = generatedUpToX;
    const patternIdx = Math.floor(levelRng() * CHUNK_PATTERNS.length) % CHUNK_PATTERNS.length;
    const pattern = CHUNK_PATTERNS[patternIdx];

    if (chunkCount === 0) {
      // Safe opening chunk: solid ground the whole way across, no pit, so the
      // player always has firm footing immediately after entering the stage.
      groundSegments.push({ x: base, y: GROUND_Y, w: CHUNK_W, h: 40 });
    } else {
      // Ground: solid segment before pit, solid segment after pit. Pit width is
      // clamped so it is always jumpable.
      const gapW = Math.min(pattern.gapW, MAX_PIT_W);
      groundSegments.push(
        { x: base, y: GROUND_Y, w: pattern.gapX, h: 40 },
        { x: base + pattern.gapX + gapW, y: GROUND_Y, w: CHUNK_W - (pattern.gapX + gapW), h: 40 },
      );
    }

    // Two floating platforms from the pattern.
    for (const plat of pattern.platforms) {
      stagePlatforms.push({
        x: base + plat.x,
        y: plat.y,
        w: plat.w,
        h: plat.h,
      });
    }

    generatedUpToX = base + CHUNK_W;
    chunkCount++;
  }
}

function updatePlatformLevel(dt) {
  // Movement, gravity, and jumping come from the shared, level-agnostic helper
  // — identical to the box stage and to any future level — so the bunny's jump
  // mechanic carries over automatically with no per-stage re-wiring.
  applyPlayerJumpPhysics(dt);
  player.grounded = false;

  for (const seg of groundSegments) resolveObstacle(player, seg);
  for (const plat of stagePlatforms) resolveObstacle(player, plat);

  // Only the very start of the stage blocks movement — there's no
  // right-hand bound, since it keeps extending as the bunny advances.
  player.x = Math.max(player.r, player.x);

  // Falling into a pit is just as fatal as being caught by a claw.
  if (player.y > H + 60) {
    state = STATE.PLATFORM_FADING;
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
  if (door) {
    const cx = Math.max(door.x, Math.min(player.x, door.x + door.w));
    const cy = Math.max(door.y, Math.min(player.y, door.y + door.h));
    const dx = player.x - cx, dy = player.y - cy;
    if (dx * dx + dy * dy <= player.r * player.r) {
      // Player touched the door — start the END_LEVEL sequence
      state = STATE.END_LEVEL;
      doorTouchElapsed = 0;
      return;
    }
  }

  // Side-scrolling camera: follow the player once they pass the screen's
  // center (never scrolls left past the start of the stage), and keep
  // generating/dropping chunks so the stage extends ahead of the camera
  // without the world-object lists growing without bound.
  cameraX = Math.max(0, player.x - W / 2);
  generateChunksUpTo(cameraX + W + GENERATE_AHEAD);
  groundSegments = groundSegments.filter(s => s.x + s.w > cameraX - DESPAWN_BEHIND);
  stagePlatforms = stagePlatforms.filter(p => p.x + p.w > cameraX - DESPAWN_BEHIND);
}

function initHoverClaw() {
  hoverClaw = {
    x: 300, y: HOVER_CLAW_Y,
    patrolCenter: 300, patrolT: 0,
    armLen: 14, jawOpen: 18,
    swooping: false, swoopElapsed: 0, cooldown: 0,
    swoopStartX: 0, swoopEndX: 0, swoopDiveY: 0, swoopTargetY: 0,
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
    // Keep the diving claw on-screen too: if the player sprints forward mid-arc
    // and the camera scrolls past the swoop's world x, drag the arc's x forward
    // so the claw never dips off the left edge while diving.
    if (c.x < cameraX + HOVER_CLAW_MIN_ONSCREEN_X) {
      c.x = cameraX + HOVER_CLAW_MIN_ONSCREEN_X;
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
  const minCenterX = cameraX + HOVER_CLAW_MIN_ONSCREEN_X - HOVER_PATROL_AMPLITUDE;
  if (c.patrolCenter < minCenterX) {
    c.patrolCenter = minCenterX;
    c.x = c.patrolCenter + Math.sin(c.patrolT) * HOVER_PATROL_AMPLITUDE;
  }
  // Also hard-clamp the instantaneous x so a swing of the patrol sine never
  // dips the body off the left of the screen.
  if (c.x < cameraX + HOVER_CLAW_MIN_ONSCREEN_X) {
    c.x = cameraX + HOVER_CLAW_MIN_ONSCREEN_X;
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
  if (c.cooldown <= 0 && player.vx > 0 &&
      player.x < c.x && (c.x - player.x) < HOVER_SWOOP_TRIGGER_RANGE) {
    c.swooping = true;
    c.swoopElapsed = 0;
    c.swoopStartX = c.x;
    // Snapshot the bunny's position (x AND y) at the exact instant the swoop
    // begins, then aim the whole arc at that captured point so the claw
    // actually descends toward where the player was at swoop-start — not a
    // fixed depth or a stale/mistargeted point. The snapshot is frozen here:
    // if the player moves during the ~1s dive, the arc still homes on the
    // spot they occupied when the swoop triggered.
    const targetX = player.x;
    const targetY = player.y;
    c.swoopTargetY = targetY;
    // Horizontal: the arc's lowest point (t=0.5) sits over the captured x, and
    // the sweep continues past it so the claw rises back up ahead of the player.
    c.swoopEndX = Math.max(40, Math.min(HOVER_CLAW_MAX_X, 2 * targetX - c.swoopStartX));
    // Vertical: dive so the harmful jaw tips (c.y + c.armLen) reach the captured
    // player y at the arc's low point, making the claw swoop down to where the
    // bunny actually was. Clamp so the tips never punch below the ground.
    const maxTipY = Math.min(player.y, GROUND_Y - 4);
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
  let dx = player.x - left, dy = player.y - tipY;
  if (dx * dx + dy * dy < player.r * player.r) {
    state = STATE.PLATFORM_FADING;
    return;
  }

  // Check right finger
  dx = player.x - right; dy = player.y - tipY;
  if (dx * dx + dy * dy < player.r * player.r) {
    state = STATE.PLATFORM_FADING;
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
const PLATFORM_CLAWS = {
  2: drawRedHoverClaw,   // rooftop: mechanical red claw
  3: drawSnakeClaw,      // jungle: snake-styled claw
  4: drawBatClaw,        // cavern: bat-styled claw
};

function drawHoverClaw(c) {
  const render = PLATFORM_CLAWS[platformLevel] || drawRedHoverClaw;
  render(c);
}

// Level-2 (rooftop) hover claw — the default mechanical red claw.
function drawRedHoverClaw(c) {
  // Body block — floats freely with no cable/arm running up off the top of
  // the screen, unlike the box's claw.
  ctx.fillStyle = '#c33';
  ctx.fillRect(c.x - 14, c.y - 14, 28, 18);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 14, c.y - 14, 28, 18);

  const tipY = c.y + c.armLen;

  ctx.strokeStyle = '#e44';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipLeft(c), tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipRight(c), tipY); ctx.stroke();

  ctx.fillStyle = '#f88';
  ctx.beginPath(); ctx.arc(clawTipLeft(c),  tipY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(clawTipRight(c), tipY, 4, 0, Math.PI * 2); ctx.fill();
}

// Level-3 hazard drawn as a snake instead of the mechanical claw. It occupies
// exactly the same geometry the claw does — a head at (c.x, c.y) with the two
// harmful jaw tips at clawTipLeft/Right(c) and y = c.y + c.armLen — so the
// existing collision (checkHoverClawCollision) is unchanged; only the look
// differs. The snake's body coils up above the head (in place of the claw's
// body block) and its two open fangs sit right where the claw's jaw tips are.
function drawSnakeClaw(c) {
  const tipY = c.y + c.armLen;
  const wriggle = Math.sin(Date.now() / 180) * 5;

  // Coiled green body rising up above the head, in place of the claw's block.
  ctx.strokeStyle = '#2f9e44';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x + wriggle, c.y - 40);
  ctx.quadraticCurveTo(c.x - 12 + wriggle, c.y - 26, c.x + 6, c.y - 14);
  ctx.quadraticCurveTo(c.x + 16, c.y - 6, c.x, c.y);
  ctx.stroke();
  // Belly highlight along the body.
  ctx.strokeStyle = '#69db7c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x + wriggle, c.y - 40);
  ctx.quadraticCurveTo(c.x - 12 + wriggle, c.y - 26, c.x + 6, c.y - 14);
  ctx.quadraticCurveTo(c.x + 16, c.y - 6, c.x, c.y);
  ctx.stroke();

  // Snake head (an ellipse) centered where the claw body sat.
  ctx.fillStyle = '#37b24d';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b8a3e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes.
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(c.x - 5, c.y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 5, c.y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(c.x - 5, c.y - 3, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 5, c.y - 3, 1.2, 0, Math.PI * 2); ctx.fill();

  // Two fangs striking down to exactly the jaw-tip hit points.
  const left = clawTipLeft(c), right = clawTipRight(c);
  ctx.strokeStyle = '#2b8a3e';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(c.x - 4, c.y + 6); ctx.lineTo(left, tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x + 4, c.y + 6); ctx.lineTo(right, tipY); ctx.stroke();
  ctx.fillStyle = '#f8f9fa';
  ctx.beginPath(); ctx.arc(left, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(right, tipY, 3.5, 0, Math.PI * 2); ctx.fill();

  // Flicking forked tongue between the fangs.
  const tongueLen = 8 + Math.sin(Date.now() / 120) * 3;
  ctx.strokeStyle = '#e03131';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 8);
  ctx.lineTo(c.x, c.y + 8 + tongueLen);
  ctx.moveTo(c.x, c.y + 8 + tongueLen);
  ctx.lineTo(c.x - 3, c.y + 12 + tongueLen);
  ctx.moveTo(c.x, c.y + 8 + tongueLen);
  ctx.lineTo(c.x + 3, c.y + 12 + tongueLen);
  ctx.stroke();
}

// Level-4 hazard drawn as a bat instead of the mechanical claw. Like the snake
// claw it occupies exactly the same geometry the claw does — a body at
// (c.x, c.y) with the two harmful clawed feet at clawTipLeft/Right(c) and
// y = c.y + c.armLen — so the existing collision (checkHoverClawCollision) is
// unchanged; only the look differs. Flapping membranous wings spread out from
// the furry body, and the two grabbing talons hang down to the jaw-tip points.
function drawBatClaw(c) {
  const tipY = c.y + c.armLen;
  const flap = Math.sin(Date.now() / 120) * 8;   // wing beat

  // Two membranous wings sweeping out from the body, flapping up and down.
  ctx.fillStyle = '#3b2a4a';
  ctx.strokeStyle = '#5a4570';
  ctx.lineWidth = 1.5;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c.x + dir * 6, c.y - 2);
    // outer wing tip, rising/falling with the flap
    ctx.quadraticCurveTo(c.x + dir * 26, c.y - 16 - flap, c.x + dir * 34, c.y - 4 - flap);
    // scalloped trailing edge back toward the body
    ctx.quadraticCurveTo(c.x + dir * 26, c.y - 2 - flap * 0.4, c.x + dir * 22, c.y + 6);
    ctx.quadraticCurveTo(c.x + dir * 16, c.y + 2, c.x + dir * 12, c.y + 8);
    ctx.quadraticCurveTo(c.x + dir * 9, c.y + 3, c.x + dir * 6, c.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Furry round body where the claw block sat.
  ctx.fillStyle = '#4a3560';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e2040';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Two pointed ears on top.
  ctx.fillStyle = '#4a3560';
  ctx.beginPath();
  ctx.moveTo(c.x - 8, c.y - 8); ctx.lineTo(c.x - 11, c.y - 18); ctx.lineTo(c.x - 3, c.y - 11);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c.x + 8, c.y - 8); ctx.lineTo(c.x + 11, c.y - 18); ctx.lineTo(c.x + 3, c.y - 11);
  ctx.closePath(); ctx.fill();

  // Glowing eyes.
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath(); ctx.arc(c.x - 4, c.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 4, c.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(c.x - 4, c.y - 2, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 4, c.y - 2, 1, 0, Math.PI * 2); ctx.fill();

  // Two little fangs under the snout.
  ctx.fillStyle = '#f8f9fa';
  ctx.beginPath();
  ctx.moveTo(c.x - 3, c.y + 6); ctx.lineTo(c.x - 1.5, c.y + 10); ctx.lineTo(c.x, c.y + 6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c.x + 3, c.y + 6); ctx.lineTo(c.x + 1.5, c.y + 10); ctx.lineTo(c.x, c.y + 6);
  ctx.closePath(); ctx.fill();

  // Two grabbing talons reaching down to exactly the jaw-tip hit points.
  const left = clawTipLeft(c), right = clawTipRight(c);
  ctx.strokeStyle = '#2e2040';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x - 4, c.y + 8); ctx.lineTo(left, tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x + 4, c.y + 8); ctx.lineTo(right, tipY); ctx.stroke();
  // Curved claws at the tips.
  ctx.fillStyle = '#1b1329';
  ctx.beginPath(); ctx.arc(left, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(right, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
}

function drawPlatformBackground() {
  if (platformLevel >= 4) {
    drawCavernBackground();
    return;
  }
  if (platformLevel >= 3) {
    drawJungleBackground();
    return;
  }

  // Indoor arcade backdrop — a dim, windowless wall, matching the arcade
  // theme the bunny popped out into.
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1b1330');
  grd.addColorStop(1, '#3a2a55');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,240,190,0.85)';
  drawCeilingLight(W - 60, 34);

  ctx.fillStyle = 'rgba(255,60,180,0.35)';
  drawNeonGlow(90, 90);
  ctx.fillStyle = 'rgba(60,220,255,0.3)';
  drawNeonGlow(260, 140);
}

// Jungle backdrop for level 3: a green sky-to-canopy gradient, a warm sun, a
// silhouette of layered foliage across the back, and a few hanging vines —
// drawn in the same flat, canvas-shape style as the rest of the game's scenery.
function drawJungleBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#123d1f');   // deep canopy green up top
  grd.addColorStop(0.55, '#1f5e30');
  grd.addColorStop(1, '#2f7d3f');   // brighter forest floor light below
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Hazy sun glow filtering through the canopy.
  const sun = ctx.createRadialGradient(W - 70, 60, 0, W - 70, 60, 90);
  sun.addColorStop(0, 'rgba(255,240,170,0.6)');
  sun.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W - 70, 60, 90, 0, Math.PI * 2);
  ctx.fill();

  // Layered foliage silhouettes across the background (two depth layers).
  drawJungleFoliage(H * 0.62, '#0e3a1c', 46, 0);
  drawJungleFoliage(H * 0.74, '#15522a', 62, 30);

  // A few hanging vines drifting down from the canopy.
  ctx.strokeStyle = 'rgba(30,90,40,0.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const vineXs = [70, 190, 300, 400];
  for (let i = 0; i < vineXs.length; i++) {
    const x = vineXs[i];
    const len = 90 + (i % 3) * 40;
    const sway = Math.sin(Date.now() / 900 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sway, len / 2, x + sway * 1.5, len);
    ctx.stroke();
    // A leaf at the vine's tip.
    ctx.fillStyle = 'rgba(40,120,55,0.8)';
    ctx.beginPath();
    ctx.ellipse(x + sway * 1.5, len, 5, 9, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A row of overlapping rounded bumps forming a bushy foliage silhouette at a
// given baseline y, in the given color (used for back-layer jungle scenery).
function drawJungleFoliage(baseY, color, bumpR, offset) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = -bumpR + offset; x < W + bumpR; x += bumpR * 1.3) {
    const h = bumpR + (x * 0.7 % (bumpR * 0.6));
    ctx.arc(x, baseY, h, Math.PI, 0, false);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// Cavern backdrop for level 4: a dark rocky gradient, hanging stalactites from
// the ceiling and stalagmites rising from below, a faint glow, and a few small
// bats fluttering in the gloom — drawn in the same flat canvas-shape style as
// the rest of the game's scenery.
function drawCavernBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0c0a14');    // near-black cavern ceiling
  grd.addColorStop(0.55, '#1a1626');
  grd.addColorStop(1, '#2a2338');    // faintly lit cave floor
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Dim glow from some unseen source deep in the cave.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.72, 0, W * 0.5, H * 0.72, 160);
  glow.addColorStop(0, 'rgba(90,120,160,0.18)');
  glow.addColorStop(1, 'rgba(90,120,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Stalactites hanging from the ceiling.
  ctx.fillStyle = '#241d33';
  const topXs = [40, 110, 180, 250, 330, 420];
  for (let i = 0; i < topXs.length; i++) {
    const x = topXs[i];
    const w = 16 + (i % 3) * 6;
    const len = 40 + (i * 37 % 60);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.lineTo(x + w / 2, 0);
    ctx.lineTo(x, len);
    ctx.closePath();
    ctx.fill();
  }

  // Stalagmites rising from the cave floor at the back.
  ctx.fillStyle = '#2f2740';
  const botXs = [70, 150, 300, 380];
  for (let i = 0; i < botXs.length; i++) {
    const x = botXs[i];
    const w = 20 + (i % 2) * 10;
    const len = 50 + (i * 29 % 50);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, H);
    ctx.lineTo(x + w / 2, H);
    ctx.lineTo(x, H - len);
    ctx.closePath();
    ctx.fill();
  }

  // A few small bats fluttering in the background.
  ctx.fillStyle = 'rgba(10,8,16,0.9)';
  const batBase = [[90, 90], [250, 60], [360, 120]];
  for (let i = 0; i < batBase.length; i++) {
    const bx = batBase[i][0] + Math.sin(Date.now() / 700 + i * 2) * 18;
    const by = batBase[i][1] + Math.cos(Date.now() / 900 + i) * 10;
    const w = Math.sin(Date.now() / 100 + i) * 4;   // wing flap
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx - 7, by - 5 - w, bx - 11, by - w);
    ctx.quadraticCurveTo(bx - 6, by + 1, bx, by + 2);
    ctx.quadraticCurveTo(bx + 6, by + 1, bx + 11, by - w);
    ctx.quadraticCurveTo(bx + 7, by - 5 - w, bx, by);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCeilingLight(cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawNeonGlow(cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.arc(cx + 18, cy - 8, 20, 0, Math.PI * 2);
  ctx.arc(cx + 38, cy, 16, 0, Math.PI * 2);
  ctx.fill();
}

// Draws every world-space entity (ground, platforms, enemies, the bunny)
// through a single camera translation, so what's rendered always matches
// where things actually are in the simulation. This is the fix for the
// scrubbed attempt's core bug: there is now exactly one place the
// world-to-screen offset happens, instead of it being computed but never
// applied.
function drawPlatformWorld() {
  ctx.save();
  ctx.translate(-cameraX, 0);

  const cavern = platformLevel >= 4;
  const jungle = platformLevel === 3;
  // Cavern level: dark rock ground with a pale mineral crust and glowing
  // crystal-topped platforms; jungle level: earthy soil topped with grass;
  // otherwise back to the grey arcade concrete.
  const groundBody = cavern ? '#3a3348' : jungle ? '#6b4a2b' : '#8f8f96';
  const groundTop  = cavern ? '#6f6480' : jungle ? '#3fa34d' : '#b7b7be';
  const platBody   = cavern ? '#2c2640' : jungle ? '#4d3620' : '#5a5f6b';
  const platTop    = cavern ? '#9d7bff' : jungle ? '#5cc46a' : '#4be0ff';

  for (const seg of groundSegments) {
    if (seg.x + seg.w < cameraX - 20 || seg.x > cameraX + W + 20) continue;
    ctx.fillStyle = groundBody;
    ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
    ctx.fillStyle = groundTop;
    ctx.fillRect(seg.x, seg.y, seg.w, 5);
  }

  for (const plat of stagePlatforms) {
    if (plat.x + plat.w < cameraX - 20 || plat.x > cameraX + W + 20) continue;
    ctx.fillStyle = platBody;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = platTop;
    ctx.fillRect(plat.x, plat.y, plat.w, 3);
  }

  drawHoverClaw(hoverClaw);
  if (door) drawDoor(door);
  drawPlayer(player);

  ctx.restore();
}

function drawEnemy(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  ctx.fillStyle = '#c33';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#822';
  ctx.fillRect(e.x + 2, e.y + e.h - 4, 5, 4);
  ctx.fillRect(e.x + e.w - 7, e.y + e.h - 4, 5, 4);
}

function drawDoor(d) {
  // In the jungle level (3+), the exit is a cave mouth in a rocky outcrop
  // instead of a wooden door. Same rect/trigger, different graphic.
  if (platformLevel >= 3) {
    drawCave(d);
    return;
  }

  // Black door frame with a window
  ctx.fillStyle = '#222';
  ctx.fillRect(d.x - d.w / 2, d.y, d.w, d.h);

  // Door window with a slight glow
  ctx.fillStyle = '#333';
  ctx.fillRect(d.x - d.w / 2 + 4, d.y + 10, d.w - 8, d.h - 20);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(d.x - d.w / 2 + 6, d.y + 12, d.w - 12, d.h - 24);

  // Door knob
  ctx.fillStyle = '#f0ad4e';
  ctx.beginPath();
  ctx.arc(d.x + d.w / 2 - 8, d.y + d.h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Jungle vines framing the level-1 exit door, matching the hanging-vine
  // styling used in the jungle level's backdrop.
  drawDoorVines(d);
}

// Hanging/climbing green jungle vines that frame the wooden exit door, giving
// it a jungle-vine motif. Drawn in the same flat curved-stroke-with-leaf style
// as drawJungleBackground's canopy vines: a couple of vines drape down each
// side of the door frame and one swags across the top, each dotted with leaves.
function drawDoorVines(d) {
  const left = d.x - d.w / 2;
  const right = d.x + d.w / 2;
  const top = d.y;
  const bottom = d.y + d.h;

  ctx.save();
  ctx.strokeStyle = 'rgba(30,90,40,0.85)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // A small leaf at (x, y), oriented by angle — same look as the backdrop vines.
  const leaf = (x, y, angle) => {
    ctx.fillStyle = 'rgba(40,120,55,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 8, angle, 0, Math.PI * 2);
    ctx.fill();
  };

  // Vines climbing down each side post of the door frame, gently swaying.
  const sides = [left - 2, right + 2];
  for (let s = 0; s < sides.length; s++) {
    const x = sides[s];
    const dir = s === 0 ? -1 : 1;   // sway outward from the frame
    const sway = Math.sin(Date.now() / 900 + s * 1.7) * 4;
    ctx.strokeStyle = 'rgba(30,90,40,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, top - 6);
    ctx.quadraticCurveTo(x + dir * (5 + sway), top + d.h * 0.4,
                         x + dir * 2 + sway, bottom - 4);
    ctx.stroke();
    // Leaves sprouting along the side vine.
    for (let t = 0.25; t <= 0.9; t += 0.32) {
      const ly = top - 6 + (bottom - 4 - (top - 6)) * t;
      leaf(x + dir * (3 + sway * t), ly, 0.5 * dir);
    }
  }

  // A vine swagging across the top of the door frame, dipping in the middle.
  const swagDip = Math.sin(Date.now() / 1100) * 3;
  ctx.strokeStyle = 'rgba(30,90,40,0.85)';
  ctx.beginPath();
  ctx.moveTo(left - 2, top - 6);
  ctx.quadraticCurveTo(d.x, top + 8 + swagDip, right + 2, top - 6);
  ctx.stroke();
  // Leaves hanging from the top swag.
  leaf(d.x, top + 8 + swagDip, 0);
  leaf(left + d.w * 0.28, top + 2 + swagDip * 0.6, -0.4);
  leaf(right - d.w * 0.28, top + 2 + swagDip * 0.6, 0.4);

  ctx.restore();
}

// Cave-mouth exit for the jungle level: a mossy rock mound with a dark,
// arched opening. Occupies the same footprint as the door (centered on d.x,
// standing on the ground with its base at d.y + d.h).
function drawCave(d) {
  const cx = d.x;                 // horizontal center of the opening
  const baseY = d.y + d.h;        // ground level (bottom of the rect)
  const rockW = d.w + 26;         // rock mound is a bit wider than the opening
  const rockTop = d.y - 10;       // mound rises slightly above the opening
  const mouthW = d.w - 8;         // width of the cave opening
  const mouthTop = d.y + 14;      // top of the arched opening

  // Rocky outcrop: a rounded grey mound behind the opening.
  ctx.fillStyle = '#5a5750';
  ctx.beginPath();
  ctx.moveTo(cx - rockW / 2, baseY);
  ctx.quadraticCurveTo(cx - rockW / 2, rockTop, cx, rockTop - 8);
  ctx.quadraticCurveTo(cx + rockW / 2, rockTop, cx + rockW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // Darker shading on the rock for a bit of depth.
  ctx.fillStyle = '#494640';
  ctx.beginPath();
  ctx.moveTo(cx + 2, rockTop - 6);
  ctx.quadraticCurveTo(cx + rockW / 2 - 4, rockTop + 6, cx + rockW / 2, baseY);
  ctx.lineTo(cx + 6, baseY);
  ctx.closePath();
  ctx.fill();

  // The dark cave opening: a flat-bottomed arch.
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, baseY);
  ctx.lineTo(cx - mouthW / 2, mouthTop + 6);
  ctx.quadraticCurveTo(cx - mouthW / 2, mouthTop, cx, mouthTop);
  ctx.quadraticCurveTo(cx + mouthW / 2, mouthTop, cx + mouthW / 2, mouthTop + 6);
  ctx.lineTo(cx + mouthW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // Subtle inner glow so the opening reads as a deep passage.
  const glow = ctx.createRadialGradient(cx, baseY - 6, 2, cx, baseY - 6, mouthW / 2 + 6);
  glow.addColorStop(0, 'rgba(60,90,70,0.55)');
  glow.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, baseY);
  ctx.lineTo(cx - mouthW / 2, mouthTop + 6);
  ctx.quadraticCurveTo(cx - mouthW / 2, mouthTop, cx, mouthTop);
  ctx.quadraticCurveTo(cx + mouthW / 2, mouthTop, cx + mouthW / 2, mouthTop + 6);
  ctx.lineTo(cx + mouthW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // A few tufts of moss along the top of the outcrop.
  ctx.fillStyle = '#3f7d43';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * (rockW / 3.2), rockTop + 2 + Math.abs(i) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatformHUD() {
  const cavern = platformLevel >= 4;
  const jungle = platformLevel === 3;
  const dark = cavern || jungle;  // both use light-on-dark HUD text
  const primary = cavern ? '#e8e0ff' : jungle ? '#e8ffe8' : '#2a2a2a';
  const secondary = cavern ? '#c9b8ff' : jungle ? '#bff0bf' : '#3a3a3a';
  ctx.fillStyle = primary;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${score}`, 12, 24);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = secondary;
  const label = cavern ? 'LEVEL 4 — CAVERN!' : jungle ? 'LEVEL 3 — JUNGLE!' : 'OUT OF THE MACHINE!';
  ctx.fillText(label, 12, 44);
  drawLives(dark ? primary : '#2a2a2a');
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
  // Platformer-style horizontal movement. player.moveDir records the raw
  // left/right MOVE-INPUT intent this frame (-1 left, +1 right, 0 none),
  // independent of whether the bunny actually moves — the head-roll animation
  // is driven by this intent, not by resulting position change, so she turns to
  // face her input even when blocked, and stays put when carried by a platform.
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) { player.vx = -player.speed; player.moveDir = -1; }
  else if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = player.speed; player.moveDir = 1; }
  else { player.vx = 0; player.moveDir = 0; }

  // Jump — delegated to the shared, level-agnostic jump trigger so every
  // stage (present or future) gets identical jump behavior.
  tryJump();
}

// Shared, stage-independent jump trigger. This is the single source of truth
// for "the bunny jumps": it reads the same jump inputs (Arrow-Up / W / Space,
// and — via keys['ArrowUp'] — the on-screen JUMP button) in every level, and
// only launches while grounded so holding the key won't re-trigger mid-air.
// Any new stage that wants jumping just needs to call applyPlayerJumpPhysics()
// (or handleInput()) — it never has to re-implement this.
function tryJump() {
  const jumpPressed = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '];
  if (jumpPressed && player.grounded) {
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
  }
}

// Shared, level-agnostic player jump/gravity physics. Applies horizontal &
// vertical input, gravity, and the jump velocity uniformly, then integrates the
// player's position for the frame. It deliberately does NOT do stage-specific
// collision/bounds — each stage runs its own collision pass (box floor+obstacles,
// platform segments, etc.) after calling this. Because the jump mechanic lives
// here (and in tryJump), any level added now or in the future inherits jumping
// simply by calling this helper; there is no per-stage jump re-wiring.
function applyPlayerJumpPhysics(dt) {
  handleInput();
  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);
  // While airborne, apply the horizontal boost so the jump's horizontal reach
  // is ~20% greater than grounded movement, without altering jump height.
  const horizVx = player.grounded ? player.vx : player.vx * AIR_HORIZONTAL_BOOST;
  player.x += horizVx * dt;
  player.y += player.vy * dt;
}

function updatePlayerPhysics(dt) {
  // Movement, gravity, and jumping are handled by the shared, level-agnostic
  // helper so this stage stays in lockstep with every other level's jump feel.
  applyPlayerJumpPhysics(dt);

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

  // Level-1 animals rock slightly when pushed: rotate the whole figure about
  // its base (bottom-center) by its current tilt so it wobbles like it's
  // rocking on the floor. A no-op (tilt 0) for animals at rest and for every
  // non-push kind (crate/ball), which never set a tilt.
  const rocking = ob.tilt && PUSH_ANIMAL_KINDS.includes(ob.kind);
  if (rocking) {
    ctx.save();
    const pivotY = ob.y + ob.h; // base of the figure sitting on the floor
    ctx.translate(cx, pivotY);
    ctx.rotate(ob.tilt);
    ctx.translate(-cx, -pivotY);
  }

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

  } else if (ob.kind === 'gorilla') {
    // Dark rounded body filling the box, sitting on the floor
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.62, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rounded head
    ctx.fillStyle = '#3d3d3d';
    ctx.beginPath();
    ctx.arc(cx, ob.y + ob.h * 0.28, ob.w * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.beginPath(); ctx.arc(cx - ob.w * 0.34, ob.y + ob.h * 0.26, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ob.w * 0.34, ob.y + ob.h * 0.26, 5, 0, Math.PI * 2); ctx.fill();
    // Lighter face patch
    ctx.fillStyle = '#7a6a5a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.32, ob.w * 0.2, ob.h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 4, ob.y + ob.h * 0.28, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, ob.y + ob.h * 0.28, 1.6, 0, Math.PI * 2); ctx.fill();

  } else if (ob.kind === 'giraffe') {
    // Tall body with a long neck, sitting on the floor
    const bodyTop = ob.y + ob.h * 0.55;
    // Legs/body block
    ctx.fillStyle = '#e0b64a';
    ctx.fillRect(ob.x + 4, bodyTop, ob.w - 8, ob.y + ob.h - bodyTop);
    // Neck
    ctx.fillRect(cx - 5, ob.y + ob.h * 0.16, 10, ob.h * 0.42);
    // Head
    ctx.beginPath();
    ctx.ellipse(cx + 4, ob.y + ob.h * 0.14, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ossicones (horns)
    ctx.strokeStyle = '#c99a30';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, ob.y + ob.h * 0.10); ctx.lineTo(cx, ob.y + ob.h * 0.04); ctx.stroke();
    // Brown spots
    ctx.fillStyle = '#b5793a';
    ctx.beginPath(); ctx.arc(ob.x + 10, bodyTop + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 10, bodyTop + 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, bodyTop + 16, 3, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx + 6, ob.y + ob.h * 0.13, 1.4, 0, Math.PI * 2); ctx.fill();

  } else if (ob.kind === 'shark') {
    // Grey body lying on the floor
    ctx.fillStyle = '#6b8fa3';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fin at the left
    ctx.beginPath();
    ctx.moveTo(ob.x + 2, cy);
    ctx.lineTo(ob.x - 6, cy - 10);
    ctx.lineTo(ob.x - 6, cy + 10);
    ctx.closePath();
    ctx.fill();
    // Dorsal fin on top
    ctx.beginPath();
    ctx.moveTo(cx - 4, ob.y + 2);
    ctx.lineTo(cx + 6, ob.y + 2);
    ctx.lineTo(cx, ob.y - 8);
    ctx.closePath();
    ctx.fill();
    // White belly
    ctx.fillStyle = '#dfeaf0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ob.h * 0.18, ob.w * 0.4, ob.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 10, cy - 3, 2, 0, Math.PI * 2); ctx.fill();
    // Mouth (gill line of teeth)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w - 16, cy + 4); ctx.lineTo(ob.x + ob.w - 2, cy + 4); ctx.stroke();

  } else if (ob.kind === 'hamster') {
    // Small round golden body sitting on the floor
    ctx.fillStyle = '#e0a860';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.6, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b5793a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Rounded head
    ctx.fillStyle = '#eab878';
    ctx.beginPath();
    ctx.arc(cx, ob.y + ob.h * 0.34, ob.w * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = '#d99a58';
    ctx.beginPath(); ctx.arc(cx - ob.w * 0.24, ob.y + ob.h * 0.16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ob.w * 0.24, ob.y + ob.h * 0.16, 4, 0, Math.PI * 2); ctx.fill();
    // Cream belly patch
    ctx.fillStyle = '#f6e4c8';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.66, ob.w * 0.26, ob.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes and nose
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 4, ob.y + ob.h * 0.32, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, ob.y + ob.h * 0.32, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a05a3a';
    ctx.beginPath(); ctx.arc(cx, ob.y + ob.h * 0.42, 1.6, 0, Math.PI * 2); ctx.fill();

  } else if (ob.kind === 'walrus') {
    // Plump brown body resting on the floor
    ctx.fillStyle = '#8a6b5a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.58, ob.w * 0.5, ob.h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5e4638';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head bulge at the right
    ctx.fillStyle = '#9a7a68';
    ctx.beginPath();
    ctx.arc(ob.x + ob.w * 0.74, ob.y + ob.h * 0.5, ob.h * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Snout/muzzle
    ctx.fillStyle = '#c8a892';
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.w * 0.84, ob.y + ob.h * 0.6, ob.w * 0.16, ob.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tusks
    ctx.fillStyle = '#f4f0e4';
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w * 0.80, ob.y + ob.h * 0.68); ctx.lineTo(ob.x + ob.w * 0.78, ob.y + ob.h * 0.92); ctx.lineTo(ob.x + ob.w * 0.83, ob.y + ob.h * 0.70); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w * 0.88, ob.y + ob.h * 0.68); ctx.lineTo(ob.x + ob.w * 0.90, ob.y + ob.h * 0.92); ctx.lineTo(ob.x + ob.w * 0.85, ob.y + ob.h * 0.70); ctx.closePath(); ctx.fill();
    // Fore flipper
    ctx.fillStyle = '#6e5344';
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.w * 0.34, ob.y + ob.h * 0.82, ob.w * 0.14, ob.h * 0.14, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w * 0.72, ob.y + ob.h * 0.42, 2, 0, Math.PI * 2); ctx.fill();

  } else if (ob.kind === 'dolphin') {
    // Sleek blue-grey body lying on the floor
    ctx.fillStyle = '#5b8fb0';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ob.w * 0.5, ob.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fluke at the left
    ctx.beginPath();
    ctx.moveTo(ob.x + 4, cy);
    ctx.lineTo(ob.x - 6, cy - 9);
    ctx.lineTo(ob.x - 6, cy + 9);
    ctx.closePath();
    ctx.fill();
    // Curved dorsal fin on top
    ctx.beginPath();
    ctx.moveTo(cx - 6, ob.y + 4);
    ctx.quadraticCurveTo(cx + 2, ob.y - 8, cx + 8, ob.y + 4);
    ctx.closePath();
    ctx.fill();
    // Beak/rostrum at the right
    ctx.beginPath();
    ctx.moveTo(ob.x + ob.w - 2, cy - 3);
    ctx.lineTo(ob.x + ob.w + 8, cy);
    ctx.lineTo(ob.x + ob.w - 2, cy + 3);
    ctx.closePath();
    ctx.fill();
    // Pale belly
    ctx.fillStyle = '#dbe9f0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ob.h * 0.2, ob.w * 0.42, ob.h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye and smile
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 12, cy - 3, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2f5f7a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w - 14, cy + 3); ctx.quadraticCurveTo(ob.x + ob.w - 8, cy + 6, ob.x + ob.w - 2, cy + 3); ctx.stroke();
  }

  if (rocking) ctx.restore();
}

function drawObstacles() {
  for (const ob of obstacles) drawObstacle(ob);
}

// Draws one folding ear in the head's LOCAL, roll-rotated frame.
//  angFromTop  – the ear's mounting angle around the head, measured so that
//                0 is straight up. As the head rolls this rotates with it.
//  The ear is drawn as a segmented stalk so it can bend: whenever the ear
//  swings low enough that its tip would pass below the ground contact point
//  it folds/flops back against the floor instead of clipping through it.
function drawFoldingEar(r, angFromTop, furColor, furShadow, innerEar) {
  const earW = r * 0.55;
  const earH = r * 1.9;
  const segs = 5;

  // World-space downward direction expressed in the head's local (roll-rotated)
  // frame. `groundDirLocal` is passed in via closure-free globals set by the
  // caller (see drawPlayer); here we derive the ear's own outward direction.
  ctx.save();
  // Rotate into the ear's mounting angle (relative to local "up").
  ctx.rotate(angFromTop);

  // Direction from the ear toward the ground, expressed in the ear's own frame.
  // In this ear-local frame the ear points "up" (local angle -PI/2), while the
  // direction toward the ground sits at (_earDownAngle - angFromTop). The ear
  // aims at the floor when those coincide, so offset the ground direction by
  // that -PI/2 so that d === 0 means the ear points straight down (not to the
  // side). Without this offset the fold triggered a quarter-turn early, folding
  // the ears against the right edge instead of against the ground.
  const downAng = (_earDownAngle - angFromTop) + Math.PI / 2; // 0 => ear points straight down
  // Normalize to [-PI, PI]
  let d = Math.atan2(Math.sin(downAng), Math.cos(downAng));
  // How far the (unfolded) ear tip reaches along the world-down axis, measured
  // from the head centre: cos(d) is the fraction of the ear's length that points
  // toward the ground (1 when the ear aims straight down, 0 when horizontal), so
  // the tip's depth below the centre is earH * cos(d).
  const tipDepth = earH * Math.max(0, Math.cos(d));
  // The fold must NOT start when the ear merely becomes horizontal — at that
  // point the tip is still level with the head centre, well above the ground.
  // Only begin folding once the ear tip rotates down far enough to reach the
  // BOTTOM edge of the round head (depth === r), and ramp to a full fold as the
  // tip continues past that toward pointing straight down (depth === earH).
  // Suppressed entirely while airborne so mid-jump ears stay straight.
  const foldProgress = earH > r
    ? Math.max(0, Math.min(1, (tipDepth - r) / (earH - r)))
    : 0;
  const fold = _earFoldActive ? foldProgress * foldProgress : 0; // ease-in the fold (grounded only)

  // Build the ear as a chain of segments; each successive segment bends toward
  // horizontal (away from the ground) proportionally to `fold`, so the tip
  // curls back against the floor rather than spearing through it.
  const segLen = earH / segs;
  let px = 0, py = 0;
  let dirX = 0, dirY = -1;         // start pointing "up" in local frame
  const bendPerSeg = fold * (Math.PI * 0.42); // total bend distributed along ear
  // bend the ear sideways, away from the ground contact (sign follows d)
  const bendSign = d >= 0 ? -1 : 1;

  ctx.beginPath();
  const pts = [{ x: px, y: py }];
  for (let i = 0; i < segs; i++) {
    const ang = bendSign * bendPerSeg * ((i + 1) / segs);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ndx = dirX * ca - dirY * sa;
    const ndy = dirX * sa + dirY * ca;
    dirX = ndx; dirY = ndy;
    px += dirX * segLen;
    py += dirY * segLen;
    pts.push({ x: px, y: py });
  }

  // Draw the ear as a tapering capsule following the bent spine.
  const half = earW / 2;
  ctx.beginPath();
  // one side out
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const w = half * (1 - 0.35 * t);
    // perpendicular to local spine tangent
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x + nx * w, Y = pts[i].y + ny * w;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  // back down the other side
  for (let i = pts.length - 1; i >= 0; i--) {
    const t = i / (pts.length - 1);
    const w = half * (1 - 0.35 * t);
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x - nx * w, Y = pts[i].y - ny * w;
    ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = furColor;
  ctx.fill();
  ctx.strokeStyle = furShadow;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner-ear detail follows the same bent spine, slightly inset.
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const w = (half - 3) * (1 - 0.35 * t);
    if (w <= 0) continue;
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x + nx * w, Y = pts[i].y + ny * w;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const t = i / (pts.length - 1);
    const w = (half - 3) * (1 - 0.35 * t);
    if (w <= 0) continue;
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x - nx * w, Y = pts[i].y - ny * w;
    ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = innerEar;
  ctx.fill();

  ctx.restore();
}

// Angle (in the head's roll-rotated local frame) that points toward the
// ground contact point. Set each frame by drawPlayer before it draws ears.
let _earDownAngle = 0;

// Whether the ground-fold should be applied to the ears this frame. Set by
// drawPlayer to the player's grounded state so ears only fold on a surface and
// stay straight mid-jump.
let _earFoldActive = true;

function drawPlayer(p) {
  const r = p.r;

  // ── Rolling: accumulate a roll angle from the player's left/right MOVE INPUT
  // intent (p.moveDir), NOT from actual horizontal travel, so the head faces
  // her input direction and spins like a wheel that way. Driving off input
  // intent means: (1) she still turns to face a held left/right even when an
  // obstacle blocks her and she can't actually move, and (2) she does NOT spin
  // when a platform (e.g. the moving turtle) carries her while she gives no
  // left/right input. The per-frame roll uses her normal move speed so the
  // spin rate matches unobstructed walking. As before, the spin only applies
  // while grounded; mid-jump the head holds its last roll value.
  const moveDir = p.moveDir || 0;
  if (p.roll === undefined) p.roll = 0;
  if (p.grounded) p.roll += (moveDir * p.speed) / r; // radians of roll per input frame (grounded only)
  const roll = p.roll;

  // Ears only fold against the ground while the bunny is standing on a surface.
  // In the air they stay straight even when the arc happens to aim them
  // downward, so drawFoldingEar is told whether folding is currently active.
  _earFoldActive = p.grounded;

  // Soft glow (unrotated, under everything)
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

  // In the head's local frame the world "down" direction (toward the ground
  // contact point) sits at world angle +PI/2; after the head rolls by `roll`,
  // that same world-down direction lives at local angle (PI/2 - roll).
  _earDownAngle = Math.PI / 2 - roll;

  // Everything (ears + face) is drawn in a frame translated to the player and
  // rotated by the roll angle, so the whole head visibly rolls.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(roll);

  // Ears (drawn behind the head). Each ear is mounted a little outward from the
  // top and folds against the ground as the head rolls it into contact.
  drawFoldingEar(r, -0.45, furColor, furShadow, innerEar); // left ear
  drawFoldingEar(r,  0.45, furColor, furShadow, innerEar); // right ear

  // Head/body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = furColor;
  ctx.fill();
  ctx.strokeStyle = furShadow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cheeks
  ctx.fillStyle = 'rgba(243,182,194,0.5)';
  ctx.beginPath(); ctx.arc(-r * 0.5, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( r * 0.5, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( r * 0.32, -r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();

  // Nose
  ctx.fillStyle = '#e07a92';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.18);
  ctx.lineTo(-r * 0.12, r * 0.32);
  ctx.lineTo( r * 0.12, r * 0.32);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
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
  drawLives('#4af');
}

// Remaining-lives readout, shown top-right in both stages. Rendered as a row
// of heart glyphs (filled = remaining, hollow = spent) so the count is legible
// at a glance.
function drawLives(color) {
  ctx.save();
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  const hearts = '\u2665 '.repeat(Math.max(0, lives)).trim();
  ctx.fillStyle = color;
  ctx.fillText(`LIVES  ${hearts}`, W - 12, 24);
  ctx.restore();
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

// ─── Launch intro: UFO strikes the machine with purple lightning ────────────
// Shown once at game launch (STATE.INTRO), before normal play begins. A flying
// saucer swoops in from the top of the screen, dives down onto the claw machine
// cabinet, and blasts it with a jagged purple lightning bolt on impact. After a
// short flash the intro hands off to STATE.PLAYING and the game starts.
let introElapsed;
const INTRO_FLY_IN   = 60;   // dt-units: UFO descends toward the machine
const INTRO_STRIKE   = 45;   // dt-units: lightning strike + flash holds
const INTRO_HANDOFF  = 20;   // dt-units: brief settle before play starts
const INTRO_DURATION = INTRO_FLY_IN + INTRO_STRIKE + INTRO_HANDOFF;

// Machine cabinet geometry for the intro (purely cosmetic — the real gameplay
// machine is the whole canvas). Lightning targets the top-center of this box.
const INTRO_MACHINE = { x: W * 0.22, y: H * 0.42, w: W * 0.56, h: H * 0.5 };

function startIntro() {
  introElapsed = 0;
  state = STATE.INTRO;
}

// One jagged lightning bolt from (x1,y1) to (x2,y2), split into segments that
// jitter sideways. `seed` keeps the jitter stable within a frame so the bolt
// doesn't strobe every draw.
function drawLightningBolt(x1, y1, x2, y2, seed, width, color) {
  const segments = 9;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const bx = x1 + (x2 - x1) * t;
    const by = y1 + (y2 - y1) * t;
    // Deterministic pseudo-random sideways jitter, zeroed at the endpoints.
    const jitter = i < segments ? Math.sin(seed + i * 12.9898) * 22 * (1 - Math.abs(t - 0.5) * 2 + 0.3) : 0;
    ctx.lineTo(bx + jitter, by);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawIntroMachine() {
  const m = INTRO_MACHINE;
  // Cabinet body
  ctx.fillStyle = '#241a3a';
  ctx.strokeStyle = '#a259ff';
  ctx.lineWidth = 3;
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  // Glass display area
  ctx.fillStyle = 'rgba(120,90,200,0.18)';
  ctx.fillRect(m.x + 12, m.y + 34, m.w - 24, m.h * 0.55);
  ctx.strokeStyle = '#ff6ec7';
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x + 12, m.y + 34, m.w - 24, m.h * 0.55);
  // Marquee header
  ctx.fillStyle = '#3a2a5a';
  ctx.fillRect(m.x, m.y, m.w, 28);
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAW', m.x + m.w / 2, m.y + 20);
  // Prize chute at the bottom
  ctx.fillStyle = '#150e26';
  ctx.fillRect(m.x + m.w * 0.5 - 22, m.y + m.h - 30, 44, 30);
  ctx.textAlign = 'left';
}

// A classic flying saucer, drawn centered at (cx, cy) with a purple glow and
// a beam of underlight.
function drawUFO(cx, cy, tilt) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  // Under-glow beam
  ctx.fillStyle = 'rgba(162,89,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(14, 6);
  ctx.lineTo(40, 60);
  ctx.lineTo(-40, 60);
  ctx.closePath();
  ctx.fill();
  // Saucer body
  ctx.fillStyle = '#8a8fb0';
  ctx.beginPath();
  ctx.ellipse(0, 4, 46, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4d66';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Dome
  ctx.fillStyle = '#b6a8ff';
  ctx.beginPath();
  ctx.ellipse(0, -2, 22, 18, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#7a5cff';
  ctx.stroke();
  // Dome highlight
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-6, -8, 6, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Running lights
  const lightCount = 5;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / (lightCount - 1)) * Math.PI;
    const lx = Math.cos(a) * 38;
    const ly = 4 + Math.sin(a) * 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = (frame + i) % 12 < 6 ? '#ff6ec7' : '#a259ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawIntro(dt) {
  introElapsed = Math.min(introElapsed + dt, INTRO_DURATION);
  const t = introElapsed;

  // Dark night backdrop for the launch scene.
  ctx.fillStyle = '#0a0616';
  ctx.fillRect(0, 0, W, H);

  drawIntroMachine();

  const m = INTRO_MACHINE;
  const strikeX = m.x + m.w / 2;
  const strikeTopY = m.y;              // top-center of the cabinet (impact point)

  // UFO path: descends from above the screen toward a hover point just over the
  // machine during the fly-in, then hovers there while it strikes.
  const flyProgress = Math.min(t / INTRO_FLY_IN, 1);
  const eased = 1 - Math.pow(1 - flyProgress, 3); // ease-out
  const ufoHoverY = m.y - 70;
  const ufoY = -40 + (ufoHoverY + 40) * eased;
  // Slight sideways sway on the way in for a "swooping" feel.
  const ufoX = strikeX + Math.sin(flyProgress * Math.PI) * 60 * (1 - eased);
  const tilt = Math.sin(t * 0.08) * 0.08;

  const striking = t >= INTRO_FLY_IN && t < INTRO_FLY_IN + INTRO_STRIKE;
  const strikeT = striking ? (t - INTRO_FLY_IN) / INTRO_STRIKE : 0;

  // Pink lightning strike from the UFO's underside down onto the machine.
  if (striking) {
    const boltCount = 2 + (frame % 2);
    for (let b = 0; b < boltCount; b++) {
      const seed = frame * 3.1 + b * 7.7;
      drawLightningBolt(ufoX, ufoY + 14, strikeX + (b - 0.5) * 10, strikeTopY, seed, 4, '#ff4fd8');
      drawLightningBolt(ufoX, ufoY + 14, strikeX + (b - 0.5) * 10, strikeTopY, seed + 1.3, 2, '#ffd9f4');
    }
    // Electric burst where the bolt hits the cabinet.
    const burstR = 10 + Math.sin(strikeT * Math.PI) * 26;
    const grad = ctx.createRadialGradient(strikeX, strikeTopY, 0, strikeX, strikeTopY, burstR);
    grad.addColorStop(0, 'rgba(255,217,244,0.9)');
    grad.addColorStop(0.5, 'rgba(255,79,216,0.5)');
    grad.addColorStop(1, 'rgba(255,79,216,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(strikeX, strikeTopY, burstR, 0, Math.PI * 2);
    ctx.fill();
    // Full-screen pink flash that pulses with the strike.
    const flash = Math.sin(strikeT * Math.PI) * 0.35 * (frame % 3 === 0 ? 1.4 : 1);
    ctx.fillStyle = `rgba(255,120,220,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawUFO(ufoX, ufoY, tilt);

  // During the strike, the flashing green-and-pink 'Claw Mashine' logo
  // descends into view over the scene, in sync with the pink lightning.
  if (striking) {
    drawClawMashineLogo(dt, 128);
  }

  // Title text glowing over the scene.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe066';
  ctx.shadowColor = '#a259ff';
  ctx.shadowBlur = 20;
  ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('CLAW MACHINE', W / 2, 60);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  // Hand off to normal play after the strike settles.
  if (introElapsed >= INTRO_DURATION) {
    init();
  }
}

// ─── 'Claw Mashine' logo ──────────────────────────────────────────────────────

// Animated title logo reading 'Claw Mashine' (spelling intentional). It slowly
// descends from above the top of the screen to a resting baseline and flashes,
// alternating between green and pink each cycle.
function drawClawMashineLogo(dt, baselineY) {
  let y;
  if (baselineY !== undefined) {
    // Fixed baseline (used by the launch intro so the flashing logo sits at a
    // set spot during the strike without colliding with the intro title).
    y = baselineY;
  } else {
    // Slowly ease the logo down from offscreen to its resting baseline.
    if (logoY < LOGO_REST_Y) {
      logoY = Math.min(LOGO_REST_Y, logoY + LOGO_DESCEND_SPEED * dt);
    }
    y = logoY;
  }

  // Flash: alternate between green and pink on a smooth cycle.
  const t = (Math.sin(frame * 0.12) + 1) / 2; // 0..1 oscillation
  const green = '#39ff5e';
  const pink = '#ff4fd8';
  const color = t < 0.5 ? green : pink;
  const glow = t < 0.5 ? pink : green;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fillText('Claw Mashine', W / 2, y);
  ctx.restore();
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let lastTime = 0;
let frame = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3); // ~60 fps units
  lastTime = ts;
  frame++;

  // Launch intro plays before anything else and draws its own backdrop.
  if (state === STATE.INTRO) {
    drawIntro(dt);
    requestAnimationFrame(loop);
    return;
  }

  drawBackground();

  if (state === STATE.PLAYING) {
    // While a claw is actively hauling the bunny up in its jaws, she's fully
    // caught — freeze her own movement/physics (same idea as freezing the
    // player during FADING) so the claw's retract is the only thing moving
    // her, instead of gravity/input fighting the carry each frame.
    const grabbedBefore = claws.some(c => c.grabbing && c.grabbedIsPlayer);
    if (!grabbedBefore) {
      updatePlayerPhysics(dt);
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
    drawClawMashineLogo(dt);

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
      // Reaching the rooftop unlocks stage 2 as the new respawn checkpoint.
      highestStage = 2;
      initPlatformLevel(2);
      state = STATE.PLATFORM;
    }

  } else if (state === STATE.PLATFORM) {
    updatePlatformLevel(dt);

    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

  } else if (state === STATE.END_LEVEL) {
    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

    // Fade to white on door touch to indicate level complete
    doorTouchElapsed = Math.min(doorTouchElapsed + dt, DOOR_FADE_DURATION);
    const doorProgress = doorTouchElapsed / DOOR_FADE_DURATION;
    ctx.fillStyle = `rgba(255,255,255,${doorProgress * 0.8})`;
    ctx.fillRect(0, 0, W, H);

    if (doorProgress >= 1) {
      if (platformLevel < 3) {
        // Clearing the rooftop platform level (stage 2) leads into the jungle
        // level (stage 3): re-init the platforming machinery for level 3, which
        // renders a jungle backdrop and a snake-styled claw.
        highestStage = 3;
        initPlatformLevel(3);
        state = STATE.PLATFORM;
      } else if (platformLevel < 4) {
        // Clearing the jungle level (stage 3) leads into the cavern level
        // (stage 4): re-init the platforming machinery for level 4, which
        // renders a cavern backdrop and a bat-styled claw.
        highestStage = 4;
        initPlatformLevel(4);
        state = STATE.PLATFORM;
      } else {
        // Level 4 (cavern) cleared — the run is complete.
        state = STATE.GAME_OVER;
        gameOverAlpha = 0;
      }
    }

  } else if (state === STATE.PLATFORM_FADING) {
    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

    fadeAlpha = Math.min(1, fadeAlpha + fadeSpeed);
    drawFadeOverlay();

    if (fadeAlpha >= 1) {
      // Spend a life and respawn at the highest-reached stage, or game over.
      handleDeath();
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

    // Once fully black, spend a life and respawn at the highest-reached
    // stage — or, if this was the last life, proceed to the game-over screen.
    if (fadeAlpha >= 1) {
      handleDeath();
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

startIntro();
requestAnimationFrame(loop);
