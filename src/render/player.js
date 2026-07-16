import { ctx } from '../core.js';
import { earFeedbackFoldAmount } from '../physics.js';
import { EAR_LENGTH_FRAC } from '../tuning.js';

function drawFoldingEar(r, angFromTop, furColor, furShadow, innerEar) {
  const earW = r * 0.55;
  const earH = r * EAR_LENGTH_FRAC;
  const segs = 5;

  // World-space downward direction expressed in the head's local (roll-rotated)
  // frame. `groundDirLocal` is passed in via closure-free globals set by the
  // caller (see drawPlayer); here we derive the ear's own outward direction.
  ctx.save();
  // Rotate into the ear's mounting angle (relative to local "up").
  ctx.rotate(angFromTop);

  // Direction from the ear toward the ground, expressed in the ear's own frame.
  // In this ear-local frame the ear points "up" (local angle -PI/2), while the
  // direction toward the ground sits at (_earDownAngle - angFromTop). The ear
  // aims at the floor when those coincide, so offset the ground direction by
  // that -PI/2 so that d === 0 means the ear points straight down (not to the
  // side). Without this offset the fold triggered a quarter-turn early, folding
  // the ears against the right edge instead of against the ground.
  const downAng = (_earDownAngle - angFromTop) + Math.PI / 2; // 0 => ear points straight down
  // Normalize to [-PI, PI]
  let d = Math.atan2(Math.sin(downAng), Math.cos(downAng));
  // How far the (unfolded) ear tip reaches along the world-down axis, measured
  // from the head centre: cos(d) is the fraction of the ear's length that points
  // toward the ground (1 when the ear aims straight down, 0 when horizontal), so
  // the tip's depth below the centre is earH * cos(d).
  const tipDepth = earH * Math.max(0, Math.cos(d));
  // The fold must NOT start when the ear merely becomes horizontal — at that
  // point the tip is still level with the head centre, well above the ground.
  // Only begin folding once the ear tip rotates down far enough to reach the
  // BOTTOM edge of the round head (depth === r), and ramp to a full fold as the
  // tip continues past that toward pointing straight down (depth === earH).
  // Suppressed entirely while airborne so mid-jump ears stay straight.
  const foldProgress = earH > r
    ? Math.max(0, Math.min(1, (tipDepth - r) / (earH - r)))
    : 0;
  // Geometric fold from the head roll (ease-in, grounded only), plus the
  // transient blocked-jump feedback fold. The feedback (a brief half-fold that
  // straightens back out, set on _earFeedbackFold by tryJump) is added on top so
  // that when the player presses jump with un-folded ears, the ears twitch into
  // their "jumping" fold and back, showing what the jump input does. It's
  // clamped so the combined fold never exceeds a full fold.
  const geomFold = _earFoldActive ? foldProgress * foldProgress : 0; // ease-in the fold (grounded only)
  const fold = Math.min(1, geomFold + _earFeedbackFold);

  // Build the ear as a chain of segments; each successive segment bends toward
  // horizontal (away from the ground) proportionally to `fold`, so the tip
  // curls back against the floor rather than spearing through it.
  const segLen = earH / segs;
  let px = 0, py = 0;
  let dirX = 0, dirY = -1;         // start pointing "up" in local frame
  const bendPerSeg = fold * (Math.PI * 0.42); // total bend distributed along ear
  // bend the ear sideways, away from the ground contact (sign follows d)
  const bendSign = d >= 0 ? -1 : 1;

  ctx.beginPath();
  const pts = [{ x: px, y: py }];
  for (let i = 0; i < segs; i++) {
    const ang = bendSign * bendPerSeg * ((i + 1) / segs);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ndx = dirX * ca - dirY * sa;
    const ndy = dirX * sa + dirY * ca;
    dirX = ndx; dirY = ndy;
    px += dirX * segLen;
    py += dirY * segLen;
    pts.push({ x: px, y: py });
  }

  // Draw the ear as a tapering capsule following the bent spine.
  const half = earW / 2;
  ctx.beginPath();
  // one side out
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const w = half * (1 - 0.35 * t);
    // perpendicular to local spine tangent
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x + nx * w, Y = pts[i].y + ny * w;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  // back down the other side
  for (let i = pts.length - 1; i >= 0; i--) {
    const t = i / (pts.length - 1);
    const w = half * (1 - 0.35 * t);
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x - nx * w, Y = pts[i].y - ny * w;
    ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = furColor;
  ctx.fill();
  ctx.strokeStyle = furShadow;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner-ear detail follows the same bent spine, slightly inset.
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const w = (half - 3) * (1 - 0.35 * t);
    if (w <= 0) continue;
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x + nx * w, Y = pts[i].y + ny * w;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const t = i / (pts.length - 1);
    const w = (half - 3) * (1 - 0.35 * t);
    if (w <= 0) continue;
    const tan = i < pts.length - 1
      ? { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
      : { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
    const tl = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tl, ny = tan.x / tl;
    const X = pts[i].x - nx * w, Y = pts[i].y - ny * w;
    ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = innerEar;
  ctx.fill();

  ctx.restore();
}

// Angle (in the head's roll-rotated local frame) that points toward the
// ground contact point. Set each frame by drawPlayer before it draws ears.

let _earDownAngle = 0;

// Whether the ground-fold should be applied to the ears this frame. Set by
// drawPlayer to the player's grounded state so ears only fold on a surface and
// stay straight mid-jump.

let _earFoldActive = true;

// Transient additive fold (0..~0.5) for the blocked-jump feedback twitch. Set
// each frame by drawPlayer from the player's feedback timer; added on top of the
// geometric fold in drawFoldingEar.

let _earFeedbackFold = 0;

export function drawPlayer(p) {
  const r = p.r;
  // Surface the blocked-jump feedback fold for this player into the ear
  // renderer's global, mapping the timer (see tryJump / EAR_FEEDBACK_DURATION)
  // into a half-fold that rises then straightens back out.
  _earFeedbackFold = earFeedbackFoldAmount(p);

  // ── Rolling: accumulate a roll angle from the player's left/right MOVE INPUT
  // intent (p.moveDir), NOT from actual horizontal travel, so the head faces
  // her input direction and spins like a wheel that way. Driving off input
  // intent means: (1) she still turns to face a held left/right even when an
  // obstacle blocks her and she can't actually move, and (2) she does NOT spin
  // when a platform (e.g. the moving turtle) carries her while she gives no
  // left/right input. The per-frame roll uses her normal move speed so the
  // spin rate matches unobstructed walking. As before, the spin only applies
  // while grounded; mid-jump the head holds its last roll value.
  const moveDir = p.moveDir || 0;
  if (p.roll === undefined) p.roll = 0;
  if (p.grounded) p.roll += (moveDir * p.speed) / r; // radians of roll per input frame (grounded only)
  const roll = p.roll;

  // Ears only fold against the ground while the bunny is standing on a surface.
  // In the air they stay straight even when the arc happens to aim them
  // downward, so drawFoldingEar is told whether folding is currently active.
  _earFoldActive = p.grounded;

  // Soft glow (unrotated, under everything)
  const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.2);
  grd.addColorStop(0, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  const furColor = '#f7f0e6';
  const furShadow = '#d8c9b0';
  const innerEar = '#f3b6c2';

  // In the head's local frame the world "down" direction (toward the ground
  // contact point) sits at world angle +PI/2; after the head rolls by `roll`,
  // that same world-down direction lives at local angle (PI/2 - roll).
  _earDownAngle = Math.PI / 2 - roll;

  // Everything (ears + face) is drawn in a frame translated to the player and
  // rotated by the roll angle, so the whole head visibly rolls.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(roll);

  // Ears (drawn behind the head). Each ear is mounted a little outward from the
  // top and folds against the ground as the head rolls it into contact.
  drawFoldingEar(r, -0.45, furColor, furShadow, innerEar); // left ear
  drawFoldingEar(r,  0.45, furColor, furShadow, innerEar); // right ear

  // Head/body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = furColor;
  ctx.fill();
  ctx.strokeStyle = furShadow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cheeks
  ctx.fillStyle = 'rgba(243,182,194,0.5)';
  ctx.beginPath(); ctx.arc(-r * 0.5, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( r * 0.5, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( r * 0.32, -r * 0.05, r * 0.13, 0, Math.PI * 2); ctx.fill();

  // Nose
  ctx.fillStyle = '#e07a92';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.18);
  ctx.lineTo(-r * 0.12, r * 0.32);
  ctx.lineTo( r * 0.12, r * 0.32);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
