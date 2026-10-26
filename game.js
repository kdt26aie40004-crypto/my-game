'use strict';

// ============================================================
//  基本設定
// ============================================================
const TILE = 8, COLS = 40, ROWS = 23;
const W = COLS * TILE, H = ROWS * TILE; // 320 x 184
const DT = 1 / 60;

const view = document.getElementById('game');
const vctx = view.getContext('2d');
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const ctx = buf.getContext('2d');
const tileCanvas = document.createElement('canvas');
tileCanvas.width = W; tileCanvas.height = H;
const tctx = tileCanvas.getContext('2d');

let scale = 3;
function resize() {
  scale = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  view.width = W * scale;
  view.height = H * scale;
}
addEventListener('resize', resize);
resize();

// ============================================================
//  物理パラメータ（単位: px/秒）
// ============================================================
const MAX_RUN = 90, RUN_ACCEL = 1000, RUN_REDUCE = 400, AIR_MULT = 0.65;
const GRAVITY = 900, HALF_GRAV_THRESHOLD = 40, MAX_FALL = 160, FAST_FALL = 240;
const JUMP_SPEED = -105, JUMP_H_BOOST = 40, VAR_JUMP_TIME = 0.2;
const WALL_JUMP_H = 130, WALL_JUMP_FORCE_TIME = 0.16, WALL_SLIDE_MAX = 40;
const DASH_SPEED = 240, DASH_TIME = 0.15, END_DASH_SPEED = 160, END_DASH_UP_MULT = 0.75;
const SUPER_SPEED = 260, HYPER_SPEED = 325;
const CLIMB_UP = -45, CLIMB_DOWN = 80;
const STAMINA = 110, CLIMB_UP_COST = 45.45, CLIMB_STILL_COST = 10, CLIMB_JUMP_COST = 27.5;
const COYOTE_TIME = 0.1, JUMP_BUFFER = 0.1;

// ============================================================
//  色
// ============================================================
const CORE_READY = '#47e0ff';   // ダッシュ可能
const DASH_COLOR = '#3d8bff';   // ダッシュ中の残像（ホログラム風の電光ブルー）
const CORE_EMPTY = '#55606e';   // ダッシュ使用済み
const CORE_WARN = '#ff5a4a';    // スタミナ切れ間近

