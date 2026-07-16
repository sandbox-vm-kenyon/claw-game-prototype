import { STATE, game } from './state.js';
import { resolveClawBodies, spawnClaw, touchesCeiling, updateClaws } from './claw.js';
import { H, W, btnPlayAgain, ctx } from './core.js';
import { initObstacles, updateObstacles } from './entities/obstacles.js';
import { initPlatformLevel, updatePlatformLevel } from './levels/platform.js';
import { LEVELS } from './levels/registry.js';
import { resolveObstacles, updatePlayerPhysics } from './physics.js';
import { drawBackground, drawPlatformBackground } from './render/background.js';
import { drawClaws } from './render/claws.js';
import { drawFadeOverlay, drawGameOver, drawHUD, drawPlatformHUD } from './render/hud.js';
import { drawClawMashineLogo, drawIntro, startIntro } from './render/intro.js';
import { drawObstacles } from './render/obstacles.js';
import { drawPlayer } from './render/player.js';
import { drawPlatformWorld } from './render/world.js';
import { DOOR_FADE_DURATION, LOGO_START_Y, MOVE_SPEED, POPOUT_DURATION, POPOUT_RISE, SPAWN_INTERVAL, START_LIVES } from './tuning.js';

export function init() {
  // Fresh game start / Play Again: refill the life pool and reset the
  // highest-reached checkpoint back to stage 1 (the box level).
  game.lives = START_LIVES;
  game.highestStage = 1;

  game.state = STATE.PLAYING;
  game.fadeAlpha = 0;
  game.gameOverAlpha = 0;
  game.fadeSpeed = 0.018;
  game.score = 0;
  game.runStartTime = performance.now();

  game.grabFadeAlpha = 0;
  game.grabFadeClaw = null;

  game.logoY = LOGO_START_Y;

  if (btnPlayAgain) btnPlayAgain.classList.remove('visible');

  game.player = {
    x: W / 2,
    y: H - 14,   // start standing on the ground
    r: 14,
    speed: MOVE_SPEED,
    vx: 0,
    vy: 0,
    grounded: false,
  };

  game.claws = [];
  spawnClaw();

  initObstacles();
}

// Reset just the box/claw-machine stage (stage 1) to its opening layout,
// WITHOUT touching the run-wide lives/score/highest-stage bookkeeping — used
// to respawn the player at the start of stage 1 after a death when stage 1 is
// still the highest stage they've reached.

export function respawnBoxStage() {
  game.state = STATE.PLAYING;
  game.fadeAlpha = 0;
  game.fadeSpeed = 0.018;

  game.grabFadeAlpha = 0;
  game.grabFadeClaw = null;

  game.player = {
    x: W / 2,
    y: H - 14,   // start standing on the ground
    r: 14,
    speed: MOVE_SPEED,
    vx: 0,
    vy: 0,
    grounded: false,
  };

  game.claws = [];
  spawnClaw();

  initObstacles();
}

// Central death handler: spend a life and either respawn at the start of the
// highest stage reached, or — once no lives remain — proceed to the real
// game-over screen. Called the moment a fatal fade-to-black completes so the
// player briefly sees the death animation before respawning.

export function handleDeath() {
  game.lives--;
  if (game.lives > 0) {
    // Respawn at the beginning of the highest stage reached so far.
    if (game.highestStage >= 2) {
      initPlatformLevel();
      game.state = STATE.PLATFORM;
    } else {
      respawnBoxStage();
    }
  } else {
    // Out of lives — this is a real game over.
    game.state = STATE.GAME_OVER;
    game.gameOverAlpha = 0;
  }
}

// ─── Obstacles (other animals/objects in the box) ─────────────────────────
// Static bodies the bunny can jump on top of (platforms) or must jump over
// (obstacles). Collision is resolved as a circle (player) vs. axis-aligned
// box (obstacle), so this works the same whether the bunny approaches from
// the side (blocked → jump over) or lands from above (supported → jump on).

