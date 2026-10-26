'use strict';

// ============================================================
//  ゲーム状態
// ============================================================
let state = 'title';
let roomIndex = 0, room = null, grid = [];
let batteries = [], gears = [];
const collected = new Set();
let deaths = 0, playTime = 0, clearTime = 0;
let t = 0, freezeT = 0, shakeT = 0, shakeAmt = 0, fadeT = 0, bannerT = 0, winT = 0;
let particles = [], afterimages = [];

const P = {
  x: 0, y: 0, w: 6, h: 8, vx: 0, vy: 0, remX: 0, remY: 0,
  facing: 1, onGround: false, dead: false, deathT: 0,
  dashes: 1, maxDashes: 1, dashing: false, dashT: 0, dashDir: { x: 1, y: 0 },
  dashCD: 0, dashRefillT: 0, afterT: 0,
  coyote: 0, jumpBuf: 0, varJumpT: 0, varJumpSpeed: 0, forceT: 0, forceDir: 0,
  stamina: STAMINA, grabbing: false, grabDir: 0,
  sx: 1, sy: 1, runT: 0,
  ant: { x: 0, y: 0, vx: 0, vy: 0 },   // アンテナ先端（バネで揺れる）
};
