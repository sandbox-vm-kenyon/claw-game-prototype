// Claw Game — Game Over on Claw Contact: Fade to Black + Show Game Over

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const W = canvas.width;
const H = canvas.height;

// ─── State ────────────────────────────────────────────────────────────────────

const STATE = { PLAYING: 0, FADING: 1, GAME_OVER: 2, POPOUT: 3, PLATFORM: 4, PLATFORM_FADING: 5, GRAB_FADE_OUT: 6, GRAB_FADE_IN: 7, END_LEVEL: 8 };

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

// Exit door (end of platform stage): triggers a level-complete sequence when
// the bunny reaches it. The door appears at the end of the 10 randomized chunks.
let door;  // { x, y, w, h }
let doorAlpha;  // for fade-in animation
const DOOR_FADE_DURATION = 30;  // dt-units to fade to white on door touch
let doorTouchElapsed;

// ─── Platformer physics tuning ─────────────────────────────────────────────
const MOVE_SPEED = 3.2;
const GRAVITY = 0.6;
const JUMP_VELOCITY = -14;
const MAX_FALL_SPEED = 14;

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
// Max horizontal reach of a full jump is ~115px (JUMP_VELOCITY/GRAVITY/MOVE_SPEED);
// cap generated pit widths well inside that so every pit is comfortably
// clearable with a running jump and no chunk is an impossible dead-end.
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
// The swoop dives to a FIXED, telegraphed depth (the jaw tips reach this world
// y at the bottom of the arc) rather than homing onto the bunny's own position.
// It is deliberately kept high enough above the ground that a bunny simply
// running along the floor passes safely underneath — the swoop is a hazard to
// react to (jump-timed / paced), NOT a guaranteed catch. Before this, the dive
// targeted `player.y - 6` (ground level) and hugged the running bunny, so
// merely walking right was an unavoidable game-over "for no reason".
const HOVER_SWOOP_TIP_DEPTH = GROUND_Y - 120; // deepest the harmful jaw tips descend

let hoverClaw;
function initPlatformLevel() {
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

    // Check collision with player
    checkHoverClawCollision(c);
    return;
  }

  if (c.cooldown > 0) c.cooldown -= dt;

  // Hover/patrol: drift slowly side to side at a fixed altitude while
  // watching for the bunny to run underneath it moving right.
  c.patrolT += dt * HOVER_PATROL_SPEED;
  c.x = c.patrolCenter + Math.sin(c.patrolT) * HOVER_PATROL_AMPLITUDE;
  c.x = Math.max(40, Math.min(W * 4, c.x)); // allow patrol beyond screen edges in world space
  c.y = HOVER_CLAW_Y;

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
    c.swoopEndX = Math.max(40, Math.min(W * 4, c.x + HOVER_SWOOP_ADVANCE));
    // Fixed dive depth (jaw tips reach HOVER_SWOOP_TIP_DEPTH at the low point),
    // never the ground — a bunny running along the floor clears underneath it.
    c.swoopDiveY = HOVER_SWOOP_TIP_DEPTH - c.armLen;
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

function drawHoverClaw(c) {
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

function drawPlatformBackground() {
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

  for (const seg of groundSegments) {
    if (seg.x + seg.w < cameraX - 20 || seg.x > cameraX + W + 20) continue;
    ctx.fillStyle = '#8f8f96';
    ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
    ctx.fillStyle = '#b7b7be';
    ctx.fillRect(seg.x, seg.y, seg.w, 5);
  }

  for (const plat of stagePlatforms) {
    if (plat.x + plat.w < cameraX - 20 || plat.x > cameraX + W + 20) continue;
    ctx.fillStyle = '#5a5f6b';
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = '#4be0ff';
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
}

function drawPlatformHUD() {
  ctx.fillStyle = '#2a2a2a';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${score}`, 12, 24);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#3a3a3a';
  ctx.fillText('OUT OF THE MACHINE!', 12, 44);
  drawLives('#2a2a2a');
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
  player.x += player.vx * dt;
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

  // How much this ear should fold: it flops away from the ground. We measure
  // the angle between the ear's own outward direction and the ground.
  // In this ear-local frame the ear points "up" (local angle -PI/2), while the
  // direction toward the ground sits at (_earDownAngle - angFromTop). The ear
  // aims at the floor when those coincide, so offset the ground direction by
  // that -PI/2 so that d === 0 means the ear points straight down (not to the
  // side). Without this offset the fold triggered a quarter-turn early, folding
  // the ears against the right edge instead of against the ground.
  const downAng = (_earDownAngle - angFromTop) + Math.PI / 2; // 0 => ear points straight down
  // Normalize to [-PI, PI]
  let d = Math.atan2(Math.sin(downAng), Math.cos(downAng));
  // fold factor: 1 when the ear points at the ground, 0 when it points up/away.
  const nearGround = Math.max(0, Math.cos(d)); // 1 when pointing down
  const fold = nearGround * nearGround;        // ease-in the fold

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

function drawPlayer(p) {
  const r = p.r;

  // ── Rolling: accumulate a roll angle from actual horizontal travel, so the
  // head spins like a wheel in the direction of movement (roll = distance/r).
  if (p._prevX === undefined) p._prevX = p.x;
  const dx = p.x - p._prevX;
  p._prevX = p.x;
  if (p.roll === undefined) p.roll = 0;
  p.roll += dx / r;               // radians of roll per pixel travelled
  const roll = p.roll;

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
      initPlatformLevel();
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
      // Level complete — show a brief message before returning to the main game
      // or could trigger next stage/end screen here
      state = STATE.GAME_OVER;
      gameOverAlpha = 0;
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

init();
requestAnimationFrame(loop);
