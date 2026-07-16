import { game } from '../state.js';
import { clawTipLeft, clawTipRight, clawTipY } from '../claw.js';
import { ctx } from '../core.js';
import { drawObstacle } from './obstacles.js';
import { LEVELS } from '../levels/registry.js';

export function drawHoverClaw(c) {
  // The per-level hover-claw art lives in the level registry (LEVELS[n].claw),
  // which replaced the old standalone PLATFORM_CLAWS table so each level's
  // backdrop and claw are defined together in one record.
  const level = LEVELS[game.platformLevel];
  const render = (level && level.claw) || drawRedHoverClaw;
  render(c);
}

// Level-2 (rooftop) hover claw — the default mechanical red claw.

export function drawRedHoverClaw(c) {
  // Body block — floats freely with no cable/arm running up off the top of
  // the screen, unlike the box's claw.
  ctx.fillStyle = '#c33';
  ctx.fillRect(c.x - 14, c.y - 14, 28, 18);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 14, c.y - 14, 28, 18);

  const tipY = c.y + c.armLen;

  ctx.strokeStyle = '#e44';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipLeft(c), tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(clawTipRight(c), tipY); ctx.stroke();

  ctx.fillStyle = '#f88';
  ctx.beginPath(); ctx.arc(clawTipLeft(c),  tipY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(clawTipRight(c), tipY, 4, 0, Math.PI * 2); ctx.fill();
}

// Level-3 hazard drawn as a snake instead of the mechanical claw. It occupies
// exactly the same geometry the claw does — a head at (c.x, c.y) with the two
// harmful jaw tips at clawTipLeft/Right(c) and y = c.y + c.armLen — so the
// existing collision (checkHoverClawCollision) is unchanged; only the look
// differs. The snake's body coils up above the head (in place of the claw's
// body block) and its two open fangs sit right where the claw's jaw tips are.

export function drawSnakeClaw(c) {
  const tipY = c.y + c.armLen;
  const wriggle = Math.sin(Date.now() / 180) * 5;

  // Coiled green body rising up above the head, in place of the claw's block.
  ctx.strokeStyle = '#2f9e44';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x + wriggle, c.y - 40);
  ctx.quadraticCurveTo(c.x - 12 + wriggle, c.y - 26, c.x + 6, c.y - 14);
  ctx.quadraticCurveTo(c.x + 16, c.y - 6, c.x, c.y);
  ctx.stroke();
  // Belly highlight along the body.
  ctx.strokeStyle = '#69db7c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x + wriggle, c.y - 40);
  ctx.quadraticCurveTo(c.x - 12 + wriggle, c.y - 26, c.x + 6, c.y - 14);
  ctx.quadraticCurveTo(c.x + 16, c.y - 6, c.x, c.y);
  ctx.stroke();

  // Snake head (an ellipse) centered where the claw body sat.
  ctx.fillStyle = '#37b24d';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b8a3e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes.
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(c.x - 5, c.y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 5, c.y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(c.x - 5, c.y - 3, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 5, c.y - 3, 1.2, 0, Math.PI * 2); ctx.fill();

  // Two fangs striking down to exactly the jaw-tip hit points.
  const left = clawTipLeft(c), right = clawTipRight(c);
  ctx.strokeStyle = '#2b8a3e';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(c.x - 4, c.y + 6); ctx.lineTo(left, tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x + 4, c.y + 6); ctx.lineTo(right, tipY); ctx.stroke();
  ctx.fillStyle = '#f8f9fa';
  ctx.beginPath(); ctx.arc(left, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(right, tipY, 3.5, 0, Math.PI * 2); ctx.fill();

  // Flicking forked tongue between the fangs.
  const tongueLen = 8 + Math.sin(Date.now() / 120) * 3;
  ctx.strokeStyle = '#e03131';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 8);
  ctx.lineTo(c.x, c.y + 8 + tongueLen);
  ctx.moveTo(c.x, c.y + 8 + tongueLen);
  ctx.lineTo(c.x - 3, c.y + 12 + tongueLen);
  ctx.moveTo(c.x, c.y + 8 + tongueLen);
  ctx.lineTo(c.x + 3, c.y + 12 + tongueLen);
  ctx.stroke();
}

