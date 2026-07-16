// ─── Entity-type registry (ECS-lite) ────────────────────────────────────────
//
// Every box-stage obstacle "kind" is defined ONCE here, instead of being spread
// across a spawn spec, two capability arrays (`GRABBABLE_KINDS` /
// `PUSH_ANIMAL_KINDS`), several physics branches and a 277-line draw switch.
// The scattered machinery now derives from this table:
//
//   • GRABBABLE_KINDS / PUSH_ANIMAL_KINDS  -> derived (see tuning.js)
//   • obstacle sizes + spawn layout        -> read from `size` / `xFrac` here
//   • per-kind rendering                    -> `draw` (render/obstacles.js KIND_DRAW)
//
// Adding a new grabbable NPC/object is therefore additive: register one entry
// here (and, if it needs bespoke art, one draw fn) — no hunting for every
// `if (kind === …)` site.
//
// Behavior note: this is a metadata/definition registry. The actual per-kind
// physics still lives in entities/obstacles.js (updateObstacles) and the art in
// render/obstacles.js; those are wired to these definitions so behavior is
// byte-for-byte identical to the pre-refactor game. The `draw` field is filled
// in by render/obstacles.js via registerEntityDraw() to avoid a render→registry
// import cycle.

// The box-stage roster, in left-to-right spawn order. `xFrac` is the fraction
// of the box width the entity's center sits at. `size` is its collision box.
// `grabbable`: the claw can grab & haul it off. `pushable`: it rocks/drifts when
// the player pushes into it from the side.
export const ENTITY_TYPES = {
  turtle:  { size: { w: 46, h: 24 }, xFrac: 0.07, grabbable: true,  pushable: true  },
  hamster: { size: { w: 30, h: 24 }, xFrac: 0.17, grabbable: true,  pushable: true  },
  block:   { size: { w: 32, h: 32 }, xFrac: 0.27, grabbable: true,  pushable: false },
  gorilla: { size: { w: 40, h: 40 }, xFrac: 0.37, grabbable: false, pushable: true  },
  ball:    { size: { w: 34, h: 34 }, xFrac: 0.47, grabbable: true,  pushable: false },
  walrus:  { size: { w: 46, h: 32 }, xFrac: 0.57, grabbable: true,  pushable: true  },
  giraffe: { size: { w: 34, h: 52 }, xFrac: 0.66, grabbable: false, pushable: true  },
  bear:    { size: { w: 36, h: 38 }, xFrac: 0.76, grabbable: false, pushable: true  },
  dolphin: { size: { w: 48, h: 30 }, xFrac: 0.86, grabbable: true,  pushable: true  },
  shark:   { size: { w: 48, h: 30 }, xFrac: 0.95, grabbable: false, pushable: true  },
};

// Ordered list of the box-stage entities to spawn (the original spawn order).
export const OBSTACLE_SPAWN_ORDER = Object.keys(ENTITY_TYPES);

// Capability lists, DERIVED from the registry so they can never drift out of
// sync with it (they used to be hand-maintained arrays).
export const GRABBABLE_KINDS = OBSTACLE_SPAWN_ORDER.filter(k => ENTITY_TYPES[k].grabbable);
export const PUSH_ANIMAL_KINDS = OBSTACLE_SPAWN_ORDER.filter(k => ENTITY_TYPES[k].pushable);

// render/obstacles.js registers each kind's draw fn here at import time; kept as
// a late binding so the registry has no dependency on the render layer.
export function registerEntityDraw(kind, drawFn) {
  if (ENTITY_TYPES[kind]) ENTITY_TYPES[kind].draw = drawFn;
}
