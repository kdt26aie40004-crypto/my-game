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
