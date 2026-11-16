// EMBERLINE — a round-based tactical FPS on the FOUNDRY map. One attacker
// (the player) against four defending bots, first to 5 rounds. The bomb is
// the objective: plant it at site A or B, defend it until it blows, or clear
// the defenders out. Money buys a better loadout between rounds.
//
// The game loop is a fixed 120 Hz simulation separated from rendering: the
// fixed step owns movement, shooting, bots, the bomb and the round clock, and
// the render loop only positions the camera and draws. All mutable match
// state lives in the single `G` object below and in the modules it owns.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPON_DEFS, GRENADE_PRICE, GRENADE_MAX } from './weapons.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME, FUSE_TIME } from './bomb.js';
import { createRounds, WIN_SCORE, MAX_ROUNDS } from './rounds.js';
import { audio } from './audio.js';
import { createEffects } from './effects.js';
import { createHUD } from './hud.js';

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.1;
const PLAYER_HEALTH = 100;
const GRENADE_RADIUS = 6;
const GRENADE_DAMAGE = 120;
const BOMB_RADIUS = 10;
const BOMB_DAMAGE = 300;
const SHOT_HEAR_RANGE = 26;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const shotSeed = Number.parseInt(params.get('seed') || '1', 10);
if (shotMode) Math.random = mulberry32(Number.isFinite(shotSeed) ? shotSeed : 1);

// ---- Scene, renderer, camera ----------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game') });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Modules ---------------------------------------------------------------
const world = createWorld(scene);
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const bots = createBots(scene, world);
const bomb = createBomb(scene);
const rounds = createRounds();
const effects = createEffects(scene);
const hud = createHUD();
const input = createInput(renderer.domElement, () => {});

// Invisible hitboxes the bots shoot at: a material that never renders but
// still answers raycasts.
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.0, 0.42), hitMat);
torsoHit.userData.playerHit = true;
torsoHit.userData.part = 'torso';
const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), hitMat);
headHit.userData.playerHit = true;
headHit.userData.part = 'head';
scene.add(torsoHit, headHit);

// ---- Match state -----------------------------------------------------------
const G = {
  started: false,
  paused: false,
  matchOver: false,
  buyOpen: false,
  hp: PLAYER_HEALTH,
  alive: true,
  kills: 0,
  deaths: 0,
  time: 0,
  shake: 0,
  hadLock: false,
  dryAt: 0,
  lastTimer: '',
  lastBomb: '',
  grenades: [],
};

const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.6 });
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const shootDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const grenadeTmp = new THREE.Vector3();