// ============================================================
//  入力（キーボード + マウス）
// ============================================================
const BIND = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyC', 'Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  grab: ['Mouse0'],               // 左クリック
  retry: ['KeyR'],
  skip: ['Enter'],                // 会話をスキップ
};
const keys = {}, pressed = {};
function press(code) {
  if (!keys[code]) pressed[code] = true;
  keys[code] = true;
  if (!actx) { try { actx = new AudioContext(); } catch (_) { /* 音なしで続行 */ } }
}
addEventListener('keydown', e => {
  press(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Escape') document.body.style.cursor = '';
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  press('Mouse' + e.button);
  e.preventDefault();
  if (state === 'play') document.body.style.cursor = 'none';
});
addEventListener('mouseup', e => { keys['Mouse' + e.button] = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const held = a => BIND[a].some(k => keys[k]);
const hit = a => BIND[a].some(k => pressed[k]);
function clearPressed() { for (const k in pressed) delete pressed[k]; }

// ============================================================
//  効果音（WebAudio で簡易生成）
// ============================================================
let actx = null;
const SFX = {
  jump: [420, 640, 0.08, 'square', 0.04],
  dash: [260, 90, 0.16, 'sawtooth', 0.05],
  death: [320, 40, 0.45, 'square', 0.06],
  gear: [660, 1320, 0.2, 'triangle', 0.08],
  battery: [880, 1760, 0.15, 'sine', 0.08],
  win: [523, 1046, 0.8, 'triangle', 0.08],
  talk: [900, 700, 0.03, 'square', 0.015],
};
function sfx(name) {
  if (!actx) return;
  const [f0, f1, d, wave, vol] = SFX[name];
  const now = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(f1, now + d);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + d);
  o.connect(g).connect(actx.destination);
  o.start(now);
  o.stop(now + d);
}

// ============================================================
//  ステージ（座標はすべてタイル単位）
//  solids: [x, y, 幅, 高さ]   spikes: [x, y, 幅]
//  右端・上端の開いている所が出口。下に落ちるとミス。
//  チュートリアル 3部屋 → 登りステージ 3部屋 → ゴール
// ============================================================
const ROOMS = [
  // ---------- チュートリアル ----------
  {
    name: 'チュートリアル 1. 遺跡の入口',
    spawn: [3, 19],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 16], [0, 20, 12, 3], [12, 22, 4, 1],
             [16, 20, 8, 3], [24, 18, 5, 5], [29, 20, 11, 3]],
    spikes: [[12, 21, 4]],
    gears: [[20, 16]],
    batteries: [],
    hints: [[3, 6, '← → で移動\nC / Space でジャンプ（長押しで高く）']],
  },
  {
    name: 'チュートリアル 2. 崩れた橋',
    spawn: [3, 19],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 9], [0, 20, 8, 3], [8, 22, 14, 1],
             [15, 19, 3, 1], [22, 20, 6, 3], [28, 13, 4, 10], [32, 13, 8, 10]],
    spikes: [[8, 21, 14]],
    gears: [[25, 12]],
    batteries: [],
    hints: [[3, 5, 'Shift でダッシュ！（方向キーで8方向）\n空中では1回だけ。目の光が消えると使えない']],
  },
  {
    name: 'チュートリアル 3. 見張りの塔',
    spawn: [2, 19],
    solids: [[0, 0, 34, 1], [38, 0, 2, 1], [0, 0, 1, 23], [39, 0, 1, 23], [0, 20, 40, 3],
             [6, 6, 2, 14], [12, 8, 4, 1], [23, 6, 3, 1], [30, 4, 3, 1]],
    spikes: [[8, 19, 31]],
    gears: [[10, 13]],
    batteries: [[19, 6]],
    hints: [[11, 14, '左クリック長押しで壁につかまる（↑↓で登り降り）\n壁ぎわでジャンプ → 壁キック\nバッテリーでダッシュ回復']],
  },
  // ---------- 登りステージ（上へ抜けると次へ） ----------
  {
    name: 'ステージ 1. 崩れた階段',
    spawn: [3, 19],
    solids: [[0, 0, 30, 1], [35, 0, 5, 1], [0, 0, 1, 23], [39, 0, 1, 23], [0, 20, 40, 3],
             [8, 17, 4, 1], [15, 14, 4, 1], [8, 11, 4, 1], [16, 8, 4, 1], [26, 6, 4, 1]],
    spikes: [[14, 19, 25]],
    gears: [[4, 8]],
    batteries: [],
    hints: [],
  },
  {
    name: 'ステージ 2. 古い縦穴',
    spawn: [18, 19],
    solids: [[0, 0, 16, 9], [0, 9, 12, 3], [0, 12, 16, 11], [22, 0, 18, 23], [16, 20, 6, 3],
             [16, 13, 2, 1], [20, 6, 2, 1]],
    spikes: [[20, 19, 2]],
    gears: [[13, 10]],
    batteries: [[18, 3]],
    hints: [],
  },
  {
    name: 'ステージ 3. 風の崖',
    spawn: [34, 19],
    solids: [[0, 0, 4, 1], [9, 0, 31, 1], [0, 0, 1, 23], [39, 0, 1, 23], [30, 20, 9, 3],
             [1, 22, 29, 1], [24, 17, 3, 1], [17, 14, 3, 1], [6, 9, 3, 1]],
    spikes: [[1, 21, 29]],
    gears: [[38, 9]],
    batteries: [[13, 11], [7, 4]],
    hints: [],
  },
  // ---------- ダッシュ必須ステージ ----------
  // 足場の間はジャンプだけでは届かない距離（横7〜8タイル / 縦5タイル以上）にしてある
  {
    name: 'ステージ 4. 浮き石の道',
    spawn: [2, 16],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 10], [39, 15, 1, 8], [0, 17, 5, 6],
             [5, 22, 34, 1], [13, 17, 3, 1], [23, 15, 3, 1], [33, 13, 7, 2]],
    spikes: [[5, 21, 34]],
    gears: [[14, 9]],
    batteries: [],
    hints: [[6, 4, 'ここからはダッシュ必須！\nジャンプしてから Shift で遠くまで届く']],
  },
  {
    name: 'ステージ 5. 吹き抜け',
    spawn: [19, 19],
    solids: [[0, 0, 12, 1], [19, 0, 21, 1], [0, 0, 1, 23], [39, 0, 1, 23], [16, 20, 8, 3],
             [1, 22, 15, 1], [24, 22, 15, 1], [26, 14, 3, 1], [14, 8, 3, 1]],
    spikes: [[1, 21, 15], [24, 21, 15]],
    gears: [[31, 9]],
    batteries: [[21, 10]],
    hints: [[2, 12, '上へのダッシュで\n高い足場へ']],
  },
  {
    name: 'ステージ 6. バッテリーの橋',
    spawn: [2, 7],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [0, 8, 5, 15], [5, 22, 30, 1], [35, 14, 5, 9],
             [39, 0, 1, 11]],
    spikes: [[5, 21, 30]],
    gears: [[25, 13]],
    batteries: [[12, 7], [20, 9], [28, 11]],
    hints: [[6, 2, 'バッテリーをつないで渡れ！\n空中でふれるとダッシュが回復する']],
  },
  // ---------- 後半ステージ（今までの動きの組み合わせ） ----------
  {
    // ダッシュ必須: 浮いた足場の間が7〜8タイル
    name: 'ステージ 7. 歯車の工場',
    theme: 'ruins',
    spawn: [2, 19],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 15], [0, 20, 5, 3], [5, 22, 28, 1],
             [12, 19, 3, 1], [22, 17, 3, 1], [33, 18, 7, 5]],
    spikes: [[5, 21, 28]],
    gears: [[18, 12]],
    batteries: [],
    hints: [],
  },
  {
    name: 'ステージ 8. 煙突',
    theme: 'ruins',
    spawn: [3, 19],
    solids: [[0, 0, 27, 1], [33, 0, 7, 1], [0, 0, 1, 23], [39, 0, 1, 23], [0, 20, 40, 3],
             [8, 5, 2, 15], [16, 7, 4, 1], [24, 3, 2, 10]],
    spikes: [[10, 19, 29]],
    gears: [[4, 3]],
    batteries: [],
    hints: [],
  },
  {
    // ダッシュ必須: 細い鉄骨が上下しながら6〜7タイルおきに並ぶ（つかまれる壁がない）
    name: 'ステージ 9. 鉄骨の谷',
    theme: 'ruins',
    spawn: [1, 16],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 7], [39, 11, 1, 12], [0, 17, 4, 6],
             [4, 22, 35, 1], [11, 14, 2, 1], [20, 15, 2, 1], [29, 12, 2, 1], [37, 10, 3, 1]],
    spikes: [[4, 21, 35]],
    gears: [[25, 6]],
    batteries: [],
    hints: [],
  },
  {
    name: 'ステージ 10. ピストンの塔',
    theme: 'ruins',
    spawn: [15, 19],
    solids: [[0, 0, 14, 23], [26, 0, 14, 23], [14, 20, 12, 3],
             [22, 17, 4, 1], [14, 14, 4, 1], [22, 11, 4, 1], [14, 8, 4, 1], [22, 5, 4, 1]],
    spikes: [[18, 19, 8], [15, 13, 1], [23, 10, 2]],
    gears: [[20, 9]],
    batteries: [],
    hints: [],
  },
  {
    name: 'ステージ 11. スクラップの山',
    theme: 'ruins',
    spawn: [3, 19],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 5], [34, 8, 6, 15], [0, 20, 14, 3],
             [18, 6, 3, 17], [14, 22, 4, 1], [21, 22, 13, 1], [15, 17, 2, 1]],
    spikes: [[14, 21, 4], [21, 21, 13]],
    gears: [[16, 10]],
    batteries: [[26, 5]],
    hints: [],
  },
  {
    // ダッシュ必須: 壁から離れた足場を6段ずつ上へ（ジャンプだけでは届かない高さ）
    name: 'ステージ 12. 崩れた昇降機',
    theme: 'ruins',
    spawn: [19, 19],
    solids: [[0, 0, 14, 1], [21, 0, 19, 1], [0, 0, 1, 23], [39, 0, 1, 23], [17, 20, 6, 3],
             [1, 22, 16, 1], [23, 22, 16, 1], [10, 14, 3, 1], [24, 8, 3, 1], [16, 3, 3, 1]],
    spikes: [[1, 21, 16], [23, 21, 16]],
    gears: [[31, 5]],
    batteries: [[18, 9]],
    hints: [],
  },
  {
    name: 'ステージ 13. 歯車のつり橋',
    theme: 'ruins',
    spawn: [2, 15],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 13], [0, 16, 6, 7], [33, 16, 7, 7],
             [6, 22, 27, 1], [12, 16, 2, 1], [21, 13, 2, 1]],
    spikes: [[6, 21, 27]],
    gears: [[21, 6]],
    batteries: [[17, 12], [27, 12]],
    hints: [],
  },
  {
    name: 'ステージ 14. 崩落の縦穴',
    theme: 'ruins',
    spawn: [3, 19],
    solids: [[0, 0, 30, 1], [36, 0, 4, 1], [0, 0, 1, 23], [39, 0, 1, 23], [1, 20, 7, 3],
             [8, 22, 31, 1], [12, 15, 3, 1], [5, 10, 3, 1], [14, 6, 3, 1], [29, 6, 3, 1]],
    spikes: [[8, 21, 31]],
    gears: [[1, 4]],
    batteries: [[22, 5]],
    hints: [],
  },
  {
    name: 'ステージ 15. スパークの回廊',
    theme: 'ruins',
    spawn: [2, 19],
    solids: [[0, 0, 39, 15], [0, 0, 1, 23], [39, 0, 1, 15], [35, 18, 5, 5], [1, 20, 5, 3],
             [14, 20, 3, 3], [25, 20, 3, 3], [6, 22, 29, 1]],
    spikes: [[6, 21, 8], [17, 21, 8], [28, 21, 7]],
    gears: [[21, 16]],
    batteries: [],
    hints: [],
  },
  {
    name: 'ステージ 16. 最後の登り',
    theme: 'ruins',
    spawn: [2, 19],
    solids: [[0, 0, 18, 1], [24, 0, 16, 1], [0, 0, 1, 23], [39, 0, 1, 23], [1, 20, 38, 3],
             [8, 8, 2, 12], [16, 10, 3, 1], [30, 6, 3, 1], [20, 3, 4, 1]],
    spikes: [[10, 19, 29]],
    gears: [[38, 9]],
    batteries: [[23, 6]],
    hints: [],
  },
  // ---------- ゴール ----------
  {
    // 最後の試練: 小さな足場（トゲで安全な所は1マスだけ）→ バッテリー2つ → 天井近くのゲート
    name: '頂上のゲート',
    theme: 'ruins',
    spawn: [2, 19],
    solids: [[0, 0, 40, 1], [0, 0, 1, 23], [39, 0, 1, 23], [1, 20, 4, 3], [5, 22, 34, 1],
             [11, 18, 2, 1], [19, 15, 2, 1], [29, 13, 2, 1], [33, 4, 6, 1]],
    spikes: [[5, 21, 34], [20, 14, 1], [33, 3, 1]],
    gears: [[20, 8]],
    batteries: [[25, 12], [30, 7]],
    goal: [36, 3],
    hints: [[3, 10, '最後の試練。\nゲートは天井の近くだ']],
  },
];
const TOTAL_GEARS = ROOMS.reduce((n, r) => n + r.gears.length, 0);

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

