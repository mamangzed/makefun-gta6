// Leo Marín on foot: the procedural character mesh, WASD movement relative to
// the camera, sprint, and the walk-cycle limb swing.
import * as THREE from 'three';
import { G, CITY_HALF } from './state.js';
import { clamp, lerpAngle, dist2D } from './utils.js';
import { collideCircle } from './city.js';
import { moveAxes, isSprinting } from './input.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xff2e88, roughness: 0.85 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacketMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), shirtMat);
  chest.position.set(0, 1.06, 0.18);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 }));
  hair.position.y = 1.8;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xffd23d, roughness: 0.7 }));
  cap.position.y = 1.88;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.24), pantsMat);
  legL.position.set(-0.15, 0.39, 0);
  legL.geometry.translate(0, -0.37, 0); // pivot at the hip
  legL.position.y = 0.76;
  const legR = legL.clone();
  legR.position.x = 0.15;
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.36), shoeMat);
  shoeL.position.set(0, -0.72, 0.05);
  legL.add(shoeL);
  const shoeR = shoeL.clone();
  legR.add(shoeR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), jacketMat);
  armL.geometry.translate(0, -0.31, 0); // pivot at the shoulder
  armL.position.set(-0.36, 1.32, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  group.add(torso, chest, head, hair, cap, legL, legR, armL, armR);
  group.userData.limbs = { legL, legR, armL, armR };
  return group;
}

export function initPlayer() {
  const mesh = makePlayerMesh();
  mesh.position.copy(G.player.pos);
  mesh.rotation.y = G.player.heading;
  G.scene.add(mesh);
  G.player.mesh = mesh;
  G.player.limbs = mesh.userData.limbs;
}

// On-foot update: move, collide, animate. Driving lives in vehicles.js.
export function updatePlayer(dt) {
  const p = G.player;
  if (p.car) return;
  const axes = moveAxes();
  const sprint = isSprinting();
  const speed = sprint ? 7.2 : 4.2;

  // Movement is relative to the camera yaw.
  const forwardX = Math.sin(G.camYaw);
  const forwardZ = Math.cos(G.camYaw);
  const rightX = Math.sin(G.camYaw - Math.PI / 2);
  const rightZ = Math.cos(G.camYaw - Math.PI / 2);
  let mx = forwardX * axes.y + rightX * axes.x;
  let mz = forwardZ * axes.y + rightZ * axes.x;
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  if (p.moving) {
    mx /= len; mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    p.heading = lerpAngle(p.heading, targetHeading, Math.min(1, dt * 12));
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;
    p.walkPhase += dt * speed * 2.1;
  }
  collideCircle(p.pos, 0.55);
  p.pos.x = clamp(p.pos.x, -CITY_HALF - 4, CITY_HALF + 26);
  p.pos.z = clamp(p.pos.z, -CITY_HALF - 4, CITY_HALF + 4);
  p.speed = p.moving ? speed : 0;

  // Walk cycle: legs and arms swing opposite; idle breathes slightly.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.7 : 0;
  const limbs = p.limbs;
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  if (p.punchCooldown <= 0.3) {
    limbs.armL.rotation.x = -swing * 0.85;
    limbs.armR.rotation.x = swing * 0.85;
  }
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
}
