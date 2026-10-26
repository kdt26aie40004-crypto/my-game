'use strict';

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
