'use strict';

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
