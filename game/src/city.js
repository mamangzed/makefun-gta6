// Solmar Bay itself: a procedural sun-soaked grid city — roads, sidewalks, crosswalks,
// pastel towers with lit-window facades, street lamps, palms, a central park and a
// beach with open water on the east edge. Also owns building collision and road helpers.
import * as THREE from 'three';
import { G, CITY_HALF, ROAD_SPACING, ROAD_WIDTH, WORLD_HALF } from './state.js';
import { rand, randInt, pick, clamp } from './utils.js';

const PALETTE = [
  0xffd9c2, 0xffc2d1, 0xc2e8ff, 0xfff3b0, 0xd8f7c5, 0xe8d8ff,
  0xffb38a, 0x9fd8ff, 0xf7e6c8, 0xc8f0e0,
];
const GLASS = [0x2e4a66, 0x3a5a78, 0x24405a, 0x4a6a8a];

// One canvas facade texture per variant, reused by every building that picks it.
function makeFacadeTexture(baseColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.16)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // window grid
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : '#1d2f45';
      g.fillRect(10 + col * 23, 12 + row * 20, 15, 12);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(10 + col * 23, 12 + row * 20, 15, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const facadeTextures = [];
const facadeMats = [];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x5a7ba0, roughness: 0.35, metalness: 0.35 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.9 });

function facadeMaterial(i) {
  if (!facadeMats[i]) {
    const base = '#' + PALETTE[i % PALETTE.length].toString(16).padStart(6, '0');
    facadeTextures[i] = makeFacadeTexture(base, 0.28);
    facadeMats[i] = new THREE.MeshStandardMaterial({ map: facadeTextures[i], roughness: 0.85 });
  }
  return facadeMats[i];
}

export function roadCoords() {
  const xs = [];
  for (let v = -CITY_HALF; v <= CITY_HALF; v += ROAD_SPACING) xs.push(v);
  return xs;
}

// Is this point on asphalt (a road strip)?
export function isOnRoad(x, z) {
  const half = ROAD_WIDTH / 2;
  for (const rx of G.roadXs) if (Math.abs(x - rx) <= half) return true;
  for (const rz of G.roadZs) if (Math.abs(z - rz) <= half) return true;
  return false;
}

// Push a circle (x,z,r) out of every building footprint. Returns true on contact.
export function collideCircle(pos, r) {
  let hit = false;
  for (const b of G.colliders) {
    const cx = clamp(pos.x, b.x0, b.x1);
    const cz = clamp(pos.z, b.z0, b.z1);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the footprint: push out along the smallest penetration
        const pl = pos.x - b.x0, pr = b.x1 - pos.x, pt = pos.z - b.z0, pb = b.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.x0 - r;
        else if (m === pr) pos.x = b.x1 + r;
        else if (m === pt) pos.z = b.z0 - r;
        else pos.z = b.z1 + r;
      }
    }
  }
  return hit;
}

// A random point on a road, optionally near a reference point.
// horizontal=true means the road runs along x (its z is a road coordinate).
export function randomRoadPoint(nearX, nearZ, maxDist) {
  for (let tries = 0; tries < 20; tries++) {
    const horizontal = Math.random() < 0.5;
    const road = pick(horizontal ? G.roadXs : G.roadZs);
    const along = rand(-CITY_HALF, CITY_HALF);
    const x = horizontal ? along : road;
    const z = horizontal ? road : along;
    const pt = { x, z, horizontal };
    if (nearX === undefined) return pt;
    const dx = x - nearX, dz = z - nearZ;
    if (dx * dx + dz * dz < maxDist * maxDist) return pt;
  }
  return { x: nearX ?? 0, z: nearZ ?? 0, horizontal: true };
}

