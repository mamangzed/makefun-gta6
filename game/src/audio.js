// Procedural WebAudio sound: no audio files, everything is synthesized.
// Engine hum, police siren, gunshot, punch, pickup chime and UI clicks.
import { G } from './state.js';

let ctx = null;
let engineOsc = null, engineOsc2 = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenLfo = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Looping engine: two detuned saws through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(lp); engineOsc2.connect(lp);
    lp.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();

    // Two-tone police siren, LFO flips the pitch.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 750;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
  } catch (e) {
    ctx = null;
  }
}

function now() { return ctx ? ctx.currentTime : 0; }

export function setEngine(speed01, driving) {
  if (!ctx || G.muted) { if (engineGain) engineGain.gain.value = 0; return; }
  const t = now();
  const target = driving ? 0.05 + speed01 * 0.09 : 0;
  engineGain.gain.setTargetAtTime(target, t, 0.08);
  const f = 52 + speed01 * 130;
  engineOsc.frequency.setTargetAtTime(f, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(f * 1.494, t, 0.08);
}

export function setSiren(on) {
  if (!ctx) return;
  sirenGain.gain.setTargetAtTime(on && !G.muted ? 0.045 : 0, now(), 0.15);
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || G.muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, now());
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now() + dur);
  g.gain.setValueAtTime(vol || 0.18, now());
  g.gain.exponentialRampToValueAtTime(0.001, now() + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(now() + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || G.muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
  const g = ctx.createGain();
  g.gain.value = vol || 0.3;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export function sfx(name) {
  if (!ctx) return;
  switch (name) {
    case 'shot': noiseBurst(0.14, 0.5, 2600); blip(190, 0.09, 'square', 0.22, 60); break;
    case 'punch': noiseBurst(0.09, 0.35, 700); break;
    case 'pickup': blip(660, 0.1, 'sine', 0.2); setTimeout(() => blip(990, 0.16, 'sine', 0.2), 90); break;
    case 'cash': blip(880, 0.08, 'triangle', 0.2); setTimeout(() => blip(1174, 0.08, 'triangle', 0.2), 80); setTimeout(() => blip(1568, 0.18, 'triangle', 0.22), 160); break;
    case 'click': blip(520, 0.05, 'square', 0.1); break;
    case 'thud': noiseBurst(0.16, 0.4, 320); break;
    case 'siren-blip': blip(950, 0.12, 'triangle', 0.16, 700); break;
    case 'mission': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.2), i * 110)); break;
    case 'fail': blip(220, 0.3, 'sawtooth', 0.16, 110); break;
    case 'door': noiseBurst(0.07, 0.18, 1200); break;
    default: break;
  }
}
