import { game } from '../state.js';
import { W, ctx } from '../core.js';
import { drawHoverClaw } from './claws.js';
import { drawPlayer } from './player.js';

export function drawPlatformWorld() {
  ctx.save();
  ctx.translate(-game.cameraX, 0);

  const cavern = game.platformLevel >= 4;
  const jungle = game.platformLevel === 3;
  // Cavern level: dark rock ground with a pale mineral crust and glowing
  // crystal-topped platforms; jungle level: earthy soil topped with grass;
  // otherwise back to the grey arcade concrete.
  const groundBody = cavern ? '#3a3348' : jungle ? '#6b4a2b' : '#8f8f96';
  const groundTop  = cavern ? '#6f6480' : jungle ? '#3fa34d' : '#b7b7be';
  const platBody   = cavern ? '#2c2640' : jungle ? '#4d3620' : '#5a5f6b';
  const platTop    = cavern ? '#9d7bff' : jungle ? '#5cc46a' : '#4be0ff';

  for (const seg of game.groundSegments) {
    if (seg.x + seg.w < game.cameraX - 20 || seg.x > game.cameraX + W + 20) continue;
    ctx.fillStyle = groundBody;
    ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
    ctx.fillStyle = groundTop;
    ctx.fillRect(seg.x, seg.y, seg.w, 5);
  }

  for (const plat of game.stagePlatforms) {
    if (plat.x + plat.w < game.cameraX - 20 || plat.x > game.cameraX + W + 20) continue;
    ctx.fillStyle = platBody;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = platTop;
    ctx.fillRect(plat.x, plat.y, plat.w, 3);
  }

  drawHoverClaw(game.hoverClaw);
  if (game.door) drawDoor(game.door);
  drawPlayer(game.player);

  ctx.restore();
}

function drawEnemy(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  ctx.fillStyle = '#c33';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, e.w / 2, e.h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#822';
  ctx.fillRect(e.x + 2, e.y + e.h - 4, 5, 4);
  ctx.fillRect(e.x + e.w - 7, e.y + e.h - 4, 5, 4);
}

