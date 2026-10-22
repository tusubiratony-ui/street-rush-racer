const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const speedMeter = document.getElementById('speedMeter');
const nitroMeter = document.getElementById('nitroMeter');
const messageBox = document.getElementById('messageBox');
const messageTitle = document.getElementById('messageTitle');
const messageText = document.getElementById('messageText');

const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const nitroBtn = document.getElementById('nitroBtn');

let w = 0;
let h = 0;
let lastTime = 0;

const state = {
  started: false,
  gameOver: false,
  score: 0,
  best: Number(localStorage.getItem('streetRush3DBest') || 0),
  distance: 0,
  speed: 120,
  targetSpeed: 120,
  maxSpeed: 360,
  nitro: 100,
  roadCurve: 0,
  roadCenter: 0,
  lane: 1,
  carX: 0,
  carY: 0,
  carWidth: 70,
  carHeight: 112,
  roadTilt: 0,
  roadScroll: 0
};

const keys = {
  left: false,
  right: false,
  nitro: false
};

const obstacles = [];
let spawnCooldown = 0.8;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  w = Math.floor(window.innerWidth * ratio);
  h = Math.floor(window.innerHeight * ratio);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  state.carY = h * 0.82;
  state.carX = w * 0.5;

  if (!state.started && !state.gameOver) {
    state.carX = w * 0.5;
  }
}

function laneToWorldX(lane) {
  const base = state.roadCenter + (lane - 1) * 140;
  return base;
}

function project3D(z, laneIndex) {
  const horizonY = h * 0.22;
  const bottomY = h * 0.96;
  const t = 1 - z / 1200;
  const y = horizonY + t * (bottomY - horizonY);
  const roadWidthAtY = 120 + (1 - z / 1200) * (w * 0.78 - 120);
  const laneSpread = roadWidthAtY * 0.22;
  const x = state.roadCenter + (laneIndex - 1) * laneSpread * 1.5;

  return {
    x,
    y,
    scale: 0.35 + (1 - z / 1200) * 1.25
  };
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  obstacles.push({
    lane,
    z: 1200,
    width: 56,
    height: 96,
    color: ['#f87171', '#fbbf24', '#a78bfa', '#4ade80'][Math.floor(Math.random() * 4)],
    drift: (Math.random() - 0.5) * 8
  });
}

function setMessage(title, text, visible) {
  messageTitle.textContent = title;
  messageText.textContent = text;
  messageBox.style.display = visible ? 'block' : 'none';
}

function startGame() {
  state.started = true;
  state.gameOver = false;
  state.score = 0;
  state.distance = 0;
  state.speed = 120;
  state.targetSpeed = 120;
  state.nitro = 100;
  state.lane = 1;
  state.roadCurve = 0;
  state.roadScroll = 0;
  obstacles.length = 0;
  spawnCooldown = 0.75;
  state.carX = w * 0.5;
  setMessage('', '', false);
}

function endGame() {
  state.gameOver = true;
  state.started = false;
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem('streetRush3DBest', String(state.best));
  setMessage('CRASH', 'Press Space or Tap to Race Again', true);
}

function updateUI() {
  scoreEl.textContent = `SCORE ${Math.floor(state.score).toString().padStart(5, '0')}`;
  const speedRatio = clamp((state.speed / state.maxSpeed) * 100, 0, 100);
  const nitroRatio = clamp(state.nitro, 0, 100);
  speedMeter.style.width = `${speedRatio}%`;
  nitroMeter.style.width = `${nitroRatio}%`;
}

