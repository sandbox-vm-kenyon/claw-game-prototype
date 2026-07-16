import { describe, it, expect } from 'vitest';
import { game } from '../src/state.js';
import { updateObstacles } from '../src/entities/obstacles.js';
import { PUSH_MAX_TILT, PUSH_SLIDE_SPEED, FLOOR_Y } from '../src/tuning.js';
import { W } from '../src/core.js';

// A pushable animal, fully rocked over (tilt at its cap) and flagged as pushed +
// sliding in a given direction, as resolveObstacle sets it up once the rock
// reaches full tilt.
function slidingAnimal(dir, x) {
  return {
    kind: 'bear', // a pushable animal kind
    x, y: FLOOR_Y - 40, w: 40, h: 40,
    vx: 0, vy: 0, angle: 0, dir: 1,
    stoodOn: false, touching: false, wasTouching: false, falling: false,
    homeX: x, pushed: true, driftVX: 0,
    tilt: PUSH_MAX_TILT * dir, tiltVel: 0, sliding: dir,
  };
}

describe('push-and-slide animal physics', () => {
  it('a fully-rocked pushed animal slides in the push direction', () => {
    const a = slidingAnimal(1, 100);
    game.obstacles = [a];
    const startX = a.x;
    updateObstacles(1);
    expect(a.x).toBeGreaterThan(startX);
    expect(a.x - startX).toBeCloseTo(PUSH_SLIDE_SPEED, 5);
    expect(a.sliding).toBe(1); // still sliding, nothing in the way
  });

  it('the slide stops flush when it collides with another obstacle', () => {
    const a = slidingAnimal(1, 100);
    // A blocker whose left edge is only a hair to the right of the slider.
    const blocker = { kind: 'block', x: 100 + 40 + 0.2, y: FLOOR_Y - 40, w: 40, h: 40 };
    game.obstacles = [a, blocker];
    updateObstacles(1);
    // Comes to rest flush against the blocker's left edge, and stops sliding.
    expect(a.x + a.w).toBeCloseTo(blocker.x, 5);
    expect(a.sliding).toBe(0);
  });

  it('the slide stops at the box wall', () => {
    // Right at the right wall, sliding right — can't move any further.
    const a = slidingAnimal(1, W - 40);
    game.obstacles = [a];
    updateObstacles(1);
    expect(a.x).toBeCloseTo(W - 40, 5); // stayed flush at the wall
    expect(a.sliding).toBe(0);          // halted
  });

  it('an animal no longer being pushed stops sliding', () => {
    const a = slidingAnimal(1, 100);
    a.pushed = false;
    game.obstacles = [a];
    updateObstacles(1);
    expect(a.sliding).toBe(0);
  });
});
