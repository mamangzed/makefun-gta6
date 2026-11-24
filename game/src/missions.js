// Story missions: three jobs for Rosa Delgado, in order, each with a glowing
// beacon, a HUD objective and a cash payout. After the third, free roam.
import * as THREE from 'three';
import { G, addMoney } from './state.js';
import { dist2D, formatMoney } from './utils.js';
import { spawnCar } from './vehicles.js';
import { setWanted, clearPolice } from './police.js';
import { showToast, showBanner, setObjective } from './hud.js';
import { sfx } from './audio.js';

// Fixed story locations (all on road intersections, so every marker is reachable).
const DOCKS = { x: 180, z: 140 };        // east docks, by the bay
const CLUB_NEON = { x: -20, z: -20 };    // Rosa's club, downtown
const SAFEHOUSE = { x: -140, z: 140 };   // Leo's bolt-hole, south-west
const PICKUP_SPOT = { x: 60, z: -140 };  // the courier's route, north side

const MISSIONS = [
  {
    name: 'THE PICKUP',
    reward: 500,
    steps: [
      { text: 'Drive to the docks and collect Rosa’s package.', target: DOCKS },
      { text: 'Deliver the package to Club Neon. Don’t scratch the paint.', target: CLUB_NEON },
    ],
  },
  {
    name: 'TAIL JOB',
    reward: 800,
    steps: [
      { text: 'Tail the courier van — stay close, but don’t spook him.', target: null, tail: true },
    ],
  },
  {
    name: 'HEAT WAVE',
    reward: 1500,
    steps: [
      { text: 'The SBPD is onto you. Survive the heat, then reach the safehouse.', target: null, survive: true },
    ],
  },
];

let beacon = null;
let diamond = null;

export function createMarker() {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 42, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 21;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23d }),
  );
  diamond.position.y = 7;
  group.add(beam, ring, diamond);
  group.visible = false;
  G.scene.add(group);
  beacon = group;
  G.marker = group;
  return group;
}

export function setMarkerPos(x, z) {
  if (!beacon) return;
  beacon.position.set(x, 0, z);
  beacon.visible = true;
}

export function hideMarker() {
  if (beacon) beacon.visible = false;
}

export function currentMission() {
  return MISSIONS[G.missionIndex] || null;
}

export function currentStep() {
  const m = currentMission();
  return m ? m.steps[G.missionStep] : null;
}

export function startMission(index) {
  G.missionIndex = index;
  G.missionStep = 0;
  G.missionActive = true;
  G.missionTimer = 0;
  G.missionHold = 0;
  const m = MISSIONS[index];
  showBanner(m.name, 'Rosa Delgado — Club Neon');
  sfx('mission');
  applyStep();
}

function applyStep() {
  const step = currentStep();
  if (!step) return;
  if (step.tail) {
    // Spawn the courier van on a loop around the north side.
    const van = spawnCar(0x8a5fd0, PICKUP_SPOT.x, PICKUP_SPOT.z, Math.PI / 2, 'target');
    van.axis = 'x'; van.dir = 1; van.cruise = 11; van.speed = 11;
    G.traffic.push(van);
    G.missionTargetCar = van;
    hideMarker();
  } else if (step.survive) {
    setWanted(3, 'The SBPD found your trail');
    G.missionTimer = 45;
    hideMarker();
  } else {
    setMarkerPos(step.target.x, step.target.z);
  }
  setObjective(currentMission().name, step.text);
}

function completeStep() {
  const m = currentMission();
  G.missionStep++;
  sfx('pickup');
  if (G.missionStep >= m.steps.length) completeMission();
  else applyStep();
}

function completeMission() {
  const m = currentMission();
  addMoney(m.reward);
  G.stats.missionsDone++;
  G.missionActive = false;
  hideMarker();
  showBanner('JOB DONE', '+' + formatMoney(m.reward) + ' — ' + m.name);
  showToast('Job complete: +' + formatMoney(m.reward));
  sfx('cash');
  saveGame();
  if (G.missionIndex + 1 < MISSIONS.length) {
    setTimeout(() => {
      if (G.mode === 'playing') startMission(G.missionIndex + 1);
    }, 2600);
  } else {
    G.missionIndex = MISSIONS.length;
    setObjective('FREE ROAM', 'Story complete. Solmar Bay is yours — keep the money coming.');
    showBanner('STORY COMPLETE', 'Leo Marín runs Solmar Bay now.');
  }
}