// ---- Helpers ----------------------------------------------------------------
function siteAt(x, z) {
  for (const site of Object.values(SITES)) {
    if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return site;
  }
  return null;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function refreshHud() {
  const ammo = weapons.ammoOf(weapons.current());
  hud.setAmmo(ammo.mag, ammo.reserve, weapons.def().name, rounds.state.grenades);
  hud.setMoney(rounds.state.money);
  hud.setRound(rounds.state.round, rounds.state.scoreUs, rounds.state.scoreThem);
  hud.setHealth(G.hp);
}

function hintForState() {
  const phase = rounds.state.phase;
  if (phase === 'freeze') return 'Buy phase — press B for the buy menu';
  if (phase !== 'live') return '';
  if (!G.alive) return bomb.state.status === 'planted' ? 'Bomb planted — waiting for detonation' : '';
  if (bomb.state.status === 'planted') return 'Defend the bomb until it detonates';
  if (bomb.state.status === 'planting') return 'Hold E — planting the bomb';
  if (siteAt(player.state.position.x, player.state.position.z)) return 'Hold E to plant the bomb';
  return 'Plant the bomb at site A or B — or eliminate the Wardens';
}

function updateDynamicHud() {
  const rs = rounds.state;
  let timer = '—';
  let urgent = false;
  if (rs.phase === 'freeze') timer = `STARTS IN ${Math.ceil(rs.freezeLeft)}`;
  else if (rs.phase === 'live') {
    if (bomb.state.status === 'planted') {
      timer = formatTime(bomb.state.fuse);
      urgent = bomb.state.fuse < 10;
    } else {
      timer = formatTime(rs.roundLeft);
      urgent = rs.roundLeft < 15;
    }
  }
  if (timer !== G.lastTimer) {
    G.lastTimer = timer;
    hud.setTimer(timer, urgent);
  }
  let bombText = 'BOMB — CARRIED';
  let bombCls = 'carried';
  if (bomb.state.status === 'planting') {
    bombText = 'PLANTING…';
    bombCls = 'carried';
  } else if (bomb.state.status === 'planted') {
    bombText = `BOMB PLANTED — ${formatTime(bomb.state.fuse)}`;
    bombCls = 'planted';
  } else if (bomb.state.status === 'defused') {
    bombText = 'BOMB DEFUSED';
    bombCls = 'gone';
  } else if (bomb.state.status === 'exploded') {
    bombText = 'BOMB DETONATED';
    bombCls = 'gone';
  }
  if (bombText !== G.lastBomb) {
    G.lastBomb = bombText;
    hud.setBomb(bombText, bombCls);
  }
  hud.hint(hintForState());
  hud.plant(bomb.state.status === 'planting' ? bomb.state.progress : null);
}

// ---- Damage and death -------------------------------------------------------
function damagePlayer(amount, fromPos, head) {
  if (!G.alive || !G.started) return;
  G.hp -= amount;
  hud.setHealth(G.hp);
  hud.damageFlash();
  audio.hurt();
  if (G.hp > 0) return;
  G.hp = 0;
  G.alive = false;
  G.deaths += 1;
  bomb.cancelPlant();
  hud.banner('YOU WERE ELIMINATED', bomb.state.status === 'planted' ? 'The bomb is still ticking' : '', 2200);
}

function killBot(bot, cause) {
  G.kills += 1;
  rounds.addKill();
  hud.killfeed(`You ▸ ${bot.name}${cause ? ` · ${cause}` : ''}`, 'us');
  hud.setMoney(rounds.state.money);
}

function explodeAt(pos, radius, maxDamage, byPlayer) {
  effects.explosion(pos);
  audio.explosion();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.mover.position.x - pos.x, bot.mover.position.z - pos.z);
    if (dist > radius) continue;
    const damage = maxDamage * (1 - dist / radius);
    if (bots.damage(bot, damage)) {
      if (byPlayer) killBot(bot, 'blast');
      else hud.killfeed(`${bot.name} caught the blast`, 'foe');
    }
  }
  const pDist = Math.hypot(player.state.position.x - pos.x, player.state.position.z - pos.z);
  if (pDist <= radius) {
    const damage = maxDamage * (1 - pDist / radius);
    damagePlayer(damage, pos, false);
    G.shake = Math.min(0.06, 0.05 * (1 - pDist / radius) + 0.01);
  }
}

// ---- Shooting ---------------------------------------------------------------
function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    if (G.time > G.dryAt) {
      G.dryAt = G.time + 0.3;
      audio.dryFire();
    }
    weapons.reload();
    return;
  }
  weapons.pullTrigger();
  audio.shot(weapons.current());
  player.recoil(def.kick, (Math.random() - 0.5) * def.kick * 0.4);
  G.shake = Math.max(G.shake, def.kick * 0.25);

  const spread = weapons.spread(player.groundSpeed());
  camera.getWorldDirection(shootDir);
  shootDir.x += (Math.random() * 2 - 1) * spread;
  shootDir.y += (Math.random() * 2 - 1) * spread;
  shootDir.z += (Math.random() * 2 - 1) * spread;
  shootDir.normalize();
  raycaster.set(camera.position, shootDir);
  const targets = bots.hitMeshes.concat(world.shootables);
  const hits = raycaster.intersectObjects(targets, false);
  let end = null;
  for (const hit of hits) {
    const bot = hit.object.userData.bot;
    if (bot && !bot.alive) continue; // corpses do not block bullets
    end = hit.point;
    if (bot) {
      const head = hit.object.userData.part === 'head';
      const damage = def.damage * (head ? def.headMult : 1);
      const killed = bots.damage(bot, damage);
      hud.hitmarker(killed);
      audio.hitmarker(killed);
      if (killed) killBot(bot, head ? 'headshot' : null);
      effects.impact(hit.point);
    } else {
      effects.impact(hit.point);
    }
    break;
  }
  if (!end) end = tmpVec.copy(camera.position).addScaledVector(shootDir, 60);
  muzzlePos.set(0.26, -0.22, -0.9).applyMatrix4(camera.matrixWorld);
  effects.tracer(muzzlePos, end, false);
  bots.hear(player.state.position, SHOT_HEAR_RANGE);
}

