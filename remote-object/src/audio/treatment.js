/* K-4 TREATMENT UNIT -- the audio half.
 *
 * Splices into the master bus, so it treats everything the object makes
 * at once: the archive, the voice, the rotor's atmosphere. Anything
 * that arrives at the bus gets whatever this happens to be doing.
 *
 * Two controls and no settings. You cannot choose an effect, only ask
 * for another one, and what you get is a chain of two to four taken at
 * random from the palette below with random parameters. Nothing is
 * saved and nothing repeats -- ask again and the last one is gone for
 * good, which is the difference between an instrument and a preset
 * menu.
 *
 * Every effect also declares what it does to the LOOK of the thing.
 * Those contributions are summed into `visual` and read by the stage,
 * so the picture and the sound are degraded by the same decision at the
 * same moment. A machine that mangles its own audio and leaves its
 * display pristine is two machines.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const pickN = (arr, n) => {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
};

/* Each builder returns { in, out, label, visual, tick? }.
   `visual` values are added up and clamped by the stage. */
const PALETTE = {
  /* --- quantise to a handful of levels --- */
  bits(ctx) {
    const n = Math.round(rand(2, 7));
    const ws = ctx.createWaveShaper();
    const steps = Math.pow(2, n);
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    ws.curve = curve;
    return {
      in: ws, out: ws, label: "BITS " + n,
      /* fewer bits, coarser picture */
      visual: { crush: (8 - n) / 7, grain: 0.35 },
    };
  },

  /* --- soft clipping, then hard --- */
  drive(ctx) {
    const amt = rand(3, 26);
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.tanh(x * amt) * 0.86;
    }
    ws.curve = curve;
    ws.oversample = "2x";
    const trim = ctx.createGain();
    trim.gain.value = 1 / (1 + Math.log10(amt));
    ws.connect(trim);
    return {
      in: ws, out: trim, label: "DRIVE " + Math.round(amt),
      visual: { exposure: 0.3 + amt / 60, warmth: 0.5 },
    };
  },

  lowpass(ctx) {
    const f = rand(320, 3600);
    const bq = ctx.createBiquadFilter();
    bq.type = "lowpass";
    bq.frequency.value = f;
    bq.Q.value = rand(0.7, 7);
    return {
      in: bq, out: bq, label: "LP " + Math.round(f),
      /* dull and warm */
      visual: { warmth: 0.7, exposure: -0.22 },
    };
  },

  highpass(ctx) {
    const f = rand(200, 2200);
    const bq = ctx.createBiquadFilter();
    bq.type = "highpass";
    bq.frequency.value = f;
    bq.Q.value = rand(0.7, 6);
    return {
      in: bq, out: bq, label: "HP " + Math.round(f),
      /* thin and cold */
      visual: { warmth: -0.7, scan: 0.5 },
    };
  },

  /* --- multiply by a tone: the most machine-like thing here --- */
  ring(ctx) {
    const f = rand(24, 720);
    const g = ctx.createGain();
    g.gain.value = 0;                 // the carrier supplies all of it
    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.5 ? "sine" : "square";
    osc.frequency.value = f;
    osc.connect(g.gain);
    osc.start();
    return {
      in: g, out: g, label: "RING " + Math.round(f), node: osc,
      visual: { scan: 1, pulse: 0.5, warmth: -0.3 },
    };
  },

  /* --- amplitude modulation, slow enough to hear as movement --- */
  tremolo(ctx) {
    const f = rand(0.6, 11);
    const g = ctx.createGain();
    g.gain.value = 0.55;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const depth = ctx.createGain();
    depth.gain.value = rand(0.2, 0.45);
    osc.connect(depth).connect(g.gain);
    osc.start();
    return {
      in: g, out: g, label: "TREM " + f.toFixed(1), node: osc,
      visual: { pulse: 1, pulseRate: f },
    };
  },

  delay(ctx) {
    const time = rand(0.06, 0.42);
    const fb = rand(0.2, 0.62);
    const dry = ctx.createGain();
    const d = ctx.createDelay(1);
    d.delayTime.value = time;
    const loop = ctx.createGain();
    loop.gain.value = fb;
    const wet = ctx.createGain();
    wet.gain.value = rand(0.25, 0.6);
    const sum = ctx.createGain();
    dry.connect(sum);
    dry.connect(d);
    d.connect(loop).connect(d);
    d.connect(wet).connect(sum);
    return {
      in: dry, out: sum, label: "DLY " + Math.round(time * 1000),
      visual: { grain: 0.8, exposure: -0.1 },
    };
  },
};

const NAMES = Object.keys(PALETTE);

const BLANK = { crush: 0, grain: 0, scan: 0, warmth: 0, exposure: 0, pulse: 0, pulseRate: 2 };

export class Treatment {
  /**
   * @param bus         everything the object makes arrives here
   * @param destination where it goes when this is out of the way
   */
  constructor(ctx, bus, destination) {
    this.ctx = ctx;
    this.bus = bus;
    this.destination = destination;
    this.chain = [];
    this.on = false;
    this.label = "NONE";
    this.visual = { ...BLANK };
    this.lamps = new Set();
    this.bypass();
  }

  /** Straight through. */
  bypass() {
    try { this.bus.disconnect(); } catch { /* nothing attached yet */ }
    this.bus.connect(this.destination);
  }

  /** Take two to four at random and wire them in series. */
  generate() {
    const ctx = this.ctx;
    this.teardown();

    const n = 2 + Math.floor(Math.random() * 3);
    const chosen = pickN(NAMES, n);
    this.chain = chosen.map((k) => Object.assign(PALETTE[k](ctx), { kind: k }));

    /* sum what it does to the picture */
    const v = { ...BLANK };
    for (const fx of this.chain) {
      for (const key in fx.visual) {
        if (key === "pulseRate") v.pulseRate = fx.visual.pulseRate;
        else v[key] += fx.visual[key];
      }
    }
    this.visual = v;
    this.lamps = new Set(chosen);
    this.label = this.chain.map((f) => f.label).join(" · ");

    if (this.on) this.engage();
    return this.label;
  }

  /** Route the bus through whatever is currently built. */
  engage() {
    if (!this.chain.length) this.generate();
    try { this.bus.disconnect(); } catch { /* fine */ }
    let node = this.bus;
    for (const fx of this.chain) {
      node.connect(fx.in);
      node = fx.out;
    }
    node.connect(this.destination);
  }

  set enabled(on) {
    this.on = !!on;
    if (this.on) this.engage();
    else this.bypass();
  }

  get enabled() { return this.on; }

  /** What the stage should apply. Zeroed when the unit is off. */
  get look() {
    return this.on ? this.visual : BLANK;
  }

  teardown() {
    for (const fx of this.chain) {
      try { fx.out.disconnect(); } catch { /* already gone */ }
      try { fx.in.disconnect(); } catch { /* already gone */ }
      if (fx.node) { try { fx.node.stop(); } catch { /* already stopped */ } }
    }
    this.chain = [];
  }
}

export { NAMES as TREATMENTS };