// ============================================================
//  プレイヤー（小さなロボット）
// ============================================================
const approach = (v, target, amount) => v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);

function placePlayer() {
  const [sx, sy] = room.spawn;
  Object.assign(P, {
    x: sx * TILE + 1, y: sy * TILE, vx: 0, vy: 0, remX: 0, remY: 0,
    onGround: false, dead: false, dashes: P.maxDashes, dashing: false,
    dashCD: 0, dashRefillT: 0, coyote: 0, jumpBuf: 0, varJumpT: 0, forceT: 0,
    stamina: STAMINA, grabbing: false, sx: 1, sy: 1, facing: 1, runT: 0,
  });
  const base = antennaBase();
  P.ant = { x: base.x, y: base.y - 4, vx: 0, vy: 0 };
  afterimages = [];
}

function jump(ix) {
  P.jumpBuf = 0; P.coyote = 0;
  P.vy = JUMP_SPEED;
  P.vx += ix * JUMP_H_BOOST;
  P.varJumpT = VAR_JUMP_TIME; P.varJumpSpeed = P.vy;
  P.sx = 0.6; P.sy = 1.4;
  dust(P.x + P.w / 2, P.y + P.h, 4);
  sfx('jump');
}

function wallJump(dir) {
  P.jumpBuf = 0; P.coyote = 0;
  P.vx = dir * WALL_JUMP_H; P.vy = JUMP_SPEED;
  P.varJumpT = VAR_JUMP_TIME; P.varJumpSpeed = P.vy;
  P.forceT = WALL_JUMP_FORCE_TIME; P.forceDir = dir; P.facing = dir;
  P.sx = 0.6; P.sy = 1.4;
  sparks(dir > 0 ? P.x : P.x + P.w, P.y + P.h / 2, 5);
  sfx('jump');
}

function startDash(ix, iy) {
  let dx = ix, dy = iy;
  if (dx === 0 && dy === 0) dx = P.facing;
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  P.dashes--;
  P.dashing = true; P.dashT = DASH_TIME; P.dashDir = { x: dx, y: dy };
  P.dashCD = 0.2; P.dashRefillT = 0.1; P.afterT = 0;
  P.vx = dx * DASH_SPEED; P.vy = dy * DASH_SPEED;
  P.grabbing = false; P.varJumpT = 0; P.forceT = 0;
  if (dx !== 0) P.facing = Math.sign(dx);
  freezeT = 0.05;
  shake(0.15, 2);
  burst(P.x + P.w / 2, P.y + P.h / 2, 8, DASH_COLOR, 60);
  sfx('dash');
}

