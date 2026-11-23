// Ambient sound, made entirely in the browser (no recordings, no rights issues).
// A low drone in A, a breath of filtered noise, and sparse bell tones through a
// generated reverb. Dragging the field opens the filter; hovering a work plucks
// a note tied to its number.
const PENTA = [0, 2, 4, 7, 9]; // A major pentatonic steps
const hz = (semi) => 220 * 2 ** (semi / 12);

export class Sound {
  constructor() { this.on = false; this.ctx = null; }

  init() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // reverb from decaying noise
    const len = ctx.sampleRate * 4.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    const verb = (this.verb = ctx.createConvolver());
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    verb.connect(wet).connect(master);

    // drone
    const lp = (this.lp = ctx.createBiquadFilter());
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.32;
    lp.connect(droneGain); droneGain.connect(master); droneGain.connect(verb);
    [[-12, 'sine', 0.5, 0], [-12, 'sine', 0.4, 4], [-5, 'triangle', 0.12, -3], [0, 'sine', 0.16, 2], [7, 'sine', 0.05, 5]]
      .forEach(([semi, type, g, det]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(semi); o.detune.value = det;
        const gg = ctx.createGain(); gg.gain.value = g;
        // each voice swells on its own slow cycle
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + Math.random() * 0.05;
        const lg = ctx.createGain(); lg.gain.value = g * 0.6;
        lfo.connect(lg).connect(gg.gain);
        o.connect(gg).connect(lp); o.start(); lfo.start();
      });
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.021;
    const sg = ctx.createGain(); sg.gain.value = 220;
    sweep.connect(sg).connect(lp.frequency); sweep.start();

    // air: brown noise through a soft band
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = nb.getChannelData(0); let lastv = 0;
    for (let i = 0; i < nd.length; i++) { lastv = (lastv + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = lastv * 3.5; }
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.07;
    ns.connect(bp).connect(ng).connect(master); ns.start();

    this.bells();
  }

  bell(freq, gain = 0.06, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 2.76; // inharmonic partial, glassy
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.verb); g.connect(this.master);
    o.start(t); o2.start(t); o.stop(t + 3.4); o2.stop(t + 3.4);
  }

  bells() {
    const next = () => {
      if (this.on) {
        const step = PENTA[Math.floor(Math.random() * PENTA.length)] + 12 * Math.floor(Math.random() * 2);
        this.bell(hz(step), 0.035 + Math.random() * 0.03);
      }
      this.bellTimer = setTimeout(next, 3500 + Math.random() * 6500);
    };
    next();
  }

  toggle() {
    if (!this.ctx) this.init();
    this.on = !this.on;
    const t = this.ctx.currentTime;
    if (this.on) this.ctx.resume();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.on ? 0.5 : 0, t + (this.on ? 2.5 : 0.8));
    return this.on;
  }

  pluck(n) {
    if (!this.on) return;
    const step = PENTA[n % 5] + 12 * (1 + (Math.floor(n / 5) % 2));
    this.bell(hz(step), 0.03);
  }

  open() { if (this.on) { this.bell(hz(-5), 0.05); this.bell(hz(4), 0.03, 0.09); } }

  motion(v) {
    if (!this.on) return;
    const target = 520 + Math.min(v, 40) * 55;
    this.lp.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }
}
