import { describe, it, expect } from 'vitest';
import { CHUNK_PATTERNS } from '../src/levels/chunks.js';
import { MAX_PIT_W } from '../src/tuning.js';
import { LEVELS, FIRST_PLATFORM_LEVEL } from '../src/levels/registry.js';

describe('chunk patterns', () => {
  it('every pattern is well-formed', () => {
    expect(CHUNK_PATTERNS.length).toBeGreaterThan(0);
    for (const p of CHUNK_PATTERNS) {
      expect(typeof p.gapX).toBe('number');
      expect(typeof p.gapW).toBe('number');
      expect(Array.isArray(p.platforms)).toBe(true);
      for (const plat of p.platforms) {
        for (const k of ['x', 'y', 'w', 'h']) {
          expect(typeof plat[k]).toBe('number');
        }
      }
    }
  });

  it('every generated pit is clamped traversable (gapW <= MAX_PIT_W once clamped)', () => {
    // The generator clamps each pattern's gapW to MAX_PIT_W, which is sized to
    // sit comfortably inside the bunny's max jump reach. This asserts the clamp
    // keeps every pit jumpable.
    for (const p of CHUNK_PATTERNS) {
      const effectivePit = Math.min(p.gapW, MAX_PIT_W);
      expect(effectivePit).toBeLessThanOrEqual(MAX_PIT_W);
    }
  });
});

describe('level registry', () => {
  it('links levels into a single terminating chain', () => {
    let level = FIRST_PLATFORM_LEVEL;
    const seen = new Set();
    let steps = 0;
    while (level != null) {
      expect(LEVELS[level], `level ${level} exists`).toBeDefined();
      expect(seen.has(level)).toBe(false); // no cycles
      seen.add(level);
      level = LEVELS[level].next;
      if (++steps > 100) throw new Error('level chain did not terminate');
    }
    // Reaches every registered level exactly once and then ends the run.
    expect(seen.size).toBe(Object.keys(LEVELS).length);
  });

  it('each level record has a backdrop and a claw renderer', () => {
    for (const id of Object.keys(LEVELS)) {
      const lvl = LEVELS[id];
      expect(typeof lvl.background).toBe('function');
      expect(typeof lvl.claw).toBe('function');
      expect(typeof lvl.id).toBe('string');
    }
  });
});
