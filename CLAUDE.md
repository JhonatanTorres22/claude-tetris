# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Tetris clásico implementado en JavaScript vanilla (sin frameworks, sin build, sin dependencias). Tres archivos componen todo el proyecto:

- `index.html` — DOM: canvas del tablero (`#board`, 300×600), canvas de la siguiente pieza (`#next-canvas`, 120×120), panel de score/lines/level, y overlay de pausa/game over.
- `style.css` — tema oscuro tipo arcade retro.
- `game.js` — toda la lógica del juego (~300 líneas, sin módulos, todo en scope global).

## Comandos

No hay build, ni test runner, ni linter, ni `package.json`. Para ejecutar el juego:

```bash
start index.html        # Windows: abrir directamente
# o servir estático, p. ej.:
npx serve .
python3 -m http.server 8000
```

No hay proceso de verificación automatizado: los cambios se comprueban abriendo el juego en el navegador y jugando manualmente.

## Arquitectura

Todo vive en `game.js` como funciones y variables globales que operan sobre un puñado de variables de estado mutables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`). No hay clases ni módulos ES6.

- **Tablero**: matriz `ROWS × COLS` (`createBoard`); cada celda es `0` (vacía) o un índice `1–8` en `COLORS`/`PIECES` que identifica el tipo de pieza.
- **Piezas**: `PIECES` define las 7 formas estándar más una pieza reto "tuerca" (`N`, índice 8: `[[8,8,8],[8,0,8],[8,8,8]]`, un anillo 3×3 con hueco vacío en el centro) como matrices cuadradas. `randomPiece` elige el tipo con `PIECES.length - 1` para incluir automáticamente cualquier pieza añadida al final del array. `rotateCW` rota transponiendo y luego invirtiendo filas — no hay tabla SRS, solo esta rotación simple.
- **Colisión** (`collide`): única función que valida límites del tablero y solapes; todo movimiento (mover, rotar, caer) pasa por ella antes de aplicarse.
- **Wall kicks** (`tryRotate`): tras rotar, prueba desplazamientos `[0, -1, 1, -2, 2]` en `x` hasta encontrar uno sin colisión; si ninguno funciona, la rotación se descarta.
- **Bucle de juego** (`loop`): un único `requestAnimationFrame` acumula `dt` en `dropAccum`; al superar `dropInterval` baja la pieza una fila o la fija (`lockPiece`) si no puede. `draw()` se llama en cada frame (grid + tablero fijado + ghost piece + pieza actual).
- **Fijar pieza** (`lockPiece` → `merge` + `clearLines` + `spawn`): al no poder seguir bajando, la pieza se escribe en `board`, se limpian líneas completas y se genera la siguiente.
- **Líneas y puntuación**: `clearLines` recorre el tablero de abajo hacia arriba eliminando filas completas; puntuación via `LINE_SCORES = [0,100,300,500,800]` multiplicada por `level`. El nivel sube cada 10 líneas y `dropInterval = max(100, 1000 − (level−1)×90)`.
- **Ghost piece** (`ghostY`): proyecta hacia abajo la posición final de la pieza actual con `collide`; se dibuja con `globalAlpha = 0.2` antes de la pieza real.
- **Game over**: se dispara en `spawn()` si la pieza recién generada ya colisiona en su posición inicial.
- **Input**: un único listener `keydown` global despacha por `e.code` (flechas, `KeyX` para rotar, `Space` para hard drop, `KeyP` para pausa). No hay debounce ni DAS/ARR (repetición de tecla depende del propio navegador).

### Parámetros ajustables (todos en `game.js`, arriba del archivo)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`, `dropInterval` inicial. Si cambias `COLS`/`ROWS`/`BLOCK`, actualiza también `width`/`height` de `<canvas id="board">` en `index.html` (deben ser `COLS×BLOCK` y `ROWS×BLOCK`).