function updatePlayer(dt) {
  const ix = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  const iy = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);

  const wasGround = P.onGround;
  P.onGround = P.vy >= 0 && hitAt(0, 1);
  if (P.onGround) {
    if (!wasGround) { P.sx = 1.4; P.sy = 0.65; dust(P.x + P.w / 2, P.y + P.h, 3); }
    P.coyote = COYOTE_TIME;
    P.stamina = STAMINA;
    if (!P.dashing && P.dashRefillT <= 0) P.dashes = P.maxDashes;
    P.runT += Math.abs(P.vx) * dt;
  } else {
    P.coyote -= dt;
  }

  P.dashCD -= dt; P.dashRefillT -= dt; P.varJumpT -= dt; P.forceT -= dt;
  P.jumpBuf = hit('jump') ? JUMP_BUFFER : P.jumpBuf - dt;
  if (ix !== 0 && !P.grabbing && !P.dashing && P.forceT <= 0) P.facing = ix;

  if (hit('dash') && P.dashes > 0 && P.dashCD <= 0) startDash(ix, iy);

  if (P.dashing) {
    P.dashT -= dt;
    P.afterT -= dt;
    if (P.afterT <= 0) {
      P.afterT = 0.04;
      afterimages.push({ x: P.x, y: P.y, sx: P.sx, sy: P.sy, life: 0.3 });
    }
    if (P.jumpBuf > 0 && P.coyote > 0 && P.dashDir.y >= 0 && P.dashDir.x !== 0) {
      // 地上ダッシュ中のジャンプ → スーパー / ハイパー
      const hyper = P.dashDir.y > 0;
      P.dashing = false;
      jump(0);
      P.vx = Math.sign(P.dashDir.x) * (hyper ? HYPER_SPEED : SUPER_SPEED);
      if (hyper) { P.vy *= 0.5; P.varJumpSpeed = P.vy; }
    } else if (P.dashT <= 0) {
      P.dashing = false;
      if (P.dashDir.y <= 0) {
        P.vx = P.dashDir.x * END_DASH_SPEED;
        P.vy = P.dashDir.y * END_DASH_SPEED;
        if (P.vy < 0) P.vy *= END_DASH_UP_MULT;
      }
    }
  } else {
    const wallDir = hitAt(P.facing, 0) ? P.facing : (hitAt(-P.facing, 0) ? -P.facing : 0);

    // つかまり解除（壁の上端まで登ったら、よじ登る）
    if (P.grabbing && (!held('grab') || wallDir !== P.grabDir || P.stamina <= 0)) {
      P.grabbing = false;
      if (held('grab') && P.vy < 0 && !hitAt(P.grabDir, 0)) {
        P.vy = -100;
        P.vx = P.grabDir * 50;
        P.forceT = 0.12; P.forceDir = P.grabDir;
      }
    }
    if (!P.grabbing && held('grab') && wallDir !== 0 && P.stamina > 0 && P.vy >= 0) {
      P.grabbing = true; P.grabDir = wallDir; P.facing = wallDir;
      P.vx = 0; P.vy = 0; P.varJumpT = 0;
    }

    if (P.grabbing) {
      P.vx = 0;
      if (iy < 0) { P.vy = CLIMB_UP; P.stamina -= CLIMB_UP_COST * dt; P.runT += 45 * dt; }
      else if (iy > 0) P.vy = CLIMB_DOWN;
      else { P.vy = 0; P.stamina -= CLIMB_STILL_COST * dt; }
      if (P.jumpBuf > 0) {
        P.grabbing = false;
        if (ix === -P.grabDir) wallJump(-P.grabDir);
        else { jump(0); P.stamina -= CLIMB_JUMP_COST; }
      }
    } else {
      // 横移動
      const mx = P.forceT > 0 ? P.forceDir : ix;
      const mult = P.onGround ? 1 : AIR_MULT;
      if (Math.abs(P.vx) > MAX_RUN && Math.sign(P.vx) === mx)
        P.vx = approach(P.vx, MAX_RUN * mx, RUN_REDUCE * mult * dt);
      else
        P.vx = approach(P.vx, MAX_RUN * mx, RUN_ACCEL * mult * dt);

      // 重力（頂点付近でジャンプ押しっぱなしなら半分）
      if (!P.onGround) {
        let maxFall = iy > 0 ? FAST_FALL : MAX_FALL;
        const sliding = wallDir !== 0 && ix === wallDir && P.vy > 0;
        if (sliding) maxFall = WALL_SLIDE_MAX;
        const g = (Math.abs(P.vy) < HALF_GRAV_THRESHOLD && held('jump')) ? GRAVITY * 0.5 : GRAVITY;
        P.vy = approach(P.vy, maxFall, g * dt);
        if (sliding && Math.random() < 0.3) sparks(wallDir > 0 ? P.x + P.w : P.x, P.y + P.h, 1);
      }

      // 可変ジャンプ
      if (P.varJumpT > 0) {
        if (held('jump')) P.vy = Math.min(P.vy, P.varJumpSpeed);
        else P.varJumpT = 0;
      }

      if (P.jumpBuf > 0) {
        if (P.coyote > 0) jump(ix);
        else if (hitAt(3, 0)) wallJump(-1);
        else if (hitAt(-3, 0)) wallJump(1);
      }
    }
  }

  moveX(P.vx * dt);
  moveY(P.vy * dt);

  P.sx = approach(P.sx, 1, 1.75 * dt);
  P.sy = approach(P.sy, 1, 1.75 * dt);
  updateAntenna(dt);

  if (hit('retry') || P.y > H || spikeHit(P.x, P.y, P.w, P.h)) { die(); return; }
  if (P.x + P.w / 2 > W || P.y + P.h / 2 < 0) nextRoom();
}

function moveX(amount) {
  P.remX += amount;
  let m = Math.round(P.remX);
  P.remX -= m;
  const s = Math.sign(m);
  while (m !== 0) {
    if (hitAt(s, 0)) { P.vx = 0; P.remX = 0; break; }
    P.x += s; m -= s;
  }
}

function moveY(amount) {
  P.remY += amount;
  let m = Math.round(P.remY);
  P.remY -= m;
  const s = Math.sign(m);
  while (m !== 0) {
    if (!hitAt(0, s)) { P.y += s; m -= s; continue; }
    // 天井の角に頭をぶつけたら少し横にずらす
    let corrected = false;
    if (s < 0) {
      for (const d of [1, -1, 2, -2, 3, -3]) {
        if (!collide(P.x + d, P.y + s, P.w, P.h) && !hitAt(d, 0)) { P.x += d; corrected = true; break; }
      }
    }
    if (!corrected) { P.vy = 0; P.remY = 0; break; }
  }
}

// 頭のてっぺん中央（アンテナの根元）
function antennaBase() {
  const by = Math.round(P.y + P.h);
  return { x: Math.round(P.x + P.w / 2), y: by - Math.round(9 * P.sy) };
}

// アンテナ先端をバネで追従させる（動きに遅れて揺れる）
function updateAntenna(dt) {
  const base = antennaBase();
  const a = P.ant;
  const tx = base.x, ty = base.y - 4;
  a.vx += ((tx - a.x) * 320 - a.vx * 12) * dt;
  a.vy += ((ty - a.y) * 320 - a.vy * 12) * dt;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  const dx = a.x - base.x, dy = a.y - base.y, d = Math.hypot(dx, dy);
  if (d > 5) { a.x = base.x + dx / d * 5; a.y = base.y + dy / d * 5; }
}

function coreColor() {
  if (P.grabbing && P.stamina < 20 && Math.floor(t * 10) % 2 === 0) return CORE_WARN;
  return P.dashes > 0 ? CORE_READY : CORE_EMPTY;
}

function die() {
  if (P.dead) return;
  P.dead = true; P.deathT = 0.8;
  deaths++;
  shake(0.3, 3);
  const cx = P.x + P.w / 2, cy = P.y + P.h / 2;
  for (const c of ['#d8e0ea', '#7d8fa6', '#ffcc33', coreColor()]) burst(cx, cy, 4, c, 110, 300);
  sfx('death');
}

