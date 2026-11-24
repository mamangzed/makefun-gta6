// HUD: the DOM panels (money, health, wanted stars, objective, speed) and the
// 2D top-down minimap canvas — roads, the player arrow, cars, police and the
// mission beacon, redrawn every frame.
import { G, CITY_HALF } from './state.js';
import { formatMoney } from './utils.js';

let moneyEl, healthFill, wantedEl, objTag, objText, objDist, speedo, speedNum, crosshair, toastEl, bannerEl, hintEl;
let minimap, mctx;
let toastUntil = 0;
let bannerUntil = 0;

export function initHud() {
  moneyEl = document.getElementById('money');
  healthFill = document.getElementById('healthfill');
  wantedEl = document.getElementById('wanted');
  objTag = document.getElementById('objtag');
  objText = document.getElementById('objtext');
  objDist = document.getElementById('objdist');
  speedo = document.getElementById('speedo');
  speedNum = document.getElementById('speednum');
  crosshair = document.getElementById('crosshair');
  toastEl = document.getElementById('toast');
  bannerEl = document.getElementById('banner');
  hintEl = document.getElementById('hint');
  minimap = document.getElementById('minimap');
  mctx = minimap.getContext('2d');
}

export function showToast(text, seconds = 3.5) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  toastUntil = G.time + seconds;
}

export function showBanner(text, sub = '', seconds = 2.6) {
  if (!bannerEl) return;
  bannerEl.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
  bannerEl.classList.add('show');
  bannerUntil = G.time + seconds;
}

export function setObjective(tag, text) {
  if (objTag) objTag.textContent = tag;
  if (objText) objText.textContent = text;
}

export function updateHud() {
  if (!moneyEl) return;
  moneyEl.innerHTML = formatMoney(G.money) + ' <small>SOLMAR BAY</small>';
  healthFill.style.width = Math.max(0, G.health) + '%';
  healthFill.style.background = G.health > 50
    ? 'linear-gradient(90deg,#ff5a5a,#ff9a3d)'
    : 'linear-gradient(90deg,#ff2020,#ff5a5a)';

  // Wanted stars: lit gold, flashing red at 3+.
  const stars = wantedEl.textContent;
  wantedEl.classList.toggle('hot', G.wanted >= 3);
  const spans = [];
  for (let i = 0; i < 5; i++) {
    spans.push(i < G.wanted ? '<span class="lit">★</span>' : '<span>★</span>');
  }
  wantedEl.innerHTML = spans.join('');

  // Speedo only while driving.
  if (G.player.car) {
    speedo.classList.add('on');
    speedNum.textContent = Math.round(Math.abs(G.player.speed) * 3.2);
  } else {
    speedo.classList.remove('on');
  }
  crosshair.classList.toggle('on', !G.player.car && G.mode === 'playing');

  // Hint fades after the first minute of play.
  if (hintEl) hintEl.style.opacity = G.time < 45 ? '1' : '0';

  if (toastEl && G.time > toastUntil) toastEl.style.opacity = '0';
  if (bannerEl && G.time > bannerUntil) bannerEl.classList.remove('show');

  drawMinimap();
}

function drawMinimap() {
  const S = 200;
  const scale = S / (CITY_HALF * 2 + 60);
  const toMap = (x, z) => [(x + CITY_HALF + 30) * scale, (z + CITY_HALF + 30) * scale];
  const ctx = mctx;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, S, S);
  // Water on the east edge.
  ctx.fillStyle = '#1d7fb8';
  const [wx] = toMap(CITY_HALF + 10, 0);
  ctx.fillRect(wx, 0, S - wx, S);
  // Blocks.
  ctx.fillStyle = '#1b2635';
  for (let i = 0; i < G.roadXs.length - 1; i++) {
    for (let j = 0; j < G.roadZs.length - 1; j++) {
      const [x0, z0] = toMap(G.roadXs[i] + 6, G.roadZs[j] + 6);
      const [x1, z1] = toMap(G.roadXs[i + 1] - 6, G.roadZs[j + 1] - 6);
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
  }
  // Roads.
  ctx.strokeStyle = '#5a6470';
  ctx.lineWidth = 3;
  for (const rx of G.roadXs) {
    const [x] = toMap(rx, 0);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }
  for (const rz of G.roadZs) {
    const [, z] = toMap(0, rz);
    ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
  }
  // Mission beacon.
  if (G.marker && G.marker.visible) {
    const [mx, mz] = toMap(G.marker.position.x, G.marker.position.z);
    const pulse = 5 + Math.sin(G.time * 5) * 2;
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath();
    ctx.moveTo(mx, mz - pulse);
    ctx.lineTo(mx + pulse, mz);
    ctx.lineTo(mx, mz + pulse);
    ctx.lineTo(mx - pulse, mz);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Traffic (yellow) and police (flashing red/blue).
  for (const car of G.cars) {
    if (!car.alive || car.kind === 'player') continue;
    const [cx, cz] = toMap(car.pos.x, car.pos.z);
    if (car.kind === 'police') {
      ctx.fillStyle = Math.floor(G.time * 4) % 2 === 0 ? '#ff3b30' : '#3b82ff';
      ctx.beginPath(); ctx.arc(cx, cz, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(cx - 2, cz - 2, 4, 4);
    }
  }
  // Player arrow (white, rotated to heading).
  const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-G.player.heading + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
