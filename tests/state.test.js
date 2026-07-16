import { describe, it, expect } from 'vitest';
import { STATE, STATE_NAME, TRANSITIONS, setState, game } from '../src/state.js';

describe('FSM state enum + transition table', () => {
  it('has a unique integer per named state', () => {
    const values = Object.values(STATE);
    expect(new Set(values).size).toBe(values.length);
  });

  it('STATE_NAME is the inverse of STATE', () => {
    for (const [name, val] of Object.entries(STATE)) {
      expect(STATE_NAME[val]).toBe(name);
    }
  });

  it('every transition target is a real state', () => {
    const valid = new Set(Object.values(STATE));
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      expect(valid.has(Number(from))).toBe(true);
      for (const t of targets) expect(valid.has(t)).toBe(true);
    }
  });

  it('setState updates the shared game state', () => {
    setState(STATE.PLATFORM);
    expect(game.state).toBe(STATE.PLATFORM);
    setState(STATE.PLAYING);
    expect(game.state).toBe(STATE.PLAYING);
  });
});
