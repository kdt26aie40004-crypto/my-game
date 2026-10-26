'use strict';

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