function buildGround(scene) {
  // Base concrete slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 320, WORLD_HALF * 2 + 320),
    new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(60, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Sand strip + open water on the east edge (the bay).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(34, WORLD_HALF * 2 + 320),
    new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY_HALF + 17, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(320, WORLD_HALF * 2 + 320),
    new THREE.MeshStandardMaterial({ color: 0x1d7fb8, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY_HALF + 34 + 160, 0.02, 0);
  scene.add(water);

  // Sidewalk slabs: light strips along every road, slightly raised.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 1 });
  const walkGeo = new THREE.PlaneGeometry(ROAD_WIDTH + 8, CITY_HALF * 2 + 16);
  for (const rx of G.roadXs) {
    const w = new THREE.Mesh(walkGeo, walkMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(rx, 0.02, 0);
    w.receiveShadow = true;
    scene.add(w);
  }
  for (const rz of G.roadZs) {
    const w = new THREE.Mesh(walkGeo, walkMat);
    w.rotation.x = -Math.PI / 2;
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.02, rz);
    w.receiveShadow = true;
    scene.add(w);
  }

  // Asphalt strips on top of the sidewalks.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f333a, roughness: 0.95 });
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, CITY_HALF * 2 + 16);
  for (const rx of G.roadXs) {
    const r = new THREE.Mesh(roadGeo, roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(rx, 0.05, 0);
    r.receiveShadow = true;
    scene.add(r);
  }
  for (const rz of G.roadZs) {
    const r = new THREE.Mesh(roadGeo, roadMat);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = Math.PI / 2;
    r.position.set(0, 0.05, rz);
    r.receiveShadow = true;
    scene.add(r);
  }

  // Centre dashes, instanced: one yellow dash every 4 units along each road.
  const dashGeo = new THREE.PlaneGeometry(0.5, 2.4);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5c542 });
  const dashes = [];
  for (const rx of G.roadXs) {
    for (let z = -CITY_HALF; z <= CITY_HALF; z += 4) dashes.push([rx, z, 0]);
  }
  for (const rz of G.roadZs) {
    for (let x = -CITY_HALF; x <= CITY_HALF; x += 4) dashes.push([x, rz, Math.PI / 2]);
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const up = new THREE.Vector3(0, 1, 0);
  dashes.forEach(([x, z, rot], i) => {
    eul.set(-Math.PI / 2, 0, rot);
    q.setFromEuler(eul);
    m4.compose(new THREE.Vector3(x, 0.08, z), q, new THREE.Vector3(1, 1, 1));
    dashMesh.setMatrixAt(i, m4);
  });
  dashMesh.instanceMatrix.needsUpdate = true;
  scene.add(dashMesh);

  // Crosswalk stripes at every intersection, instanced.
  const stripeGeo = new THREE.PlaneGeometry(0.9, 3.4);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f6 });
  const stripes = [];
  for (const rx of G.roadXs) {
    for (const rz of G.roadZs) {
      for (let k = -2; k <= 2; k++) {
        stripes.push([rx + k * 1.8, rz - 7.4, 0]);
        stripes.push([rx + k * 1.8, rz + 7.4, 0]);
        stripes.push([rx - 7.4, rz + k * 1.8, Math.PI / 2]);
        stripes.push([rx + 7.4, rz + k * 1.8, Math.PI / 2]);
      }
    }
  }
  const stripeMesh = new THREE.InstancedMesh(stripeGeo, stripeMat, stripes.length);
  stripes.forEach(([x, z, rot], i) => {
    eul.set(-Math.PI / 2, 0, rot);
    q.setFromEuler(eul);
    m4.compose(new THREE.Vector3(x, 0.09, z), q, new THREE.Vector3(1, 1, 1));
    stripeMesh.setMatrixAt(i, m4);
  });
  stripeMesh.instanceMatrix.needsUpdate = true;
  scene.add(stripeMesh);
}

function buildBuildings(scene) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 0.6, 1);
  const acGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
  const blockCenters = [];
  for (let i = 0; i < G.roadXs.length - 1; i++) {
    for (let j = 0; j < G.roadZs.length - 1; j++) {
      blockCenters.push([(G.roadXs[i] + G.roadXs[i + 1]) / 2, (G.roadZs[j] + G.roadZs[j + 1]) / 2]);
    }
  }
  for (const [bx, bz] of blockCenters) {
    // Central park block stays green.
    if (Math.abs(bx) < 1 && Math.abs(bz) < 1) continue;
    const distC = Math.sqrt(bx * bx + bz * bz);
    const tall = distC < 70;
    const n = tall ? 1 : (Math.random() < 0.55 ? 1 : 4);
    if (n === 1) {
      const w = rand(18, 26), d = rand(18, 26);
      const h = tall ? rand(28, 62) : rand(9, 22);
      addBuilding(scene, boxGeo, roofGeo, acGeo, bx, bz, w, h, d);
    } else {
      const off = 7.5, s = rand(11, 13);
      for (const [ox, oz] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
        addBuilding(scene, boxGeo, roofGeo, acGeo, bx + ox, bz + oz, s, rand(8, 20), s);
      }
    }
  }
}

