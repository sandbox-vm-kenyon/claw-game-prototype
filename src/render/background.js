import { game } from '../state.js';
import { H, W, ctx } from '../core.js';
import { LEVELS } from '../levels/registry.js';

// Backdrop dispatch is now data-driven: each level record in the level registry
// names its own `background` fn, so this looks the level up instead of running
// an if/else ladder on game.platformLevel. Adding a level = appending a record
// (with its backdrop fn), not editing this function.
export function drawPlatformBackground() {
  const level = LEVELS[game.platformLevel];
  const bg = (level && level.background) || drawRooftopBackground;
  bg();
}

// Level-2 (rooftop/arcade) backdrop — a dim, windowless wall, matching the
// arcade theme the bunny popped out into.
export function drawRooftopBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1b1330');
  grd.addColorStop(1, '#3a2a55');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,240,190,0.85)';
  drawCeilingLight(W - 60, 34);

  ctx.fillStyle = 'rgba(255,60,180,0.35)';
  drawNeonGlow(90, 90);
  ctx.fillStyle = 'rgba(60,220,255,0.3)';
  drawNeonGlow(260, 140);
}

// Jungle backdrop for level 3: a green sky-to-canopy gradient, a warm sun, a
// silhouette of layered foliage across the back, and a few hanging vines —
// drawn in the same flat, canvas-shape style as the rest of the game's scenery.

export function drawJungleBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#123d1f');   // deep canopy green up top
  grd.addColorStop(0.55, '#1f5e30');
  grd.addColorStop(1, '#2f7d3f');   // brighter forest floor light below
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Hazy sun glow filtering through the canopy.
  const sun = ctx.createRadialGradient(W - 70, 60, 0, W - 70, 60, 90);
  sun.addColorStop(0, 'rgba(255,240,170,0.6)');
  sun.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W - 70, 60, 90, 0, Math.PI * 2);
  ctx.fill();

  // Layered foliage silhouettes across the background (two depth layers).
  drawJungleFoliage(H * 0.62, '#0e3a1c', 46, 0);
  drawJungleFoliage(H * 0.74, '#15522a', 62, 30);

  // A few hanging vines drifting down from the canopy.
  ctx.strokeStyle = 'rgba(30,90,40,0.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const vineXs = [70, 190, 300, 400];
  for (let i = 0; i < vineXs.length; i++) {
    const x = vineXs[i];
    const len = 90 + (i % 3) * 40;
    const sway = Math.sin(Date.now() / 900 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sway, len / 2, x + sway * 1.5, len);
    ctx.stroke();
    // A leaf at the vine's tip.
    ctx.fillStyle = 'rgba(40,120,55,0.8)';
    ctx.beginPath();
    ctx.ellipse(x + sway * 1.5, len, 5, 9, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A row of overlapping rounded bumps forming a bushy foliage silhouette at a
// given baseline y, in the given color (used for back-layer jungle scenery).

function drawJungleFoliage(baseY, color, bumpR, offset) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = -bumpR + offset; x < W + bumpR; x += bumpR * 1.3) {
    const h = bumpR + (x * 0.7 % (bumpR * 0.6));
    ctx.arc(x, baseY, h, Math.PI, 0, false);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// Cavern backdrop for level 4: a dark rocky gradient, hanging stalactites from
// the ceiling and stalagmites rising from below, a faint glow, and a few small
// bats fluttering in the gloom — drawn in the same flat canvas-shape style as
// the rest of the game's scenery.

export function drawCavernBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0c0a14');    // near-black cavern ceiling
  grd.addColorStop(0.55, '#1a1626');
  grd.addColorStop(1, '#2a2338');    // faintly lit cave floor
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Dim glow from some unseen source deep in the cave.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.72, 0, W * 0.5, H * 0.72, 160);
  glow.addColorStop(0, 'rgba(90,120,160,0.18)');
  glow.addColorStop(1, 'rgba(90,120,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Stalactites hanging from the ceiling.
  ctx.fillStyle = '#241d33';
  const topXs = [40, 110, 180, 250, 330, 420];
  for (let i = 0; i < topXs.length; i++) {
    const x = topXs[i];
    const w = 16 + (i % 3) * 6;
    const len = 40 + (i * 37 % 60);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.lineTo(x + w / 2, 0);
    ctx.lineTo(x, len);
    ctx.closePath();
    ctx.fill();
  }

  // Stalagmites rising from the cave floor at the back.
  ctx.fillStyle = '#2f2740';
  const botXs = [70, 150, 300, 380];
  for (let i = 0; i < botXs.length; i++) {
    const x = botXs[i];
    const w = 20 + (i % 2) * 10;
    const len = 50 + (i * 29 % 50);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, H);
    ctx.lineTo(x + w / 2, H);
    ctx.lineTo(x, H - len);
    ctx.closePath();
    ctx.fill();
  }

  // A few small bats fluttering in the background.
  ctx.fillStyle = 'rgba(10,8,16,0.9)';
  const batBase = [[90, 90], [250, 60], [360, 120]];
  for (let i = 0; i < batBase.length; i++) {
    const bx = batBase[i][0] + Math.sin(Date.now() / 700 + i * 2) * 18;
    const by = batBase[i][1] + Math.cos(Date.now() / 900 + i) * 10;
    const w = Math.sin(Date.now() / 100 + i) * 4;   // wing flap
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx - 7, by - 5 - w, bx - 11, by - w);
    ctx.quadraticCurveTo(bx - 6, by + 1, bx, by + 2);
    ctx.quadraticCurveTo(bx + 6, by + 1, bx + 11, by - w);
    ctx.quadraticCurveTo(bx + 7, by - 5 - w, bx, by);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCeilingLight(cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawNeonGlow(cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.arc(cx + 18, cy - 8, 20, 0, Math.PI * 2);
  ctx.arc(cx + 38, cy, 16, 0, Math.PI * 2);
  ctx.fill();
}

// Draws every world-space entity (ground, platforms, enemies, the bunny)
// through a single camera translation, so what's rendered always matches
// where things actually are in the simulation. This is the fix for the
// scrubbed attempt's core bug: there is now exactly one place the
// world-to-screen offset happens, instead of it being computed but never
// applied.

export function drawBackground() {
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}
