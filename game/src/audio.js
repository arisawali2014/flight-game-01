// Sound, synthesised live with WebAudio — no audio files. A sawtooth engine note tracks the
// throttle, filtered noise becomes the wind of the slipstream, and one-shot voices mark the
// moments a pilot feels: the ring chime, the touchdown thud, the stall warble, the crash.
// Everything is created lazily on the first user gesture (browser autoplay rules) and every
// call is safe before that: silent.

let ctx = null;
let engine = null;
let engineFilter = null;
let wind = null;
let windGain = null;
let master = null;

/** Create the audio graph. Call from a user gesture; later calls are no-ops. */
export function initAudio() {
  if (ctx !== null) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  engine = ctx.createOscillator();
  engine.type = 'sawtooth';
  engine.frequency.value = 55;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 320;
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0.05;
  engine.connect(engineFilter).connect(engineGain).connect(master);
  engine.start();

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 700;
  windFilter.Q.value = 0.6;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(master);
  wind.start();
}

/** Keep the engine and wind matched to the aeroplane, once a frame. */
export function updateAudio(plane) {
  if (ctx === null || engine === null) return;
  const t = ctx.currentTime;
  const rpm = 50 + plane.throttle * 105 + plane.speed * 0.12;
  engine.frequency.setTargetAtTime(plane.crashed ? 30 : rpm, t, 0.08);
  engineFilter.frequency.setTargetAtTime(240 + plane.throttle * 700, t, 0.1);
  windGain.gain.setTargetAtTime(Math.min(0.22, (plane.speed / 118) ** 2 * 0.3), t, 0.15);
}

/** A short voice: one oscillator blip with an envelope. */
function blip(freqA, freqB, duration, type, gain, when = 0) {
  if (ctx === null) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqA, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Two bright notes: a ring threaded clean. */
export function ringChime(centred) {
  blip(880, 880, 0.12, 'sine', 0.22);
  blip(centred ? 1568 : 1174, centred ? 1568 : 1174, 0.2, 'sine', 0.2, 0.09);
}

/** A low thud for the wheels meeting the ground. */
export function touchdownThud(hard) {
  blip(120, 42, hard ? 0.3 : 0.2, 'sine', hard ? 0.5 : 0.32);
}

/** The stall warning warble. */
export function stallWarble() {
  blip(620, 470, 0.16, 'square', 0.06);
}

/** A noise burst and falling note: the sortie ends against the ground. */
export function crashSound() {
  if (ctx === null) return;
  blip(300, 36, 0.8, 'sawtooth', 0.4);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(g).connect(master);
  src.start(t);
}