// ---- Grenades ----------------------------------------------------------------
function throwGrenade() {
  if (!G.alive || rounds.state.phase !== 'live' || rounds.state.grenades <= 0) return;
  rounds.state.grenades -= 1;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  camera.getWorldDirection(shootDir);
  mesh.position.copy(camera.position).addScaledVector(shootDir, 0.5);
  scene.add(mesh);
  const vel = shootDir.clone().multiplyScalar(16);
  vel.y += 3.5;
  vel.add(player.mover.velocity);
  G.grenades.push({ mesh, vel, fuse: 1.6 });
  refreshHud();
  audio.reload();
}

function stepGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i -= 1) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    const pos = g.mesh.position;
    const r = 0.12;
    // Move one axis at a time; a collider hit bounces the grenade back.
    for (const axis of ['x', 'y', 'z']) {
      pos[axis] += g.vel[axis] * dt;
      for (const box of world.colliders) {
        if (pos.x + r < box.min.x || pos.x - r > box.max.x) continue;
        if (pos.y + r < box.min.y || pos.y - r > box.max.y) continue;
        if (pos.z + r < box.min.z || pos.z - r > box.max.z) continue;
        pos[axis] -= g.vel[axis] * dt;
        g.vel[axis] *= -0.45;
        g.vel.x *= 0.8;
        g.vel.z *= 0.8;
        break;
      }
    }
    if (pos.y < r) {
      pos.y = r;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
    }
    if (g.fuse <= 0) {
      scene.remove(g.mesh);
      G.grenades.splice(i, 1);
      explodeAt(pos, GRENADE_RADIUS, GRENADE_DAMAGE, true);
      bots.hear(pos, 40);
    }
  }
}

// ---- Buy menu -----------------------------------------------------------------
const SHOP_IDS = [...Object.keys(WEAPON_DEFS), 'grenade'];

function openBuy() {
  if (!rounds.buyOpen() || !G.alive || G.matchOver) return;
  G.buyOpen = true;
  input.releaseLock();
  hud.showBuy(WEAPON_DEFS, weapons.owned, weapons.current(), rounds.state.money, rounds.state.grenades, rounds.state.round, buyItem);
}

function closeBuy() {
  if (!G.buyOpen) return;
  G.buyOpen = false;
  hud.hideBuy();
  if (G.started && !G.matchOver && !shotMode) input.requestLock();
}

function buyItem(id) {
  if (!rounds.buyOpen()) return;
  if (id === 'grenade') {
    if (rounds.state.grenades >= GRENADE_MAX || rounds.state.money < GRENADE_PRICE) {
      audio.deny();
      return;
    }
    rounds.state.money -= GRENADE_PRICE;
    rounds.state.grenades += 1;
    audio.buy();
  } else {
    const def = WEAPON_DEFS[id];
    if (weapons.owned.has(id)) {
      weapons.equip(id);
      audio.buy();
    } else if (rounds.state.money >= def.price) {
      rounds.state.money -= def.price;
      weapons.buy(id);
      weapons.equip(id);
      audio.buy();
    } else {
      audio.deny();
      return;
    }
  }
  refreshHud();
  hud.showBuy(WEAPON_DEFS, weapons.owned, weapons.current(), rounds.state.money, rounds.state.grenades, rounds.state.round, buyItem);
}

hud.onBuyClose(closeBuy);

// ---- Round lifecycle -----------------------------------------------------------
const ROUND_TEXT = {
  elimination: ['ROUND WON', 'All defenders eliminated'],
  bomb: ['ROUND WON', 'The bomb detonated'],
  defused: ['ROUND LOST', 'The bomb was defused'],
  time: ['ROUND LOST', 'Time expired — the site held'],
};

function spawnPlayer() {
  player.teleport(SPAWNS.attacker.x, 0, SPAWNS.attacker.z, SPAWNS.attacker.yaw);
  G.hp = PLAYER_HEALTH;
  G.alive = true;
  G.shake = 0;
}

