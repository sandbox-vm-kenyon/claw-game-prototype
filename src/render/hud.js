import { game } from '../state.js';
import { H, W, ctx } from '../core.js';

export function drawPlatformHUD() {
  const cavern = game.platformLevel >= 4;
  const jungle = game.platformLevel === 3;
  const dark = cavern || jungle;  // both use light-on-dark HUD text
  const primary = cavern ? '#e8e0ff' : jungle ? '#e8ffe8' : '#2a2a2a';
  const secondary = cavern ? '#c9b8ff' : jungle ? '#bff0bf' : '#3a3a3a';
  ctx.fillStyle = primary;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${game.score}`, 12, 24);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = secondary;
  const label = cavern ? 'LEVEL 4 — CAVERN!' : jungle ? 'LEVEL 3 — JUNGLE!' : 'OUT OF THE MACHINE!';
  ctx.fillText(label, 12, 44);
  drawLives(dark ? primary : '#2a2a2a');
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function drawHUD() {
  ctx.fillStyle = '#4af';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${game.score}`, 12, 24);
  drawLives('#4af');
}

// Remaining-lives readout, shown top-right in both stages. Rendered as a row
// of heart glyphs (filled = remaining, hollow = spent) so the count is legible
// at a glance.

function drawLives(color) {
  ctx.save();
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  const hearts = '\u2665 '.repeat(Math.max(0, game.lives)).trim();
  ctx.fillStyle = color;
  ctx.fillText(`LIVES  ${hearts}`, W - 12, 24);
  ctx.restore();
}

// ─── Fade to Black ────────────────────────────────────────────────────────────

export function drawFadeOverlay() {
  ctx.fillStyle = `rgba(0,0,0,${game.fadeAlpha})`;
  ctx.fillRect(0, 0, W, H);
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────

export function drawGameOver() {
  // After fade is complete, reveal game over text by fading it in
  ctx.globalAlpha = game.gameOverAlpha;

  // "GAME OVER" heading
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px monospace';
  ctx.fillStyle = '#e44';
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 24;
  ctx.fillText('GAME OVER', W / 2, H / 2 - 40);

  ctx.shadowBlur = 0;

  // Score line
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`Score: ${game.score}`, W / 2, H / 2 + 12);

  // Restart prompt
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
  ctx.globalAlpha = game.gameOverAlpha * pulse;
  ctx.font = '16px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText('Press  R  to restart', W / 2, H / 2 + 56);

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ─── Launch intro: UFO strikes the machine with purple lightning ────────────
// Shown once at game launch (STATE.INTRO), before normal play begins. A flying
// saucer swoops in from the top of the screen, dives down onto the claw machine
// cabinet, and blasts it with a jagged purple lightning bolt on impact. After a
// short flash the intro hands off to STATE.PLAYING and the game starts.
