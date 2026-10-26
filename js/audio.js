'use strict';

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