function startRound() {
  spawnPlayer();
  bots.spawn(SPAWNS.defenders);
  bomb.reset();
  for (const g of G.grenades) scene.remove(g.mesh);
  G.grenades.length = 0;
  closeBuy();
  refreshHud();
  updateDynamicHud();
  hud.banner(`ROUND ${rounds.state.round}`, rounds.state.round === 1 ? 'Plant the bomb at A or B — first to 5' : '', 2400);
}

function startMatch() {
  rounds.reset();
  weapons.refillAll();
  weapons.equip('pistol');
  G.kills = 0;
  G.deaths = 0;
  G.matchOver = false;
  G.started = true;
  startRound();
}

function handleRoundEvents(events) {
  for (const event of events) {
    if (event.type === 'live') {
      hud.hint(hintForState());
    } else if (event.type === 'buyClosed') {
      closeBuy();
      hud.hint('Buy window closed');
    } else if (event.type === 'roundEnd') {
      closeBuy();
      const [title, sub] = ROUND_TEXT[event.reason] || ['ROUND OVER', ''];
      const won = event.winner === 'us';
      hud.banner(won ? title : title, sub, 3200);
      if (won) audio.roundWin();
      else audio.roundLose();
      hud.killfeed(won ? `Round ${rounds.state.round} — attackers take it` : `Round ${rounds.state.round} — defenders hold`, won ? 'us' : 'foe');
      refreshHud();
    } else if (event.type === 'roundStart') {
      startRound();
    } else if (event.type === 'matchEnd') {
      G.matchOver = true;
      const won = event.winner === 'us';
      input.releaseLock();
      hud.overlay(
        won ? 'MATCH WON' : 'MATCH LOST',
        `${rounds.state.scoreUs} — ${rounds.state.scoreThem} · ${G.kills} eliminations · ${won ? 'Emberline takes the Foundry.' : 'The Wardens held the Foundry.'} Play again?`,
        'PLAY AGAIN',
        () => {
          audio.resume();
          input.requestLock();
          hud.hideOverlay();
          startMatch();
        },
      );
    }
  }
}

// ---- Bot context (one object, fields refreshed each step) -----------------------
const botCtx = {
  playerPos: player.state.position,
  playerAlive: true,
  playerSpeed: 0,
  playerCrouching: false,
  active: false,
  bombPlanted: false,
  bombSite: null,
  bombPos: bomb.state.pos,
  playerHitboxes: [torsoHit, headHit],
  tracer: (from, to) => effects.tracer(from, to, true),
  shotSound: () => audio.enemyShot(),
  damagePlayer: (amount, from, head) => damagePlayer(amount, from, head),
  defused: (bot) => {
    if (!bomb.defuse()) return;
    hud.killfeed(`${bot.name} defused the bomb`, 'foe');
    audio.defuse();
  },
  defuseStart: (bot) => {
    hud.killfeed(`${bot.name} is defusing the bomb!`, 'foe');
  },
};

