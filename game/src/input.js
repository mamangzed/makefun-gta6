// Keyboard + mouse input: a live key set, camera look deltas, and click events.
// Pointer lock on the canvas gives the mouse-look feel; dragging works too.
import { G } from './state.js';

export const keys = {};
export let mouseDown = false;
export let clicked = false;   // consumed by combat each frame

export function initInput(canvas, callbacks) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyM') callbacks.onMute();
    if (e.code === 'KeyP' || e.code === 'Escape') callbacks.onPause();
    if (e.code === 'KeyE') callbacks.onInteract();
    if (e.code === 'KeyF') callbacks.onPunch();
    if (e.code === 'KeyR') callbacks.onReload();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  canvas.addEventListener('click', () => {
    if (G.mode === 'playing' && !document.pointerLockElement) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (G.mode !== 'playing') return;
    if (document.pointerLockElement === canvas) {
      G.mouseDX += e.movementX;
      G.mouseDY += e.movementY;
    } else if (mouseDown) {
      G.mouseDX += e.movementX;
      G.mouseDY += e.movementY;
    }
    G.lastMouseAt = G.time;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true;
    if (e.button === 0) clicked = true;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
}

export function consumeClick() {
  const c = clicked;
  clicked = false;
  return c;
}

// WASD / arrows, as a -1..1 pair, relative to the camera.
export function moveAxes() {
  let x = 0, y = 0;
  if (keys['KeyW'] || keys['ArrowUp']) y += 1;
  if (keys['KeyS'] || keys['ArrowDown']) y -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  return { x, y };
}

export function isSprinting() {
  return !!(keys['ShiftLeft'] || keys['ShiftRight']);
}
