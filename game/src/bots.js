// The defenders: four bots with a real state machine. Each opens on its own
// route to a hold, scans its lane, and reacts to what it sees and hears:
// a gunshot sends nearby bots to investigate, a planted bomb sends every
// living bot rushing to the site to defuse. Combat is hitscan through the
// same world the player hides behind, with a reaction delay, bursts and
// spread that grows with range and with the player's speed.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, BOT_ROUTES, RUSH_ROUTES } from './world.js';
import { createMover } from './player.js';

const HEALTH = 100;
const WALK_SPEED = 3.4;
const STRAFE_SPEED = 2.2;
const VISION_RANGE = 42;
const VISION_DOT = 0.5; // ~60 degrees half-angle
const HEAR_RANGE = 26;
const BOT_DAMAGE = 22;
const BOT_HEAD_MULT = 3;
const DEFUSE_TIME = 5;
const NAMES = ['Warden-1', 'Warden-2', 'Warden-3', 'Warden-4'];

function waypoint(id) {
  const [x, z] = WAYPOINTS[id];
  return { x, z };
}

export function createBots(scene, world) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.6, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const gunPos = new THREE.Vector3();

  const bots = [];
  const hitMeshes = [];

  function makeBot(index, spawn) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.56;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.28, 1.05, -0.3);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0.28, 1.08, -0.62);
    flash.visible = false;
    group.add(torso, head, legL, legR, gun, flash);
    group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    scene.add(group);

    const mover = createMover(world.colliders, 0.34, 1.72);
    mover.teleport(spawn.x, 0, spawn.z);
    group.position.copy(mover.position);
    group.rotation.y = Math.PI;
    const bot = {
      index, name: NAMES[index], group, torso, head, gun, flash,
      mover, health: HEALTH, alive: true, fall: 0,
      state: 'route', route: BOT_ROUTES[index].route.slice(), routeIndex: 0,
      holdId: BOT_ROUTES[index].hold, scanId: BOT_ROUTES[index].scan,
      patrol: BOT_ROUTES[index].patrol ? BOT_ROUTES[index].patrol.slice() : null,
      patrolIndex: 0,
      yaw: Math.PI, targetYaw: Math.PI, scanPhase: index * 1.3,
      seenAt: -10, lastSeen: new THREE.Vector3(), hearPos: null, hearAt: -10,
      engageAt: 0, nextShotAt: 0, burstLeft: 0, strafeDir: 1, strafeAt: 0,
      defuseAt: 0, flashAt: 0, walkPhase: 0, investigateUntil: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function losClear(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function seesPlayer(bot, ctx) {
    if (!ctx.playerAlive) return false;
    const bp = bot.mover.position;
    const dx = ctx.playerPos.x - bp.x;
    const dz = ctx.playerPos.z - bp.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISION_RANGE) return false;
    // Facing: the bot looks along -sin(yaw), -cos(yaw), like the player.
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    if ((dx * fx + dz * fz) / (dist || 1) < VISION_DOT) return false;
    eyePos.set(bp.x, bp.y + 1.5, bp.z);
    tmpTo.set(ctx.playerPos.x, ctx.playerPos.y + 1.2, ctx.playerPos.z);
    return losClear(eyePos, tmpTo);
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const target = Math.atan2(-(x - bot.mover.position.x), -(z - bot.mover.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function walkTo(bot, x, z, dt, speed) {
    const p = bot.mover.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) return true;
    bot.mover.drive(dt, (dx / dist) * speed, (dz / dist) * speed, 8);
    faceToward(bot, x, z, dt);
    bot.walkPhase += dt * 7;
    return false;
  }

  function fireAtPlayer(bot, ctx, time) {
    const bp = bot.mover.position;
    const pp = ctx.playerPos;
    gunPos.set(bp.x + Math.sin(bot.yaw + Math.PI / 2) * 0.28, bp.y + 1.05, bp.z + Math.cos(bot.yaw + Math.PI / 2) * 0.28);
    const dist = Math.hypot(pp.x - bp.x, pp.z - bp.z);
    const spread = 0.028 + (dist / VISION_RANGE) * 0.022 + Math.min(1, ctx.playerSpeed / 5.4) * 0.03 - (ctx.playerCrouching ? 0.012 : 0);
    tmpDir.set(pp.x - gunPos.x, pp.y + 1.2 - gunPos.y, pp.z - gunPos.z).normalize();
    tmpDir.x += (Math.random() * 2 - 1) * spread;
    tmpDir.y += (Math.random() * 2 - 1) * spread;
    tmpDir.z += (Math.random() * 2 - 1) * spread;
    tmpDir.normalize();
    raycaster.set(gunPos, tmpDir);
    raycaster.far = 60;
    const targets = ctx.playerHitboxes.concat(world.shootables);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : gunPos.clone().addScaledVector(tmpDir, 40);
    ctx.tracer(gunPos, end);
    bot.flash.visible = true;
    bot.flashAt = time + 0.05;
    ctx.shotSound(gunPos);
    if (hit && hit.object.userData.playerHit) {
      const head = hit.object.userData.part === 'head';
      ctx.damagePlayer(head ? BOT_DAMAGE * BOT_HEAD_MULT : BOT_DAMAGE, bp, head);
    }
  }

  function startEngage(bot, ctx, time) {
    bot.state = 'engage';
    bot.engageAt = time;
    bot.nextShotAt = time + 0.45 + Math.random() * 0.3; // reaction delay
    bot.burstLeft = 3 + Math.floor(Math.random() * 3);
    bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
    bot.strafeAt = time + 0.7 + Math.random() * 0.7;
    bot.lastSeen.copy(ctx.playerPos);
    bot.seenAt = time;
  }

  function stepBot(bot, dt, ctx, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    if (bot.flash.visible && time > bot.flashAt) bot.flash.visible = false;
    bot.group.position.copy(bot.mover.position);
    bot.group.rotation.y = bot.yaw;

    const canSee = ctx.active && seesPlayer(bot, ctx);
    if (canSee) {
      bot.lastSeen.copy(ctx.playerPos);
      bot.seenAt = time;
      if (bot.state !== 'engage' && bot.state !== 'defuse') startEngage(bot, ctx, time);
    }

    // A planted bomb overrides everything but combat and defusing.
    if (ctx.bombPlanted && bot.state !== 'engage' && bot.state !== 'defuse' && bot.state !== 'rush') {
      bot.state = 'rush';
      const route = RUSH_ROUTES[ctx.bombSite];
      let nearest = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < route.length; i += 1) {
        const w = waypoint(route[i]);
        const d = Math.hypot(w.x - bot.mover.position.x, w.z - bot.mover.position.z);
        if (d < nearestDist) { nearestDist = d; nearest = i; }
      }
      bot.route = route.slice(nearest);
      bot.routeIndex = 0;
    }

    if (bot.state === 'engage') {
      faceToward(bot, ctx.playerPos.x, ctx.playerPos.z, dt, 8);
      if (time - bot.seenAt > 2.5) {
        // Lost the player: go check where they were last seen.
        bot.state = 'investigate';
        bot.hearPos = { x: bot.lastSeen.x, z: bot.lastSeen.z };
        bot.investigateUntil = time + 4;
        return;
      }
      const dist = Math.hypot(ctx.playerPos.x - bot.mover.position.x, ctx.playerPos.z - bot.mover.position.z);
      if (time > bot.strafeAt) {
        bot.strafeDir = -bot.strafeDir;
        bot.strafeAt = time + 0.7 + Math.random() * 0.7;
      }
      // Strafe sideways, closing in when far, backing off when close.
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const px = -fz * bot.strafeDir;
      const pz = fx * bot.strafeDir;
      const approach = dist > 18 ? 1 : dist < 4 ? -1 : 0;
      bot.mover.drive(dt, px * STRAFE_SPEED + fx * approach * 2, pz * STRAFE_SPEED + fz * approach * 2, 8);
      if (time >= bot.nextShotAt && time >= bot.engageAt + 0.2) {
        fireAtPlayer(bot, ctx, time);
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 3);
          bot.nextShotAt = time + 0.5 + Math.random() * 0.5;
        } else {
          bot.nextShotAt = time + 0.11;
        }
      }
      return;
    }

    if (bot.state === 'defuse') {
      if (Math.hypot(ctx.bombPos.x - bot.mover.position.x, ctx.bombPos.z - bot.mover.position.z) > 1.6) {
        bot.state = 'rush';
        return;
      }
      if (time >= bot.defuseAt) {
        ctx.defused(bot);
        bot.state = 'hold';
      }
      return;
    }

    if (bot.state === 'rush') {
      if (bot.routeIndex < bot.route.length) {
        const w = waypoint(bot.route[bot.routeIndex]);
        if (walkTo(bot, w.x, w.z, dt, WALK_SPEED)) bot.routeIndex += 1;
      } else if (ctx.bombPos && walkTo(bot, ctx.bombPos.x, ctx.bombPos.z, dt, WALK_SPEED)) {
        bot.state = 'defuse';
        bot.defuseAt = time + DEFUSE_TIME;
        ctx.defuseStart(bot);
      }
      return;
    }

    if (bot.state === 'investigate') {
      if (bot.hearPos && walkTo(bot, bot.hearPos.x, bot.hearPos.z, dt, WALK_SPEED)) {
        bot.hearPos = null;
      }
      if (time > bot.investigateUntil && !bot.hearPos) {
        bot.state = bot.holdId ? 'hold' : 'patrol';
        bot.patrolIndex = 0;
      }
      return;
    }

    if (bot.state === 'route') {
      if (bot.routeIndex < bot.route.length) {
        const w = waypoint(bot.route[bot.routeIndex]);
        if (walkTo(bot, w.x, w.z, dt, WALK_SPEED)) bot.routeIndex += 1;
      } else if (bot.holdId) {
        bot.state = 'hold';
      } else {
        bot.state = 'patrol';
        bot.patrolIndex = 0;
      }
      return;
    }

    if (bot.state === 'patrol' && bot.patrol) {
      const w = waypoint(bot.patrol[bot.patrolIndex]);
      if (walkTo(bot, w.x, w.z, dt, WALK_SPEED * 0.8)) {
        bot.patrolIndex = (bot.patrolIndex + 1) % bot.patrol.length;
      }
      return;
    }

    // Hold: stand and sweep the lane the bot was posted to watch.
    const scan = waypoint(bot.scanId);
    bot.targetYaw = Math.atan2(-(scan.x - bot.mover.position.x), -(scan.z - bot.mover.position.z)) + Math.sin(time * 0.5 + bot.scanPhase) * 0.6;
    let diff = bot.targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, diff));
    bot.mover.drive(dt, 0, 0, 8);
  }

  return {
    bots,
    hitMeshes,
    spawn(spawns) {
      for (let i = 0; i < spawns.length; i += 1) {
        if (bots[i]) {
          const bot = bots[i];
          bot.mover.teleport(spawns[i].x, 0, spawns[i].z);
          bot.health = HEALTH;
          bot.alive = true;
          bot.fall = 0;
          bot.state = 'route';
          bot.route = BOT_ROUTES[i].route.slice();
          bot.routeIndex = 0;
          bot.yaw = Math.PI;
          bot.group.rotation.set(0, Math.PI, 0);
          bot.group.position.copy(bot.mover.position);
          bot.flash.visible = false;
        } else {
          makeBot(i, spawns[i]);
        }
      }
    },
    step(dt, ctx, time) {
      for (const bot of bots) stepBot(bot, dt, ctx, time);
    },
    hear(pos, radius) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(pos.x - bot.mover.position.x, pos.z - bot.mover.position.z);
        if (d > radius) continue;
        if (bot.state === 'engage' || bot.state === 'defuse' || bot.state === 'rush') continue;
        bot.state = 'investigate';
        bot.hearPos = { x: pos.x, z: pos.z };
        bot.hearAt = performance.now() / 1000;
        bot.investigateUntil = bot.hearAt + 4;
      }
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.state === 'defuse') bot.state = 'rush'; // a hit breaks the defuse
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.fall = 0;
      bot.flash.visible = false;
      return true;
    },
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    reset() {
      for (const bot of bots) {
        bot.health = HEALTH;
        bot.alive = true;
        bot.fall = 0;
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.group.position.copy(bot.mover.position);
      }
    },
    hearRange: HEAR_RANGE,
  };
}
