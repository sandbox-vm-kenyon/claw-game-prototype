import { describe, it, expect } from 'vitest';
import { resolveObstacle } from '../src/physics.js';

// resolveObstacle is the one shared collision primitive (circle player vs.
// axis-aligned box), reused across every stage — the highest-leverage thing to
// pin down with tests.

function box(x, y, w, h, kind = 'block') {
  return { x, y, w, h, kind };
}

describe('resolveObstacle (circle-vs-AABB)', () => {
  it('does nothing when the circle does not overlap the box', () => {
    const p = { x: 0, y: 0, r: 10, vx: 0, vy: 0, grounded: false };
    resolveObstacle(p, box(100, 100, 20, 20));
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.grounded).toBe(false);
  });

  it('landing on top pushes up and out and marks grounded', () => {
    // Player centered above the box top edge, sinking in by 4px.
    const ob = box(0, 100, 40, 40);
    const p = { x: 20, y: 100 + 10 - 4, r: 10, vx: 0, vy: 0, grounded: false };
    resolveObstacle(p, ob);
    // Pushed back up so its bottom rests on the box top (y = top - r).
    expect(p.y).toBeCloseTo(100 - 10, 5);
    expect(p.grounded).toBe(true);
  });

  it('hitting a side blocks horizontally without grounding', () => {
    // Player overlapping the LEFT edge of the box from the left side.
    const ob = box(100, 0, 40, 40);
    const p = { x: 100 - 10 + 4, y: 20, r: 10, vx: 0, vy: 0, grounded: false };
    resolveObstacle(p, ob);
    // Pushed left so it no longer overlaps; not grounded (side hit).
    expect(p.x).toBeLessThan(100);
    expect(p.grounded).toBe(false);
  });

  it('resolves a deep center-inside overlap out the nearest edge', () => {
    const ob = box(0, 0, 100, 100);
    // Center inside, nearest to the top edge.
    const p = { x: 50, y: 10, r: 10, vx: 0, vy: 0, grounded: false };
    resolveObstacle(p, ob);
    expect(p.y).toBeCloseTo(0 - 10, 5); // ejected out the top
    expect(p.grounded).toBe(true);
  });
});
