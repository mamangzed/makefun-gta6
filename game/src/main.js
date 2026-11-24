// Solmar Bay — Street Heat. Boot, the one game loop, the third-person camera,
// menus, save/load, and ?shot= staging for screenshots.
//
// ?shot=cover|street|chase|mission stages that scene (player placed, wanted set,
// police spawned, mission running) and sets window.__shotReady once painted,
// so screenshots are real renders of the live game.
import * as THREE from 'three';
import { G, setMode, damagePlayer } from './state.js';
import { clamp } from './utils.js';
import { buildCity } from './city.js';
import { initPlayer, updatePlayer } from './player.js';
import { spawnParkedCars, enterCar, exitCar, updatePlayerCar, nearestStealableCar } from './vehicles.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { initPeds, updatePeds } from './pedestrians.js';
import { updatePolice, setWanted, clearPolice } from './police.js';
import { createMarker, startMission, updateMissions, saveGame, loadSave, hasSave, applySave } from './missions.js';
import { tryPunch, tryShoot, reload, updateCombat } from './combat.js';
import { initHud, updateHud, showToast, showBanner, setObjective } from './hud.js';
import { initAudio, setEngine, setSiren, sfx } from './audio.js';
import { initInput, keys, moveAxes, consumeClick } from './input.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe8);
scene.fog = new THREE.Fog(0x9fc8e8, 240, 520);
G.scene = scene;
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.renderer = renderer;

// Sun-soaked midday light.
const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
// A visible sun disc for the sky.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(14, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff8d0, fog: false }),
);
sunDisc.position.set(300, 260, 140);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

buildCity(scene);
spawnParkedCars();
initTraffic();
initPeds();
initPlayer();
createMarker();
initHud();

window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function announce(msg) { statusEl.textContent = msg; }

// --- Menu / save / pause wiring -------------------------------------------
const btnStart = document.getElementById('btn-start');
const btnContinue = document.getElementById('btn-continue');
if (hasSave()) btnContinue.style.display = '';

function startNewGame() {
  initAudio();
  sfx('click');
  G.money = 250; G.health = 100; G.missionIndex = 0;
  G.player.pos.set(20, 0, 0);
  G.player.heading = Math.PI;
  G.player.mesh.position.copy(G.player.pos);
  setMode('playing');
  setObjective('THE PICKUP', 'Rosa needs a driver. Steal a car and meet her first job — press E near a car.');
  showToast('Welcome to Solmar Bay. Steal a car with E, then follow the pink beacon.');
  showBanner('SOLMAR BAY', 'Steal a car. Take the job. Don’t get caught.');
  announce('Playing Solmar Bay Street Heat.');
  setTimeout(() => { if (G.mode === 'playing' && !G.missionActive) startMission(0); }, 4000);
}

function continueGame() {
  initAudio();
  sfx('click');
  const save = loadSave();
  if (save) applySave(save);
  setMode('playing');
  showToast('Welcome back, Leo.');
  announce('Continuing saved game.');
}

btnStart.addEventListener('click', startNewGame);
btnContinue.addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  sfx('click');
  setMode('playing');
  announce('Playing.');
});
document.getElementById('btn-save').addEventListener('click', () => {
  saveGame();
  showToast('Game saved.');
  sfx('cash');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  location.reload();
});
document.getElementById('btn-respawn').addEventListener('click', () => {
  sfx('click');
  G.money = Math.max(0, G.money - 100);
  G.health = 100;
  clearPolice();
  if (G.player.car) { G.player.car.kind = 'parked'; G.player.car = null; }
  G.player.pos.set(20, 0, 0);
  G.player.heading = Math.PI;
  G.player.mesh.visible = true;
  G.player.mesh.position.copy(G.player.pos);
  G.player.mesh.rotation.y = G.player.heading;
  setMode('playing');
  showToast('Patched up at Solmar General. $100 lighter.');
  announce('Back on the streets.');
});

// --- Input callbacks --------------------------------------------------------
initInput(canvas, {
  onMute() {
    G.muted = !G.muted;
    if (G.muted) setSiren(false);
    showToast(G.muted ? 'Sound off.' : 'Sound on.');
  },
  onPause() {
    if (G.mode === 'playing') { setMode('paused'); announce('Paused.'); }
    else if (G.mode === 'paused') { setMode('playing'); announce('Playing.'); }
  },
  onInteract() {
    if (G.mode !== 'playing') return;
    initAudio();
    if (G.player.car) exitCar();
    else {
      const car = nearestStealableCar(4.2);
      if (car) enterCar(car);
    }
  },
  onPunch() { tryPunch(); },
  onReload() { reload(); },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'playing') setMode('paused');
});

// --- Third-person camera ----------------------------------------------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  // Mouse look; when idle the camera slowly drifts for a cinematic feel.
  G.camYaw -= G.mouseDX * 0.0032;
  G.camPitch = clamp(G.camPitch + G.mouseDY * 0.0026, 0.05, 1.1);
  G.mouseDX = 0; G.mouseDY = 0;
  if (G.time - G.lastMouseAt > 6 && G.mode === 'playing') {
    G.camYaw += dt * 0.05;
  }

  const driving = !!G.player.car;
  const dist = driving ? 11.5 : 7.2;
  const height = driving ? 4.6 : 3.4;
  camTarget.copy(G.player.pos);
  camTarget.y += driving ? 1.9 : 1.7;
  // Camera sits behind the player; while driving it trails the car's heading.
  const yaw = driving ? G.player.heading + Math.PI : G.camYaw;
  const pitch = G.camPitch;
  camPos.set(
    camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    camTarget.y + Math.sin(pitch) * dist + height * 0.35,
    camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camPos.y = Math.max(camPos.y, 1.4);
  G.camera.position.lerp(camPos, Math.min(1, dt * 7));
  G.camera.lookAt(camTarget);
}

