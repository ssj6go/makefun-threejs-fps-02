// The bomb: one state machine the round revolves around. The player carries
// it, channels 3.5 s inside a site to plant it, and then has 30 s of fuse
// before it wins the round — unless a bot stands beside it for 5 s to defuse.
// Beeps speed up as the fuse runs down; the blink light does the same.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3.5;
export const FUSE_TIME = 30;
export const DEFUSE_TIME = 5;

export function createBomb(scene) {
  const group = new THREE.Group();
  const casing = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.32),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.5 }),
  );
  casing.position.y = 0.12;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), emissive: new THREE.Color(PALETTE.foe), emissiveIntensity: 2 }),
  );
  light.position.set(0.12, 0.3, 0);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.05, 0.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.2 }),
  );
  stripe.position.set(0, 0.2, 0);
  group.add(casing, light, stripe);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried', // carried | planting | planted | defused | exploded
    site: null,
    pos: new THREE.Vector3(),
    progress: 0,
    fuse: FUSE_TIME,
    beepIn: 1,
  };

  return {
    state,
    startPlant(site, pos) {
      if (state.status !== 'carried') return false;
      state.status = 'planting';
      state.site = site;
      state.pos.copy(pos);
      state.progress = 0;
      return true;
    },
    cancelPlant() {
      if (state.status !== 'planting') return;
      state.status = 'carried';
      state.site = null;
      state.progress = 0;
    },
    defuse() {
      if (state.status !== 'planted') return false;
      state.status = 'defused';
      group.visible = false;
      return true;
    },
    reset() {
      state.status = 'carried';
      state.site = null;
      state.progress = 0;
      state.fuse = FUSE_TIME;
      state.beepIn = 1;
      group.visible = false;
    },
    // Returns event names that happened this step: 'planted', 'beep', 'exploded'.
    update(dt, stillPlanting) {
      const events = [];
      if (state.status === 'planting') {
        if (!stillPlanting) {
          this.cancelPlant();
          return events;
        }
        state.progress += dt / PLANT_TIME;
        if (state.progress >= 1) {
          state.status = 'planted';
          state.fuse = FUSE_TIME;
          state.beepIn = 1;
          group.position.copy(state.pos);
          group.visible = true;
          events.push('planted');
        }
      } else if (state.status === 'planted') {
        state.fuse -= dt;
        state.beepIn -= dt;
        if (state.beepIn <= 0) {
          events.push('beep');
          state.beepIn = state.fuse > 20 ? 1 : state.fuse > 10 ? 0.5 : 0.25;
        }
        if (state.fuse <= 0) {
          state.status = 'exploded';
          group.visible = false;
          events.push('exploded');
        }
      }
      return events;
    },
    step(time) {
      if (state.status !== 'planted') return;
      const rate = state.fuse > 20 ? 2 : state.fuse > 10 ? 5 : 9;
      light.material.emissiveIntensity = Math.sin(time * Math.PI * rate) > 0 ? 2.5 : 0.2;
    },
  };
}
