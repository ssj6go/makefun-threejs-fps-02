// The map: FOUNDRY, an industrial yard 46 x 40 m. Attackers spawn south,
// defenders north, two bomb sites (A west, B east), three lanes (west, mid,
// east) and a connector behind the mid door. Built from boxes; every box is a
// collider and a surface a bullet stops on. Waypoints below are the graph the
// bots walk: routes, holds and rush paths are lists of node ids.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material]
const BOXES = [
  // Floor and perimeter (4.6 m walls).
  [46.4, 0.4, 40.4, 0, -0.2, 0, 'canvas'],
  [0.4, 4.6, 40.4, -23.2, 2.3, 0, 'surface'],
  [0.4, 4.6, 40.4, 23.2, 2.3, 0, 'surface'],
  [46.4, 4.6, 0.4, 0, 2.3, -20.2, 'surface'],
  [46.4, 4.6, 0.4, 0, 2.3, 20.2, 'surface'],
  // Lane dividers (west x=-10, east x=10), open at the connector (z -4..-9).
  [0.4, 3.4, 16, -10, 1.7, 4, 'surface'],
  [0.4, 3.4, 16, 10, 1.7, 4, 'surface'],
  // Mid door wall at z=2, a 3 m gap in the middle.
  [8.5, 3.4, 0.4, -5.75, 1.7, 2, 'surface'],
  [8.5, 3.4, 0.4, 5.75, 1.7, 2, 'surface'],
  // Site approach wall at z=-9: gaps west, mid and east.
  [4, 3.4, 0.4, -21, 1.7, -9, 'surface'],
  [13, 3.4, 0.4, -8.5, 1.7, -9, 'surface'],
  [13, 3.4, 0.4, 8.5, 1.7, -9, 'surface'],
  [4, 3.4, 0.4, 21, 1.7, -9, 'surface'],
  // Attacker yard cover.
  [2.2, 1.1, 1.2, -5, 0.55, 14, 'hairline'],
  [2.2, 1.1, 1.2, 5, 0.55, 14, 'hairline'],
  [1.2, 0.9, 1.2, 0, 0.45, 10, 'hairline'],
  // West lane cover.
  [1.4, 1.1, 1.4, -15, 0.55, 6, 'hairline'],
  [2.4, 0.9, 1.2, -17, 0.45, -1, 'hairline'],
  [1.2, 1.3, 1.2, -13, 0.65, -7, 'hairline'],
  // East lane cover.
  [1.4, 1.1, 1.4, 15, 0.55, 6, 'hairline'],
  [2.4, 0.9, 1.2, 17, 0.45, -1, 'hairline'],
  [1.2, 1.3, 1.2, 13, 0.65, -7, 'hairline'],
  // Mid plaza cover and the raised platform (0.8 m: jumpable) over the connector.
  [1.6, 1.0, 1.6, -6, 0.5, 7, 'hairline'],
  [1.6, 1.0, 1.6, 6, 0.5, 7, 'hairline'],
  [2.2, 1.1, 1.2, 0, 0.55, 4.5, 'hairline'],
  [5, 0.8, 3, 0, 0.4, -6, 'surface'],
  // Site A cover and its tall container.
  [1.6, 1.1, 1.6, -18, 0.55, -12, 'hairline'],
  [1.2, 1.0, 1.2, -13, 0.5, -16, 'hairline'],
  [2.4, 2.4, 1.2, -12, 1.2, -11, 'hairline'],
  [1.0, 0.8, 1.0, -16, 0.4, -17.5, 'hairline'],
  // Site B cover and its tall container.
  [1.6, 1.1, 1.6, 18, 0.55, -12, 'hairline'],
  [1.2, 1.0, 1.2, 13, 0.5, -16, 'hairline'],
  [2.4, 2.4, 1.2, 12, 1.2, -11, 'hairline'],
  [1.0, 0.8, 1.0, 16, 0.4, -17.5, 'hairline'],
  // Defender yard cover.
  [1.4, 1.0, 1.4, -4, 0.5, -15, 'hairline'],
  [1.4, 1.0, 1.4, 4, 0.5, -15, 'hairline'],
];

