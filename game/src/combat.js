// Combat: fists on foot and a pistol with a centre-screen raycast.
// Punching or shooting a bystander is a crime; shooting near police draws heat.
import * as THREE from 'three';
import { G } from './state.js';
import { dist2D, angleDiff } from './utils.js';
import { nearestPed } from './pedestrians.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';
import { showToast } from './hud.js';

const PUNCH_RANGE = 2.4;
const PUNCH_ARC = 1.1;
let tracer = null;
let tracerUntil = 0;

function ensureTracer() {
  if (tracer) return;
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  tracer.visible = false;
  tracer.frustumCulled = false;
  G.scene.add(tracer);
}

export function tryPunch() {
  const p = G.player;
  if (p.car || p.punchCooldown > 0 || G.mode !== 'playing') return;
  p.punchCooldown = 0.45;
  sfx('punch');
  // Swing the arm (visual only, the walk-cycle code resets it next frame).
  const armR = p.mesh.userData.limbs?.armR;
  if (armR) armR.rotation.x = -1.6;
  const ped = nearestPed(p.pos.x, p.pos.z, PUNCH_RANGE);
  if (ped) {
    const ang = Math.atan2(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z);
    if (Math.abs(angleDiff(ang, p.heading)) < PUNCH_ARC) {
      ped.alive = false;
      ped.fallTimer = 0;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
      addWanted(1, 'Assault in broad daylight');
      showToast('You knocked a local flat. The SBPD noticed.');
    }
  }
}

export function tryShoot() {
  const p = G.player;
  if (p.car || p.shootCooldown > 0 || G.mode !== 'playing') return;
  p.shootCooldown = 0.3;
  p.ammo = Math.max(0, p.ammo - 1);
  G.stats.shotsFired++;
  G.gunshotAt = G.time;
  sfx('shot');
  ensureTracer();

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), G.camera);
  ray.far = 90;
  // Test pedestrians first, then cars, then buildings.
  const pedMeshes = G.peds.filter((pd) => pd.alive).map((pd) => pd.mesh);
  const carMeshes = G.cars.filter((c) => c.alive).map((c) => c.mesh);
  let hit = ray.intersectObjects(pedMeshes, true)[0];
  let hitPoint = null;
  if (hit) {
    hitPoint = hit.point;
    const ped = G.peds.find((pd) => pd.mesh === hit.object || pd.mesh.children.includes(hit.object));
    if (ped) {
      ped.alive = false;
      ped.fallTimer = 0;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
      addWanted(2, 'Shots fired on the street');
    }
  } else {
    hit = ray.intersectObjects(carMeshes, true)[0];
    if (hit) {
      hitPoint = hit.point;
      addWanted(1, 'Shots fired on the street');
      sfx('thud');
    }
  }
  if (!hit) {
    // Whiff: the tracer just runs out into the city.
    hitPoint = ray.ray.at(60, new THREE.Vector3());
  }

  // Muzzle-to-impact tracer, fading fast.
  const start = p.mesh.position.clone();
  start.y = 1.45;
  const pos = tracer.geometry.attributes.position;
  pos.setXYZ(0, start.x, start.y, start.z);
  pos.setXYZ(1, hitPoint.x, hitPoint.y, hitPoint.z);
  pos.needsUpdate = true;
  tracer.visible = true;
  tracerUntil = G.time + 0.08;
}

export function reload() {
  const p = G.player;
  if (p.car || G.mode !== 'playing') return;
  if (p.ammo < 24) {
    p.ammo = 24;
    sfx('click');
    showToast('Pistol reloaded.');
  }
}

export function updateCombat(dt) {
  const p = G.player;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  if (tracer && tracer.visible && G.time > tracerUntil) tracer.visible = false;
  // Ammo slowly trickles back while walking the streets.
  if (p.ammo < 24 && Math.random() < dt * 0.05) p.ammo++;
}
