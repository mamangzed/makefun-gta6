// AI traffic: cars that cruise the road grid, turn at intersections, slow for the
// car ahead, and pull over (briefly) when a police chase screams past.
import { G } from './state.js';
import { rand, pick, clamp } from './utils.js';
import { spawnCar, CAR_COLORS } from './vehicles.js';
import { collideCircle, randomRoadPoint } from './city.js';

const TRAFFIC_COUNT = 14;

export function initTraffic() {
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const pt = randomRoadPoint();
    const lane = pick([-3.1, 3.1]);
    const x = pt.horizontal ? pt.x : pt.x + lane;
    const z = pt.horizontal ? pt.z + lane : pt.z;
    const car = spawnCar(pick(CAR_COLORS), x, z, pt.horizontal ? Math.PI / 2 : 0, 'traffic');
    car.axis = pt.horizontal ? 'x' : 'z';
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.cruise = rand(8, 13);
    car.speed = car.cruise;
    car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    G.traffic.push(car);
  }
}

function onIntersection(car) {
  // Near a crossing road on the perpendicular axis?
  const along = car.axis === 'x' ? car.pos.x : car.pos.z;
  const roads = car.axis === 'x' ? G.roadZs : G.roadXs;
  for (const r of roads) {
    if (Math.abs(along - r) < 2.5) return true;
  }
  return false;
}

export function updateTraffic(dt) {
  for (const car of G.traffic) {
    if (!car.alive) continue;
    if (car.stuck > 0) {
      car.stuck -= dt;
      car.speed = Math.max(0, car.speed - 12 * dt);
    } else {
      // Slow down for a car ahead on the same road and direction.
      let ahead = Infinity;
      for (const other of G.cars) {
        if (other === car || !other.alive) continue;
        if (other.axis !== car.axis || other.dir !== car.dir) continue;
        const gap = car.axis === 'x'
          ? (other.pos.x - car.pos.x) * car.dir
          : (other.pos.z - car.pos.z) * car.dir;
        const lateral = car.axis === 'x'
          ? Math.abs(other.pos.z - car.pos.z)
          : Math.abs(other.pos.x - car.pos.x);
        if (gap > 0 && gap < 14 && lateral < 4) ahead = Math.min(ahead, gap);
      }
      const want = ahead < 9 ? Math.max(0, (ahead - 5) * 1.2) : car.cruise;
      car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
    }

    // Turn at an intersection, sometimes.
    if (onIntersection(car) && Math.random() < dt * 0.9) {
      const wasX = car.axis === 'x';
      car.axis = wasX ? 'z' : 'x';
      car.dir = Math.random() < 0.5 ? 1 : -1;
      // Snap onto the new road's centre line.
      if (wasX) {
        let best = G.roadXs[0], bd = Infinity;
        for (const r of G.roadXs) { const d = Math.abs(r - car.pos.x); if (d < bd) { bd = d; best = r; } }
        car.pos.x = best + (car.dir > 0 ? 3.1 : -3.1) * 0;
        car.pos.x = best;
      } else {
        let best = G.roadZs[0], bd = Infinity;
        for (const r of G.roadZs) { const d = Math.abs(r - car.pos.z); if (d < bd) { bd = d; best = r; } }
        car.pos.z = best;
      }
      car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    }

    // Advance along the current road.
    if (car.axis === 'x') car.pos.x += car.dir * car.speed * dt;
    else car.pos.z += car.dir * car.speed * dt;

    // Wrap around the city edge instead of driving into the bay.
    if (car.pos.x > 178) car.pos.x = -178;
    if (car.pos.x < -178) car.pos.x = 178;
    if (car.pos.z > 178) car.pos.z = -178;
    if (car.pos.z < -178) car.pos.z = 178;

    collideCircle(car.pos, 1.9);
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels;
    const spin = (car.speed * dt) / 0.36;
    for (const w of wheels) w.rotation.x += spin;
  }
}
