# Claw Machine — Architecture & Expansion Guide

A review of the game as it exists today, followed by concrete, professionally-minded
recommendations for refactoring it and growing it sustainably — especially for
**adding levels, adding NPCs/enemies, and adding similar content over time**.

- **Live game:** https://sandbox-vm-kenyon.github.io/claw-game-prototype/
- **Source reviewed:** `sandbox-vm-kenyon/claw-game-prototype` @ `main` (commit `d8e7a63`)
  — the deployed bundle is byte-identical to this source at time of writing.

> This document describes the *existing* game. It does not require renaming the
> game; the "claw mashine round 3" title applies to the surrounding project, not
> the game itself.

---

## 1. Current Architecture

### 1.1 High-level shape

The whole game is **two static files served directly from GitHub Pages** — there
is no build step, package manager, framework, or module system:

| File | Size | Responsibility |
|------|------|----------------|
| `index.html` | ~230 lines | Canvas element, all CSS/layout, on-screen touch controls (virtual joystick + JUMP button), Play Again button. Loads `game.js` via a classic `<script>` tag. |
| `game.js` | ~3000 lines | The entire game: state, physics, entities, claw AI, all levels, all rendering, the game loop. |
| `README.md` | 1 line | Link to the live game. |

Everything in `game.js` runs in the **global lexical scope**. That is deliberate
and load-bearing: the inline `<script>` in `index.html` reaches directly into
`game.js`'s top-level `keys` object to feed touch input (see
`index.html` `holdKey`/`updateJoystick`). There are no `import`/`export`
statements and no bundler.

Rendering is **immediate-mode 2D canvas** (`canvas.getContext('2d')`) at a fixed
internal resolution of **480×520**, CSS-scaled to fit the viewport. All art is
drawn procedurally in code — there are no image/sprite/audio assets.

### 1.2 The game loop

A single `requestAnimationFrame` loop (`loop(ts)`, `game.js:2786`) drives
everything. Its structure:

