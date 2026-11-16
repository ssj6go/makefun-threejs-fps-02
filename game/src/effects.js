// Tracers, impact sparks and the explosion, all from pools allocated once:
// no per-frame allocation in the hot loop. Tracers are short-lived lines,
// sparks are one THREE.Points cloud fed from a ring buffer.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 32;
const TRACER_LIFE = 0.07;
const PARTICLES = 320;

export function createEffects(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const line = new THREE.Line(
      tracerGeo.clone(),
      new THREE.LineBasicMaterial({ color: new THREE.Color(i % 2 ? PALETTE.foe : PALETTE.accent), transparent: true, opacity: 0.85 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const positions = new Float32Array(PARTICLES * 3);
  const velocities = new Float32Array(PARTICLES * 3);
  const life = new Float32Array(PARTICLES);
  for (let i = 0; i < PARTICLES; i += 1) positions[i * 3 + 1] = -100;
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  points.frustumCulled = false;
  scene.add(points);
  let particleIndex = 0;

  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26);
  scene.add(boomLight);

  function spawn(pos, count, speed, up) {
    for (let n = 0; n < count; n += 1) {
      const i = particleIndex;
      particleIndex = (particleIndex + 1) % PARTICLES;
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      velocities[i * 3] = (Math.random() * 2 - 1) * speed;
      velocities[i * 3 + 1] = Math.random() * up;
      velocities[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
      life[i] = 0.35 + Math.random() * 0.5;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  return {
    tracer(from, to, enemy = false) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_POOL;
      slot.line.material.color.set(enemy ? PALETTE.foe : PALETTE.accent);
      const attr = slot.line.geometry.attributes.position;
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.life = TRACER_LIFE;
    },
    impact(pos) {
      spawn(pos, 8, 1.6, 2.2);
    },
    explosion(pos) {
      spawn(pos, 110, 7, 9);
      boomLight.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
      boomLight.intensity = 400;
    },
    step(dt) {
      for (const slot of tracers) {
        if (!slot.line.visible) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.line.visible = false;
      }
      let anyAlive = false;
      for (let i = 0; i < PARTICLES; i += 1) {
        if (life[i] <= 0) continue;
        anyAlive = true;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        velocities[i * 3 + 1] -= 9 * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.02) {
          positions[i * 3 + 1] = 0.02;
          velocities[i * 3 + 1] *= -0.3;
        }
      }
      if (anyAlive) particleGeo.attributes.position.needsUpdate = true;
      if (boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity - dt * 700);
    },
  };
}
