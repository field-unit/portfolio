/* An atmosphere, generated fresh each time the thing is set going.
 *
 * Six partials on a randomised root, each drifting on its own slow
 * envelope, over a band of noise that sweeps on a period long enough
 * that you never hear it repeat. Nothing is sampled and nothing is
 * stored: every activation picks a new root, a new set of ratios, new
 * waveforms and new drift rates, so the sound has genuinely never
 * existed before and will not exist again.
 *
 * It has no transport. Brightness and level are read continuously from
 * how fast the object is turning, so the sound is not something the
 * device plays -- it is something the device is doing, and it winds
 * down when the device does.
 */

/* Ratios that stay consonant enough to be a pad rather than a cluster,
   with two intervals in there that are not from any tuning system a
   person would choose. */
const RATIOS = [1, 1.5, 2, 2.5, 3, 4, 1.333, 2.667, 5, 1.183, 3.373];

export class Drone {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.voices = [];
    this._intensity = 0;

    const now = ctx.currentTime;

    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 300;
    this.lp.Q.value = 0.7;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.lp.connect(this.out);
    this.out.connect(destination || ctx.destination);

    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 110;
      const gain = ctx.createGain();
      gain.gain.value = 0;

      /* each partial breathes on its own clock, which is what stops six
         oscillators sounding like one chord */
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.017;
      const depth = ctx.createGain();
      depth.gain.value = 0.05;
      lfo.connect(depth).connect(gain.gain);

      osc.connect(gain).connect(this.lp);
      osc.start(now);
      lfo.start(now);
      this.voices.push({ osc, gain, lfo, depth });
    }

    /* the bed */
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer(ctx);
    this.noise.loop = true;
    this.bp = ctx.createBiquadFilter();
    this.bp.type = "bandpass";
    this.bp.frequency.value = 700;
    this.bp.Q.value = 2;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.bp).connect(this.noiseGain).connect(this.lp);

    this.sweep = ctx.createOscillator();
    this.sweep.type = "sine";
    this.sweep.frequency.value = 0.023;
    this.sweepDepth = ctx.createGain();
    this.sweepDepth.gain.value = 380;
    this.sweep.connect(this.sweepDepth).connect(this.bp.frequency);

    this.noise.start(now);
    this.sweep.start(now);
  }

  /** Throw the whole thing away and pick another one. */
  strike() {
    const ctx = this.ctx;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const rand = (a, b) => a + Math.random() * (b - a);

    const root = rand(48, 132);
    const pool = RATIOS.slice();

    this.voices.forEach((v, i) => {
      const r = pool.splice(Math.floor(Math.random() * pool.length), 1)[0] ?? 1;
      const cents = rand(-9, 9) / 1200;
      v.osc.frequency.setTargetAtTime(root * r * Math.pow(2, cents), t, 0.35);
      v.osc.type = i === 0 ? "triangle" : Math.random() < 0.22 ? "sawtooth" : "sine";
      v.base = 0.34 / (1 + i * 0.55);
      v.gain.gain.setTargetAtTime(v.base, t, 0.5);
      v.lfo.frequency.setTargetAtTime(rand(0.02, 0.19), t, 0.2);
      v.depth.gain.setTargetAtTime(v.base * rand(0.3, 0.95), t, 0.4);
    });

    this.bp.frequency.setTargetAtTime(rand(260, 2100), t, 0.6);
    this.bp.Q.setTargetAtTime(rand(0.8, 6), t, 0.6);
    this.noiseGain.gain.setTargetAtTime(rand(0.02, 0.09), t, 0.8);
    this.sweep.frequency.setTargetAtTime(rand(0.011, 0.06), t, 0.4);
    this.sweepDepth.gain.setTargetAtTime(rand(120, 700), t, 0.4);

    this.struck = true;
  }

  /** 0..1, read from how fast the thing is turning. */
  set intensity(v) {
    const x = Math.max(0, Math.min(1, v));
    this._intensity = x;
    if (!this.struck) return;
    const t = this.ctx.currentTime;
    /* level lags the spin, so it swells in and takes its time going */
    this.out.gain.setTargetAtTime(Math.pow(x, 1.4) * 0.5, t, x > 0.05 ? 0.25 : 1.6);
    this.lp.frequency.setTargetAtTime(220 + x * x * 5200, t, 0.4);
  }

  get intensity() { return this._intensity; }
}

function noiseBuffer(ctx) {
  const n = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  /* brown-ish: white noise is too bright to sit under a pad */
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}
