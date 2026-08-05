/**
 * Tiny Web-Audio synthesizer — no asset files, just procedural blips.
 * Call resume() from a user gesture so the AudioContext can start.
 */
const VOL_KEY = 'md.sfxVolume';

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw == null) return 0.35;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35;
  } catch {
    return 0.35;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = loadVolume();
  muted = false;

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    this.ensure();
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try {
      localStorage.setItem(VOL_KEY, String(this.volume));
    } catch {
      /* ignore */
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.ensure();
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    gain = 0.2,
    slide = 0,
  ) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain = 0.15) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const t0 = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  mineHit() {
    this.tone(180, 0.08, 'triangle', 0.22, -80);
    this.noise(0.06, 0.1);
  }
  mineMiss() {
    this.tone(110, 0.12, 'sawtooth', 0.12, -40);
  }
  anvil() {
    this.tone(420, 0.05, 'square', 0.18);
    this.tone(840, 0.08, 'triangle', 0.1, -200);
  }
  forge() {
    this.noise(0.18, 0.12);
    this.tone(90, 0.2, 'sawtooth', 0.08, 40);
  }
  beatGood() {
    this.tone(660, 0.06, 'sine', 0.16);
    this.tone(990, 0.08, 'sine', 0.1);
  }
  beatMiss() {
    this.tone(160, 0.14, 'triangle', 0.14, -60);
  }
  cartBump() {
    this.tone(70, 0.1, 'square', 0.12);
    this.noise(0.08, 0.08);
  }
  cartRoll() {
    this.noise(0.04, 0.03);
  }
  deposit() {
    this.tone(320, 0.05, 'triangle', 0.12);
    this.tone(480, 0.07, 'triangle', 0.1);
  }
  hit() {
    this.tone(240, 0.05, 'square', 0.1);
    this.noise(0.05, 0.08);
  }
  enemyDie() {
    this.tone(200, 0.15, 'sawtooth', 0.14, -150);
  }
  built() {
    this.tone(440, 0.08, 'sine', 0.12);
    this.tone(660, 0.12, 'sine', 0.1);
  }
  night() {
    this.tone(110, 0.35, 'sine', 0.14, -30);
  }
  dawn() {
    this.tone(330, 0.2, 'sine', 0.1);
    this.tone(495, 0.25, 'sine', 0.08);
  }
  shoot() {
    this.tone(280, 0.04, 'square', 0.1, -120);
    this.noise(0.05, 0.06);
  }
  ui() {
    this.tone(520, 0.04, 'sine', 0.08);
  }
}

export const sfx = new Sfx();
