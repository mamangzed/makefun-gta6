// Vehicles: procedural car meshes, parked cars to steal, and the player's
// arcade driving physics (accelerate, brake, steer, handbrake, collisions).
import * as THREE from 'three';
import { G, CITY_HALF } from './state.js';
import { clamp, lerpAngle, rand, pick, dist2D } from './utils.js';
import { collideCircle, randomRoadPoint, isOnRoad } from './city.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';

export const CAR_COLORS = [0xd23b3b, 0x3b7dd2, 0xf2c14e, 0x39b06a, 0xe8e8e8, 0x22242a, 0xff7a3d, 0x8a5fd0, 0x2fb3a8];
const BODY_GEO = new THREE.BoxGeometry(1.9, 0.62, 4.3);
const CABIN_GEO = new THREE.BoxGeometry(1.65, 0.55, 2.1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.15, metalness: 0.7 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.4 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xdd1111, emissiveIntensity: 0.9 });

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(CABIN_GEO, opts.police ? bodyMat : GLASS_MAT);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  // Headlights + taillights.
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), LIGHT_MAT);
    hl.position.set(sx, 0.62, 2.16);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), TAIL_MAT);
    tl.position.set(sx, 0.62, -2.16);
    group.add(tl);
  }
  // Wheels.
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  if (opts.police) {
    // Black-and-white livery + flashing light bar.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.4, 1.4), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    door.position.set(0, 0.62, 0.1);
    group.add(door);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    red.position.x = -0.28;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }));
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.5, -0.25);
    group.add(bar);
    group.userData.lightBar = { red, blue };
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(color, x, z, heading, kind) {
  const mesh = makeCarMesh(color, { police: kind === 'police' });
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh, color, kind: kind || 'parked',
    pos: mesh.position,
    heading,
    speed: 0,
    steer: 0,
    alive: true,
    // traffic AI fields
    axis: 'x', dir: 1, cruise: 0, stuck: 0,
    // police fields
    ramCooldown: 0,
  };
  G.cars.push(car);
  return car;
}

export function spawnParkedCars() {
  for (let i = 0; i < 16; i++) {
    const pt = randomRoadPoint();
    // Park in a lane of the road this point is actually on, facing along it.
    const lane = pick([-3.4, 3.4]);
    const x = pt.horizontal ? pt.x : pt.x + lane;
    const z = pt.horizontal ? pt.z + lane : pt.z;
    const heading = pt.horizontal ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? 0 : Math.PI);
    spawnCar(pick(CAR_COLORS), x, z, heading, 'parked');
  }
}

// The nearest stealable car (parked or traffic) within reach of the player.
export function nearestStealableCar(maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    if (car.kind === 'police' || car.kind === 'target') continue;
    if (car === G.player.car) continue;
    const d = dist2D(G.player.pos.x, G.player.pos.z, car.pos.x, car.pos.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(car) {
  const wasParked = car.kind === 'parked';
  car.kind = 'player';
  G.player.car = car;
  G.player.mesh.visible = false;
  car.speed = 0;
  if (wasParked) {
    G.stats.carsStolen++;
    addWanted(1, 'Car stolen — the SBPD noticed');
    sfx('door');
  }
  if (G.traffic.includes(car)) G.traffic.splice(G.traffic.indexOf(car), 1);
}

export function exitCar() {
  const car = G.player.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  const p = G.player;
  const side = Math.cos(p.heading) >= 0 ? 1 : -1;
  p.pos.set(car.pos.x + side * 2.2, 0, car.pos.z);
  p.heading = car.heading;
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  p.car = null;
  sfx('door');
}

// Arcade driving: called every frame while the player is in a car.
export function updatePlayerCar(dt, axes, handbrake) {
  const car = G.player.car;
  if (!car) return;
  const maxSpeed = 42;
  const maxReverse = 12;
  const accel = 16;
  const brake = 30;
  const drag = 0.4;

  if (axes.y > 0) car.speed += accel * dt;
  else if (axes.y < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * drag * 6 * dt;
    if (Math.abs(car.speed) < 0.3) car.speed = 0;
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * 26 * dt;
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);

  // Steering tightens at low speed, loosens at high speed; reverse flips it.
  const steerTarget = -axes.x * clamp(Math.abs(car.speed) / 8, 0, 1) * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turnRate = car.steer * (car.speed / 10);
  car.heading += turnRate * dt * (car.speed >= 0 ? 1 : -1);
  if (handbrake && Math.abs(car.speed) > 6) car.heading += car.steer * dt * 1.6;

  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = nx; car.pos.z = nz;
  if (collideCircle(car.pos, 1.9)) {
    // Scraped a building: kill most of the speed and shove the car back out.
    const bounced = Math.abs(car.speed) > 8;
    car.speed *= -0.25;
    if (bounced) sfx('thud');
  }
  // Keep the city bounded (beach + water edge).
  car.pos.x = clamp(car.pos.x, -CITY_HALF - 6, CITY_HALF + 26);
  car.pos.z = clamp(car.pos.z, -CITY_HALF - 6, CITY_HALF + 6);

  car.mesh.rotation.y = car.heading;
  // Wheels spin with speed; fronts yaw with steering.
  const wheels = car.mesh.userData.wheels;
  const spin = (car.speed * dt) / 0.36;
  wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = car.steer * 0.9;
  });

  // Running over pedestrians at speed is a crime — and it hurts.
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const d = dist2D(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z);
    if (d < 2.2 && Math.abs(car.speed) > 4) {
      ped.alive = false;
      ped.fallTimer = 0;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
      G.stats.pedsHit++;
      addWanted(1, 'Pedestrian struck');
      sfx('thud');
      car.speed *= 0.85;
    }
  }

  // Bumping other cars: shove them aside, lose a little speed.
  for (const other of G.cars) {
    if (other === car || !other.alive) continue;
    const d = dist2D(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
    if (d < 3.6 && d > 0.01) {
      const push = (3.6 - d) * 0.5;
      const dx = (other.pos.x - car.pos.x) / d;
      const dz = (other.pos.z - car.pos.z) / d;
      other.pos.x += dx * push;
      other.pos.z += dz * push;
      if (other.kind === 'traffic' || other.kind === 'target') {
        other.speed = Math.max(0, other.speed - 2);
        other.stuck = 1.2;
      }
      car.speed *= 0.96;
    }
  }

  G.player.pos.copy(car.pos);
  G.player.heading = car.heading;
  G.player.speed = car.speed;
}
