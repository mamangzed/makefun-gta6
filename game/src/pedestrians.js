// Pedestrians: Solmar Bay locals strolling the sidewalks, crossing at intersections,
// and fleeing when a car bears down on them or a gun goes off nearby.
import * as THREE from 'three';
import { G, CITY_HALF } from './state.js';
import { rand, pick, clamp, dist2D, lerpAngle } from './utils.js';
import { randomRoadPoint } from './city.js';

const PED_COUNT = 26;
const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0xa8e6cf];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS = [0x2f3542, 0x57606f, 0x3742fa, 0x2f3542, 0x747d8c];

function makePedMesh() {
  const group = new THREE.Group();
  const skin = pick(SKINS);
  const shirt = pick(SHIRTS);
  const pants = pick(PANTS);
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: pick([0x1a1a1a, 0x4a2c0a, 0x777777, 0x2b1d0e]), roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
  head.position.y = 1.56;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
  hair.position.y = 1.76;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirtMat);
  armL.position.set(-0.34, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.34;
  group.add(torso, head, hair, legL, legR, armL, armR);
  group.userData.limbs = { legL, legR, armL, armR };
  return group;
}

function sidewalkPoint() {
  const pt = randomRoadPoint();
  const off = pick([-8.8, 8.8]);
  return {
    x: pt.horizontal ? pt.x : pt.x + off,
    z: pt.horizontal ? pt.z + off : pt.z,
    axis: pt.horizontal ? 'x' : 'z',
    dir: Math.random() < 0.5 ? 1 : -1,
  };
}

export function initPeds() {
  for (let i = 0; i < PED_COUNT; i++) {
    const sp = sidewalkPoint();
    const mesh = makePedMesh();
    mesh.position.set(sp.x, 0, sp.z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, pos: mesh.position,
      heading: sp.axis === 'x' ? (sp.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (sp.dir > 0 ? 0 : Math.PI),
      axis: sp.axis, dir: sp.dir,
      speed: rand(1.1, 1.9), walkPhase: rand(0, 6),
      alive: true, fleeing: 0, fallTimer: 0, respawnAt: 0,
    });
  }
}

function nearestIntersection(ped) {
  const along = ped.axis === 'x' ? ped.pos.x : ped.pos.z;
  const roads = ped.axis === 'x' ? G.roadZs : G.roadXs;
  for (const r of roads) if (Math.abs(along - r) < 1.6) return true;
  return false;
}

export function updatePeds(dt) {
  const playerCar = G.player.car;
  const playerSpeed = Math.abs(G.player.speed);
  for (const ped of G.peds) {
    if (!ped.alive) {
      ped.fallTimer += dt;
      if (ped.fallTimer > 4) {
        // Get back up somewhere fresh, out of the player's sight.
        const sp = sidewalkPoint();
        ped.pos.set(sp.x, 0, sp.z);
        ped.mesh.rotation.set(0, 0, 0);
        ped.mesh.position.y = 0;
        ped.axis = sp.axis; ped.dir = sp.dir;
        ped.alive = true;
        ped.fleeing = 0;
      }
      continue;
    }

    // Flee: a speeding car nearby, or a gunshot.
    let flee = ped.fleeing > 0;
    if (playerCar && playerSpeed > 6) {
      const d = dist2D(ped.pos.x, ped.pos.z, G.player.pos.x, G.player.pos.z);
      if (d < 9) { flee = true; ped.fleeing = 1.6; }
    }
    if (G.gunshotAt && G.time - G.gunshotAt < 1.2) {
      const d = dist2D(ped.pos.x, ped.pos.z, G.player.pos.x, G.player.pos.z);
      if (d < 22) { flee = true; ped.fleeing = 2.2; }
    }
    ped.fleeing = Math.max(0, ped.fleeing - dt);

    const speed = flee ? 4.6 : ped.speed;
    // Turn at intersections, or when fleeing, dart away from the road.
    if (nearestIntersection(ped) && Math.random() < dt * 1.1) {
      ped.axis = ped.axis === 'x' ? 'z' : 'x';
      ped.dir = Math.random() < 0.5 ? 1 : -1;
      ped.heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
    }
    if (ped.axis === 'x') ped.pos.x += ped.dir * speed * dt;
    else ped.pos.z += ped.dir * speed * dt;
    if (ped.pos.x > CITY_HALF + 4) ped.pos.x = -CITY_HALF - 4;
    if (ped.pos.x < -CITY_HALF - 4) ped.pos.x = CITY_HALF + 4;
    if (ped.pos.z > CITY_HALF + 4) ped.pos.z = -CITY_HALF - 4;
    if (ped.pos.z < -CITY_HALF - 4) ped.pos.z = CITY_HALF + 4;

    ped.walkPhase += dt * speed * 3.2;
    const swing = Math.sin(ped.walkPhase) * 0.55;
    const limbs = ped.mesh.userData.limbs;
    limbs.legL.rotation.x = swing;
    limbs.legR.rotation.x = -swing;
    limbs.armL.rotation.x = -swing * 0.8;
    limbs.armR.rotation.x = swing * 0.8;
    ped.mesh.rotation.y = ped.heading;
  }
}

// Nearest living pedestrian to a point, within maxDist.
export function nearestPed(x, z, maxDist) {
  let best = null, bestD = maxDist;
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const d = dist2D(x, z, ped.pos.x, ped.pos.z);
    if (d < bestD) { best = ped; bestD = d; }
  }
  return best;
}