// ---- Fixed simulation step -------------------------------------------------------
function fixedStep(dt) {
  G.time += dt;
  if (!G.started || G.paused || G.matchOver) return;
  const phase = rounds.state.phase;
  const live = phase === 'live';

  // Look is applied every step from the accumulated deltas.
  const look = input.takeLook();
  if (G.alive && !G.buyOpen) player.look(look.x, look.y);

  const planting = bomb.state.status === 'planting';
  if (live && G.alive && !G.buyOpen && !planting) {
    player.step(dt, input.state.keys);
  } else if (live && G.alive && planting) {
    player.mover.drive(dt, 0, 0, 8); // planting roots the player in place
  }

  // Planting: hold E inside a site while carrying the bomb.
  if (live && G.alive && bomb.state.status === 'carried' && input.state.keys.has('KeyE')) {
    const site = siteAt(player.state.position.x, player.state.position.z);
    if (site) {
      const plantPos = grenadeTmp.set(player.state.position.x, 0, player.state.position.z);
      bomb.startPlant(site.name, plantPos);
    }
  }
  const stillPlanting = live && G.alive && input.state.keys.has('KeyE');
  for (const event of bomb.update(dt, stillPlanting)) {
    if (event === 'planted') {
      hud.killfeed(`Bomb planted at site ${bomb.state.site}`, 'us');
      hud.banner('BOMB PLANTED', `Site ${bomb.state.site} — ${FUSE_TIME}s to detonation`, 2400);
      audio.plant();
      bots.hear(bomb.state.pos, 60);
    } else if (event === 'beep') {
      audio.beep();
    } else if (event === 'exploded') {
      explodeAt(bomb.state.pos, BOMB_RADIUS, BOMB_DAMAGE, true);
      hud.killfeed('Bomb detonated', 'us');
    }
  }

  // Shooting: full-auto weapons fire while held; the rest fire once per click.
  // The queue is drained every step so a click never goes stale across a
  // weapon switch.
  const firing = input.state.firing;
  const clicked = input.consumeShot();
  const def = weapons.def();
  const trigger = def.auto ? firing : clicked;
  if (trigger && live && G.alive && !G.buyOpen && input.state.locked) {
    if (weapons.ready()) playerShoot();
    else if (weapons.ammoOf(weapons.current()).mag === 0) weapons.reload();
  }

  weapons.step(dt);
  G.shake = Math.max(0, G.shake - dt * 0.12);

  // Player hitboxes follow the body for the bots' raycasts.
  torsoHit.position.set(player.state.position.x, player.state.position.y + 0.95, player.state.position.z);
  headHit.position.set(player.state.position.x, player.state.position.y + 1.56, player.state.position.z);

  if (live) {
    botCtx.playerAlive = G.alive;
    botCtx.playerSpeed = player.groundSpeed();
    botCtx.playerCrouching = player.state.crouching;
    botCtx.active = true;
    botCtx.bombPlanted = bomb.state.status === 'planted';
    botCtx.bombSite = bomb.state.site;
    bots.step(dt, botCtx, G.time);
  }

  stepGrenades(dt);

  const events = rounds.update(dt, {
    botsAlive: bots.aliveCount(),
    bombStatus: bomb.state.status,
    playerAlive: G.alive,
  });
  handleRoundEvents(events);
  updateDynamicHud();
}

// ---- One-shot keys (handled once per rendered frame) -----------------------------
function handleKeys() {
  if (!G.started || G.paused || G.matchOver) return;
  if (input.consume('KeyB')) {
    if (G.buyOpen) closeBuy();
    else openBuy();
    return;
  }
  if (input.consume('Escape') && G.buyOpen) {
    closeBuy();
    return;
  }
  if (G.buyOpen) {
    for (let i = 0; i < SHOP_IDS.length; i += 1) {
      if (input.consume(`Digit${i + 1}`)) buyItem(SHOP_IDS[i]);
    }
    return;
  }
  if (input.consume('KeyR') && G.alive) {
    if (weapons.reload()) audio.reload();
  }
  if (input.consume('KeyG')) throwGrenade();
  if (input.consume('Digit1') && G.alive) {
    // Primary slot: the best primary owned, most recent buy first.
    for (const id of ['sniper', 'rifle', 'smg']) {
      if (weapons.owned.has(id)) {
        weapons.equip(id);
        refreshHud();
        break;
      }
    }
  }
  if (input.consume('Digit2') && G.alive) {
    weapons.equip('pistol');
    refreshHud();
  }
}

// ---- Pause and resume --------------------------------------------------------------
function pause() {
  if (!G.started || G.matchOver || G.paused) return;
  G.paused = true;
  closeBuy();
  hud.overlay('PAUSED', 'The round is waiting. Click to get back in.', 'RESUME', resume);
}

function resume() {
  audio.resume();
  input.requestLock();
  hud.hideOverlay();
  G.paused = false;
  // Pointer lock can be refused right after an ESC exit; if it did not take,
  // put the overlay back so the next click retries.
  setTimeout(() => {
    if (!input.state.locked && G.started && !G.matchOver) pause();
  }, 350);
}

function startFromOverlay() {
  audio.resume();
  input.requestLock();
  hud.hideOverlay();
  if (!G.started) startMatch();
  else G.paused = false;
  setTimeout(() => {
    if (!input.state.locked && G.started && !G.matchOver) pause();
  }, 350);
}

hud.overlay(
  'EMBERLINE',
  'Round-based tactical FPS on the FOUNDRY map. You attack alone against four Wardens — plant the bomb at A or B, or eliminate them all. First to 5 rounds. WASD move · Mouse aim · Click shoot · R reload · B buy · G grenade · E plant · Ctrl crouch.',
  'CLICK TO PLAY',
  startFromOverlay,
);

