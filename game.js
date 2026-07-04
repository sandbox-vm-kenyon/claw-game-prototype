// Claw Game — Game Over on Claw Contact: Fade to Black + Show Game Over

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// ─── State ────────────────────────────────────────────────────────────────────

const STATE = { PLAYING: 0, FADING: 1, GAME_OVER: 2 };

let state, player, claws, score, fadeAlpha, fadeSpeed, gameOverAlpha;
let runStartTime;

// ─── Platformer physics tuning ─────────────────────────────────────────────
const MOVE_SPEED = 3.2;
const GRAVITY = 0.6;
const JUMP_VELOCITY = -11;
const MAX_FALL_SPEED = 14;

function init() {
  state = STATE.PLAYING;
  fadeAlpha = 0;
  gameOverAlpha = 0;
  fadeSpeed = 0.018;
  score = 0;
  runStartTime = performance.now();

  player = {
    x: W / 2,
    y: H - 14,   // start standing on the ground
    r: 14,
    speed: MOVE_SPEED,
    vx: 0,
    vy: 0,
    grounded: true,
    color: '#4af',
  };

  claws = [];
  spawnClaw();
}

// ─── Claw AI ──────────────────────────────────────────────────────────────────
// The claw actively hunts the bunny: every frame it steers itself toward the
// bunny's current x position while it descends. Both the homing (horizontal
// chase) speed and the descent speed ramp up the longer the run lasts, so the
// hook gets more relentless over time regardless of score.

const HOMING_BASE = 0.9;     // starting horizontal pursuit speed (px/frame)
const HOMING_GROWTH = 0.06;  // added per second survived
const HOMING_MAX = 6.5;      // cap so it stays beatable

const FALL_BASE = 1.2;       // starting descent speed (px/frame)
const FALL_GROWTH = 0.035;   // added per second survived
const FALL_MAX = 7;          // cap on descent speed

function secondsElapsed() {
  return (performance.now() - runStartTime) / 1000;
}

function spawnClaw() {
  const lane = 48 + Math.floor(Math.random() * 8) * 48;
  claws.push({
    x: lane,
    y: -40,
    vy: FALL_BASE,
    armLen: 30,
    jawOpen: 18,
    grabbing: false,
    color: '#e44',
  });
}

function updateClaws(dt) {
  const t = secondsElapsed();
  const homingSpeed = Math.min(HOMING_BASE + t * HOMING_GROWTH, HOMING_MAX);
  const fallSpeed = Math.min(FALL_BASE + t * FALL_GROWTH, FALL_MAX);

  for (let c of claws) {
    // AI pursuit: steer horizontally toward the bunny's current position.
    const dx = player.x - c.x;
    const step = Math.min(Math.abs(dx), homingSpeed * dt);
    c.x += Math.sign(dx) * step;
    c.x = Math.max(24, Math.min(W - 24, c.x));

    // Descend — speed increases the longer the bunny survives.
    c.vy = fallSpeed;
    c.y += c.vy * dt;

    // Pulsing jaw
    c.jawOpen = 16 + Math.sin(Date.now() / 220) * 6;
  }
  // Remove claws that have left the screen
  claws = claws.filter(c => c.y < H + 60);
}

// ─── Collision ────────────────────────────────────────────────────────────────

function clawTipY(c) { return c.y + c.armLen; }
function clawTipLeft(c) { return c.x - c.jawOpen; }
function clawTipRight(c) { return c.x + c.jawOpen; }

function checkCollision() {
  for (let c of claws) {
    const tipY = clawTipY(c);
    const dx = Math.abs(player.x - c.x);
    const dy = Math.abs(player.y - tipY);
    // Circle vs rough claw-jaw bounding box
    if (dx < c.jawOpen + player.r && dy < player.r + 10) {
      return true;
    }
  }
  return false;
}

// ─── Input ────────────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'r' || e.key === 'R') && state === STATE.GAME_OVER) init();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

function handleInput() {
  // Platformer-style horizontal movement
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) player.vx = -player.speed;
  else if (keys['ArrowRight'] || keys['d'] || keys['D']) player.vx = player.speed;
  else player.vx = 0;

  // Jump — only while grounded, so holding the key won't re-trigger mid-air
  const jumpPressed = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '];
  if (jumpPressed && player.grounded) {
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
  }
}

function updatePlayerPhysics() {
  // Gravity
  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);

  // Apply velocity
  player.x += player.vx;
  player.y += player.vy;

  // Ground collision (floor of the box)
  const groundY = H - player.r;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  // Keep player within the box horizontally
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
}

// ─── Score ────────────────────────────────────────────────────────────────────

let spawnTimer = 0;
const SPAWN_INTERVAL = 120; // frames

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawBackground() {
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

function drawPlayer(p) {
  // Glow
  const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 2.5);
  grd.addColorStop(0, 'rgba(68,170,255,0.35)');
  grd.addColorStop(1, 'rgba(68,170,255,0)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 2;
  ctx.stroke();
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

function drawHUD() {
  ctx.fillStyle = '#4af';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`SCORE  ${score}`, 12, 24);
}

// ─── Fade to Black ────────────────────────────────────────────────────────────

function drawFadeOverlay() {
  ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
  ctx.fillRect(0, 0, W, H);
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────

function drawGameOver() {
  // After fade is complete, reveal game over text by fading it in
  ctx.globalAlpha = gameOverAlpha;

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
  ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 12);

  // Restart prompt
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
  ctx.globalAlpha = gameOverAlpha * pulse;
  ctx.font = '16px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText('Press  R  to restart', W / 2, H / 2 + 56);

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let lastTime = 0;
let frame = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3); // ~60 fps units
  lastTime = ts;
  frame++;

  drawBackground();

  if (state === STATE.PLAYING) {
    handleInput();
    updatePlayerPhysics();
    updateClaws(dt);

    // Spawn new claw periodically
    spawnTimer++;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      spawnClaw();
      score++;
    }

    // Draw scene
    for (let c of claws) drawClaw(c);
    drawPlayer(player);
    drawHUD();

    // Collision → start fade
    if (checkCollision()) {
      state = STATE.FADING;
      // Freeze player
    }

  } else if (state === STATE.FADING) {
    // Scene stays visible underneath fade
    for (let c of claws) drawClaw(c);
    drawPlayer(player);
    drawHUD();

    // Advance fade
    fadeAlpha = Math.min(1, fadeAlpha + fadeSpeed);
    drawFadeOverlay();

    // Once fully black, switch to GAME_OVER
    if (fadeAlpha >= 1) {
      state = STATE.GAME_OVER;
    }

  } else if (state === STATE.GAME_OVER) {
    // Keep it fully black underneath
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Fade in the game over text
    gameOverAlpha = Math.min(1, gameOverAlpha + 0.025);
    drawGameOver();
  }

  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
requestAnimationFrame(loop);