function respawn() {
  loadRoom(roomIndex);
  bannerT = 0;
  placePlayer();
  fadeT = 0.25;
}

function nextRoom() {
  loadRoom(roomIndex + 1);
  placePlayer();
  fadeT = 0.3;
}

// ============================================================
//  エフェクト
// ============================================================
function shake(time, amt) { shakeT = Math.max(shakeT, time); shakeAmt = Math.max(shakeAmt, amt); }

function dust(x, y, n) {
  for (let i = 0; i < n; i++)
    particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 20,
                     g: 30, life: 0.3, max: 0.3, color: '#e8c9a0', size: 1 });
}

function sparks(x, y, n) {
  for (let i = 0; i < n; i++)
    particles.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40,
                     g: 200, life: 0.25, max: 0.25, color: Math.random() < 0.5 ? '#ffd23f' : '#ff8a3d', size: 1 });
}

// 小さな歯車を回転させながら飛び散らせる
function burst(x, y, n, color, speed, gravity = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.5 + Math.random() * 0.5);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                     g: gravity, life: 0.5, max: 0.5, color, size: 2,
                     gear: true, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 20 });
  }
}

// 夕暮れに漂う光の粒
const MOTES = Array.from({ length: 35 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  sp: 4 + Math.random() * 10, ph: Math.random() * 6,
}));

function updateEffects(dt) {
  for (const m of MOTES) {
    m.y -= m.sp * dt;
    m.x += Math.sin(t * 0.8 + m.ph) * 6 * dt;
    if (m.y < 0) { m.y += H; m.x = Math.random() * W; }
  }
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
    if (p.gear) { p.rot += p.vr * dt; p.vx *= 0.96; p.vy = p.g ? p.vy : p.vy * 0.96; }
  }
  particles = particles.filter(p => p.life > 0);
  for (const a of afterimages) a.life -= dt;
  afterimages = afterimages.filter(a => a.life > 0);
  if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeAmt = 0; }
  if (fadeT > 0) fadeT -= dt;
  if (bannerT > 0) bannerT -= dt;
}

// ============================================================
//  アイテム・ゴール
// ============================================================
function touches(cx, cy, r) {
  return P.x < cx + r && P.x + P.w > cx - r && P.y < cy + r && P.y + P.h > cy - r;
}

function goalPos() {
  return { x: room.goal[0] * TILE + 4, y: (room.goal[1] + 1) * TILE - 12 };
}

function updateEntities(dt) {
  for (const b of batteries) {
    if (!b.active) {
      b.t -= dt;
      if (b.t <= 0) { b.active = true; burst(b.x, b.y, 6, CORE_READY, 30); }
    } else if (!P.dead && touches(b.x, b.y, 5) && (P.dashes < P.maxDashes || P.stamina < 20)) {
      P.dashes = P.maxDashes; P.stamina = STAMINA;
      b.active = false; b.t = 2.5;
      freezeT = 0.05;
      burst(b.x, b.y, 10, CORE_READY, 70);
      sfx('battery');
    }
  }
  for (const g of gears) {
    if (!g.got && !P.dead && touches(g.x, g.y, 5)) {
      g.got = true;
      collected.add(g.key);
      burst(g.x, g.y, 12, '#ffcc33', 60);
      sfx('gear');
    }
  }
  if (room.goal) {
    const gp = goalPos();
    if (Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2;
      particles.push({ x: gp.x + Math.cos(a) * 6, y: gp.y + Math.sin(a) * 12, vx: 0, vy: -15,
                       g: 0, life: 0.6, max: 0.6, color: '#c9a4ff', size: 1 });
    }
    if (!P.dead && touches(gp.x, gp.y, 10)) {
      state = 'win'; winT = 0; clearTime = playTime;
      for (let i = 0; i < 4; i++) burst(gp.x, gp.y, 15, ['#ffcc33', '#c9a4ff', CORE_READY, '#ff8a3d'][i], 120);
      sfx('win');
    }
  }
}

// ============================================================
//  メインループ
// ============================================================
// ============================================================
//  オープニングの会話（ゲートをめざす理由）
// ============================================================
const STORY = [
  { who: 'robot', text: 'ピピッ。目標は遺跡の頂上の「ゲート」。彼の地へ向かいます。' },
];
const SPEAKERS = {
  record: { name: '博士の記録', color: '#5cf27a' },
  robot: { name: 'No.7', color: CORE_READY },
};
let storyIndex = 0, storyChars = 0;

function beginStory() {
  state = 'story';
  storyIndex = 0; storyChars = 0;
  loadRoom(0);
  bannerT = 0;
  placePlayer();
  fadeT = 0.4;
  document.body.style.cursor = 'none';
}

function updateStory(dt) {
  const line = STORY[storyIndex].text;
  const before = Math.floor(storyChars);
  storyChars = Math.min(line.length, storyChars + 30 * dt);
  const now = Math.floor(storyChars);
  if (now > before && now % 2 === 0 && line[now - 1] !== '\n') sfx('talk');
  if (hit('skip')) { startGame(); return; }
  if (!hit('jump')) return;
  if (storyChars < line.length) storyChars = line.length;          // 文字送りを一気に表示
  else if (++storyIndex >= STORY.length) startGame();
  else storyChars = 0;
}

// 会話ウィンドウ左の顔アイコン（16x16 で描いて拡大する）
const portrait = document.createElement('canvas');
portrait.width = 16; portrait.height = 16;
const pctx = portrait.getContext('2d');

function drawPortrait(who) {
  pctx.clearRect(0, 0, 16, 16);
  if (who === 'robot') {
    drawRobot(5, 6, 1, 1, 1, null, pctx);
    pctx.fillStyle = '#5b6678';
    pctx.fillRect(8, 2, 1, 3);
    pctx.fillStyle = CORE_READY;
    pctx.fillRect(7, 1, 2, 2);
  } else {
    // 古いモニターに映る波形
    pctx.fillStyle = '#2f3542';
    pctx.fillRect(1, 2, 14, 11);
    pctx.fillRect(6, 13, 4, 2);
    pctx.fillStyle = '#0e2a1e';
    pctx.fillRect(2, 3, 12, 9);
    pctx.fillStyle = '#5cf27a';
    const talking = storyChars < STORY[storyIndex].text.length;
    for (let x = 2; x < 14; x++) {
      const amp = talking ? Math.sin(t * 20 + x * 1.3) * 3 : 0;
      pctx.fillRect(x, Math.round(7 + amp), 1, 1);
    }
  }
}

