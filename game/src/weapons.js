// The armoury: four hitscan weapons, each with its own view model, magazine
// and feel. Ammo is kept per weapon across switches and rounds, as a bought
// loadout should be. Spread grows with movement and with sustained fire
// (heat), so stopping to aim and firing in bursts both pay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  pistol: { name: 'P9 Sidearm', price: 0, mag: 12, reserve: 48, damage: 26, headMult: 3, fireGap: 0.16, reloadTime: 1.4, spreadStill: 0.003, spreadMove: 0.02, auto: false, kick: 0.011, slot: 2, blurb: 'Reliable sidearm. Free, always carried.' },
  rifle: { name: 'VK-47', price: 2700, mag: 30, reserve: 90, damage: 34, headMult: 3, fireGap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true, kick: 0.009, slot: 1, blurb: 'Full-auto workhorse. Three torso hits, one headshot.' },
  smg: { name: 'K9 Raptor', price: 1500, mag: 25, reserve: 100, damage: 24, headMult: 3, fireGap: 0.07, reloadTime: 1.6, spreadStill: 0.004, spreadMove: 0.018, auto: true, kick: 0.006, slot: 1, blurb: 'Fast and forgiving on the move. Close quarters.' },
  sniper: { name: 'Lynx .50', price: 4750, mag: 5, reserve: 15, damage: 95, headMult: 3, fireGap: 1.1, reloadTime: 2.6, spreadStill: 0.0004, spreadMove: 0.05, auto: false, kick: 0.03, slot: 1, blurb: 'One headshot, one kill. Punishes a moving shot.' },
};

export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2;

const MUZZLE_TIME = 0.06;
const HEAT_PER_SHOT = 0.11;
const HEAT_DECAY = 2.2;
const HEAT_SPREAD = 0.014;

function buildModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  if (kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.22), body);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.09), grip);
    frame.position.set(0, -0.08, 0.06);
    model.add(slide, frame);
    model.position.set(0.22, -0.22, -0.4);
    model.scale.setScalar(0.65);
  } else if (kind === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.3), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
    barrel.position.set(0, 0.02, -0.24);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), grip);
    mag.position.set(0, -0.1, -0.02);
    model.add(receiver, barrel, mag);
    model.position.set(0.25, -0.24, -0.45);
    model.scale.setScalar(0.65);
  } else if (kind === 'sniper') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.5);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.16), grip);
    stock.position.set(0, -0.02, 0.2);
    model.add(receiver, barrel, scope, stock);
    model.position.set(0.26, -0.25, -0.55);
    model.scale.setScalar(0.65);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.16), grip);
    stock.position.set(0, -0.02, 0.18);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), accent);
    sight.position.set(0, 0.08, -0.1);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.26, -0.25, -0.55);
    model.scale.setScalar(0.65);
  }
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const kind of Object.keys(WEAPON_DEFS)) {
    models[kind] = buildModel(kind);
    models[kind].visible = false;
    camera.add(models[kind]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.22, -0.9);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.2, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const [kind, def] of Object.entries(WEAPON_DEFS)) {
    ammo[kind] = { mag: def.mag, reserve: def.reserve };
  }
  const owned = new Set(['pistol']);
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0 };
  models.pistol.visible = true;

  function def() {
    return WEAPON_DEFS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - HEAT_DECAY * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = model.userData.baseZ ?? model.position.z;
    if (model.userData.baseZ === undefined) model.userData.baseZ = model.position.z;
    model.position.z = model.userData.baseZ + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo[state.current].mag;
        const take = Math.min(need, ammo[state.current].reserve);
        ammo[state.current].mag += take;
        ammo[state.current].reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPON_DEFS,
    owned,
    current() {
      return state.current;
    },
    def,
    ammoOf(kind) {
      return ammo[kind];
    },
    equip(kind) {
      if (!owned.has(kind) || kind === state.current) return false;
      models[state.current].visible = false;
      state.current = kind;
      models[kind].visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.15);
      return true;
    },
    buy(kind) {
      owned.add(kind);
      ammo[kind] = { mag: WEAPON_DEFS[kind].mag, reserve: WEAPON_DEFS[kind].reserve };
    },
    step,
    ready() {
      return ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + HEAT_PER_SHOT);
    },
    takeRound() {
      if (ammo[state.current].mag <= 0) return false;
      ammo[state.current].mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || ammo[state.current].mag === def().mag || ammo[state.current].reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove + state.heat * HEAT_SPREAD;
    },
    refillAll() {
      for (const kind of owned) ammo[kind] = { mag: WEAPON_DEFS[kind].mag, reserve: WEAPON_DEFS[kind].reserve };
    },
  };
}
