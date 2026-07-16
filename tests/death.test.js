import { describe, it, expect, beforeEach } from 'vitest';
import { game, STATE } from '../src/state.js';
import { handleDeath } from '../src/main.js';

// handleDeath is the checkpoint/lives logic: dying spends a life and respawns at
// the start of the highest stage reached, and only a zero-life death ends the
// run. This exercises that branch logic without a canvas.

describe('handleDeath (lives + checkpoint)', () => {
  beforeEach(() => {
    game.lives = 5;
    game.highestStage = 1;
    game.state = STATE.FADING;
  });

  it('spends a life on death', () => {
    game.lives = 3;
    handleDeath();
    expect(game.lives).toBe(2);
  });

  it('with lives left on stage 1, respawns into the box stage (PLAYING)', () => {
    game.highestStage = 1;
    handleDeath();
    expect(game.state).toBe(STATE.PLAYING);
    expect(game.lives).toBe(4);
  });

  it('with lives left past stage 1, respawns into the platform stage', () => {
    game.highestStage = 3;
    handleDeath();
    expect(game.state).toBe(STATE.PLATFORM);
  });

  it('on the last life, a death ends the run (GAME_OVER)', () => {
    game.lives = 1;
    handleDeath();
    expect(game.lives).toBe(0);
    expect(game.state).toBe(STATE.GAME_OVER);
    expect(game.gameOverAlpha).toBe(0);
  });
});
