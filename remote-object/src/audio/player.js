/* Playback.
 *
 * A plain <audio> element does the actual work -- it handles streaming,
 * Range seeking, codec support and the mobile lifecycle far better than
 * anything hand-rolled on top of Web Audio would. Web Audio is bolted
 * on for exactly one reason: the analyser feeds the waveform on the
 * Receiver's display, and a display that draws the signal it is
 * actually playing is worth the extra graph.
 *
 * If the AudioContext refuses to start, playback continues without the
 * meter rather than failing.
 */

const BINS = 60;   // waveform columns on the panel

export class Player {
  constructor() {
    /* createElement rather than `new Audio()`: the global is easy to
       shadow -- Three exports a class of the same name -- and this
       form cannot be captured by whatever else is in scope. */
    this.el = document.createElement("audio");
    this.el.preload = "metadata";
    this.el.crossOrigin = "anonymous";
    this.object = null;
    this.loading = false;
    this.error = null;
    this.onEnded = null;
    this.onChange = null;

    this.bins = new Float32Array(BINS);
    this._ctx = null;
    this._analyser = null;
    this._time = null;

    const changed = () => this.onChange && this.onChange();

    this.el.addEventListener("loadstart", () => { this.loading = true; changed(); });
    this.el.addEventListener("canplay", () => { this.loading = false; changed(); });
    this.el.addEventListener("loadedmetadata", changed);
    this.el.addEventListener("play", changed);
    this.el.addEventListener("pause", changed);
    this.el.addEventListener("ended", () => {
      changed();
      if (this.onEnded) this.onEnded();
    });
    this.el.addEventListener("error", () => {
      this.loading = false;
      this.error = "unreadable";
      changed();
    });
  }

  /* The graph can only be built inside a user gesture, so this is
     called from the same click that opens the object. */
  wake() {
    if (this._ctx) {
      if (this._ctx.state === "suspended") this._ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      /* One bus that everything on the object joins -- the archive, the
         voice, the rotor -- so that a single unit can treat the lot. */
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      this._bus = bus;

      const src = ctx.createMediaElementSource(this.el);
      const gain = ctx.createGain();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      src.connect(gain);
      gain.connect(bus);
      gain.connect(an);
      this._ctx = ctx;
      this._gain = gain;
      this._analyser = an;
      this._time = new Uint8Array(an.fftSize);
    } catch {
      /* no meter, but the element still plays */
      this._ctx = null;
    }
  }

  /** The shared graph. Null until the first user gesture wakes it. */
  get context() { return this._ctx; }

  /** Where every sound on the object should be sent. */
  get bus() { return this._bus || (this._ctx && this._ctx.destination) || null; }

  load(object) {
    if (!object || !object.src) return false;
    if (this.object === object) return true;
    this.object = object;
    this.error = null;
    this.loading = true;
    this.el.src = object.src;
    this.el.load();
    return true;
  }

  play() {
    if (!this.object) return;
    if (this._ctx && this._ctx.state === "suspended") this._ctx.resume();
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { this.error = "refused"; });
  }

  pause() { this.el.pause(); }
  toggle() { this.el.paused ? this.play() : this.pause(); }

  stop() {
    this.el.pause();
    try { this.el.currentTime = 0; } catch { /* not seekable yet */ }
  }

  seek(sec) {
    const d = this.duration;
    if (!isFinite(d)) return;
    try { this.el.currentTime = Math.max(0, Math.min(d - 0.05, sec)); } catch { /* ignore */ }
  }

  seekBy(delta) { this.seek(this.time + delta); }

  set volume(v) { this.el.volume = Math.max(0, Math.min(1, v)); }
  get volume() { return this.el.volume; }

  get time() { return this.el.currentTime || 0; }
  get duration() { return this.el.duration; }
  get playing() { return !this.el.paused && !this.el.ended; }

  /** Downsample the live signal to one peak per display column. */
  sample() {
    const out = this.bins;
    if (!this._analyser || !this.playing) {
      for (let i = 0; i < BINS; i++) out[i] *= 0.86;   // let it fall away
      return out;
    }
    this._analyser.getByteTimeDomainData(this._time);
    const step = Math.floor(this._time.length / BINS);
    for (let i = 0; i < BINS; i++) {
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(this._time[i * step + j] - 128) / 128;
        if (v > peak) peak = v;
      }
      /* attack fast, release slow, like a needle */
      out[i] = peak > out[i] ? peak : out[i] * 0.72 + peak * 0.28;
    }
    return out;
  }
}