function drawStory() {
  vctx.fillStyle = 'rgba(10,5,25,0.45)';
  vctx.fillRect(0, 0, view.width, view.height);
  const line = STORY[storyIndex];
  const sp = SPEAKERS[line.who];
  // ウィンドウ
  const bx = 8, by = 122, bw = W - 16, bh = 54;
  vctx.fillStyle = 'rgba(20,10,35,0.9)';
  vctx.fillRect(bx * scale, by * scale, bw * scale, bh * scale);
  vctx.strokeStyle = sp.color;
  vctx.lineWidth = Math.max(1, scale / 2);
  vctx.strokeRect(bx * scale, by * scale, bw * scale, bh * scale);
  // 顔アイコン
  drawPortrait(line.who);
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(portrait, (bx + 6) * scale, (by + 8) * scale, 38 * scale, 38 * scale);
  // 名前と本文（1文字ずつ表示）
  text(sp.name, bx + 52, by + 6, 7, sp.color);
  text(line.text.slice(0, Math.floor(storyChars)), bx + 52, by + 19, 7, '#ffffff');
  if (storyChars >= line.text.length && Math.floor(t * 3) % 2 === 0) text('▼', bx + bw - 12, by + bh - 11, 6, '#ffffff');
  text('C / Space: つぎへ   Enter: スキップ', W - 6, 4, 5, '#e8e0ff', 'right', 0.8);
}

function startGame() {
  deaths = 0; playTime = 0;
  collected.clear();
  particles = [];
  loadRoom(0);
  placePlayer();
  fadeT = 0.4;
  state = 'play';
  document.body.style.cursor = 'none';
}

function step(dt) {
  t += dt;
  updateEffects(dt);
  if (state === 'title') {
    if (hit('jump')) beginStory();
    return;
  }
  if (state === 'story') {
    updateStory(dt);
    return;
  }
  if (state === 'win') {
    winT += dt;
    if (winT > 1 && hit('jump')) { state = 'title'; document.body.style.cursor = ''; }
    return;
  }
  if (freezeT > 0) { freezeT -= dt; return; }
  playTime += dt;
  if (P.dead) {
    P.deathT -= dt;
    if (P.deathT <= 0) respawn();
  } else {
    updatePlayer(dt);
  }
  updateEntities(dt);
}

let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    step(DT);
    acc -= DT;
    clearPressed();
  }
  render();
  requestAnimationFrame(frame);
}

// ============================================================
//  描画
// ============================================================

// 背景: 夕焼けの空・太陽・雲・遠くの台地
// alt（0〜1）が大きいほど高い所にいる: 台地と太陽が下に沈み、足元に雲海、空の上の方は夜空になる
const RUINS_START = ROOMS.findIndex(r => r.theme === 'ruins');
function roomAlt(i) {
  return i < RUINS_START ? 0 : (i - RUINS_START + 1) / (ROOMS.length - RUINS_START);
}

function mixColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const bgCache = new Map();
function getBackground(alt) {
  const key = alt.toFixed(3);
  if (bgCache.has(key)) return bgCache.get(key);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const b = c.getContext('2d');

  const g = b.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixColor('#3b2463', '#0f0826', alt));
  g.addColorStop(0.45 + alt * 0.25, mixColor('#e0607e', '#b04a80', alt));
  g.addColorStop(Math.min(0.95, 0.75 + alt * 0.18), '#ffa25e');
  g.addColorStop(1, '#ffd08a');
  b.fillStyle = g;
  b.fillRect(0, 0, W, H);

  // 高い所ほど星が見える
  if (alt > 0) {
    b.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const sx = (i * 97) % W, sy = (i * 53) % Math.round(H * 0.5);
      b.globalAlpha = alt * (0.3 + ((i * 31) % 7) / 10);
      b.fillRect(sx, sy, 1, 1);
    }
    b.globalAlpha = 1;
  }

  const sunY = 95 + alt * 45;
  b.fillStyle = 'rgba(255,240,180,0.25)';
  b.beginPath(); b.arc(235, sunY, 34, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#fff1b8';
  b.beginPath(); b.arc(235, sunY, 24, 0, Math.PI * 2); b.fill();

  b.fillStyle = 'rgba(255,200,170,0.45)';
  for (const [cx, cy, w] of [[40, 40, 50], [150, 28, 70], [280, 50, 45], [100, 70, 40]]) {
    const y = cy + alt * 70;
    b.fillRect(cx - w / 2, y, w, 4);
    b.fillRect(cx - w / 3, y - 3, w * 0.6, 3);
  }

  // 台地のシルエット（登るほど下へ沈む）
  const layers = [
    { color: '#b0486e', base: 120 + alt * 75, seed: 2 },
    { color: '#7a2f5e', base: 150 + alt * 75, seed: 7 },
  ];
  for (const m of layers) {
    b.fillStyle = m.color;
    b.beginPath();
    b.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      const n = Math.sin(x * 0.05 + m.seed) + Math.sin(x * 0.11 + m.seed * 2) * 0.5;
      const y = m.base - Math.round(n * 2) * 10;
      b.lineTo(x, y);
      b.lineTo(x + 16, y);
    }
    b.lineTo(W, H);
    b.fill();
  }

  // 足元の雲海（登るほど厚くなる）
  if (alt > 0) {
    const top = H - 8 - alt * 50;
    for (const [color, off] of [['#f4b8a8', 0], ['#ffe2cf', 8]]) {
      b.fillStyle = color;
      for (let x = -10; x <= W + 10; x += 14) {
        const r = 9 + ((x * 7 + off) % 5);
        b.beginPath(); b.arc(x + off, top + off + Math.sin(x * 0.07 + off) * 3, r, 0, Math.PI * 2); b.fill();
      }
      b.fillRect(0, top + off, W, H);
    }
  }

  bgCache.set(key, c);
  return c;
}

