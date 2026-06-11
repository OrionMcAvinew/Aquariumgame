// Tiny WebAudio blips — no assets needed.
export class Sound {
  constructor() {
    this.ctx = null;
    const resume = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    };
    window.addEventListener("pointerdown", resume, { once: false });
    window.addEventListener("keydown", resume, { once: false });
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
