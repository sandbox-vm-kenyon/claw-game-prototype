import { H, W } from './core.js';

export const START_LIVES = 5;
// Which platform stage is currently running: 2 = the rooftop/arcade platform
// level, 3 = the jungle level (same platforming machinery, but a jungle
// backdrop and a snake-styled hover claw), 4 = the cavern level (a cave
// backdrop and a bat-styled hover claw). Set by initPlatformLevel().

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

// Decorative 'Claw Mashine' logo that slowly descends from the top of the
// screen while flashing between green and pink. logoY is its current baseline
// y (world = screen space); it starts above the top edge and eases downward.

export const LOGO_START_Y = -30;      // begins fully offscreen above the top edge

export const LOGO_REST_Y = 40;        // eases down to this resting baseline

export const LOGO_DESCEND_SPEED = 0.25; // px per ~60fps-unit — slow drift downward

export const DROP_CHANCE = 0.5; // odds a grab is let go mid-retract instead of held all the way up

// Pop-out transition (riding a retracting claw all the way to the box's
// ceiling no longer kills the player — it launches them up and out of the
// top of the machine into a second, platformer-style level).

export const POPOUT_DURATION = 30;  // dt-units (~0.5s at 60fps)

export const POPOUT_RISE = 140;     // extra px the player visibly rises during the pop

// Exit door (end of platform stage): triggers a level-complete sequence when
// the bunny reaches it. The door appears at the end of the 10 randomized chunks.

export const DOOR_FADE_DURATION = 30;  // dt-units to fade to white on door touch

// ─── Platformer physics tuning ─────────────────────────────────────────────

export const MOVE_SPEED = 3.2;

export const GRAVITY = 0.6;
// Vertical jump height was raised 20%. Peak height ∝ JUMP_VELOCITY²/(2·GRAVITY),
// so scaling the launch velocity by √1.20 (−14 → −15.336) raises the apex by
// exactly 20% while leaving GRAVITY (and thus fall feel) unchanged.

export const JUMP_VELOCITY = -15.336231610144651; // = -14 * Math.sqrt(1.20)

export const MAX_FALL_SPEED = 14;
// Airborne horizontal boost: while jumping, the bunny covers more horizontal
// ground per frame than while grounded. Raised from 1.2 to 1.92 (×1.60) so a
// full running jump now lands 60% farther without changing jump height (airtime
// is unchanged, so the extra distance comes purely from faster airborne travel).

export const AIR_HORIZONTAL_BOOST = 1.92;

export const FLOOR_Y = H - 6; // resting line for items sitting in the bottom of the box

// Which obstacle kinds the claw can grab and carry off. The bear, gorilla,
// giraffe and shark are left out on purpose — the crate, turtle, ball, and
// the level-1 collectible animals (hamster, walrus, dolphin) are up for grabs.

// GRABBABLE_KINDS / PUSH_ANIMAL_KINDS now live in — and are derived from — the
// entity-type registry (entities/registry.js), so the capability lists can
// never drift out of sync with the entity definitions. They were previously
// hand-maintained arrays here.

// Beach-ball rolling tuning — the ball is the only obstacle that reacts to
// contact by rolling instead of just blocking/supporting the player.

export const BALL_ROLL_ACCEL = 0.9;  // nudge applied to ball speed per frame of contact (px/frame)

export const BALL_CARRY_FACTOR = 0.35; // how much of the player's own speed is imparted while stood on

export const BALL_MAX_SPEED = 4;     // cap on rolling speed so it stays controllable

export const BALL_FRICTION = 0.93;   // per-frame decay so the ball rolls to a stop

export const BALL_BOUNDS_PAD = 4;    // keep the ball from rolling off the box edges

// Beach-ball bounce tuning — being light, the ball also pops up a little
// and bounces (loses some height each bounce, then settles) any time it's
// freshly hit, whether landed on from above or bumped from the side.

export const BALL_GRAVITY = 0.5;           // downward acceleration pulling the ball back to the floor (px/frame^2)

export const BALL_BOUNCE_RESTITUTION = 0.5; // fraction of impact speed kept on each bounce off the floor

export const BALL_POP_LAND = -6;           // upward pop applied when the player lands on top of it (px/frame)

export const BALL_POP_SIDE = -3;           // smaller upward pop applied when bumped from the side (px/frame)

export const BALL_MIN_BOUNCE_VY = 0.6;     // once a floor bounce would be slower than this, just settle instead

// Turtle tuning — the turtle is the only obstacle that walks on its own,
// and only while the player is currently standing on top of it.

export const TURTLE_SPEED = 0.5;     // slow crawl speed while ridden (px/frame)

export const TURTLE_BOUNDS_PAD = 4;  // keep the turtle from crawling off the box edges