function renderTiles() {
  tctx.clearRect(0, 0, W, H);
  const ruins = room.theme === 'ruins';
  const solidR = (tx, ty) => tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS || grid[ty][tx] === 1;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE, py = y * TILE;
      if (grid[y][x] === 1) {
        if (ruins) { drawRuinStone(x, y, px, py, solidR); continue; }
        // 石レンガ
        tctx.fillStyle = '#4a3550';
        tctx.fillRect(px, py, TILE, TILE);
        tctx.fillStyle = '#3a2840';
        tctx.fillRect(px, py + 3, TILE, 1);
        tctx.fillRect(px + (y % 2 ? 2 : 6), py, 1, 3);
        tctx.fillRect(px + (y % 2 ? 5 : 1), py + 4, 1, 4);
        tctx.fillStyle = '#5e4566';
        if (!solidR(x - 1, y)) tctx.fillRect(px, py, 1, TILE);
        if (!solidR(x + 1, y)) tctx.fillRect(px + TILE - 1, py, 1, TILE);
        if (!solidR(x, y + 1)) { tctx.fillStyle = '#2c1f33'; tctx.fillRect(px, py + TILE - 1, TILE, 1); }
        // 上が空いていれば草
        if (!solidR(x, y - 1)) {
          tctx.fillStyle = '#7fcf5a'; tctx.fillRect(px, py, TILE, 2);
          tctx.fillStyle = '#4f9a3c'; tctx.fillRect(px, py + 2, TILE, 1);
          tctx.fillStyle = '#7fcf5a';
          if ((x * 5 + y) % 3 === 0) tctx.fillRect(px + 2, py - 1, 1, 1);
          if ((x * 3 + y) % 4 === 0) tctx.fillRect(px + 6, py - 2, 1, 2);
        }
      } else if (grid[y][x] === 2) {
        // 鉄のトゲ
        tctx.fillStyle = '#4b525c';
        tctx.fillRect(px, py + 7, TILE, 1);
        for (const ox of [0, 4]) {
          tctx.fillStyle = '#9aa3ad';
          tctx.beginPath();
          tctx.moveTo(px + ox, py + 7);
          tctx.lineTo(px + ox + 2, py + 3);
          tctx.lineTo(px + ox + 4, py + 7);
          tctx.fill();
          tctx.fillStyle = '#e6ebf0';
          tctx.fillRect(px + ox + 2, py + 3, 1, 1);
        }
      }
    }
  }
}

// 遺跡の石ブロック（16x8 の石を互い違いに積み、ひび・苔をランダムに付ける）
function drawRuinStone(x, y, px, py, solidR) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const stoneStart = (x + y) % 2 === 0;
  tctx.fillStyle = (h % 4 === 0) ? '#6e6a78' : '#77727f';
  tctx.fillRect(px, py, TILE, TILE);
  // 目地
  tctx.fillStyle = '#55515d';
  tctx.fillRect(px, py + 7, TILE, 1);
  if (!stoneStart) tctx.fillRect(px + 7, py, 1, 7);
  tctx.fillStyle = '#8e8a96';
  tctx.fillRect(px, py, stoneStart ? TILE : 7, 1);
  // ひび
  if (h % 7 === 0) {
    tctx.fillStyle = '#5a5664';
    tctx.fillRect(px + 2, py + 2, 1, 1);
    tctx.fillRect(px + 3, py + 3, 1, 1);
    tctx.fillRect(px + 3, py + 4, 1, 1);
    tctx.fillRect(px + 4, py + 5, 1, 1);
  }
  // 側面と底の縁取り
  tctx.fillStyle = '#8e8a96';
  if (!solidR(x - 1, y)) tctx.fillRect(px, py, 1, TILE);
  tctx.fillStyle = '#5f5b68';
  if (!solidR(x + 1, y)) tctx.fillRect(px + TILE - 1, py, 1, TILE);
  if (!solidR(x, y + 1)) { tctx.fillStyle = '#46424f'; tctx.fillRect(px, py + TILE - 1, TILE, 1); }
  // ところどころ苔むした石
  if (h % 5 === 0) {
    tctx.fillStyle = '#5d8a36';
    tctx.fillRect(px + 1 + (h % 3), py + 2 + (h % 2), 3, 2);
    tctx.fillRect(px + 2 + (h % 3), py + 4, 1, 1);
  }
  // 上が空いていれば苔が覆い、ふちから垂れる
  if (!solidR(x, y - 1)) {
    tctx.fillStyle = '#6f9e3c';
    tctx.fillRect(px, py, TILE, 2);
    tctx.fillStyle = '#5a8a32';
    for (let i = 0; i < TILE; i++) {
      const d = (h >> (i * 3)) & 7;
      if (d < 3) tctx.fillRect(px + i, py + 2, 1, d + 1);
    }
    tctx.fillStyle = '#8fc457';
    if (h % 3 === 0) tctx.fillRect(px + 3, py - 1, 1, 1);
    if (h % 4 === 1) tctx.fillRect(px + 6, py - 1, 1, 1);
  }
  // 横が空いていれば側面にも少し苔
  if (!solidR(x - 1, y) && h % 3 === 1) { tctx.fillStyle = '#5a8a32'; tctx.fillRect(px, py + 1, 1, 3); }
  if (!solidR(x + 1, y) && h % 3 === 2) { tctx.fillStyle = '#5a8a32'; tctx.fillRect(px + TILE - 1, py + 2, 1, 3); }
}

function drawRobot(x, y, facing, sx, sy, silhouette, g = ctx) {
  const bw = Math.round(8 * sx), bh = Math.round(9 * sy);
  const cx = Math.round(x + P.w / 2), by = Math.round(y + P.h);
  const left = cx - Math.floor(bw / 2), top = by - bh;
  if (silhouette) {
    // ホログラム風の残像（走査線のように1行おきに描く）
    g.fillStyle = silhouette;
    for (let yy = top; yy < by; yy += 2) g.fillRect(left, yy, bw, 1);
    g.fillRect(left, top, 1, bh);
    g.fillRect(left + bw - 1, top, 1, bh);
    return;
  }
  const headH = Math.round(bh * 0.5);
  const step = (P.onGround || P.grabbing) && Math.floor(P.runT / 5) % 2 === 1;
  // 足
  g.fillStyle = '#2f3542';
  g.fillRect(left + 1, by - 2 - (step ? 1 : 0), 2, 2);
  g.fillRect(left + bw - 3, by - 2 - (step ? 0 : 1), 2, 2);
  // 胴体
  g.fillStyle = '#7d8fa6';
  g.fillRect(left + 1, top + headH, bw - 2, bh - headH - 2);
  g.fillStyle = '#a9b7c9';
  g.fillRect(left + 2, top + headH + 1, bw - 4, 1);
  // 頭
  g.fillStyle = '#d8e0ea';
  g.fillRect(left, top, bw, headH);
  g.fillStyle = '#aab6c6';
  g.fillRect(left, top + headH - 1, bw, 1);
  // バイザーと目（ダッシュ可能かどうかで光る色が変わる）
  g.fillStyle = '#1d2430';
  g.fillRect(left + 1, top + 1, bw - 2, 2);
  g.fillStyle = coreColor();
  g.fillRect(cx + (facing > 0 ? 1 : -3), top + 1, 2, 2);
}

