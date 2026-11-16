// Sound without assets: every effect is a few oscillators or a burst of
// filtered noise through one master gain. The context starts on the first
// user gesture, so nothing plays before the player clicks in.
let ctx = null;
let master = null;
let noiseBuffer = null;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

function tone(freq, dur, type, gain, slideTo) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function noise(dur, gain, lowpass) {
  if (!ctx) return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  source.connect(filter).connect(g).connect(master);
  source.start();
  source.stop(ctx.currentTime + dur);
}

export const audio = {
  resume() {
    ensure();
  },
  shot(kind) {
    if (!ensure()) return;
    if (kind === 'sniper') {
      noise(0.35, 0.9, 900);
      tone(90, 0.3, 'sine', 0.6, 40);
    } else if (kind === 'smg') {
      noise(0.09, 0.5, 2600);
      tone(220, 0.07, 'square', 0.12, 110);
    } else {
      noise(0.14, 0.7, 1600);
      tone(160, 0.1, 'square', 0.18, 70);
    }
  },
  enemyShot() {
    if (!ensure()) return;
    noise(0.1, 0.28, 1200);
  },
  dryFire() {
    if (!ensure()) return;
    tone(1400, 0.05, 'square', 0.08);
  },
  reload() {
    if (!ensure()) return;
    tone(500, 0.06, 'square', 0.1);
    setTimeout(() => tone(750, 0.06, 'square', 0.1), 140);
  },
  hitmarker(kill) {
    if (!ensure()) return;
    tone(kill ? 880 : 1200, kill ? 0.16 : 0.07, 'sine', 0.25);
    if (kill) setTimeout(() => tone(660, 0.14, 'sine', 0.2), 90);
  },
  hurt() {
    if (!ensure()) return;
    tone(120, 0.18, 'sawtooth', 0.25, 60);
  },
  explosion() {
    if (!ensure()) return;
    noise(1.1, 1, 320);
    tone(60, 0.9, 'sine', 0.9, 28);
  },
  beep() {
    if (!ensure()) return;
    tone(1050, 0.09, 'sine', 0.22);
  },
  plant() {
    if (!ensure()) return;
    tone(420, 0.12, 'square', 0.15);
    setTimeout(() => tone(560, 0.12, 'square', 0.15), 130);
  },
  defuse() {
    if (!ensure()) return;
    tone(700, 0.1, 'sine', 0.18);
    setTimeout(() => tone(500, 0.14, 'sine', 0.18), 120);
  },
  buy() {
    if (!ensure()) return;
    tone(980, 0.08, 'sine', 0.18);
    setTimeout(() => tone(1320, 0.1, 'sine', 0.18), 90);
  },
  deny() {
    if (!ensure()) return;
    tone(220, 0.14, 'square', 0.14, 160);
  },
  roundWin() {
    if (!ensure()) return;
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.22), i * 130));
  },
  roundLose() {
    if (!ensure()) return;
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'sine', 0.2), i * 140));
  },
};
