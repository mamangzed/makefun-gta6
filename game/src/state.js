// Shared mutable game state: one object every system reads and writes.
// main.js fills in the three.js handles (scene, camera, renderer) at boot.
import * as THREE from 'three';

export const CITY_HALF = 180;        // city spans -180..180 on x and z
export const ROAD_SPACING = 40;      // distance between parallel roads
export const ROAD_WIDTH = 12;        // drivable asphalt width
export const WORLD_HALF = 260;       // playable bounds incl. beach + water

export const G = {
  scene: null,
  camera: null,
  renderer: null,
  mode: 'menu',           // menu | playing | paused | wasted
  time: 0,
  money: 250,
  health: 100,
  wanted: 0,              // 0..5 stars
  lastSeenAt: 0,          // last time any police unit had the player in range
  crimeCooldownUntil: 0,  // crimes within this window do not stack stars

  player: {
    pos: new THREE.Vector3(20, 0, 0),
    heading: Math.PI,      // facing -z (down the avenue)
    speed: 0,
    walkPhase: 0,
    moving: false,
    mesh: null,
    limbs: null,           // { legL, legR, armL, armR } for the walk cycle
    car: null,             // vehicle object the player is driving, or null
    punchCooldown: 0,
    shootCooldown: 0,
    ammo: 24,
  },

  // Dynamic world lists, filled by their own modules.
  cars: [],        // every drivable vehicle (parked, traffic, police, mission)
  traffic: [],     // AI traffic vehicles (subset of cars)
  peds: [],        // pedestrians
  police: [],      // police units chasing the player (subset of cars)
  colliders: [],   // building footprints { x0, z0, x1, z1 }
  roadXs: [],      // x coordinates of north-south roads
  roadZs: [],      // z coordinates of east-west roads

  // Mission / story progress.
  missionIndex: 0,        // 0..2 story missions, 3 = story complete
  missionStep: 0,
  missionActive: false,
  missionTimer: 0,        // countdown or hold timer, per mission
  missionHold: 0,         // cumulative "stay close" seconds (mission 2)
  missionTargetCar: null,
  marker: null,           // THREE.Group beacon at the current objective

  // Camera + input.
  camYaw: Math.PI,
  camPitch: 0.32,
  mouseDX: 0,
  mouseDY: 0,
  lastMouseAt: -99,

  muted: false,
  stats: { carsStolen: 0, pedsHit: 0, missionsDone: 0, shotsFired: 0 },

  SAVE_KEY: 'solmar-bay-save-v1',
};

export function setMode(mode) {
  G.mode = mode;
  document.getElementById('hud').classList.toggle('on', mode === 'playing');
  document.getElementById('menu').classList.toggle('hidden', mode !== 'menu');
  document.getElementById('pause').classList.toggle('hidden', mode !== 'paused');
  document.getElementById('wasted').classList.toggle('hidden', mode !== 'wasted');
}

export function addMoney(amount) {
  G.money = Math.max(0, G.money + amount);
}

export function damagePlayer(amount, cause) {
  if (G.mode !== 'playing') return;
  G.health = Math.max(0, G.health - amount);
  if (G.health <= 0) {
    G.health = 0;
    setMode('wasted');
    const el = document.getElementById('wasted-text');
    if (el) el.textContent = cause || 'The streets of Solmar Bay got the better of you.';
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

export function healPlayer(amount) {
  G.health = Math.min(100, G.health + amount);
}