// Level-4 hazard drawn as a bat instead of the mechanical claw. Like the snake
// claw it occupies exactly the same geometry the claw does — a body at
// (c.x, c.y) with the two harmful clawed feet at clawTipLeft/Right(c) and
// y = c.y + c.armLen — so the existing collision (checkHoverClawCollision) is
// unchanged; only the look differs. Flapping membranous wings spread out from
// the furry body, and the two grabbing talons hang down to the jaw-tip points.

export function drawBatClaw(c) {
  const tipY = c.y + c.armLen;
  const flap = Math.sin(Date.now() / 120) * 8;   // wing beat

  // Two membranous wings sweeping out from the body, flapping up and down.
  ctx.fillStyle = '#3b2a4a';
  ctx.strokeStyle = '#5a4570';
  ctx.lineWidth = 1.5;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c.x + dir * 6, c.y - 2);
    // outer wing tip, rising/falling with the flap
    ctx.quadraticCurveTo(c.x + dir * 26, c.y - 16 - flap, c.x + dir * 34, c.y - 4 - flap);
    // scalloped trailing edge back toward the body
    ctx.quadraticCurveTo(c.x + dir * 26, c.y - 2 - flap * 0.4, c.x + dir * 22, c.y + 6);
    ctx.quadraticCurveTo(c.x + dir * 16, c.y + 2, c.x + dir * 12, c.y + 8);
    ctx.quadraticCurveTo(c.x + dir * 9, c.y + 3, c.x + dir * 6, c.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Furry round body where the claw block sat.
  ctx.fillStyle = '#4a3560';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e2040';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Two pointed ears on top.
  ctx.fillStyle = '#4a3560';
  ctx.beginPath();
  ctx.moveTo(c.x - 8, c.y - 8); ctx.lineTo(c.x - 11, c.y - 18); ctx.lineTo(c.x - 3, c.y - 11);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c.x + 8, c.y - 8); ctx.lineTo(c.x + 11, c.y - 18); ctx.lineTo(c.x + 3, c.y - 11);
  ctx.closePath(); ctx.fill();

  // Glowing eyes.
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath(); ctx.arc(c.x - 4, c.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 4, c.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(c.x - 4, c.y - 2, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 4, c.y - 2, 1, 0, Math.PI * 2); ctx.fill();

  // Two little fangs under the snout.
  ctx.fillStyle = '#f8f9fa';
  ctx.beginPath();
  ctx.moveTo(c.x - 3, c.y + 6); ctx.lineTo(c.x - 1.5, c.y + 10); ctx.lineTo(c.x, c.y + 6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c.x + 3, c.y + 6); ctx.lineTo(c.x + 1.5, c.y + 10); ctx.lineTo(c.x, c.y + 6);
  ctx.closePath(); ctx.fill();

  // Two grabbing talons reaching down to exactly the jaw-tip hit points.
  const left = clawTipLeft(c), right = clawTipRight(c);
  ctx.strokeStyle = '#2e2040';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x - 4, c.y + 8); ctx.lineTo(left, tipY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x + 4, c.y + 8); ctx.lineTo(right, tipY); ctx.stroke();
  // Curved claws at the tips.
  ctx.fillStyle = '#1b1329';
  ctx.beginPath(); ctx.arc(left, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(right, tipY, 3.5, 0, Math.PI * 2); ctx.fill();
}

function drawClaw(c) {
  // Arm / cable
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x, 0);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();

  // Body block
  ctx.fillStyle = '#c33';
  ctx.fillRect(c.x - 14, c.y - 14, 28, 18);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 14, c.y - 14, 28, 18);

  const tipY = clawTipY(c);

  // Left jaw
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 4);
  ctx.lineTo(clawTipLeft(c), tipY);
  ctx.stroke();

  // Right jaw
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 4);
  ctx.lineTo(clawTipRight(c), tipY);
  ctx.stroke();

  // Jaw tips
  ctx.fillStyle = '#f88';
  ctx.beginPath(); ctx.arc(clawTipLeft(c),  tipY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(clawTipRight(c), tipY, 4, 0, Math.PI * 2); ctx.fill();
}

// Draws every active claw, plus whatever item it's currently grabbed onto
// (drawn first so the claw's jaws read as gripping it, not floating beside
// it) — used anywhere claws are drawn so a carried item is never dropped
// from the scene mid-retract.

export function drawClaws() {
  for (const c of game.claws) {
    if (c.grabbing && c.grabbedObstacle) drawObstacle(c.grabbedObstacle);
    drawClaw(c);
  }
}
