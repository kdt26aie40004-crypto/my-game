'use strict';

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
