import { STATE, game } from './state.js';
import { btnPlayAgain } from './core.js';
import { init } from './main.js';
import { playerEarFold, updateEarFeedback } from './physics.js';
import { AIR_HORIZONTAL_BOOST, EAR_FEEDBACK_DURATION, EAR_FOLD_JUMP_THRESHOLD, GRAVITY, JUMP_VELOCITY, MAX_FALL_SPEED } from './tuning.js';

const keys = {};
// DOM wiring is guarded so this module (imported transitively by the pure
// physics code) can also load in a non-browser test environment.
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === 'r' || e.key === 'R') && game.state === STATE.GAME_OVER) init();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
}

// "Play Again" button on the game-over screen — restarts the run the same
// way pressing R does.
if (btnPlayAgain) {
  btnPlayAgain.addEventListener('click', () => {
    if (game.state === STATE.GAME_OVER) init();
  });
}

function handleInput() {
  // Platformer-style horizontal movement. player.moveDir records the raw
  // left/right MOVE-INPUT intent this frame (-1 left, +1 right, 0 none),
  // independent of whether the bunny actually moves — the head-roll animation
  // is driven by this intent, not by resulting position change, so she turns to
  // face her input even when blocked, and stays put when carried by a platform.
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) { game.player.vx = -game.player.speed; game.player.moveDir = -1; }
  else if (keys['ArrowRight'] || keys['d'] || keys['D']) { game.player.vx = game.player.speed; game.player.moveDir = 1; }
  else { game.player.vx = 0; game.player.moveDir = 0; }

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
  // Edge-detect the jump input so a blocked jump fires its feedback twitch once
  // per press, not every frame the key is held. (The successful-jump path is
  // already self-limiting because it clears player.grounded.)
  const justPressed = jumpPressed && !game.player.jumpKeyWasDown;
  game.player.jumpKeyWasDown = jumpPressed;

  if (!jumpPressed || !game.player.grounded) return;

  // Jump is only allowed when the ears are at least partially folded (their tips
  // down against the ground). If they aren't folded enough, the jump does NOT
  // happen; instead play the quick half-fold-then-straighten feedback twitch so
  // the player sees that pressing jump drives the ears' "jumping" fold action.
  if (playerEarFold(game.player) >= EAR_FOLD_JUMP_THRESHOLD) {
    game.player.vy = JUMP_VELOCITY;
    game.player.grounded = false;
  } else if (justPressed && (!game.player.earFeedbackT || game.player.earFeedbackT <= 0)) {
    game.player.earFeedbackT = EAR_FEEDBACK_DURATION;
  }
}

// Shared, level-agnostic player jump/gravity physics. Applies horizontal &
// vertical input, gravity, and the jump velocity uniformly, then integrates the
// player's position for the frame. It deliberately does NOT do stage-specific
// collision/bounds — each stage runs its own collision pass (box floor+obstacles,
// platform segments, etc.) after calling this. Because the jump mechanic lives
// here (and in tryJump), any level added now or in the future inherits jumping
// simply by calling this helper; there is no per-stage jump re-wiring.

export function applyPlayerJumpPhysics(dt) {
  handleInput();
  updateEarFeedback(game.player, dt); // advance the blocked-jump feedback twitch
  game.player.vy = Math.min(game.player.vy + GRAVITY, MAX_FALL_SPEED);
  // While airborne, apply the horizontal boost so the jump's horizontal reach
  // is ~20% greater than grounded movement, without altering jump height.
  const horizVx = game.player.grounded ? game.player.vx : game.player.vx * AIR_HORIZONTAL_BOOST;
  game.player.x += horizVx * dt;
  game.player.y += game.player.vy * dt;
}

// ─── On-screen touch controls (folded in from index.html) ───────────────────
//
// One-handed controls: a left-side virtual joystick drives movement and a
// right-side button triggers the jump. Both write into the same module-level
// `keys` map the keyboard uses, so the rest of the game reads one input
// abstraction. (Previously these lived in an inline <script> in index.html and
// reached into game.js's global `keys`; under ES modules that global is gone,
// so the wiring moves here where `keys` is in scope.)
function holdKey(key, el) {
  if (!el) return;
  const start = () => { keys[key] = true; };
  const stop  = () => { keys[key] = false; };
  el.addEventListener('pointerdown',  e => { e.preventDefault(); start(); });
  el.addEventListener('pointerup',    stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
}
const hasDom = typeof document !== 'undefined';
if (hasDom) holdKey('ArrowUp', document.getElementById('btnJump'));

// Draggable joystick: only horizontal deflection affects movement, since this
// is a side-scrolling platformer with no vertical steering.
const joystick = hasDom ? document.getElementById('joystick') : null;
const joystickKnob = hasDom ? document.getElementById('joystickKnob') : null;
const JOYSTICK_RADIUS = 26; // max knob travel from center, in px
const JOYSTICK_DEADZONE = 10;
let joystickPointerId = null;

function updateJoystick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.min(Math.hypot(dx, dy), JOYSTICK_RADIUS);
  const angle = Math.atan2(dy, dx);
  joystickKnob.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;

  keys['ArrowRight'] = dx > JOYSTICK_DEADZONE;
  keys['ArrowLeft']  = dx < -JOYSTICK_DEADZONE;
}

function resetJoystick() {
  joystickKnob.style.transform = 'translate(0, 0)';
  keys['ArrowLeft'] = false;
  keys['ArrowRight'] = false;
  joystickPointerId = null;
}

if (joystick) {
  joystick.addEventListener('pointerdown', e => {
    e.preventDefault();
    joystickPointerId = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    updateJoystick(e.clientX, e.clientY);
  });
  joystick.addEventListener('pointermove', e => {
    if (e.pointerId !== joystickPointerId) return;
    updateJoystick(e.clientX, e.clientY);
  });
  joystick.addEventListener('pointerup',     e => { if (e.pointerId === joystickPointerId) resetJoystick(); });
  joystick.addEventListener('pointercancel', e => { if (e.pointerId === joystickPointerId) resetJoystick(); });
}
