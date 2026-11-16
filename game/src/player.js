// Movement: one AABB body resolved against the world's colliders one axis at a
// time, so a wall never swallows a body. The player wraps it with look, crouch
// and jump; the bots drive it directly with a desired velocity.
import * as THREE from 'three';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders, radius, height) {
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const probe = new THREE.Box3();
  let onGround = true;

  // lift keeps the feet and the crown out of the horizontal tests, so standing
  // on the floor is not read as walking into a wall.
  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + h - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  return {
    position,
    velocity,
    get onGround() { return onGround; },
    overlaps,
    // Drive toward a horizontal velocity, with gravity and ground contact.
    drive(dt, wishX, wishZ, accel) {
      const blend = Math.min(1, accel * dt);
      velocity.x += (wishX - velocity.x) * blend;
      velocity.z += (wishZ - velocity.z) * blend;
      if (onGround && wishX === 0 && wishZ === 0) {
        const damp = Math.max(0, 1 - FRICTION * dt);
        velocity.x *= damp;
        velocity.z *= damp;
      }
      velocity.y -= GRAVITY * dt;
      const nextX = position.x + velocity.x * dt;
      if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
      else velocity.x = 0;
      const nextZ = position.z + velocity.z * dt;
      if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
      else velocity.z = 0;
      position.y += velocity.y * dt;
      onGround = false;
      const hit = overlaps(position.x, position.y, position.z, height, 0);
      if (hit && velocity.y <= 0) {
        position.y = hit.max.y;
        velocity.y = 0;
        onGround = true;
      } else if (hit) {
        position.y = hit.min.y - height;
        velocity.y = 0;
      }
      if (position.y < 0) {
        position.y = 0;
        velocity.y = 0;
        onGround = true;
      }
      velocity.y = Math.max(-30, velocity.y);
    },
    teleport(x, y, z) {
      position.set(x, y, z);
      velocity.set(0, 0, 0);
      onGround = true;
    },
    groundSpeed() {
      return Math.hypot(velocity.x, velocity.z);
    },
  };
}

export function createPlayer(colliders) {
  const mover = createMover(colliders, 0.34, STAND_HEIGHT);
  const body = {
    position: mover.position,
    velocity: mover.velocity,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && !mover.overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = body.crouching ? CROUCH_SPEED : WALK_SPEED;
    if (keys.has('Space') && mover.onGround) {
      body.velocity.y = JUMP_SPEED;
    }
    mover.drive(dt, wish.x * speed, wish.z * speed, (mover.onGround ? GROUND_ACCEL : AIR_ACCEL) / speed);
  }

  return {
    state: body,
    mover,
    step,
    look,
    recoil,
    groundSpeed() {
      return mover.groundSpeed();
    },
    teleport(x, y, z, yaw) {
      mover.teleport(x, y, z);
      body.yaw = yaw;
      body.pitch = 0;
    },
  };
}
