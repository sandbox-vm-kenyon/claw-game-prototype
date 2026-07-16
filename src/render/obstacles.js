import { game } from '../state.js';
import { ctx } from '../core.js';
import { PUSH_ANIMAL_KINDS, registerEntityDraw } from '../entities/registry.js';

function draw_turtle(ob, cx, cy) {
    // Shell
    ctx.fillStyle = '#3a7d3a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.55, ob.w / 2, ob.h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#255425';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head
    ctx.fillStyle = '#5cb85c';
    ctx.beginPath();
    ctx.arc(ob.x + ob.w + 4, ob.y + ob.h * 0.55, 7, 0, Math.PI * 2);
    ctx.fill();
    // Feet
    ctx.fillStyle = '#4a9a4a';
    ctx.fillRect(ob.x + 4, ob.y + ob.h - 4, 8, 6);
    ctx.fillRect(ob.x + ob.w - 12, ob.y + ob.h - 4, 8, 6);
}

function draw_block(ob, cx, cy) {
    // Wooden crate
    ctx.fillStyle = '#b5793a';
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = '#7a4e21';
    ctx.lineWidth = 2;
    ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    ctx.beginPath();
    ctx.moveTo(ob.x, ob.y); ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
    ctx.moveTo(ob.x + ob.w, ob.y); ctx.lineTo(ob.x, ob.y + ob.h);
    ctx.stroke();
}

function draw_ball(ob, cx, cy) {
    const r = ob.w / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ob.angle || 0); // spins to visualize rolling when touched/stood on
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#eee';
    ctx.fill();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Beach-ball stripes
    const stripeColors = ['#e44', '#4af', '#fc4'];
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (Math.PI * 2 / 6) * (i * 2), (Math.PI * 2 / 6) * (i * 2 + 1));
      ctx.closePath();
      ctx.fillStyle = stripeColors[i];
      ctx.fill();
    }
    ctx.restore();
}

