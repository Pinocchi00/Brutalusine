// Son : une musique d'ambiance lente et douce (nappes, basse, notes rares dans une longue réverbération),
// et des bruitages feutrés. Rien d'agressif : ondes sinus et triangle, filtres bas, attaques lentes.

const CHORDS: number[][] = [          // demi-tons au-dessus de ré : Rém9, Si♭maj7, Famaj9, Do6/9
  [0, 3, 7, 10, 14],
  [-4, 0, 3, 7, 12],
  [3, 7, 10, 14, 17],
  [-2, 2, 5, 7, 12],
];
const MELODY = [0, 3, 5, 7, 10, 12, 15, 17];   // pentatonique mineure de ré
const ROOT = 146.83;                            // ré 3
const CHORD_LEN = 11;                           // secondes par accord
const hz = (semi: number, octave = 0) => ROOT * Math.pow(2, octave + semi / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private nextChord = 0;
  private chordIndex = 0;
  private nextNote = 0;
  private lastNote = -1;
  private budget = 0;
  musicVolume = 0.5;
  sfxVolume = 0.6;
  night = 0;

  /** À appeler sur un geste du joueur (les navigateurs l'exigent). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVolume;
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVolume;
    this.music.connect(this.master); this.sfx.connect(this.master);
    // réverbération : une réponse impulsionnelle synthétique, longue et sombre
    const len = Math.floor(ctx.sampleRate * 4.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.42 * t);      // de plus en plus sourd
        d[i] = lp * Math.pow(1 - t, 2.6);
      }
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.9;
    this.reverb.connect(this.wet).connect(this.master);
    const nl = Math.floor(ctx.sampleRate * 0.4);
    this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.nextChord = ctx.currentTime + 0.3;
    this.nextNote = ctx.currentTime + 4;
  }

  setMusic(v: number): void { this.musicVolume = v; if (this.ctx) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setSfx(v: number): void { this.sfxVolume = v; if (this.ctx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  /** Une voix : oscillateur → filtre passe-bas → enveloppe → sortie directe + réverbération. */
  private voice(freq: number, type: OscillatorType, t: number, attack: number, hold: number, release: number, vol: number, cutoff: number, bus: GainNode, send: number, pan = 0, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(f).connect(g).connect(p);
    p.connect(bus);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; p.connect(s).connect(this.reverb); }
    o.start(t); o.stop(t + attack + hold + release + 0.1);
  }

  private thud(t: number, freq: number, to: number, dur: number, vol: number, pan = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g).connect(p).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private click(t: number, freq: number, dur: number, vol: number, pan = 0): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    s.connect(f).connect(g).connect(p).connect(this.sfx);
    s.start(t, Math.random() * 0.2, dur + 0.02);
  }

  /** Appelé à chaque image : programme la musique un peu en avance. */
  update(night: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.night = night;
    this.budget = Math.min(6, this.budget + 0.25);
    const now = ctx.currentTime;
    if (now + 0.5 > this.nextChord) {
      const t = this.nextChord;
      const chord = CHORDS[this.chordIndex % CHORDS.length];
      const cutoff = 950 - 420 * night;
      // nappe : chaque note de l'accord, deux voix légèrement désaccordées, entrée et sortie très lentes
      chord.forEach((semi, i) => {
        const pan = (i / (chord.length - 1)) * 1.2 - 0.6;
        this.voice(hz(semi), 'triangle', t + i * 0.35, 3.2, CHORD_LEN - 4.5, 5.5, 0.05, cutoff, this.music, 0.5, pan, -5);
        this.voice(hz(semi), 'sine', t + i * 0.35, 3.6, CHORD_LEN - 4.5, 5.5, 0.04, cutoff, this.music, 0.5, -pan, 6);
      });
      this.voice(hz(chord[0], -2), 'sine', t, 2.0, CHORD_LEN - 3, 4, 0.16, 220, this.music, 0.15);   // basse
      this.chordIndex++;
      this.nextChord = t + CHORD_LEN;
    }
    if (now + 0.3 > this.nextNote) {
      const t = this.nextNote;
      // mélodie : des notes rares, comme des gouttes ; plus rares encore la nuit
      if (Math.random() < 0.62 - 0.3 * night) {
        let k = (Math.random() * MELODY.length) | 0;
        if (k === this.lastNote) k = (k + 2) % MELODY.length;
        this.lastNote = k;
        const f = hz(MELODY[k], 1);
        const pan = Math.random() * 1.4 - 0.7;
        this.voice(f, 'sine', t, 0.012, 0.02, 2.6, 0.075, 2600, this.music, 0.9, pan);
        this.voice(f * 2.005, 'sine', t, 0.008, 0.01, 0.9, 0.018, 4000, this.music, 0.9, pan);
        if (Math.random() < 0.3) this.voice(hz(MELODY[(k + 2) % MELODY.length], 1), 'sine', t + 0.42, 0.012, 0.02, 2.2, 0.045, 2400, this.music, 0.9, -pan);
      }
      this.nextNote = t + 1.4 + Math.random() * 2.6;
    }
  }

  // ------------------------------------------------------------ bruitages
  place(size: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thud(t, size > 1 ? 120 : 170, size > 1 ? 52 : 85, size > 1 ? 0.2 : 0.11, size > 1 ? 0.42 : 0.26);
    this.click(t, 1400, 0.035, 0.07);
  }
  remove(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thud(t, 90, 150, 0.1, 0.2);
    this.click(t, 700, 0.06, 0.06);
  }
  deny(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thud(t, 110, 92, 0.1, 0.2); this.thud(t + 0.11, 92, 78, 0.14, 0.2);
  }
  ui(): void { if (this.ctx) this.click(this.ctx.currentTime, 2600, 0.02, 0.05); }
  /** Bruit discret d'une machine qui termine un cycle (seulement près de la caméra). */
  machine(near: number, pan: number): void {
    if (!this.ctx || near < 0.15 || this.budget < 1) return;
    this.budget--;
    const t = this.ctx.currentTime;
    this.click(t, 420 + Math.random() * 260, 0.06, 0.035 * near, pan);
  }
  cut(near: number, pan: number): void {
    if (!this.ctx || near < 0.15 || this.budget < 1) return;
    this.budget--;
    this.click(this.ctx.currentTime, 3000, 0.05, 0.03 * near, pan);
  }
  /** Quota accompli : un arpège de cloches qui monte dans la réverbération. */
  quota(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 15, 19, 24].forEach((semi, i) => {
      this.voice(hz(semi, 1), 'sine', t + i * 0.16, 0.01, 0.05, 3.2, 0.12, 5000, this.sfx, 0.9, (i - 2.5) / 3.5);
      this.voice(hz(semi, 2) * 1.003, 'sine', t + i * 0.16, 0.01, 0.02, 1.4, 0.03, 6000, this.sfx, 0.9, (2.5 - i) / 3.5);
    });
    this.thud(t, 70, 38, 1.4, 0.4);
  }
}
