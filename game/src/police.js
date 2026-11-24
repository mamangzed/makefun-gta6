// The Solmar Bay Police: the wanted level, pursuit units that chase and ram the
// player, and the slow cool-down when the player stays out of sight.
import { G } from './state.js';
import { clamp, dist2D, lerpAngle, angleDiff } from './utils.js';
import { spawnCar } from './vehicles.js';
import { collideCircle, randomRoadPoint } from './city.js';
import { damagePlayer } from './state.js';
import { sfx, setSiren } from './audio.js';
import { showToast } from './hud.js';

export function policeCountFor(wanted) {
  return wanted <= 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : wanted <= 4 ? 4 : 5;
}

// Raise the wanted level (crimes inside the cooldown window do not stack).
export function addWanted(stars, reason) {
  if (G.time < G.crimeCooldownUntil) return;
  G.crimeCooldownUntil = G.time + 2.5;
  setWanted(Math.min(5, G.wanted + stars), reason);
}

export function setWanted(stars, reason) {
  const before = G.wanted;
  G.wanted = clamp(stars, 0, 5);
  if (G.wanted > before) {
    G.lastSeenAt = G.time;
    sfx('siren-blip');
    if (reason) showToast(reason + ' — wanted level ' + G.wanted);
  }
  syncPoliceUnits();
}

function syncPoliceUnits() {
  const want = policeCountFor(G.wanted);
  while (G.police.length < want) {
    const pt = randomRoadPoint(G.player.pos.x, G.player.pos.z, 160);
    // Spawn at a road point 55..90 away from the player.
    let spawn = pt;
    for (let i = 0; i < 12; i++) {
      const cand = randomRoadPoint();
      const d = dist2D(cand.x, cand.z, G.player.pos.x, G.player.pos.z);
      if (d > 55 && d < 95) { spawn = cand; break; }
    }
    const car = spawnCar(0x1a1a22, spawn.x, spawn.z, 0, 'police');
    car.axis = 'x'; car.dir = 1; car.cruise = 30;
    G.police.push(car);
  }
  while (G.police.length > want) {
    const car = G.police.pop();
    car.alive = false;
    G.scene.remove(car.mesh);
    const idx = G.cars.indexOf(car);
    if (idx !== -1) G.cars.splice(idx, 1);
  }
  setSiren(G.wanted > 0);
}

export function clearPolice() {
  G.wanted = 0;
  syncPoliceUnits();
}

export function updatePolice(dt) {
  if (G.wanted === 0) return;
  const px = G.player.pos.x, pz = G.player.pos.z;
  let anyNear = false;

  for (const car of G.police) {
    if (!car.alive) continue;
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    const d = dist2D(car.pos.x, car.pos.z, px, pz);
    if (d < 70) anyNear = true;

    // Pursuit steering: head for the player, a little faster than traffic.
    const targetHeading = Math.atan2(px - car.pos.x, pz - car.pos.z);
    const turn = clamp(angleDiff(targetHeading, car.heading), -1, 1);
    const maxSpeed = 30 + G.wanted * 1.6;
    car.speed += clamp(maxSpeed - car.speed, -18 * dt, 12 * dt);
    car.heading += turn * 2.4 * dt * clamp(Math.abs(car.speed) / 12, 0.3, 1);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    if (collideCircle(car.pos, 1.9)) car.speed *= 0.5;
    car.pos.x = clamp(car.pos.x, -186, 206);
    car.pos.z = clamp(car.pos.z, -186, 186);
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels;
    const spin = (car.speed * dt) / 0.36;
    for (const w of wheels) w.rotation.x += spin;

    // Flash the light bar.
    const bar = car.mesh.userData.lightBar;
    if (bar) {
      const phase = Math.floor(G.time * 6) % 2 === 0;
      bar.red.material.emissiveIntensity = phase ? 2.4 : 0.15;
      bar.blue.material.emissiveIntensity = phase ? 0.15 : 2.4;
    }

    // Ram: damage the player (or their car) and shove them.
    if (d < 4.2 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      if (G.player.car) {
        const push = 6;
        G.player.car.pos.x += Math.sin(car.heading) * push * 0.4;
        G.player.car.pos.z += Math.cos(car.heading) * push * 0.4;
        G.player.car.speed *= 0.82;
        damagePlayer(6, 'Busted up by the SBPD.');
      } else {
        damagePlayer(12, 'Run down by the SBPD.');
        G.player.pos.x += Math.sin(car.heading) * 2.5;
        G.player.pos.z += Math.cos(car.heading) * 2.5;
      }
      sfx('thud');
    }
  }

  // Cool-down: out of every unit's sight for a while, lose a star.
  if (anyNear) G.lastSeenAt = G.time;
  else if (G.time - G.lastSeenAt > 14) {
    G.lastSeenAt = G.time;
    setWanted(G.wanted - 1);
    if (G.wanted > 0) showToast('You are losing them… wanted level ' + G.wanted);
  }
}
