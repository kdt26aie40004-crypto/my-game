'use strict';

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
