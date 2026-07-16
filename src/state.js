// ─── Game state container + finite-state-machine ────────────────────────────
//
// Historically every piece of mutable game state lived in a module-level `let`
// in one giant global-scope file. The refactor gathers them all onto a single
// shared `game` object that every module imports, so cross-module state has one
// authoritative home (and reset functions mutate one container). Fields that
// previously had an initializer keep it here; the rest start `undefined`,
// exactly as the bare `let x;` declarations did before — `init()` and the
// various respawn/init functions populate them.

export const STATE = {
  PLAYING: 0,
  FADING: 1,
  GAME_OVER: 2,
  POPOUT: 3,
  PLATFORM: 4,
  PLATFORM_FADING: 5,
  GRAB_FADE_OUT: 6,
  GRAB_FADE_IN: 7,
  END_LEVEL: 8,
  INTRO: 9,
};

// Reverse lookup (int -> name) for debugging/tests and the transition table.
export const STATE_NAME = Object.fromEntries(
  Object.entries(STATE).map(([k, v]) => [v, k]),
);

export const game = {
  // Core run state
  state: undefined,
  player: undefined,
  claws: undefined,
  obstacles: undefined,
  score: undefined,
  fadeAlpha: undefined,
  fadeSpeed: undefined,
  gameOverAlpha: undefined,
  runStartTime: undefined,

  // Lives / checkpoint system
  lives: undefined,
  highestStage: undefined,
  platformLevel: 2,

  // Grab-and-carry fade
  grabFadeAlpha: undefined,
  grabFadeClaw: undefined,

  // Decorative descending logo
  logoY: undefined,

  // Pop-out transition
  popoutStartY: undefined,
  popoutElapsed: undefined,

  // Exit door
  door: undefined,
  doorAlpha: undefined,
  doorTouchElapsed: undefined,

  // Platform world
  groundSegments: undefined,
  stagePlatforms: undefined,
  enemies: undefined,
  cameraX: undefined,
  generatedUpToX: undefined,
  chunkCount: undefined,
  levelRng: undefined,
  hoverClaw: undefined,

  // Loop / cadence counters
  spawnTimer: 0,
  introElapsed: undefined,
  frame: 0,
};

// ─── Centralized state transitions ──────────────────────────────────────────
//
// The FSM transitions used to be scattered as bare `game.state = STATE.X`
// assignments across the loop, the claw AI, the platform update and the death
// handler. `setState` is the single, auditable transition surface; `TRANSITIONS`
// documents (and, in tests, is asserted against) what each state may lead to.
// Assigning `game.state` directly still works, but going through `setState`
// keeps the flow greppable in one place.

export const TRANSITIONS = {
  [STATE.INTRO]: [STATE.PLAYING],
  [STATE.PLAYING]: [STATE.FADING, STATE.GRAB_FADE_OUT, STATE.POPOUT],
  [STATE.FADING]: [STATE.PLAYING, STATE.PLATFORM, STATE.GAME_OVER],
  [STATE.GRAB_FADE_OUT]: [STATE.GRAB_FADE_IN],
  [STATE.GRAB_FADE_IN]: [STATE.PLAYING],
  [STATE.POPOUT]: [STATE.PLATFORM],
  [STATE.PLATFORM]: [STATE.PLATFORM_FADING, STATE.END_LEVEL],
  [STATE.PLATFORM_FADING]: [STATE.PLATFORM, STATE.GAME_OVER],
  [STATE.END_LEVEL]: [STATE.PLATFORM, STATE.GAME_OVER],
  [STATE.GAME_OVER]: [STATE.PLAYING],
};

export function setState(next) {
  game.state = next;
}