export function updateMissions(dt) {
  if (!G.missionActive) return;
  const step = currentStep();
  if (!step) return;

  // Animate the beacon.
  if (beacon && beacon.visible) {
    diamond.rotation.y += dt * 2.4;
    diamond.position.y = 7 + Math.sin(G.time * 2) * 0.6;
  }

  if (step.tail && G.missionTargetCar) {
    const van = G.missionTargetCar;
    const d = dist2D(G.player.pos.x, G.player.pos.z, van.pos.x, van.pos.z);
    setMarkerPos(van.pos.x, van.pos.z);
    if (d < 34) {
      G.missionHold += dt;
      setObjective('TAIL JOB', 'Stay on the courier — ' + Math.ceil(8 - G.missionHold) + 's to go. Distance ' + Math.round(d) + 'm');
    } else {
      G.missionHold = Math.max(0, G.missionHold - dt * 0.5);
      setObjective('TAIL JOB', 'You lost him! Close the gap — under 34m. Distance ' + Math.round(d) + 'm');
    }
    if (G.missionHold >= 8) {
      // The van pulls over; the tail is done.
      van.kind = 'parked';
      van.speed = 0;
      const idx = G.traffic.indexOf(van);
      if (idx !== -1) G.traffic.splice(idx, 1);
      G.missionTargetCar = null;
      completeStep();
    }
    return;
  }

  if (step.survive) {
    if (G.wanted > 0) {
      G.missionTimer -= dt;
      setObjective('HEAT WAVE', 'Lose the SBPD — ' + Math.ceil(G.missionTimer) + 's of heat left, then reach the safehouse.');
    } else {
      setObjective('HEAT WAVE', 'Heat’s off. Get to the safehouse in the south-west.');
      setMarkerPos(SAFEHOUSE.x, SAFEHOUSE.z);
      const d = dist2D(G.player.pos.x, G.player.pos.z, SAFEHOUSE.x, SAFEHOUSE.z);
      if (d < 6) completeStep();
    }
    if (G.missionTimer <= 0 && G.wanted > 0) {
      // Heat survived on the clock: the cops give up.
      clearPolice();
      setObjective('HEAT WAVE', 'Heat’s off. Get to the safehouse in the south-west.');
      setMarkerPos(SAFEHOUSE.x, SAFEHOUSE.z);
    }
    return;
  }

  // Plain reach-the-marker step.
  const d = dist2D(G.player.pos.x, G.player.pos.z, step.target.x, step.target.z);
  setObjective(currentMission().name, step.text + ' — ' + Math.round(d) + 'm');
  if (d < 6) completeStep();
}

// Save / load: money, story progress, position, health.
export function saveGame() {
  try {
    window.localStorage.setItem(G.SAVE_KEY, JSON.stringify({
      money: G.money,
      health: G.health,
      missionIndex: G.missionIndex,
      missionActive: G.missionActive,
      x: G.player.pos.x,
      z: G.player.pos.z,
      heading: G.player.heading,
    }));
  } catch { /* storage unavailable: the run continues without saving */ }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(G.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(save) {
  G.money = save.money ?? 250;
  G.health = save.health ?? 100;
  G.missionIndex = save.missionIndex ?? 0;
  G.player.pos.set(save.x ?? 20, 0, save.z ?? 0);
  G.player.heading = save.heading ?? Math.PI;
  G.player.mesh.position.copy(G.player.pos);
  G.player.mesh.rotation.y = G.player.heading;
  if (save.missionActive && G.missionIndex < MISSIONS.length) {
    startMission(G.missionIndex);
  } else if (G.missionIndex >= MISSIONS.length) {
    setObjective('FREE ROAM', 'Story complete. Solmar Bay is yours — keep the money coming.');
  }
}
