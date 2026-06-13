// Tiny WebAudio blips + a subtle ambient bed — no assets needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this._ambient = null;
    this.ambientOn = (() => { try { return localStorage.getItem("finfortune-audio") !== "0"; } catch { return true; } })();
    const resume = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (this.ambientOn) this.startAmbient();
    };
    window.addEventListener("pointerdown", resume, { once: false });
    window.addEventListener("keydown", resume, { once: false });
  }

  // Soft underwater pad + occasional bubble blips.
  startAmbient() {
    if (!this.ctx || this._ambient) return;
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 600; lp.connect(master);
    const pad = ctx.createGain(); pad.gain.value = 0.04; pad.connect(lp);
    const oscs = [];
    for (const f of [110, 164.81, 220]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      o.connect(pad); o.start();
      const lfo = ctx.createOscillator(); lfo.type = "sine";
      lfo.frequency.value = 0.06 + Math.random() * 0.06;
      const lg = ctx.createGain(); lg.gain.value = 2.5;
      lfo.connect(lg).connect(o.detune); lfo.start();
      oscs.push(o, lfo);
    }
    const bubble = () => {
      if (!this._ambient) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      const base = 180 + Math.random() * 240;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
    };
    const interval = setInterval(() => { if (Math.random() < 0.7) bubble(); }, 650);
    this._ambient = { master, oscs, interval };
  }

  stopAmbient() {
    if (!this._ambient) return;
    const { master, oscs, interval } = this._ambient;
    clearInterval(interval);
    try { master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4); } catch { /* */ }
    setTimeout(() => oscs.forEach((o) => { try { o.stop(); } catch { /* */ } }), 600);
    this._ambient = null;
  }

  toggleAmbient() {
    this.ambientOn = !this.ambientOn;
    try { localStorage.setItem("finfortune-audio", this.ambientOn ? "1" : "0"); } catch { /* */ }
    if (this.ambientOn) this.startAmbient(); else this.stopAmbient();
    return this.ambientOn;
  }

  blip(freq, dur = 0.09, type = "square", vol = 0.04, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  scan() { this.blip(1100, 0.08); }
  pickup() { this.blip(300, 0.06, "triangle", 0.05); }
  splash() { this.blip(500, 0.12, "sine", 0.05); this.blip(700, 0.1, "sine", 0.04, 0.06); }
  chaching() { this.blip(660, 0.1, "square", 0.05); this.blip(990, 0.16, "square", 0.05, 0.09); }
  levelup() { [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.14, "triangle", 0.06, i * 0.1)); }
  bad() { this.blip(220, 0.2, "sawtooth", 0.04); }
}