// --- Shot staging for screenshots ------------------------------------------
function stageShot(name) {
  setMode('playing');
  G.player.mesh.visible = true;
  if (name === 'cover') {
    // Downtown, in a stolen car, wanted 2, police closing in behind.
    const car = G.cars.find((c) => c.kind === 'parked');
    G.player.pos.set(20, 0, 30);
    enterCar(car);
    car.pos.set(20, 0, 30);
    car.heading = Math.PI;
    car.speed = 14;
    G.camYaw = 0;
    G.camPitch = 0.3;
    setWanted(2, '');
    startMission(0);
  } else if (name === 'street') {
    // On the avenue itself, facing downtown: a long street view with traffic.
    G.player.pos.set(20, 0, 40);
    G.player.heading = Math.PI;
    G.player.mesh.position.copy(G.player.pos);
    G.camYaw = Math.PI;
    G.camPitch = 0.28;
    setObjective('FREE ROAM', 'Explore Solmar Bay. Steal a car with E. Talk to Rosa to start work.');
    // Stage life into the frame: a car rolling toward the player, a local on the sidewalk.
    // (The camera sits north of the player looking south, so stage south of him.)
    const tcar = G.traffic[0];
    if (tcar) {
      tcar.pos.set(16.9, 0, 62);
      tcar.axis = 'z'; tcar.dir = -1; tcar.heading = Math.PI; tcar.speed = 10;
      tcar.mesh.rotation.y = Math.PI;
    }
    const ped = G.peds[0];
    if (ped) {
      ped.pos.set(28.8, 0, 54);
      ped.axis = 'z'; ped.dir = -1; ped.heading = Math.PI;
    }
  } else if (name === 'chase') {
    const car = G.cars.find((c) => c.kind === 'parked');
    G.player.pos.set(-20, 0, -60);
    enterCar(car);
    car.pos.set(-20, 0, -60);
    car.heading = 0;
    car.speed = 26;
    G.camYaw = 0;
    G.camPitch = 0.28;
    setWanted(4, '');
    showToast('The SBPD is on your tail — lose them!');
    setObjective('HEAT LEVEL 4', 'Four stars. Lose the SBPD pursuit — break line of sight and stay clear.');
    // One unit cuts across ahead of the player so the chase reads in frame.
    const lead = G.police[0];
    if (lead) {
      lead.pos.set(-20, 0, -22);
      lead.heading = Math.PI;
      lead.speed = 22;
    }
  } else if (name === 'mission') {
    // North up the beach road toward the docks beacon (180, 140), 40 m out.
    // Camera sits south of the player so the beacon is in frame ahead of him.
    G.player.pos.set(180, 0, 100);
    G.player.heading = 0;
    G.player.mesh.position.copy(G.player.pos);
    G.camYaw = Math.PI;
    G.camPitch = 0.3;
    startMission(0);
  }
  // Let the world settle a couple of frames, then flag readiness.
  // Several fixed steps per rendered frame: software GL is slow, and the
  // game only needs ~1.6 s of simulated time to settle into the shot.
  let frames = 0;
  function settle() {
    for (let i = 0; i < 4; i++) stepWorld(1 / 60);
    renderer.render(scene, G.camera);
    frames++;
    if (frames < 16) requestAnimationFrame(settle);
    else window.__shotReady = true;
  }
  requestAnimationFrame(settle);
}

// --- The loop ---------------------------------------------------------------
let last = performance.now();
function stepWorld(dt) {
  G.time += dt;
  updatePlayer(dt);
  if (G.player.car) {
    const axes = moveAxes();
    updatePlayerCar(dt, axes, !!keys['Space']);
  }
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateCombat(dt);
  // Clouds drift.
  for (const cloud of G.clouds || []) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 260) cloud.position.x = -260;
  }
  updateCamera(dt);
  if (consumeClick()) tryShoot();
  setEngine(G.player.car ? Math.abs(G.player.speed) / 42 : 0, !!G.player.car);
  if (G.mode === 'playing') updateHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (G.mode === 'playing') stepWorld(dt);
  else if (G.mode === 'menu') {
    // Menu backdrop: slow orbit around downtown so the city shows behind the title.
    G.time += dt;
    G.camYaw += dt * 0.04;
    G.player.pos.set(0, 0, 0);
    updateCamera(dt);
    for (const cloud of G.clouds || []) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 260) cloud.position.x = -260;
    }
  }
  renderer.render(scene, G.camera);
}

// Debug handle for play-testing (state inspection and fixed stepping only).
window.__solmar = {
  G,
  step: (n) => { for (let i = 0; i < n; i++) stepWorld(1 / 60); renderer.render(scene, G.camera); },
  state: () => ({
    mode: G.mode, money: G.money, health: G.health, wanted: G.wanted,
    mission: G.missionIndex, step: G.missionStep, active: G.missionActive,
    x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z),
    inCar: !!G.player.car, speed: Math.round(G.player.speed),
    police: G.police.length, traffic: G.traffic.length, peds: G.peds.filter((p) => p.alive).length,
  }),
};

if (shot) stageShot(shot);
else requestAnimationFrame(frame);