function update(delta) {
  if (!state.started || state.gameOver) {
    return;
  }

  const usingNitro = keys.nitro && state.nitro > 0;

  if (usingNitro) {
    state.targetSpeed = state.maxSpeed;
    state.nitro = clamp(state.nitro - 32 * delta, 0, 100);
    state.speed = clamp(state.speed + (state.targetSpeed - state.speed) * 0.18, 90, state.maxSpeed);
  } else {
    state.targetSpeed = 120 + state.distance * 0.02;
    state.nitro = clamp(state.nitro + 16 * delta, 0, 100);
    state.speed = clamp(state.speed + (state.targetSpeed - state.speed) * 0.08, 90, state.maxSpeed);
  }

  state.distance += state.speed * delta * 2;
  state.score += state.speed * delta * 0.9;
  state.roadScroll += state.speed * delta * 0.7;
  state.roadCurve = Math.sin(state.distance * 0.0035) * 170;
  state.roadCenter = w * 0.5 + state.roadCurve;

  if (keys.left) {
    state.lane = clamp(state.lane - 1, 0, 2);
    keys.left = false;
  }
  if (keys.right) {
    state.lane = clamp(state.lane + 1, 0, 2);
    keys.right = false;
  }

  const desiredX = laneToWorldX(state.lane);
  state.carX += (desiredX - state.carX) * 0.12;

  spawnCooldown -= delta;
  if (spawnCooldown <= 0) {
    spawnObstacle();
    spawnCooldown = clamp(1.2 - state.speed * 0.0025, 0.42, 1.2);
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obstacle = obstacles[i];
    obstacle.z -= state.speed * delta * 1.9;
    obstacle.lane += Math.sin((state.distance + i) * 0.018) * 0.003;

    if (obstacle.z <= -80) {
      obstacles.splice(i, 1);
      continue;
    }

    const p = project3D(obstacle.z, obstacle.lane);
    const carScreenX = p.x;
    const carScreenY = p.y;
    const carScale = p.scale;

    const hitX = Math.abs(carScreenX - state.carX) < 52 * carScale;
    const hitY = Math.abs(carScreenY - state.carY) < 72 * carScale;

    if (hitX && hitY && obstacle.z < 220) {
      endGame();
      return;
    }
  }

  updateUI();
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#071827');
  sky.addColorStop(0.35, '#12324a');
  sky.addColorStop(0.75, '#2a1d24');
  sky.addColorStop(1, '#170f14');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.5 + Math.sin(state.distance * 0.003) * 60;
  const sunY = h * 0.17;
  const glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 170);
  glow.addColorStop(0, 'rgba(250, 204, 21, 0.8)');
  glow.addColorStop(0.3, 'rgba(251, 146, 60, 0.24)');
  glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 180, sunY - 180, 360, 360);

  for (let i = 0; i < 16; i++) {
    const x = ((i * 149) % w);
    const y = h * (0.15 + ((i * 53) % 5) * 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawCity() {
  const horizonY = h * 0.22;
  const cityHeight = h * 0.24;
  for (let i = 0; i < 30; i++) {
    const x = (i * 75 + (state.distance * 0.3)) % (w + 100) - 50;
    const buildingWidth = 30 + ((i * 19) % 42);
    const buildingHeight = 30 + ((i * 37) % 90);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(x, horizonY - buildingHeight, buildingWidth, buildingHeight);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
    for (let j = 0; j < 6; j++) {
      const windowX = x + 6 + (j * 6);
      const windowY = horizonY - buildingHeight + 8 + ((j * 7) % 18);
      ctx.fillRect(windowX, windowY, 3, 6);
    }
  }

  ctx.fillStyle = 'rgba(17, 24, 39, 0.7)';
  ctx.fillRect(0, horizonY, w, cityHeight);
}

function drawRoad() {
  const horizonY = h * 0.22;
  const bottomY = h * 0.96;
  const roadHalfTop = 80;
  const roadHalfBottom = w * 0.38;

  const centerX = w * 0.5 + state.roadCurve;
  const leftA = { x: centerX - roadHalfTop, y: horizonY };
  const rightA = { x: centerX + roadHalfTop, y: horizonY };
  const leftB = { x: centerX - roadHalfBottom, y: bottomY };
  const rightB = { x: centerX + roadHalfBottom, y: bottomY };

  ctx.fillStyle = '#2d2f34';
  ctx.beginPath();
  ctx.moveTo(leftA.x, leftA.y);
  ctx.lineTo(rightA.x, rightA.y);
  ctx.lineTo(rightB.x, rightB.y);
  ctx.lineTo(leftB.x, leftB.y);
  ctx.closePath();
  ctx.fill();

  const grass = ctx.createLinearGradient(0, horizonY, 0, h);
  grass.addColorStop(0, '#14532d');
  grass.addColorStop(1, '#0f3d2b');
  ctx.fillStyle = grass;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(leftA.x, leftA.y);
  ctx.lineTo(leftB.x, leftB.y);
  ctx.moveTo(rightA.x, rightA.y);
  ctx.lineTo(rightB.x, rightB.y);
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const y1 = horizonY + Math.pow(t, 2) * (bottomY - horizonY);
    const y2 = horizonY + Math.pow((i + 1) / 12, 2) * (bottomY - horizonY);
    const lane1 = centerX - roadHalfTop + (t * (roadHalfBottom - roadHalfTop) * 0.8);
    const lane2 = centerX + roadHalfTop - (t * (roadHalfBottom - roadHalfTop) * 0.8);
    const lane3 = centerX - roadHalfTop + ((t + 0.5) * (roadHalfBottom - roadHalfTop) * 0.8);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lane1, y1);
    ctx.lineTo(lane2, y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(centerX, y1);
    ctx.lineTo(centerX, y2);
    ctx.stroke();

    if (i % 2 === 0) {
      const blinkT = (state.roadScroll * 0.09 + i * 0.3) % 1;
      const lineY = horizonY + blinkT * (bottomY - horizonY);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX - 20, lineY);
      ctx.lineTo(centerX + 20, lineY + 10);
      ctx.stroke();
    }
  }
}