function drawDoor(d) {
  // In the jungle level (3+), the exit is a cave mouth in a rocky outcrop
  // instead of a wooden door. Same rect/trigger, different graphic.
  if (game.platformLevel >= 3) {
    drawCave(d);
    return;
  }

  // Black door frame with a window
  ctx.fillStyle = '#222';
  ctx.fillRect(d.x - d.w / 2, d.y, d.w, d.h);

  // Door window with a slight glow
  ctx.fillStyle = '#333';
  ctx.fillRect(d.x - d.w / 2 + 4, d.y + 10, d.w - 8, d.h - 20);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(d.x - d.w / 2 + 6, d.y + 12, d.w - 12, d.h - 24);

  // Door knob
  ctx.fillStyle = '#f0ad4e';
  ctx.beginPath();
  ctx.arc(d.x + d.w / 2 - 8, d.y + d.h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Jungle vines framing the level-1 exit door, matching the hanging-vine
  // styling used in the jungle level's backdrop.
  drawDoorVines(d);
}

// Hanging/climbing green jungle vines that frame the wooden exit door, giving
// it a jungle-vine motif. Drawn in the same flat curved-stroke-with-leaf style
// as drawJungleBackground's canopy vines: a couple of vines drape down each
// side of the door frame and one swags across the top, each dotted with leaves.

function drawDoorVines(d) {
  const left = d.x - d.w / 2;
  const right = d.x + d.w / 2;
  const top = d.y;
  const bottom = d.y + d.h;

  ctx.save();
  ctx.strokeStyle = 'rgba(30,90,40,0.85)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // A small leaf at (x, y), oriented by angle — same look as the backdrop vines.
  const leaf = (x, y, angle) => {
    ctx.fillStyle = 'rgba(40,120,55,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 8, angle, 0, Math.PI * 2);
    ctx.fill();
  };

  // Vines climbing down each side post of the door frame, gently swaying.
  const sides = [left - 2, right + 2];
  for (let s = 0; s < sides.length; s++) {
    const x = sides[s];
    const dir = s === 0 ? -1 : 1;   // sway outward from the frame
    const sway = Math.sin(Date.now() / 900 + s * 1.7) * 4;
    ctx.strokeStyle = 'rgba(30,90,40,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, top - 6);
    ctx.quadraticCurveTo(x + dir * (5 + sway), top + d.h * 0.4,
                         x + dir * 2 + sway, bottom - 4);
    ctx.stroke();
    // Leaves sprouting along the side vine.
    for (let t = 0.25; t <= 0.9; t += 0.32) {
      const ly = top - 6 + (bottom - 4 - (top - 6)) * t;
      leaf(x + dir * (3 + sway * t), ly, 0.5 * dir);
    }
  }

  // A vine swagging across the top of the door frame, dipping in the middle.
  const swagDip = Math.sin(Date.now() / 1100) * 3;
  ctx.strokeStyle = 'rgba(30,90,40,0.85)';
  ctx.beginPath();
  ctx.moveTo(left - 2, top - 6);
  ctx.quadraticCurveTo(d.x, top + 8 + swagDip, right + 2, top - 6);
  ctx.stroke();
  // Leaves hanging from the top swag.
  leaf(d.x, top + 8 + swagDip, 0);
  leaf(left + d.w * 0.28, top + 2 + swagDip * 0.6, -0.4);
  leaf(right - d.w * 0.28, top + 2 + swagDip * 0.6, 0.4);

  ctx.restore();
}

// Cave-mouth exit for the jungle level: a mossy rock mound with a dark,
// arched opening. Occupies the same footprint as the door (centered on d.x,
// standing on the ground with its base at d.y + d.h).

function drawCave(d) {
  const cx = d.x;                 // horizontal center of the opening
  const baseY = d.y + d.h;        // ground level (bottom of the rect)
  const rockW = d.w + 26;         // rock mound is a bit wider than the opening
  const rockTop = d.y - 10;       // mound rises slightly above the opening
  const mouthW = d.w - 8;         // width of the cave opening
  const mouthTop = d.y + 14;      // top of the arched opening

  // Rocky outcrop: a rounded grey mound behind the opening.
  ctx.fillStyle = '#5a5750';
  ctx.beginPath();
  ctx.moveTo(cx - rockW / 2, baseY);
  ctx.quadraticCurveTo(cx - rockW / 2, rockTop, cx, rockTop - 8);
  ctx.quadraticCurveTo(cx + rockW / 2, rockTop, cx + rockW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // Darker shading on the rock for a bit of depth.
  ctx.fillStyle = '#494640';
  ctx.beginPath();
  ctx.moveTo(cx + 2, rockTop - 6);
  ctx.quadraticCurveTo(cx + rockW / 2 - 4, rockTop + 6, cx + rockW / 2, baseY);
  ctx.lineTo(cx + 6, baseY);
  ctx.closePath();
  ctx.fill();

  // The dark cave opening: a flat-bottomed arch.
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, baseY);
  ctx.lineTo(cx - mouthW / 2, mouthTop + 6);
  ctx.quadraticCurveTo(cx - mouthW / 2, mouthTop, cx, mouthTop);
  ctx.quadraticCurveTo(cx + mouthW / 2, mouthTop, cx + mouthW / 2, mouthTop + 6);
  ctx.lineTo(cx + mouthW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // Subtle inner glow so the opening reads as a deep passage.
  const glow = ctx.createRadialGradient(cx, baseY - 6, 2, cx, baseY - 6, mouthW / 2 + 6);
  glow.addColorStop(0, 'rgba(60,90,70,0.55)');
  glow.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, baseY);
  ctx.lineTo(cx - mouthW / 2, mouthTop + 6);
  ctx.quadraticCurveTo(cx - mouthW / 2, mouthTop, cx, mouthTop);
  ctx.quadraticCurveTo(cx + mouthW / 2, mouthTop, cx + mouthW / 2, mouthTop + 6);
  ctx.lineTo(cx + mouthW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // A few tufts of moss along the top of the outcrop.
  ctx.fillStyle = '#3f7d43';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * (rockW / 3.2), rockTop + 2 + Math.abs(i) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