// ---- Render loop ---------------------------------------------------------------------
let lastTime = performance.now();
let accumulator = 0;
let frames = 0;

function renderFrame() {
  const now = performance.now();
  const frameDt = Math.min(MAX_FRAME_DT, (now - lastTime) / 1000);
  lastTime = now;

  if (!shotMode) {
    if (input.state.locked) G.hadLock = true;
    else if (G.hadLock && G.started && !G.paused && !G.buyOpen && !G.matchOver) pause();
  }

  handleKeys();
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 24) {
    fixedStep(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }
  if (steps === 24) accumulator = 0;

  // Camera follows the body; the dead fall to a low, tilted view.
  const body = player.state;
  const eyeY = G.alive ? body.eye : 0.5;
  camera.position.set(body.position.x, body.position.y + eyeY, body.position.z);
  camera.rotation.y = body.yaw;
  camera.rotation.x = body.pitch;
  camera.rotation.z = G.alive ? 0 : 0.3;
  if (G.shake > 0) {
    camera.rotation.x += (Math.random() - 0.5) * G.shake;
    camera.rotation.y += (Math.random() - 0.5) * G.shake;
  }

  world.step(frameDt, G.time);
  bomb.step(G.time);
  effects.step(frameDt);
  const gap = 6 + Math.min(28, weapons.spread(player.groundSpeed()) * 480);
  hud.crosshairGap(gap);

  renderer.render(scene, camera);
  input.endFrame();

  frames += 1;
  if (shotMode) {
    if (frames >= 2) {
      window.__shotReady = true;
      return; // freeze: the harness takes the screenshot from here
    }
    requestAnimationFrame(renderFrame);
    return;
  }
  requestAnimationFrame(renderFrame);
}

// ---- Shot mode: stage the scene, then render twice ------------------------------------
function stageShot() {
  if (shotMode === 'start') {
    player.teleport(SPAWNS.attacker.x, 0, SPAWNS.attacker.z, SPAWNS.attacker.yaw);
    return;
  }
  if (shotMode === 'buy') {
    startMatch();
    hud.hideOverlay();
    hud.hideBanner();
    openBuy();
    return;
  }
  if (shotMode === 'end') {
    startMatch();
    rounds.state.round = 8;
    rounds.state.scoreUs = 5;
    rounds.state.scoreThem = 3;
    rounds.state.phase = 'matchEnd';
    G.matchOver = true;
    hud.hideBanner();
    refreshHud();
    updateDynamicHud();
    hud.overlay('MATCH WON', '5 — 3 · 9 eliminations · Emberline takes the Foundry. Play again?', 'PLAY AGAIN', () => {});
    return;
  }
  // 'play': mid-round, rifle in hand, two bots in view down the mid lane.
  startMatch();
  hud.hideOverlay();
  rounds.state.phase = 'live';
  rounds.state.roundLeft = 83;
  rounds.state.round = 4;
  rounds.state.scoreUs = 2;
  rounds.state.scoreThem = 1;
  rounds.state.money = 2450;
  weapons.buy('rifle');
  weapons.equip('rifle');
  player.teleport(0, 0, 6, 0);
  player.state.yaw = 0;
  const warden0 = bots.bots[0];
  warden0.mover.teleport(1.2, 0, 0.5);
  warden0.state = 'hold';
  warden0.scanId = 'midS';
  warden0.yaw = Math.PI;
  warden0.group.position.copy(warden0.mover.position);
  warden0.group.rotation.y = Math.PI;
  const warden1 = bots.bots[1];
  warden1.mover.teleport(-2.8, 0, 2.8);
  warden1.state = 'hold';
  warden1.scanId = 'midDoor';
  warden1.yaw = Math.PI;
  warden1.group.position.copy(warden1.mover.position);
  warden1.group.rotation.y = Math.PI;
  refreshHud();
  updateDynamicHud();
  hud.banner('ROUND 4', 'Plant the bomb at A or B — first to 5', 2400);
}

if (shotMode) {
  stageShot();
  requestAnimationFrame(renderFrame);
} else {
  player.teleport(SPAWNS.attacker.x, 0, SPAWNS.attacker.z, SPAWNS.attacker.yaw);
  requestAnimationFrame(renderFrame);
}
