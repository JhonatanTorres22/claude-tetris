'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (nut), gris metálico
  '#ff5252', // 9  - Bomba
  '#fff176', // 10 - Rayo
  '#f06292', // 11 - Tinte
  '#4db6ac', // 12 - Gravedad
  '#4fc3f7', // 13 - Congelar
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (pieza reto, hueco en el centro)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// --- Power-ups ---
// Cada POWERUP_INTERVAL líneas eliminadas, la siguiente pieza generada es un
// power-up: una pieza especial de 1×1 que cae como cualquier otra. Al fijarse
// (lockPiece) NO se une al tablero como bloque normal: en su lugar dispara su
// efecto y desaparece. `colorIndex` reutiliza huecos de COLORS (9–13) para no
// interferir con randomPiece(), que solo recorre PIECES.
const POWERUP_INTERVAL = 10;
const POWERUP_BONUS = 250; // puntos extra (×level) al activar cualquier power-up

const POWERUPS = [
  { id: 'bomb', name: 'Bomba', colorIndex: 9, glyph: '💣' },
  { id: 'lightning', name: 'Rayo', colorIndex: 10, glyph: '⚡' },
  { id: 'dye', name: 'Tinte', colorIndex: 11, glyph: '🎨' },
  { id: 'gravity', name: 'Gravedad', colorIndex: 12, glyph: '⬇' },
  { id: 'freeze', name: 'Congelar', colorIndex: 13, glyph: '❄' },
];

const POWERUP_GLYPHS = {};
POWERUPS.forEach(p => { POWERUP_GLYPHS[p.colorIndex] = p.glyph; });

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const nextLabelEl = document.getElementById('next-label');
const nextSection = document.getElementById('next-section');
const powerupCountdownEl = document.getElementById('powerup-countdown');
const statusSection = document.getElementById('status-section');
const statusEl = document.getElementById('powerup-status');

const THEME_STORAGE_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSincePowerUp, pendingPowerUp, freezeRemaining;

function getCSSVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePieceFromShape(shape) {
  return { shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, ...makePieceFromShape(shape) };
}

function randomPowerUpPiece() {
  const def = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  return { power: def.id, ...makePieceFromShape([[def.colorIndex]]) };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSincePowerUp += cleared;
    while (linesSincePowerUp >= POWERUP_INTERVAL) {
      linesSincePowerUp -= POWERUP_INTERVAL;
      pendingPowerUp = true;
    }
    updateHUD();
  }
}

function applyPowerUp(type) {
  switch (type) {
    case 'bomb': bombEffect(); break;
    case 'lightning': lightningEffect(); break;
    case 'dye': dyeEffect(); break;
    case 'gravity': gravityEffect(); break;
    case 'freeze': freezeEffect(); break;
  }
  score += POWERUP_BONUS * level;
}

function bombEffect() {
  // Destruye un área 3×3 centrada en la celda donde aterrizó la pieza.
  const cx = current.x, cy = current.y;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nx = cx + dc, ny = cy + dr;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) board[ny][nx] = 0;
    }
}

function lightningEffect() {
  // Limpia toda la fila y toda la columna donde aterrizó la pieza.
  const cx = current.x, cy = current.y;
  if (cy >= 0 && cy < ROWS) board[cy].fill(0);
  for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
}

function dyeEffect() {
  // Detecta el color más frecuente en el tablero y elimina todos sus bloques.
  const counts = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
  const colorKeys = Object.keys(counts);
  if (!colorKeys.length) return;
  const target = Number(colorKeys.reduce((a, b) => (counts[a] >= counts[b] ? a : b)));
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = 0;
}

function gravityEffect() {
  // Compacta cada columna: los bloques caen hacia abajo eliminando huecos,
  // conservando su orden relativo.
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) values.push(board[r][c]);
    for (let r = 0; r < ROWS; r++) board[r][c] = 0;
    for (let i = 0; i < values.length; i++) board[ROWS - values.length + i][c] = values[i];
  }
}

function freezeEffect() {
  // Pausa la caída automática (no la del jugador) durante 5 segundos.
  freezeRemaining = 5000;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.power) {
    applyPowerUp(current.power);
  } else {
    merge();
  }
  clearLines();
  spawn();
  updateHUD();
}

function spawn() {
  current = next;
  next = pendingPowerUp ? randomPowerUpPiece() : randomPiece();
  pendingPowerUp = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  powerupCountdownEl.textContent = POWERUP_INTERVAL - linesSincePowerUp;
}

function updateFreezeIndicator() {
  if (freezeRemaining > 0) {
    statusSection.hidden = false;
    statusEl.textContent = `❄ Congelado (${Math.ceil(freezeRemaining / 1000)}s)`;
  } else {
    statusSection.hidden = true;
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  const glyph = POWERUP_GLYPHS[colorIndex];
  if (glyph) {
    context.fillStyle = '#0f0f17';
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(glyph, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getCSSVar('--grid-color', '#22222e');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  const def = next.power && POWERUPS.find(p => p.id === next.power);
  nextLabelEl.textContent = def ? def.name : '';
  nextSection.classList.toggle('power-incoming', !!def);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
        if (gameOver) {
          draw();
          return;
        }
      }
    }
  }
  updateFreezeIndicator();
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSincePowerUp = 0;
  pendingPowerUp = false;
  freezeRemaining = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  updateFreezeIndicator();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
init();
