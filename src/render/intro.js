import { STATE, game } from '../state.js';
import { H, W, ctx } from '../core.js';
import { init } from '../main.js';
import { INTRO_DURATION, INTRO_FLY_IN, INTRO_MACHINE, INTRO_STRIKE, LOGO_DESCEND_SPEED, LOGO_REST_Y } from '../tuning.js';

export function startIntro() {
  game.introElapsed = 0;
  game.state = STATE.INTRO;
}

// One jagged lightning bolt from (x1,y1) to (x2,y2), split into segments that
// jitter sideways. `seed` keeps the jitter stable within a frame so the bolt
// doesn't strobe every draw.

function drawLightningBolt(x1, y1, x2, y2, seed, width, color) {
  const segments = 9;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const bx = x1 + (x2 - x1) * t;
    const by = y1 + (y2 - y1) * t;
    // Deterministic pseudo-random sideways jitter, zeroed at the endpoints.
    const jitter = i < segments ? Math.sin(seed + i * 12.9898) * 22 * (1 - Math.abs(t - 0.5) * 2 + 0.3) : 0;
    ctx.lineTo(bx + jitter, by);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawIntroMachine() {
  const m = INTRO_MACHINE;
  // Cabinet body
  ctx.fillStyle = '#241a3a';
  ctx.strokeStyle = '#a259ff';
  ctx.lineWidth = 3;
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  // Glass display area
  ctx.fillStyle = 'rgba(120,90,200,0.18)';
  ctx.fillRect(m.x + 12, m.y + 34, m.w - 24, m.h * 0.55);
  ctx.strokeStyle = '#ff6ec7';
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x + 12, m.y + 34, m.w - 24, m.h * 0.55);
  // Marquee header
  ctx.fillStyle = '#3a2a5a';
  ctx.fillRect(m.x, m.y, m.w, 28);
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAW', m.x + m.w / 2, m.y + 20);
  // Prize chute at the bottom
  ctx.fillStyle = '#150e26';
  ctx.fillRect(m.x + m.w * 0.5 - 22, m.y + m.h - 30, 44, 30);
  ctx.textAlign = 'left';
}

// A classic flying saucer, drawn centered at (cx, cy) with a purple glow and
// a beam of underlight.

function drawUFO(cx, cy, tilt) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  // Under-glow beam
  ctx.fillStyle = 'rgba(162,89,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(14, 6);
  ctx.lineTo(40, 60);
  ctx.lineTo(-40, 60);
  ctx.closePath();
  ctx.fill();
  // Saucer body
  ctx.fillStyle = '#8a8fb0';
  ctx.beginPath();
  ctx.ellipse(0, 4, 46, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4d66';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Dome
  ctx.fillStyle = '#b6a8ff';
  ctx.beginPath();
  ctx.ellipse(0, -2, 22, 18, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#7a5cff';
  ctx.stroke();
  // Dome highlight
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-6, -8, 6, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Running lights
  const lightCount = 5;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / (lightCount - 1)) * Math.PI;
    const lx = Math.cos(a) * 38;
    const ly = 4 + Math.sin(a) * 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = (game.frame + i) % 12 < 6 ? '#ff6ec7' : '#a259ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawIntro(dt) {
  game.introElapsed = Math.min(game.introElapsed + dt, INTRO_DURATION);
  const t = game.introElapsed;

  // Dark night backdrop for the launch scene.
  ctx.fillStyle = '#0a0616';
  ctx.fillRect(0, 0, W, H);

  drawIntroMachine();

  const m = INTRO_MACHINE;
  const strikeX = m.x + m.w / 2;
  const strikeTopY = m.y;              // top-center of the cabinet (impact point)

  // UFO path: descends from above the screen toward a hover point just over the
  // machine during the fly-in, then hovers there while it strikes.
  const flyProgress = Math.min(t / INTRO_FLY_IN, 1);
  const eased = 1 - Math.pow(1 - flyProgress, 3); // ease-out
  const ufoHoverY = m.y - 70;
  const ufoY = -40 + (ufoHoverY + 40) * eased;
  // Slight sideways sway on the way in for a "swooping" feel.
  const ufoX = strikeX + Math.sin(flyProgress * Math.PI) * 60 * (1 - eased);
  const tilt = Math.sin(t * 0.08) * 0.08;

  const striking = t >= INTRO_FLY_IN && t < INTRO_FLY_IN + INTRO_STRIKE;
  const strikeT = striking ? (t - INTRO_FLY_IN) / INTRO_STRIKE : 0;

  // Pink lightning strike from the UFO's underside down onto the machine.
  if (striking) {
    const boltCount = 2 + (game.frame % 2);
    for (let b = 0; b < boltCount; b++) {
      const seed = game.frame * 3.1 + b * 7.7;
      drawLightningBolt(ufoX, ufoY + 14, strikeX + (b - 0.5) * 10, strikeTopY, seed, 4, '#ff4fd8');
      drawLightningBolt(ufoX, ufoY + 14, strikeX + (b - 0.5) * 10, strikeTopY, seed + 1.3, 2, '#ffd9f4');
    }
    // Electric burst where the bolt hits the cabinet.
    const burstR = 10 + Math.sin(strikeT * Math.PI) * 26;
    const grad = ctx.createRadialGradient(strikeX, strikeTopY, 0, strikeX, strikeTopY, burstR);
    grad.addColorStop(0, 'rgba(255,217,244,0.9)');
    grad.addColorStop(0.5, 'rgba(255,79,216,0.5)');
    grad.addColorStop(1, 'rgba(255,79,216,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(strikeX, strikeTopY, burstR, 0, Math.PI * 2);
    ctx.fill();
    // Full-screen pink flash that pulses with the strike.
    const flash = Math.sin(strikeT * Math.PI) * 0.35 * (game.frame % 3 === 0 ? 1.4 : 1);
    ctx.fillStyle = `rgba(255,120,220,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawUFO(ufoX, ufoY, tilt);

  // During the strike, the flashing green-and-pink 'Claw Mashine' logo
  // descends into view over the scene, in sync with the pink lightning.
  if (striking) {
    drawClawMashineLogo(dt, 128);
  }

  // Title text glowing over the scene.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe066';
  ctx.shadowColor = '#a259ff';
  ctx.shadowBlur = 20;
  ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('CLAW MACHINE', W / 2, 60);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  // Hand off to normal play after the strike settles.
  if (game.introElapsed >= INTRO_DURATION) {
    init();
  }
}

// ─── 'Claw Mashine' logo ──────────────────────────────────────────────────────

// Animated title logo reading 'Claw Mashine' (spelling intentional). It slowly
// descends from above the top of the screen to a resting baseline and flashes,
// alternating between green and pink each cycle.

export function drawClawMashineLogo(dt, baselineY) {
  let y;
  if (baselineY !== undefined) {
    // Fixed baseline (used by the launch intro so the flashing logo sits at a
    // set spot during the strike without colliding with the intro title).
    y = baselineY;
  } else {
    // Slowly ease the logo down from offscreen to its resting baseline.
    if (game.logoY < LOGO_REST_Y) {
      game.logoY = Math.min(LOGO_REST_Y, game.logoY + LOGO_DESCEND_SPEED * dt);
    }
    y = game.logoY;
  }

  // Flash: alternate between green and pink on a smooth cycle.
  const t = (Math.sin(game.frame * 0.12) + 1) / 2; // 0..1 oscillation
  const green = '#39ff5e';
  const pink = '#ff4fd8';
  const color = t < 0.5 ? green : pink;
  const glow = t < 0.5 ? pink : green;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fillText('Claw Mashine', W / 2, y);
  ctx.restore();
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