function drawObstacle(obj) {
  const p = project3D(obj.z, obj.lane);
  const x = p.x;
  const y = p.y;
  const scale = p.scale;
  const width = obj.width * scale;
  const height = obj.height * scale;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = obj.color;
  ctx.fillRect(-width * 0.5, -height * 0.5, width, height);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.fillRect(-width * 0.2, -height * 0.12, width * 0.4, height * 0.38);

  const lightColor = '#fef3c7';
  ctx.fillStyle = lightColor;
  ctx.fillRect(-width * 0.3, -height * 0.54, width * 0.2, 6);
  ctx.fillRect(width * 0.1, -height * 0.54, width * 0.2, 6);

  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(-width * 0.3, height * 0.44, width * 0.2, 6);
  ctx.fillRect(width * 0.1, height * 0.44, width * 0.2, 6);

  ctx.restore();
}

function drawPlayerCar() {
  const x = state.carX;
  const y = state.carY;
  const width = state.carWidth;
  const height = state.carHeight;

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(-width * 0.5, -height * 0.5, width, height);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(-width * 0.25, -height * 0.14, width * 0.5, height * 0.35);

  const light = '#fef3c7';
  ctx.fillStyle = light;
  ctx.fillRect(-width * 0.28, -height * 0.54, width * 0.18, 8);
  ctx.fillRect(width * 0.1, -height * 0.54, width * 0.18, 8);

  ctx.fillStyle = '#fb7185';
  ctx.fillRect(-width * 0.28, height * 0.46, width * 0.18, 8);
  ctx.fillRect(width * 0.1, height * 0.46, width * 0.18, 8);

  if (keys.nitro && state.nitro > 0) {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.82)';
    ctx.fillRect(-width * 0.18, height * 0.52, width * 0.12, 18);
    ctx.fillRect(width * 0.06, height * 0.52, width * 0.12, 18);
  }

  ctx.restore();
}

function draw() {
  drawSky();
  drawCity();
  drawRoad();

  for (const obj of obstacles) {
    drawObstacle(obj);
  }

  drawPlayerCar();
}

function tick(timestamp) {
  const delta = Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016);
  lastTime = timestamp;

  update(delta);
  draw();
  requestAnimationFrame(tick);
}

function handlePointerStart(direction) {
  if (direction === 'left') keys.left = true;
  if (direction === 'right') keys.right = true;
  if (direction === 'nitro') keys.nitro = true;

  if (!state.started || state.gameOver) {
    startGame();
  }
}

function handlePointerEnd(direction) {
  if (direction === 'left') keys.left = false;
  if (direction === 'right') keys.right = false;
  if (direction === 'nitro') keys.nitro = false;
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = true;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = true;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyW') keys.nitro = true;
  if (event.code === 'Space' && (!state.started || state.gameOver)) {
    startGame();
  }
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyW') keys.nitro = false;
});

leftBtn.addEventListener('pointerdown', () => handlePointerStart('left'));
rightBtn.addEventListener('pointerdown', () => handlePointerStart('right'));
nitroBtn.addEventListener('pointerdown', () => handlePointerStart('nitro'));

leftBtn.addEventListener('pointerup', () => handlePointerEnd('left'));
rightBtn.addEventListener('pointerup', () => handlePointerEnd('right'));
nitroBtn.addEventListener('pointerup', () => handlePointerEnd('nitro'));

leftBtn.addEventListener('pointerleave', () => handlePointerEnd('left'));
rightBtn.addEventListener('pointerleave', () => handlePointerEnd('right'));
nitroBtn.addEventListener('pointerleave', () => handlePointerEnd('nitro'));

messageBox.addEventListener('pointerdown', () => {
  if (!state.started || state.gameOver) {
    startGame();
  }
});

window.addEventListener('resize', resize);

resize();
updateUI();
setMessage('READY', 'Press Space or tap to begin', true);
requestAnimationFrame(tick);
