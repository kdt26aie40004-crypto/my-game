'use strict';

// ============================================================
//  マップ
// ============================================================
function loadRoom(i) {
  roomIndex = i;
  room = ROOMS[i];
  grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (const [x, y, w, h] of room.solids)
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) grid[ty][tx] = 1;
  for (const [x, y, w] of room.spikes)
    for (let tx = x; tx < x + w; tx++) grid[y][tx] = 2;
  batteries = room.batteries.map(([x, y]) => ({ x: x * TILE + 4, y: y * TILE + 4, active: true, t: 0 }));
  gears = room.gears.map(([x, y], j) => {
    const key = i + '-' + j;
    return { x: x * TILE + 4, y: y * TILE + 4, key, got: collected.has(key) };
  });
  renderTiles();
  bannerT = 2.5;
}

function solidAt(tx, ty) {
  if (tx < 0) return true;
  if (tx >= COLS || ty < 0 || ty >= ROWS) return false;
  return grid[ty][tx] === 1;
}

function collide(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (solidAt(tx, ty)) return true;
  return false;
}
const hitAt = (dx, dy) => collide(P.x + dx, P.y + dy, P.w, P.h);

// トゲはタイル下部 3px だけが当たり判定
function spikeHit(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = Math.max(0, y0); ty <= Math.min(ROWS - 1, y1); ty++)
    for (let tx = Math.max(0, x0); tx <= Math.min(COLS - 1, x1); tx++) {
      if (grid[ty][tx] !== 2) continue;
      const sx = tx * TILE, sy = ty * TILE + 5;
      if (x < sx + TILE && x + w > sx && y < sy + 3 && y + h > sy) return true;
    }
  return false;
}
