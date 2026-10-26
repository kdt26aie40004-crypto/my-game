'use strict';

// ============================================================
//  メインループ
// ============================================================

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

requestAnimationFrame(frame);