let lastTime = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3); // ~60 fps units
  lastTime = ts;
  game.frame++;

  // Launch intro plays before anything else and draws its own backdrop.
  if (game.state === STATE.INTRO) {
    drawIntro(dt);
    requestAnimationFrame(loop);
    return;
  }

  drawBackground();

  if (game.state === STATE.PLAYING) {
    // While a claw is actively hauling the bunny up in its jaws, she's fully
    // caught — freeze her own movement/physics (same idea as freezing the
    // player during FADING) so the claw's retract is the only thing moving
    // her, instead of gravity/input fighting the carry each frame.
    const grabbedBefore = game.claws.some(c => c.grabbing && c.grabbedIsPlayer);
    if (!grabbedBefore) {
      updatePlayerPhysics(dt);
      resolveObstacles();
      resolveClawBodies();
    }
    updateObstacles(dt);
    updateClaws(dt);

    // Spawn a new claw only once the current one is gone, so only one
    // claw is ever active in the game at a time.
    if (game.claws.length === 0) {
      game.spawnTimer++;
      if (game.spawnTimer >= SPAWN_INTERVAL) {
        game.spawnTimer = 0;
        spawnClaw();
        game.score++;
      }
    } else {
      game.spawnTimer = 0;
    }

    // Draw scene
    drawObstacles();
    drawClaws();
    drawPlayer(game.player);
    drawHUD();
    drawClawMashineLogo(dt);

    // Merely touching the claw's fingers is no longer fatal on its own — the
    // bunny only dies if she's actually grabbed (see playerGrabAligned in
    // updateClaws) and the claw hauls her all the way up to a full retract
    // without rolling a drop (state = FADING is set there once that
    // carry-to-the-top completes). Riding a retracting claw all the way up
    // to the ceiling instead pops the bunny out of the top of the machine
    // into the platform level. Skipped while a claw just grabbed the bunny
    // this same frame (updateClaws may have already set state = FADING
    // itself once that grab's retract completes) — the ceiling check would
    // otherwise misfire the instant she's hauled up near the top.
    const grabbedNow = game.claws.some(c => c.grabbing && c.grabbedIsPlayer);
    if (!grabbedNow && touchesCeiling()) {
      game.state = STATE.POPOUT;
      game.popoutStartY = game.player.y;
      game.popoutElapsed = 0;
    }

  } else if (game.state === STATE.GRAB_FADE_OUT) {
    // Scene stays visible underneath the fade — the claw and its catch sink
    // into black together.
    drawObstacles();
    drawClaws();
    drawPlayer(game.player);
    drawHUD();

    game.grabFadeAlpha = Math.min(1, game.grabFadeAlpha + game.fadeSpeed);
    ctx.fillStyle = `rgba(0,0,0,${game.grabFadeAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (game.grabFadeAlpha >= 1) {
      // The item is gone for good — let go of it so only the empty claw
      // fades back in.
      game.grabFadeClaw.grabbing = false;
      game.grabFadeClaw.grabbedObstacle = null;
      game.state = STATE.GRAB_FADE_IN;
    }

  } else if (game.state === STATE.GRAB_FADE_IN) {
    // Fade back in on the same scene, minus the item the claw just made off
    // with.
    drawObstacles();
    drawClaws();
    drawPlayer(game.player);
    drawHUD();

    game.grabFadeAlpha = Math.max(0, game.grabFadeAlpha - game.fadeSpeed);
    ctx.fillStyle = `rgba(0,0,0,${game.grabFadeAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (game.grabFadeAlpha <= 0) {
      // The claw's done its job — let it finish leaving the scene like any
      // other fully-retracted claw, and resume normal play.
      game.claws = game.claws.filter(c => c !== game.grabFadeClaw);
      game.grabFadeClaw = null;
      game.state = STATE.PLAYING;
    }

  } else if (game.state === STATE.POPOUT) {
    // Scene stays visible underneath the pop-out flash while the player
    // launches further upward and out of frame.
    drawObstacles();
    drawClaws();

    game.popoutElapsed = Math.min(game.popoutElapsed + dt, POPOUT_DURATION);
    const progress = game.popoutElapsed / POPOUT_DURATION;
    game.player.y = game.popoutStartY - progress * POPOUT_RISE;

    drawPlayer(game.player);
    drawHUD();

    // Bright flash (contrasted with the fade-to-black on death) sells the
    // "pop" of bursting out through the top of the machine.
    ctx.fillStyle = `rgba(255,255,255,${progress * 0.9})`;
    ctx.fillRect(0, 0, W, H);

    if (progress >= 1) {
      // Reaching the rooftop unlocks stage 2 as the new respawn checkpoint.
      game.highestStage = 2;
      initPlatformLevel(2);
      game.state = STATE.PLATFORM;
    }

  } else if (game.state === STATE.PLATFORM) {
    updatePlatformLevel(dt);

    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

  } else if (game.state === STATE.END_LEVEL) {
    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

    // Fade to white on door touch to indicate level complete
    game.doorTouchElapsed = Math.min(game.doorTouchElapsed + dt, DOOR_FADE_DURATION);
    const doorProgress = game.doorTouchElapsed / DOOR_FADE_DURATION;
    ctx.fillStyle = `rgba(255,255,255,${doorProgress * 0.8})`;
    ctx.fillRect(0, 0, W, H);

    if (doorProgress >= 1) {
      // Progression is data-driven: each level record names the level it leads
      // to (`next`), so clearing a stage just advances to LEVELS[current].next —
      // or, when `next` is null, ends the run. Adding a level no longer means
      // editing an if/else ladder here; it means appending a registry record.
      const current = LEVELS[game.platformLevel];
      const next = current ? current.next : null;
      if (next != null) {
        game.highestStage = next;
        initPlatformLevel(next);
        game.state = STATE.PLATFORM;
      } else {
        // Final level cleared — the run is complete.
        game.state = STATE.GAME_OVER;
        game.gameOverAlpha = 0;
      }
    }

  } else if (game.state === STATE.PLATFORM_FADING) {
    drawPlatformBackground();
    drawPlatformWorld();
    drawPlatformHUD();

    game.fadeAlpha = Math.min(1, game.fadeAlpha + game.fadeSpeed);
    drawFadeOverlay();

    if (game.fadeAlpha >= 1) {
      // Spend a life and respawn at the highest-reached stage, or game over.
      handleDeath();
    }

  } else if (game.state === STATE.FADING) {
    // Scene stays visible underneath fade
    drawObstacles();
    drawClaws();
    drawPlayer(game.player);
    drawHUD();

    // Advance fade
    game.fadeAlpha = Math.min(1, game.fadeAlpha + game.fadeSpeed);
    drawFadeOverlay();

    // Once fully black, spend a life and respawn at the highest-reached
    // stage — or, if this was the last life, proceed to the game-over screen.
    if (game.fadeAlpha >= 1) {
      handleDeath();
    }

  } else if (game.state === STATE.GAME_OVER) {
    // Keep it fully black underneath
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Fade in the game over text
    game.gameOverAlpha = Math.min(1, game.gameOverAlpha + 0.025);
    drawGameOver();

    // Reveal the Play Again button once the game-over text has fully faded in
    if (game.gameOverAlpha >= 1 && btnPlayAgain) btnPlayAgain.classList.add('visible');
  }

  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
//
// Guarded so importing this module graph in a non-browser test environment
// doesn't kick off the render loop (there's no requestAnimationFrame there).
// In the browser this runs exactly as before.
if (typeof requestAnimationFrame !== 'undefined') {
  startIntro();
  requestAnimationFrame(loop);
}
