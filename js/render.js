'use strict';

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