const SILOS = [
  [-21.5, 18.5],
  [21.5, 18.5],
  [-21.5, -18.5],
  [21.5, -18.5],
];

export const WAYPOINTS = {
  atk: [0, 16],
  yardW: [-6, 13],
  yardE: [6, 13],
  westS: [-16, 9],
  westM: [-16, 2],
  westN: [-16, -7],
  eastS: [16, 9],
  eastM: [16, 2],
  eastN: [16, -7],
  midS: [0, 8],
  midDoor: [0, 2],
  midN: [0, -6],
  connW: [-8, -7],
  connE: [8, -7],
  defYard: [0, -13],
  defSpawn: [0, -16],
  gateA: [-17, -9],
  gateB: [17, -9],
  siteA: [-15, -14],
  siteB: [15, -14],
  holdA: [-18, -16.5],
  holdB: [18, -16.5],
};

// Each defender's opening route, then its hold node.
export const BOT_ROUTES = [
  { route: ['defYard', 'connW', 'westN', 'gateA', 'siteA', 'holdA'], hold: 'holdA', scan: 'gateA' },
  { route: ['defYard', 'connE', 'eastN', 'gateB', 'siteB', 'holdB'], hold: 'holdB', scan: 'gateB' },
  { route: ['defYard', 'midN', 'midDoor'], hold: 'midDoor', scan: 'midS', patrol: ['midN', 'midDoor'] },
  { route: ['defYard', 'connE', 'eastN', 'eastM', 'midDoor', 'westM', 'westN', 'connW'], hold: null, patrol: ['connE', 'eastN', 'eastM', 'midDoor', 'westM', 'westN', 'connW', 'defYard'] },
];

// Rush routes once the bomb is planted at a site.
export const RUSH_ROUTES = {
  A: ['connW', 'westN', 'gateA', 'siteA'],
  B: ['connE', 'eastN', 'gateB', 'siteB'],
};

export const SITES = {
  A: { name: 'A', minX: -20, maxX: -11, minZ: -19, maxZ: -10, center: [-15.5, -14.5] },
  B: { name: 'B', minX: 11, maxX: 20, minZ: -19, maxZ: -10, center: [15.5, -14.5] },
};

export const SPAWNS = {
  attacker: { x: 0, z: 16, yaw: 0 },
  defenders: [
    { x: -3, z: -15.5 },
    { x: 3, z: -15.5 },
    { x: -1.5, z: -17.5 },
    { x: 1.5, z: -17.5 },
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.55,
    roughness: 0.6,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of BOXES) box(w, h, d, x, y, z, mat);

  const siloGeometry = new THREE.CylinderGeometry(1.5, 1.5, 6, 20);
  for (const [x, z] of SILOS) {
    const mesh = new THREE.Mesh(siloGeometry, materials.surface);
    mesh.position.set(x, 3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site markers: a glowing floor plate, four corner posts and a floating
  // diamond that turns, so each site reads from across the map.
  const markers = [];
  const diamondGeometry = new THREE.OctahedronGeometry(0.42);
  for (const site of Object.values(SITES)) {
    const [cx, cz] = site.center;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 9), siteMat);
    plate.position.set(cx, 0.03, cz);
    plate.receiveShadow = true;
    group.add(plate);
    const postGeometry = new THREE.BoxGeometry(0.18, 1.1, 0.18);
    for (const [px, pz] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]]) {
      const post = new THREE.Mesh(postGeometry, siteMat);
      post.position.set(cx + px, 0.55, cz + pz);
      group.add(post);
    }
    const diamond = new THREE.Mesh(diamondGeometry, siteMat);
    diamond.position.set(cx, 3.1, cz);
    group.add(diamond);
    markers.push(diamond);
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 14);
    glow.position.set(cx, 2.6, cz);
    scene.add(glow);
  }

  // Light: a warm key from the front right, a cool fill from behind, and a
  // sky/ground gradient. Shadows on the key light only.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(14, 20, 12);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    step(_dt, time) {
      for (let i = 0; i < markers.length; i += 1) {
        markers[i].rotation.y = time * 0.8 + i * 1.7;
        markers[i].position.y = 3.1 + Math.sin(time * 1.4 + i * 2.1) * 0.12;
      }
    },
  };
}