function addBuilding(scene, boxGeo, roofGeo, acGeo, x, z, w, h, d) {
  const glassy = Math.random() < 0.22;
  const mat = glassy ? glassMat : facadeMaterial(randInt(0, 9));
  const b = new THREE.Mesh(boxGeo, mat);
  b.scale.set(w, h, d);
  b.position.set(x, h / 2, z);
  b.castShadow = true;
  b.receiveShadow = true;
  scene.add(b);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.scale.set(w * 0.96, 1, d * 0.96);
  roof.position.set(x, h + 0.3, z);
  scene.add(roof);
  if (Math.random() < 0.6) {
    const ac = new THREE.Mesh(acGeo, roofMat);
    ac.position.set(x + rand(-w / 4, w / 4), h + 1, z + rand(-d / 4, d / 4));
    scene.add(ac);
  }
  const pad = 0.4;
  G.colliders.push({ x0: x - w / 2 - pad, z0: z - d / 2 - pad, x1: x + w / 2 + pad, z1: z + d / 2 + pad });
}

function buildStreetProps(scene) {
  // Street lamps at intersection corners.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.6 });
  const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 2.6;
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 5.3;
  lamp.add(pole, head);
  for (const rx of G.roadXs) {
    for (const rz of G.roadZs) {
      if (Math.random() < 0.5) continue;
      const l = lamp.clone();
      l.position.set(rx + 8.4, 0, rz + 8.4);
      scene.add(l);
    }
  }

  // Palms along the beach and scattered on sidewalks.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 4.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(1.7, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e5f, roughness: 0.9 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3fb56e, roughness: 0.9 });
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.3;
  const leaves = new THREE.Mesh(leafGeo, leafMat);
  leaves.position.y = 5.1;
  leaves.scale.set(1.4, 0.55, 1.4);
  palm.add(trunk, leaves);
  for (let z = -CITY_HALF; z <= CITY_HALF; z += 20) {
    const p = palm.clone();
    p.children[1].material = Math.random() < 0.5 ? leafMat : leafMat2;
    p.position.set(CITY_HALF + 8, 0, z + rand(-4, 4));
    p.rotation.y = rand(0, Math.PI * 2);
    scene.add(p);
  }
  for (let i = 0; i < 40; i++) {
    const pt = randomRoadPoint();
    const off = pick([-8.6, 8.6]);
    const p = palm.clone();
    p.children[1].material = Math.random() < 0.5 ? leafMat : leafMat2;
    const horizontal = Math.random() < 0.5;
    p.position.set(horizontal ? pt.x : pt.x + off, 0, horizontal ? pt.z + off : pt.z);
    p.rotation.y = rand(0, Math.PI * 2);
    scene.add(p);
  }

  // Central park: lawn, trees, benches, pond.
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: 0x4da65a, roughness: 1 }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.1, 0);
  lawn.receiveShadow = true;
  scene.add(lawn);
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshStandardMaterial({ color: 0x2f8fc0, roughness: 0.2 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-5, 0.12, 4);
  scene.add(pond);
  const treeGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), trunkMat);
    tr.position.y = 1.2;
    const crown = new THREE.Mesh(treeGeo, treeMat);
    crown.position.y = 3.6;
    crown.scale.y = 1.2;
    t.add(tr, crown);
    t.position.set(rand(-12, 12), 0, rand(-12, 12));
    scene.add(t);
  }
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
    bench.position.set(rand(-11, 11), 0.35, rand(-11, 11));
    bench.rotation.y = rand(0, Math.PI);
    scene.add(bench);
  }

  // Clouds: flat white blobs drifting high above the city.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  G.clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(cloudGeo, cloudMat);
      s.position.set(rand(-6, 6), rand(-0.5, 0.5), rand(-2, 2));
      s.scale.set(rand(4, 8), rand(1.4, 2.2), rand(2.5, 4));
      cloud.add(s);
    }
    cloud.position.set(rand(-220, 220), rand(55, 80), rand(-220, 220));
    cloud.userData.speed = rand(0.6, 1.6);
    scene.add(cloud);
    G.clouds.push(cloud);
  }
}

export function buildCity(scene) {
  G.roadXs = roadCoords();
  G.roadZs = roadCoords();
  buildGround(scene);
  buildBuildings(scene);
  buildStreetProps(scene);
}
