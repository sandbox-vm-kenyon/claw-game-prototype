import { describe, it, expect } from 'vitest';
import {
  ENTITY_TYPES,
  OBSTACLE_SPAWN_ORDER,
  GRABBABLE_KINDS,
  PUSH_ANIMAL_KINDS,
} from '../src/entities/registry.js';

describe('entity-type registry', () => {
  it('defines every spawned kind with a size and capabilities', () => {
    for (const kind of OBSTACLE_SPAWN_ORDER) {
      const t = ENTITY_TYPES[kind];
      expect(t, `type ${kind}`).toBeDefined();
      expect(typeof t.size.w).toBe('number');
      expect(typeof t.size.h).toBe('number');
      expect(typeof t.grabbable).toBe('boolean');
      expect(typeof t.pushable).toBe('boolean');
    }
  });

  it('derives GRABBABLE_KINDS from the registry (preserving the original set)', () => {
    expect([...GRABBABLE_KINDS].sort()).toEqual(
      ['turtle', 'block', 'ball', 'hamster', 'walrus', 'dolphin'].sort(),
    );
    for (const k of GRABBABLE_KINDS) expect(ENTITY_TYPES[k].grabbable).toBe(true);
  });

  it('derives PUSH_ANIMAL_KINDS from the registry (preserving the original set)', () => {
    expect([...PUSH_ANIMAL_KINDS].sort()).toEqual(
      ['turtle', 'hamster', 'gorilla', 'walrus', 'giraffe', 'bear', 'dolphin', 'shark'].sort(),
    );
    for (const k of PUSH_ANIMAL_KINDS) expect(ENTITY_TYPES[k].pushable).toBe(true);
  });
});