function drawPlayer() {
  for (const a of afterimages) {
    ctx.globalAlpha = a.life / 0.3 * 0.5;
    drawRobot(a.x, a.y, 1, a.sx, a.sy, DASH_COLOR);
  }
  ctx.globalAlpha = 1;
  if (P.dead) return;

  // アンテナ
  const base = antennaBase();
  ctx.fillStyle = '#5b6678';
  for (let i = 1; i <= 3; i++) {
    const k = i / 4;
    ctx.fillRect(Math.round(base.x + (P.ant.x - base.x) * k), Math.round(base.y + (P.ant.y - base.y) * k), 1, 1);
  }
  const c = coreColor();
  if (P.dashes > 0) {
    ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 8);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(P.ant.x, P.ant.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(P.ant.x) - 1, Math.round(P.ant.y) - 1, 2, 2);

  drawRobot(P.x, P.y, P.facing, P.sx, P.sy);
}

function drawEntities() {
  // バッテリー（ダッシュ回復）
  for (const b of batteries) {
    const y = Math.round(b.y + Math.sin(t * 3) * 1.5);
    if (b.active) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = CORE_READY;
      ctx.beginPath(); ctx.arc(b.x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2f3542';
      ctx.fillRect(b.x - 3, y - 4, 6, 8);
      ctx.fillRect(b.x - 1, y - 5, 2, 1);
      ctx.fillStyle = CORE_READY;
      ctx.fillRect(b.x - 2, y - 3, 4, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x, y - 2, 1, 2);
      ctx.fillRect(b.x - 1, y, 1, 2);
    } else {
      ctx.strokeStyle = 'rgba(71,224,255,0.35)';
      ctx.strokeRect(b.x - 2.5, y - 3.5, 5, 7);
    }
  }
  // 歯車（収集アイテム）
  for (const g of gears) {
    if (g.got) continue;
    const y = g.y + Math.sin(t * 2.5 + g.x) * 1.5;
    ctx.fillStyle = '#ffcc33';
    for (let i = 0; i < 6; i++) {
      const a = t * 2 + i / 6 * Math.PI * 2;
      ctx.fillRect(Math.round(g.x + Math.cos(a) * 3.5) - 1, Math.round(y + Math.sin(a) * 3.5) - 1, 2, 2);
    }
    ctx.beginPath(); ctx.arc(g.x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a0701a';
    ctx.fillRect(Math.round(g.x) - 1, Math.round(y) - 1, 2, 2);
  }
  // ゴールのゲート
  if (room.goal) {
    const gp = goalPos();
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#c9a4ff';
    ctx.beginPath(); ctx.ellipse(gp.x, gp.y, 5 * pulse, 11 * pulse, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8a5cff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(gp.x, gp.y, 6 * pulse, 12 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#4a3550';
    ctx.fillRect(gp.x - 9, gp.y + 11, 18, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    if (p.gear) {
      // 歯車: 丸い本体 + 回転する4枚の歯
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      for (let i = 0; i < 4; i++) {
        const a = p.rot + i * Math.PI / 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * 2.5), Math.round(y + Math.sin(a) * 2.5), 1, 1);
      }
      ctx.fillStyle = '#2f3542';
      ctx.fillRect(x, y, 1, 1);
    } else {
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawMotes() {
  ctx.fillStyle = '#fff3c4';
  for (const m of MOTES) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + m.ph);
    ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// 文字は拡大後のキャンバスに直接描く（くっきり表示のため）。座標はゲーム内ピクセル
function text(str, x, y, size, color = '#ffffff', align = 'left', alpha = 1) {
  vctx.globalAlpha = alpha;
  vctx.font = `bold ${size * scale}px "Segoe UI", "Hiragino Sans", "Meiryo", sans-serif`;
  vctx.textAlign = align;
  vctx.textBaseline = 'top';
  str.split('\n').forEach((line, i) => {
    const ly = (y + i * size * 1.3) * scale;
    vctx.fillStyle = 'rgba(30,10,40,0.75)';
    vctx.fillText(line, x * scale + Math.max(1, scale / 2), ly + Math.max(1, scale / 2));
    vctx.fillStyle = color;
    vctx.fillText(line, x * scale, ly);
  });
  vctx.globalAlpha = 1;
}

function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

function render() {
  ctx.drawImage(getBackground(state === 'title' ? 0 : roomAlt(roomIndex)), 0, 0);
  if (state !== 'title') {
    ctx.drawImage(tileCanvas, 0, 0);
    drawEntities();
    drawPlayer();
  }
  drawParticles();
  drawMotes();

  vctx.imageSmoothingEnabled = false;
  vctx.fillStyle = '#000';
  vctx.fillRect(0, 0, view.width, view.height);
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    ox = Math.round((Math.random() * 2 - 1) * shakeAmt);
    oy = Math.round((Math.random() * 2 - 1) * shakeAmt);
  }
  vctx.drawImage(buf, ox * scale, oy * scale, W * scale, H * scale);

  if (state === 'title') {
    text('CLIMB UP', W / 2, 26, 28, '#ffffff', 'center');
    text('〜 ロボットの遺跡のぼり 〜', W / 2, 60, 8, '#ffe0b0', 'center');
    text('移動: ← → ↑ ↓ / WASD\nジャンプ: C / Space\nダッシュ: Shift\n壁につかまる: 左クリック\nやり直し: R',
         W / 2, 82, 7, '#fff4e0', 'center');
    if (Math.floor(t * 2) % 2 === 0) text('C / Space でスタート', W / 2, 158, 9, '#ffe066', 'center');
    return;
  }

  if (state === 'story') {
    drawStory();
    if (fadeT > 0) {
      vctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeT / 0.25)})`;
      vctx.fillRect(0, 0, view.width, view.height);
    }
    return;
  }

  for (const [hx, hy, msg] of room.hints) text(msg, hx * TILE, hy * TILE, 6, '#fff4e0', 'left', 0.9);
  if (bannerT > 0) text(room.name, W / 2, 30, 12, '#ffffff', 'center', Math.min(1, bannerT));

  text(`⚙ ${collected.size}/${TOTAL_GEARS}   ✖ ${deaths}   ${formatTime(playTime)}`, 4, 3, 6);

  if (fadeT > 0) {
    vctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeT / 0.25)})`;
    vctx.fillRect(0, 0, view.width, view.height);
  }

  if (state === 'win') {
    vctx.fillStyle = `rgba(30,10,40,${Math.min(0.7, winT)})`;
    vctx.fillRect(0, 0, view.width, view.height);
    text('ゲート到達！', W / 2, 40, 22, '#ffe066', 'center');
    text(`タイム  ${formatTime(clearTime)}\nミス  ${deaths}\n歯車  ${collected.size} / ${TOTAL_GEARS}`,
         W / 2, 80, 9, '#ffffff', 'center');
    if (winT > 1 && Math.floor(t * 2) % 2 === 0) text('C / Space でタイトルへ', W / 2, 150, 8, '#ffe0b0', 'center');
  }
}

requestAnimationFrame(frame);