// Level-1 animal "push response" tuning — the box-stage animals below aren't
// rigid: when the player pushes into one from the side it rocks/tilts a little
// and drifts slowly in the push direction, then eases back toward where it was.
// The crate ('block') and the beach ball ('ball', which has its own rolling
// physics) are intentionally excluded, and this only ever runs on the level-1
// box obstacles, never the platforming stages (which have no `obstacles`).

// (PUSH_ANIMAL_KINDS is derived from entities/registry.js — see note above.)

export const PUSH_DRIFT_ACCEL = 0.14;  // gentle nudge added to drift speed per frame of contact (px/frame)

export const PUSH_MAX_DRIFT = 10;      // how far (px) an animal may drift from its home spot

export const PUSH_DRIFT_FRICTION = 0.9; // per-frame decay so the drift is slow and settles

export const PUSH_RETURN = 0.02;       // gentle spring easing the animal back toward home when not pushed

export const PUSH_TILT_ACCEL = 0.006;  // rocking impulse toward the push direction per frame of contact (rad/frame)

export const PUSH_MAX_TILT = 0.13;     // cap on the tilt angle so the wobble stays subtle (rad, ~7.5°)

export const PUSH_TILT_STIFFNESS = 0.02; // spring pulling the tilt back upright

export const PUSH_TILT_DAMPING = 0.86;   // damping so the rocking settles rather than oscillating forever

// Push-and-slide: once a pushed animal has rocked all the way to its full tilt
// (PUSH_MAX_TILT) in the push direction, it stops merely wobbling in place and
// begins slowly sliding across the floor in that direction. The slide halts the
// instant it runs into another animal, another object, or a box wall.
export const PUSH_SLIDE_TRIGGER = 0.98;  // fraction of PUSH_MAX_TILT the rock must reach to start the slide
export const PUSH_SLIDE_SPEED = 0.6;     // slow slide speed along the floor while pushed (px/frame)

export const HOMING_BASE = 0.45;    // starting horizontal pursuit speed (px/frame)

export const HOMING_GROWTH = 0.03;  // added per second survived

export const HOMING_MAX = 3.25;     // cap so it stays beatable

export const FALL_BASE = 1.2;       // starting descent speed (px/frame)

export const FALL_GROWTH = 0.035;   // added per second survived

export const FALL_MAX = 7;          // cap on descent speed

export const RETRACT_SPEED = 3.5;   // reference speed used to size the eased retract's duration (px/frame)
                              // lower value = longer duration = slower upward retract overall

export const BOTTOM_DWELL_DURATION = 60; // ~1 second (dt is expressed in ~1-per-frame units at 60fps) the
                                   // claw pauses at the bottom, jaws already closed, before it
                                   // begins climbing back up

export const CLAW_CLOSED_JAW = 2; // jawOpen value the claw snaps to the instant it hits bottom (floor or
                            // obstacle) — the jaws close together whether or not anything was
                            // actually caught, same as a real claw machine's grab-and-release cycle.

// Ease-out quad: still decelerates toward the end like the cubic curve this
// replaced, but starts its initial rise a little more slowly (lower initial
// velocity) instead of climbing at full speed the instant the retract begins.

export const CLAW_SPAWN_Y = -40;
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

export const CLAW_LOCK_Y = CLAW_SPAWN_Y + (H - CLAW_SPAWN_Y) * 0.75;

const FINGER_HIT_R = 8; // matches the drawn 4px tip plus a small margin

// The box's open top (y = 0) — the only way to ever reach it is by riding a
// retracting claw all the way up, since normal jumping can't get anywhere
// close. Getting crushed against it there is just as fatal as the claw's
// fingers themselves, so a rider needs to hop off before it climbs that far.

export const CEILING_Y = 0;

export const CLAW_BODY_W = 28;

export const CLAW_BODY_H = 18;

export const CHUNK_W = 900;      // world-space width of one repeating stage chunk

const GAP_X = 620;        // x offset (within a chunk) where its ground pit starts (LEGACY — now per-pattern)

const GAP_W = 80;         // pit width — comfortably inside the bunny's ~100px max jump distance (LEGACY — now per-pattern)

export const GROUND_Y = H - 20;  // world y of the ground's top surface

export const GENERATE_AHEAD = W; // keep chunks generated at least this far past the camera's right edge

export const DESPAWN_BEHIND = W; // drop world objects once this far behind the camera's left edge

const ENEMY_SPEED = 1.1;  // px/frame the patrol enemy walks

const ENEMY_W = 22, ENEMY_H = 18;

// Exit door (end of platform stage level)

export const DOOR_W = 40;

export const DOOR_H = 80;

export const DOOR_X_FROM_END = 120;  // how far from the end of the 10 chunks the door sits

export const NUM_CHUNKS = 10;        // number of randomized patterns before the door

