// L'usine chante. Chaque machine a sa note ; les notes tombent sur une grille rythmique,
// si bien qu'une usine équilibrée sonne juste, et qu'une usine affamée se tait par endroits.

const SCALE = [0, 3, 5, 7, 10];             // pentatonique mineure
const ROOT = 146.83;                        // ré
const GRID = 0.125;                         // double-croche à 120 bpm

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private pad!: GainNode;
  private padFilter!: BiquadFilterNode;
  private budget = 0;
  private lastGrid = 0;
  private noise: AudioBuffer | null = null;
  volume = 0.7;

  /** À appeler sur un geste du joueur (les navigateurs l'exigent). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    // nappe : deux voix désaccordées derrière un filtre qui s'ouvre avec le jour
    this.pad = ctx.createGain(); this.pad.gain.value = 0.0;
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 400;
    for (const [f, det] of [[ROOT / 2, -6], [ROOT / 2, 7], [ROOT * 0.75, 0]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(this.padFilter); o.start();
    }
    this.padFilter.connect(this.pad).connect(this.master);
    const len = ctx.sampleRate * 0.3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  setVolume(v: number): void { this.volume = v; if (this.ctx) this.master.gain.value = v; }

  /** Appelé à chaque image : ambiance selon l'heure. */
  ambience(night: number, light: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pad.gain.setTargetAtTime(0.035 + 0.02 * night, t, 2);
    this.padFilter.frequency.setTargetAtTime(260 + 900 * light, t, 2);
    this.budget = Math.min(8, this.budget + 0.5);
    // la nuit, la jungle répond par de brefs appels aigus
    if (night > 0.4 && Math.random() < 0.012 * night) this.tone(ROOT * 8 * [1, 1.189, 1.335, 1.498][(Math.random() * 4) | 0], 'sine', 0.18, 0.03, Math.random() * 2 - 1, 0, 0.004);
  }

  private nextGrid(): number {
    const t = this.ctx!.currentTime;
    const g = Math.ceil((t + 0.01) / GRID) * GRID;
    this.lastGrid = g;
    return g - t;
  }

  private tone(freq: number, type: OscillatorType, dur: number, vol: number, pan: number, delay: number, attack = 0.005, slideTo = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private hit(dur: number, vol: number, pan: number, freq: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(ctx.currentTime, 0, dur);
  }

  private degree(n: number, octave = 0): number {
    const d = SCALE[((n % 5) + 5) % 5], oct = Math.floor(n / 5) + octave;
    return ROOT * Math.pow(2, oct + d / 12);
  }

  /** near : 0..1 (proximité de la caméra) ; pan : -1..1. */
  craft(recipeId: number, near: number, pan: number, night: number): void {
    if (!this.ctx || near < 0.03 || this.budget < 1) return;
    this.budget--;
    const delay = this.nextGrid();
    const oct = night > 0.5 ? 0 : 1;
    this.tone(this.degree(recipeId * 2, oct), recipeId % 2 ? 'triangle' : 'sine', 0.5, 0.11 * near, pan, delay, 0.008);
    this.tone(this.degree(recipeId * 2, oct) * 2.005, 'sine', 0.25, 0.03 * near, pan, delay);
  }
  mine(near: number, pan: number): void {
    if (!this.ctx || near < 0.05 || this.budget < 1) return;
    this.budget -= 0.5;
    this.tone(92, 'sine', 0.16, 0.16 * near, pan, this.nextGrid(), 0.004, 46);
  }
  cut(near: number, pan: number): void {
    if (!this.ctx || near < 0.05 || this.budget < 1) return;
    this.budget -= 0.5;
    this.hit(0.07, 0.1 * near, pan, 3200);
  }
  deliver(item: number, near: number, pan: number): void {
    if (!this.ctx || near < 0.05 || this.budget < 1) return;
    this.budget -= 0.5;
    this.tone(this.degree(item, 2), 'sine', 0.12, 0.035 * near, pan, this.nextGrid());
  }
  place(size: number): void {
    if (!this.ctx) return;
    this.tone(size > 1 ? 130 : 196, 'triangle', 0.12, 0.14, 0, 0, 0.003, size > 1 ? 65 : 120);
    this.hit(0.05, 0.08, 0, 900);
  }
  remove(): void { if (this.ctx) { this.tone(180, 'triangle', 0.14, 0.1, 0, 0, 0.003, 320); } }
  deny(): void { if (this.ctx) this.tone(82, 'square', 0.12, 0.05, 0, 0, 0.003, 70); }
  ui(): void { if (this.ctx) this.tone(660, 'sine', 0.06, 0.04, 0, 0); }
  /** Quota accompli : un accord qui monte, la Tour grandit. */
  quota(): void {
    if (!this.ctx) return;
    [0, 2, 4, 5, 7, 9].forEach((n, i) => {
      this.tone(this.degree(n, 0), 'triangle', 1.6, 0.1, (i - 2.5) / 4, i * GRID, 0.01);
      this.tone(this.degree(n, 1), 'sine', 2.2, 0.06, (2.5 - i) / 4, i * GRID + 0.03, 0.02);
    });
    this.tone(55, 'sine', 2.4, 0.3, 0, 0, 0.05, 36);
  }
}