1. Compute `dt` as a frame-rate-independent multiplier: `(ts - lastTime) / 16.67`,
   clamped to `3` (so a long stall can't teleport entities). `dt ≈ 1.0` at 60fps.
2. A global monotonic `frame` counter increments (used for animation phase and
   the claw spawn cadence).
3. **`update` and `draw` are interleaved inside one big `if/else if` ladder on
   `state`.** There is no separate "update all / then draw all" split — each
   state branch does its own physics *and* its own drawing.

The intro state short-circuits at the top (it draws its own backdrop and returns
early). Every other state falls through to `drawBackground()` first, then into
the ladder.

### 1.3 State management

Game flow is a **hand-rolled finite state machine** — a plain integer `state`
selected from a `STATE` enum (`game.js:12`):

```
PLAYING, FADING, GAME_OVER, POPOUT, PLATFORM, PLATFORM_FADING,
GRAB_FADE_OUT, GRAB_FADE_IN, END_LEVEL, INTRO
```

Transitions are **scattered as direct `state = STATE.X` assignments** across the
loop, the claw AI, the platform update, and the death handler. There is no
central transition table; to know what can follow `PLAYING` you must grep for
`state =`.

All mutable game state lives in **module-level `let` variables** rather than in a
container object — e.g. `player`, `claws`, `obstacles`, `score`, `lives`,
`highestStage`, `platformLevel`, `cameraX`, `hoverClaw`, `door`, plus fade/timer
scalars. `init()` (`game.js:85`) and the various `respawn*`/`initPlatformLevel`
functions reset the relevant subset by hand.

**Lives / checkpoint system.** `START_LIVES = 5`. Death spends a life
(`handleDeath()`, `game.js:153`) and respawns the player at the **start of the
highest stage reached** (`highestStage`), not the beginning of the run. Only when
lives hit zero does `GAME_OVER` appear.

### 1.4 Levels / stages

There are effectively **two kinds of stage**, and the second kind is reskinned
three times:

- **Stage 1 — the claw machine box** (`STATE.PLAYING`): a single fixed screen. The
  bunny dodges an AI claw that descends from the top; obstacles/animals sit on the
  floor. Riding a retracting claw to the ceiling "pops out" into stage 2.

- **Stages 2/3/4 — side-scrolling platformer** (`STATE.PLATFORM`): a Mario-style
  auto-extending runner with pits, floating platforms, patrolling enemies, a
  hover-claw hazard, and an exit door. **All three share the same machinery**
  (`initPlatformLevel(level)`, `updatePlatformLevel`) and differ only by a
  `platformLevel` integer (2 = rooftop, 3 = jungle, 4 = cavern) that switches the
  backdrop and the hover-claw art.

**Level data that IS already data-driven:**

- `CHUNK_PATTERNS` (`game.js:859`) — an array of 10 template objects, each
  `{ gapX, gapW, platforms: [{x,y,w,h}, …] }`. The platformer is built by picking
  a pattern per chunk with a **seeded PRNG** (`makeRng`, mulberry32), so a run is
  randomized but internally consistent. This is a good, extensible pattern.
- `PLATFORM_CLAWS` (`game.js:1253`) — `{ 2: drawRedHoverClaw, 3: drawSnakeClaw,
  4: drawBatClaw }`, a clean dispatch table mapping a level number to its claw
  renderer.

**Level data that is NOT yet data-driven** (hard-coded per level number):

- Backdrops are chosen by `if/else` on `platformLevel` inside
  `drawPlatformBackground` (rooftop/jungle/cavern each a separate function).
- Progression is hard-coded in the loop: `POPOUT → level 2`, and in `END_LEVEL`
  a chain of `if (platformLevel < 3) … else if (< 4) … else GAME_OVER`
  (`game.js:2934`). Adding a level 5 means editing this ladder.

### 1.5 Entity / object handling

There is **no entity/component system and no shared entity base**. Entities are
plain object literals grouped into a few arrays:

- **`obstacles`** — one flat array of heterogeneous box-stage objects built in
  `initObstacles()` (`game.js:221`) from a `specs` list of
  `{ kind, w, h, xFrac }`. Every object carries the **union of all fields any kind
  might need** (rolling `vx/vy/angle` for the ball, `dir/stoodOn` for the turtle,
  `pushed/driftVX/tilt/tiltVel` for push-animals, `falling`, `homeX`, …), whether
  or not that kind uses them.
- **`claws`** — box-stage AI claws (usually exactly one).
- **`hoverClaw`**, **`door`**, **`enemies`**, **`stagePlatforms`**,
  **`groundSegments`** — platform-stage objects.

Behavior is dispatched by **`kind` string comparisons scattered across many
functions**. The same set of kinds is switched on repeatedly:

- `GRABBABLE_KINDS`, `PUSH_ANIMAL_KINDS` — capability lists checked by
  `.includes(ob.kind)`.
- `updateObstacles` / `resolveObstacle` — per-kind physics via `if (ob.kind === …)`.
- `drawObstacle` (`game.js:1930`) — a **~277-line `if/else if` chain on `ob.kind`**
  that hand-draws each animal/crate/ball with raw canvas calls.

So a single logical entity ("the turtle") is spread across: a spec row, several
capability arrays, multiple physics branches, and a rendering branch — with no one
place that defines it.

Collision is uniform and reusable: the player is a **circle**, everything else is
an **axis-aligned box**, resolved by `resolveObstacle` (circle-vs-AABB, shortest-
escape push-out). Landing on top sets `grounded`; hitting a side blocks. This one
function is correctly shared by the box floor obstacles, platform segments, and
ground segments.

### 1.6 Claw AI

Two distinct claw behaviors, both hand-written state machines:

- **Box claw** (`updateClaws`, `game.js:549`): descend → home in on a target →
  close → retract, with a probabilistic (`DROP_CHANCE = 0.5`) mid-retract drop.
  Difficulty scales with survival time (`HOMING_*`, `FALL_*` grow with
  `secondsElapsed()`).
- **Hover claw** (`updateHoverClaw`, `game.js:1126`): patrols sinusoidally, then
  **swoops** in a timed arc toward the bunny's position when it comes within
  `HOVER_SWOOP_TRIGGER_RANGE`, with a cooldown. Rendering is delegated per level
  via `PLATFORM_CLAWS`.

### 1.7 Controls / input

- **Keyboard:** a global `keys` map populated by `window` `keydown`/`keyup`
  (`game.js:1828`). Arrow keys / `WASD` / Space, plus `R` to restart on game over.
- **Touch:** wired in `index.html`'s inline script — a draggable virtual joystick
  writes `keys['ArrowLeft'/'ArrowRight']`, and the JUMP button writes
  `keys['ArrowUp']`. Touch is intentionally mapped onto the **same `keys` object**
  the keyboard uses, so the rest of the game reads one input abstraction.
- Movement/jump are funnelled through **shared, level-agnostic helpers**
  (`handleInput`, `tryJump`, `applyPlayerJumpPhysics`, `game.js:1843–1887`). This
  is a genuine strength: **any new stage that calls `applyPlayerJumpPhysics()`
  inherits identical movement and jump feel for free**, with no per-stage rewiring.

### 1.8 Rendering

- Immediate-mode canvas, redrawn from scratch every frame.
- Each state branch draws its own layers (background → world/obstacles → claws →
  player → HUD → overlays).
- All sprites are procedural `ctx` drawing code. `drawObstacle` alone is ~277
  lines; the hover-claw/background/door/enemy draw functions add hundreds more.
  Rendering is by far the largest share of the file.

### 1.9 Build, tooling, tests

- **None.** No `package.json`, no bundler, no linter, no formatter, no test suite,
  no CI. Deployment is "push to `main`; GitHub Pages serves the raw files."
- This keeps the barrier to entry near zero, but means **no automated safety net**:
  every change is validated by hand in a browser, and a typo ships live.

### 1.10 Architecture at a glance

```
index.html ── loads ──▶ game.js (one global scope)
  │                        │
  ├─ CSS + layout          ├─ STATE enum ─────┐
  ├─ virtual joystick ─┐   ├─ module-level game state (player, claws, obstacles…)
  └─ JUMP button ──────┴──▶ keys{}            │
                           ├─ loop(ts): switch(state){ update+draw per state }
                           ├─ physics: resolveObstacle (circle-vs-AABB), player helpers
                           ├─ entities: obstacles[] (kind-switched), claws, hoverClaw…
                           ├─ levels: box stage │ platform stage (×3 reskins)
                           │           data: CHUNK_PATTERNS[], PLATFORM_CLAWS{}
                           └─ rendering: drawObstacle (277-line kind switch), draw* fns
```

### 1.11 What's already good

- Frame-rate-independent `dt` throughout.
- One shared collision primitive (circle-vs-AABB) reused across stages.
- Shared, level-agnostic movement/jump helpers — new levels get correct feel free.
- Two real examples of **data-driven design already in place**: `CHUNK_PATTERNS`
  (seeded, randomized, extensible) and `PLATFORM_CLAWS` (level→renderer table).
- Zero-dependency, trivially deployable, fast to load.
- Unusually thorough explanatory comments — the *why* behind tuning is documented.

---

## 2. The core problems for growth

Everything below stems from three root causes:

1. **One 3000-line global-scope file.** No modules, so no boundaries; anything can
   touch anything, and the file only grows.
2. **Entities defined by `kind` string, switched on everywhere.** Adding one NPC
   touches many far-apart `if (kind === …)` sites, and forgetting one is a silent
   bug. Entities carry every field any kind might need.
3. **Level identity is a bare integer with hard-coded branches.** Backdrop choice
   and progression are `if/else` ladders keyed on `platformLevel`; adding a level
   means editing several ladders, not adding one record.

None of this is broken — the game works well — but each new level/NPC currently
costs edits in *many* places, which is exactly the friction that makes content
expensive to add over time.

---

## 3. Recommended refactoring (incremental, low-risk)

Ordered so each step is independently shippable and testable, hardest-hitting
first. **None require a rewrite.**

### 3.1 Introduce a build/module boundary (enables everything else)

Adopt **ES modules** and a tiny dev server + bundler (Vite is the natural fit:
zero-config, fast, and produces the same static output GitHub Pages already
serves). Concretely:

- Split `game.js` into modules by concern, e.g.:
  ```
  src/
    main.js          # boot + the loop
    state.js         # STATE enum + a single game-state object
    input.js         # keys{}, keyboard + touch wiring (fold in index.html's script)
    physics.js       # resolveObstacle, player movement/jump helpers
    entities/        # per-entity definitions (see 3.3)
    levels/          # per-level data + registry (see 3.4)
    render/          # background/HUD/entity draw helpers
    claw.js          # box claw + hover claw AI
  ```
- Keep the output a static bundle → **deployment story is unchanged** (push, Pages
  serves `dist/`). Add a `package.json` with `dev`/`build` scripts.

This is the keystone: modules give you the seams every later step needs, and let
you add tests. Do this first, mechanically, changing behavior as little as possible.

### 3.2 Centralize state and transitions

- Replace the loose `let player, claws, …` globals with **one `game` state object**
  (`game.player`, `game.claws`, …). Reset functions then mutate one container.
- Give the FSM a **single transition surface**: a `setState(next)` helper and,
  ideally, a small `transitions` table describing what each state can lead to and
  what to run on entry (e.g. `POPOUT` on-complete → enter level 2). This removes
  the scattered `state = …` assignments and makes flow auditable in one place.

### 3.3 Give entities a data + behavior definition (lightweight ECS-lite)

You don't need a full ECS. Introduce an **entity-type registry** where each kind is
defined once, in one place, with the hooks it needs:

```js
// entities/registry.js
export const ENTITY_TYPES = {
  turtle: {
    size: { w: 46, h: 24 },
    grabbable: true,
    pushable: true,
    update(e, dt, ctxState) { /* turtle crawl */ },
    draw(e, ctx)            { /* turtle art */ },
  },
  ball:    { size:{w:34,h:34}, grabbable:true,  pushable:false, update, draw },
  gorilla: { size:{w:40,h:40}, grabbable:false, pushable:true,  update, draw },
  // …
};
```

Then the scattered machinery collapses:

- `GRABBABLE_KINDS` / `PUSH_ANIMAL_KINDS` become **derived** from the registry
  (`type.grabbable`, `type.pushable`) instead of separate hand-maintained lists
  that can drift out of sync.
- `updateObstacles` becomes: for each entity, call `ENTITY_TYPES[e.kind].update`.
- `drawObstacle`'s 277-line switch becomes: `ENTITY_TYPES[e.kind].draw(e, ctx)`.
- Entity instances only carry the fields their own type uses (spawn each type with
  its own initializer), instead of the current union-of-all-fields object.

**Payoff:** *adding a new NPC/object = adding one entry to the registry.* No
hunting for every `if (kind === …)` site. This directly serves the "add NPCs / add
similar content" goal.

Enemies and claws can adopt the same shape (an `enemies` type table; the hover
claw already has `PLATFORM_CLAWS` as a proto-example).

### 3.4 Make levels fully data-driven

Extend the pattern you already started with `CHUNK_PATTERNS`/`PLATFORM_CLAWS` into
a **single level registry**, so a level is *one record*, not an integer sprinkled
through `if/else` ladders:

```js
// levels/index.js
export const LEVELS = [
  { id: 'box',     type: 'clawBox',   /* box spawn spec, claw tuning */ },
  { id: 'rooftop', type: 'platform',  background: drawRooftopBg, claw: drawRedHoverClaw,
    chunkPatterns: ROOFTOP_PATTERNS, enemies: [...], next: 'jungle' },
  { id: 'jungle',  type: 'platform',  background: drawJungleBg,  claw: drawSnakeClaw,
    chunkPatterns: JUNGLE_PATTERNS,  enemies: [...], next: 'cavern' },
  { id: 'cavern',  type: 'platform',  background: drawCavernBg,  claw: drawBatClaw,
    chunkPatterns: CAVERN_PATTERNS,  enemies: [...], next: null /* = run complete */ },
];
```

- `drawPlatformBackground` becomes `currentLevel.background(...)` — no `if/else` on
  `platformLevel`.
- The `END_LEVEL` progression ladder becomes `goToLevel(currentLevel.next)` (or end
  the run when `next == null`).
- Per-level chunk pools let each stage feel distinct (jungle can have wider pits,
  cavern lower ceilings) without new code paths.

**Payoff:** *adding a level = appending one record* (a backdrop fn, a claw fn, a
chunk pool, a `next` pointer). This is the single biggest win for the stated goal
of "easy to add levels."

### 3.5 Separate update from render

Within each state, split the interleaved logic into an `update(dt)` phase and a
`draw()` phase (even if still selected by `state`). This makes it possible to, for
example, run the simulation in a test without a canvas, and keeps rendering code
from accreting physics side-effects.

### 3.6 Extract tuning constants into data

Physics/AI/level constants are already well-named but spread through the file.
Group them into a `config`/`tuning` module (or JSON). This makes balancing a
data edit, not a code hunt, and documents the game's "feel knobs" in one place.

---

## 4. Sustainable expansion directions

With the above in place, common content tasks become additive:

| Task | Today | After refactor |
|------|-------|----------------|
| Add a grabbable NPC | Edit `specs`, `GRABBABLE_KINDS`, `PUSH_ANIMAL_KINDS`, `updateObstacles`, `drawObstacle` | Add one `ENTITY_TYPES` entry |
| Add a platform level | Edit background `if/else`, `END_LEVEL` ladder, add draw fn, add claw to `PLATFORM_CLAWS`, add patterns | Append one `LEVELS` record |
| Add a new enemy type | New draw fn + new collision branch | Add one enemy type entry |
| Retune difficulty | Find constants across file | Edit `tuning` module |

Additional professional directions, roughly in priority order:

1. **Tests & CI.** Once modularized, add unit tests for the pure logic that's most
   bug-prone and least visual: `resolveObstacle` (circle-vs-AABB), the seeded RNG
   determinism, chunk generation traversability (every generated pit ≤ max jump
   reach — the code already *intends* this via `MAX_PIT_W`; a test would guarantee
   it), the FSM transition table, and `handleDeath` checkpoint logic. Wire a
   GitHub Action to run tests + a build on every PR so a broken change can't ship
   to Pages. This is the highest-leverage safety improvement given there is
   currently **no automated check at all**.

2. **Asset pipeline (optional).** All art is procedural. That's charming and keeps
   the repo asset-free, but as content grows, a per-entity `draw` in the registry
   (3.3) is the seam at which you *could* later swap to spritesheets/audio without
   touching game logic. Keep drawing procedural until it hurts; just isolate it now.

3. **Persistence.** No high score / progress is saved. A tiny `localStorage`
   wrapper (best stage reached, high score) is low-effort and expected of a
   polished web game.

4. **Content authoring format.** For non-programmer level tweaks, level records
   (4) and chunk patterns can move to JSON, and eventually a simple level-editor or
   a schema-validated data file could let content be added without touching JS.

5. **Types.** Introducing TypeScript (or JSDoc `@typedef`s) on the entity/level
   registries would make "did I fill in every field this type needs?" a
   compile-time check rather than a runtime surprise — very valuable precisely
   because content is added by filling in records.

6. **Accessibility / input polish.** The `keys`-map abstraction makes it cheap to
   add remappable controls or gamepad support later; keep new input sources writing
   into that one abstraction.

---

## 5. Suggested sequencing

1. **Modularize + Vite build** (3.1) — mechanical, behavior-preserving. Unlocks all else.
2. **Add tests + CI** for the pure logic (4.1) — lock in current behavior before changing it.
3. **Entity registry** (3.3) — collapse the `kind` switches; make NPCs additive.
4. **Level registry** (3.4) — collapse the `platformLevel` ladders; make levels additive.
5. **State container + transition table** (3.2) and **update/draw split** (3.5).
6. **Tuning module** (3.6), then optional TypeScript / persistence / asset seams.

Each step is independently valuable and shippable, so the game stays live and
playable throughout — no big-bang rewrite, and every step makes the *next* piece
of content cheaper to add.