// Pool of chunk pattern templates. Each pattern defines a pit position/width
// and floating-platform locations. generateChunksUpTo() picks one at RANDOM
// per chunk (seeded per level run), so a given run's layout is genuinely
// randomized rather than the same fixed sequence every time.

export const MAX_PIT_W = 92;

// ─── Platform-level hovering claw ──────────────────────────────────────────
// A second claw haunts the platform level — unlike the box's claw, it has no
// cable/arm running up off the top of the screen; it just hovers, drifting
// slowly back and forth, then swoops down in a fast arc to try to catch the
// bunny whenever they run underneath it while moving right, before rising
// back up to resume hovering (further along, tracking the bunny's progress).

export const HOVER_CLAW_Y = 70;              // altitude (px from top) the claw hovers/returns to

export const HOVER_PATROL_SPEED = 0.01;      // radians of drift per dt-unit while hovering (halved to slow the hover claw down)

export const HOVER_PATROL_AMPLITUDE = 90;    // px either side of the current patrol center

export const HOVER_SWOOP_TRIGGER_RANGE = 150;// px ahead of the claw at which an approaching bunny provokes a dive (telegraphed early)

const HOVER_SWOOP_ADVANCE = 120;      // px the claw's hover point shifts forward after each swoop

export const HOVER_SWOOP_DURATION = 60;      // dt-units for a full dive-and-rise arc (~1.0s; slowed from 34 so the swoop is easier to dodge)

export const HOVER_SWOOP_COOLDOWN = 50;      // dt-units of hovering required before it can dive again
// The swoop snapshots the bunny's position (x AND y) at the instant it
// triggers and dives toward THAT captured point: the arc's low point aims the
// harmful jaw tips at the player's y as it was when the swoop began. The dive
// depth is clamped just above the ground so the tips never punch through the
// floor. The snapshot is frozen at swoop-start, so if the player moves during
// the ~1s arc the claw still commits to where they were — a telegraphed,
// dodgeable dive rather than a stale/fixed-depth or homing catch.

export const HOVER_CLAW_MIN_ONSCREEN_X = 40; // px inset from the screen's left edge the claw's body is never allowed to fall behind (keeps it on-screen behind the player)

export const HOVER_CLAW_MAX_X = NUM_CHUNKS * CHUNK_W; // world x the claw may range up to (full stage width; the old W*4 cap pinned it ~1920px in and broke tracking deeper into the level)

// level defaults to whatever platform stage is already running (so a plain
// respawn stays on the same stage); callers advancing the player pass the
// explicit stage number (2 = rooftop, 3 = jungle).

export const SPAWN_INTERVAL = 120; // frames

// ─── Draw ─────────────────────────────────────────────────────────────────────

export const EAR_LENGTH_FRAC = 1.9;           // earH = r * this

export const EAR_MOUNT_ANGLES = [-0.45, 0.45]; // left, right ear mounting angle from top

// Jump is gated on the ears being at least PARTIALLY folded (their tips down
// against the ground). This is the geometric fold-progress threshold the deepest
// ear must reach for a jump to be allowed; below it the jump is blocked and the
// feedback twitch plays instead.

export const EAR_FOLD_JUMP_THRESHOLD = 0.25;

// Blocked-jump feedback twitch: ~0.5s total. The ears half-fold and straighten
// back out to show that pressing jump drives the ears' "jumping" fold action.

export const EAR_FEEDBACK_DURATION = 30;   // dt-units (~0.5s at 60fps)

export const EAR_FEEDBACK_MAX_FOLD = 0.5;  // peak additive fold of the half-fold twitch

// How folded a single ear is, as a raw 0..1 progress, given the head's current
// roll and this ear's mounting angle. 0 = ear still straight up / horizontal
// (tip above the head's bottom edge); 1 = ear swung fully down (tip at "straight
// down"). This is the SAME derivation drawFoldingEar uses for its geometric
// fold, factored out so tryJump can read the live fold amount without drawing.
// It deliberately ignores the grounded gate and the ease-in squaring — callers
// apply those as they need (the jump gate wants the linear geometric progress).

export const INTRO_FLY_IN   = 60;   // dt-units: UFO descends toward the machine

export const INTRO_STRIKE   = 45;   // dt-units: lightning strike + flash holds

const INTRO_HANDOFF  = 20;   // dt-units: brief settle before play starts

export const INTRO_DURATION = INTRO_FLY_IN + INTRO_STRIKE + INTRO_HANDOFF;

// Machine cabinet geometry for the intro (purely cosmetic — the real gameplay
// machine is the whole canvas). Lightning targets the top-center of this box.

export const INTRO_MACHINE = { x: W * 0.22, y: H * 0.42, w: W * 0.56, h: H * 0.5 };
