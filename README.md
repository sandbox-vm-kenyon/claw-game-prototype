# Claw Machine

A procedural HTML5 canvas game. **Play here:** https://sandbox-vm-kenyon.github.io/claw-game-prototype/

## Development

The game is built with [Vite](https://vitejs.dev/) from ES modules under `src/`.

```bash
npm install     # install dev dependencies
npm run dev     # local dev server with hot reload
npm test        # run the unit tests (Vitest)
npm run build   # produce the static bundle in dist/
npm run preview # serve the built bundle locally
```

GitHub Pages serves the built `dist/` bundle, deployed automatically from `main`
by `.github/workflows/deploy.yml`. Tests + a build run on every push and PR
(`.github/workflows/ci.yml`).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design write-up. In short,
the code is split by concern:

```
src/
  main.js            boot + the game loop
  state.js           STATE enum, the single `game` state object, FSM transitions
  input.js           keyboard + on-screen touch controls (one shared `keys` map)
  physics.js         circle-vs-AABB collision, player movement, ear-fold logic
  rng.js             seeded PRNG (mulberry32)
  tuning.js          all physics / AI / level tuning constants
  claw.js            box-claw + hover-claw AI
  entities/
    registry.js      entity-type registry — each kind defined once (size,
                     grabbable, pushable, draw); capability lists derived from it
    obstacles.js     box-stage entity spawn + per-kind physics
  levels/
    chunks.js        randomized platformer chunk patterns
    platform.js      platform-stage init / update / chunk generation
    registry.js      level registry — one record per level (backdrop, claw, next)
  render/            background / world / HUD / player / obstacle / claw / intro art
```

Adding a grabbable NPC is one entry in `entities/registry.js`; adding a level is
one record in `levels/registry.js`.