function draw_bear(ob, cx, cy) {
    // Ears
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath(); ctx.arc(ob.x + 6, ob.y + 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 6, ob.y + 6, 6, 0, Math.PI * 2); ctx.fill();
    // Head/body
    ctx.fillStyle = '#a9713f';
    ctx.beginPath();
    ctx.arc(cx, cy, ob.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Face
    ctx.fillStyle = '#6b4423';
    ctx.beginPath(); ctx.arc(cx - 5, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + 6, 2.5, 0, Math.PI * 2); ctx.fill();
}

function draw_gorilla(ob, cx, cy) {
    // Dark rounded body filling the box, sitting on the floor
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.62, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rounded head
    ctx.fillStyle = '#3d3d3d';
    ctx.beginPath();
    ctx.arc(cx, ob.y + ob.h * 0.28, ob.w * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.beginPath(); ctx.arc(cx - ob.w * 0.34, ob.y + ob.h * 0.26, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ob.w * 0.34, ob.y + ob.h * 0.26, 5, 0, Math.PI * 2); ctx.fill();
    // Lighter face patch
    ctx.fillStyle = '#7a6a5a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.32, ob.w * 0.2, ob.h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 4, ob.y + ob.h * 0.28, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, ob.y + ob.h * 0.28, 1.6, 0, Math.PI * 2); ctx.fill();
}

function draw_giraffe(ob, cx, cy) {
    // Tall body with a long neck, sitting on the floor
    const bodyTop = ob.y + ob.h * 0.55;
    // Legs/body block
    ctx.fillStyle = '#e0b64a';
    ctx.fillRect(ob.x + 4, bodyTop, ob.w - 8, ob.y + ob.h - bodyTop);
    // Neck
    ctx.fillRect(cx - 5, ob.y + ob.h * 0.16, 10, ob.h * 0.42);
    // Head
    ctx.beginPath();
    ctx.ellipse(cx + 4, ob.y + ob.h * 0.14, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ossicones (horns)
    ctx.strokeStyle = '#c99a30';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, ob.y + ob.h * 0.10); ctx.lineTo(cx, ob.y + ob.h * 0.04); ctx.stroke();
    // Brown spots
    ctx.fillStyle = '#b5793a';
    ctx.beginPath(); ctx.arc(ob.x + 10, bodyTop + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 10, bodyTop + 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, bodyTop + 16, 3, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx + 6, ob.y + ob.h * 0.13, 1.4, 0, Math.PI * 2); ctx.fill();
}

function draw_shark(ob, cx, cy) {
    // Grey body lying on the floor
    ctx.fillStyle = '#6b8fa3';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fin at the left
    ctx.beginPath();
    ctx.moveTo(ob.x + 2, cy);
    ctx.lineTo(ob.x - 6, cy - 10);
    ctx.lineTo(ob.x - 6, cy + 10);
    ctx.closePath();
    ctx.fill();
    // Dorsal fin on top
    ctx.beginPath();
    ctx.moveTo(cx - 4, ob.y + 2);
    ctx.lineTo(cx + 6, ob.y + 2);
    ctx.lineTo(cx, ob.y - 8);
    ctx.closePath();
    ctx.fill();
    // White belly
    ctx.fillStyle = '#dfeaf0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ob.h * 0.18, ob.w * 0.4, ob.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 10, cy - 3, 2, 0, Math.PI * 2); ctx.fill();
    // Mouth (gill line of teeth)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w - 16, cy + 4); ctx.lineTo(ob.x + ob.w - 2, cy + 4); ctx.stroke();
}

function draw_hamster(ob, cx, cy) {
    // Small round golden body sitting on the floor
    ctx.fillStyle = '#e0a860';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.6, ob.w * 0.5, ob.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b5793a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Rounded head
    ctx.fillStyle = '#eab878';
    ctx.beginPath();
    ctx.arc(cx, ob.y + ob.h * 0.34, ob.w * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = '#d99a58';
    ctx.beginPath(); ctx.arc(cx - ob.w * 0.24, ob.y + ob.h * 0.16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ob.w * 0.24, ob.y + ob.h * 0.16, 4, 0, Math.PI * 2); ctx.fill();
    // Cream belly patch
    ctx.fillStyle = '#f6e4c8';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.66, ob.w * 0.26, ob.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes and nose
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 4, ob.y + ob.h * 0.32, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, ob.y + ob.h * 0.32, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a05a3a';
    ctx.beginPath(); ctx.arc(cx, ob.y + ob.h * 0.42, 1.6, 0, Math.PI * 2); ctx.fill();
}

function draw_walrus(ob, cx, cy) {
    // Plump brown body resting on the floor
    ctx.fillStyle = '#8a6b5a';
    ctx.beginPath();
    ctx.ellipse(cx, ob.y + ob.h * 0.58, ob.w * 0.5, ob.h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5e4638';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head bulge at the right
    ctx.fillStyle = '#9a7a68';
    ctx.beginPath();
    ctx.arc(ob.x + ob.w * 0.74, ob.y + ob.h * 0.5, ob.h * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // Snout/muzzle
    ctx.fillStyle = '#c8a892';
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.w * 0.84, ob.y + ob.h * 0.6, ob.w * 0.16, ob.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tusks
    ctx.fillStyle = '#f4f0e4';
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w * 0.80, ob.y + ob.h * 0.68); ctx.lineTo(ob.x + ob.w * 0.78, ob.y + ob.h * 0.92); ctx.lineTo(ob.x + ob.w * 0.83, ob.y + ob.h * 0.70); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w * 0.88, ob.y + ob.h * 0.68); ctx.lineTo(ob.x + ob.w * 0.90, ob.y + ob.h * 0.92); ctx.lineTo(ob.x + ob.w * 0.85, ob.y + ob.h * 0.70); ctx.closePath(); ctx.fill();
    // Fore flipper
    ctx.fillStyle = '#6e5344';
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.w * 0.34, ob.y + ob.h * 0.82, ob.w * 0.14, ob.h * 0.14, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w * 0.72, ob.y + ob.h * 0.42, 2, 0, Math.PI * 2); ctx.fill();
}

function draw_dolphin(ob, cx, cy) {
    // Sleek blue-grey body lying on the floor
    ctx.fillStyle = '#5b8fb0';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ob.w * 0.5, ob.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fluke at the left
    ctx.beginPath();
    ctx.moveTo(ob.x + 4, cy);
    ctx.lineTo(ob.x - 6, cy - 9);
    ctx.lineTo(ob.x - 6, cy + 9);
    ctx.closePath();
    ctx.fill();
    // Curved dorsal fin on top
    ctx.beginPath();
    ctx.moveTo(cx - 6, ob.y + 4);
    ctx.quadraticCurveTo(cx + 2, ob.y - 8, cx + 8, ob.y + 4);
    ctx.closePath();
    ctx.fill();
    // Beak/rostrum at the right
    ctx.beginPath();
    ctx.moveTo(ob.x + ob.w - 2, cy - 3);
    ctx.lineTo(ob.x + ob.w + 8, cy);
    ctx.lineTo(ob.x + ob.w - 2, cy + 3);
    ctx.closePath();
    ctx.fill();
    // Pale belly
    ctx.fillStyle = '#dbe9f0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ob.h * 0.2, ob.w * 0.42, ob.h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye and smile
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ob.x + ob.w - 12, cy - 3, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2f5f7a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ob.x + ob.w - 14, cy + 3); ctx.quadraticCurveTo(ob.x + ob.w - 8, cy + 6, ob.x + ob.w - 2, cy + 3); ctx.stroke();
}

const KIND_DRAW = {
  turtle: draw_turtle,
  block: draw_block,
  ball: draw_ball,
  bear: draw_bear,
  gorilla: draw_gorilla,
  giraffe: draw_giraffe,
  shark: draw_shark,
  hamster: draw_hamster,
  walrus: draw_walrus,
  dolphin: draw_dolphin,
};

// Publish each kind's art into the entity-type registry so a definition and its
// renderer are associated in one place (ENTITY_TYPES[kind].draw). drawObstacle
// still dispatches via the local KIND_DRAW table for speed, but the registry is
// the authoritative "one place a new entity is added."
for (const kind of Object.keys(KIND_DRAW)) registerEntityDraw(kind, KIND_DRAW[kind]);

export function drawObstacle(ob) {
  const cx = ob.x + ob.w / 2;
  const cy = ob.y + ob.h / 2;

  // Level-1 animals rock slightly when pushed: rotate the whole figure about
  // its base (bottom-center) by its current tilt so it wobbles like it's
  // rocking on the floor. A no-op (tilt 0) for animals at rest and for every
  // non-push kind (crate/ball), which never set a tilt.
  const rocking = ob.tilt && PUSH_ANIMAL_KINDS.includes(ob.kind);
  if (rocking) {
    ctx.save();
    const pivotY = ob.y + ob.h; // base of the figure sitting on the floor
    ctx.translate(cx, pivotY);
    ctx.rotate(ob.tilt);
    ctx.translate(-cx, -pivotY);
  }

  // Per-kind art is looked up in KIND_DRAW rather than a long if/else chain, so
  // adding an entity means registering one draw fn (see entities/registry.js).
  const drawFn = KIND_DRAW[ob.kind];
  if (drawFn) drawFn(ob, cx, cy);

  if (rocking) ctx.restore();
}

export function drawObstacles() {
  for (const ob of game.obstacles) drawObstacle(ob);
}

// Ear geometry shared between the input logic (which needs to know how folded
// the ears are BEFORE drawing, to gate the jump) and the renderer. The two ears
// are mounted a little outward from the top of the head; their length is a fixed
// multiple of the head radius. Keeping these as named constants means the jump
// gate and the drawn fold are computed from the exact same geometry — one source
// of truth — rather than two hand-tuned copies that could drift apart.

