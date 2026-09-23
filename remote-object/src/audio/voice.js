/* A voice.
 *
 * Not the browser's speech synthesiser. That cannot be routed through
 * Web Audio in any reliable way, so it cannot be degraded, and modern
 * TTS is smooth and breathy and completely wrong for this -- it sounds
 * like a phone assistant, which is the one thing this object must never
 * sound like.
 *
 * So this is a formant synthesiser, which is what those chips actually
 * were. A buzzing glottal source and a hiss, pushed through three
 * bandpass filters whose centre frequencies are the formants of the
 * phoneme being said. Move the filters, and the same buzz becomes a
 * different vowel. That is all speech is, physically, and doing it
 * properly gets the right voice for free: stepped, buzzy, slightly
 * wrong, and audibly assembled out of parts.
 *
 * The pronunciation rules are approximate on purpose. English spelling
 * is irregular and a rule-based reader mangles a fair proportion of it.
 * A machine that reconstructs speech from written evidence and gets
 * some of it wrong is exactly the machine this is meant to be, so the
 * mistakes are left in.
 */

/* --- phoneme table -------------------------------------------------
   f1/f2/f3 in Hz, `v` = voiced, `n` = noisy, `ms` = nominal length.
   Stops carry a `hold` of near-silence before their burst.            */

const P = {
  /* vowels */
  AA: { f: [730, 1090, 2440], v: 1, ms: 165 },
  AE: { f: [660, 1720, 2410], v: 1, ms: 165 },
  AH: { f: [640, 1190, 2390], v: 1, ms: 130 },
  AO: { f: [570, 840, 2410], v: 1, ms: 165 },
  EH: { f: [530, 1840, 2480], v: 1, ms: 140 },
  ER: { f: [490, 1350, 1690], v: 1, ms: 165 },
  IH: { f: [390, 1990, 2550], v: 1, ms: 120 },
  IY: { f: [270, 2290, 3010], v: 1, ms: 150 },
  OW: { f: [450, 900, 2300], v: 1, ms: 165 },
  UH: { f: [440, 1020, 2240], v: 1, ms: 130 },
  UW: { f: [300, 870, 2240], v: 1, ms: 160 },

  /* approximants and nasals */
  L: { f: [360, 1300, 2900], v: 1, ms: 95 },
  R: { f: [310, 1060, 1380], v: 1, ms: 95 },
  W: { f: [300, 610, 2200], v: 1, ms: 85 },
  Y: { f: [270, 2290, 3010], v: 1, ms: 80 },
  M: { f: [250, 1100, 2100], v: 1, ms: 105, nasal: 1 },
  N: { f: [250, 1700, 2600], v: 1, ms: 105, nasal: 1 },
  NG: { f: [250, 2300, 2750], v: 1, ms: 115, nasal: 1 },

  /* fricatives */
  F: { f: [400, 1100, 2200], n: 1, ms: 110 },
  V: { f: [400, 1100, 2200], n: 1, v: 1, ms: 95 },
  TH: { f: [400, 1400, 2400], n: 1, ms: 105 },
  DH: { f: [400, 1400, 2400], n: 1, v: 1, ms: 90 },
  S: { f: [1200, 4800, 6400], n: 1, ms: 130 },
  Z: { f: [1200, 4400, 6000], n: 1, v: 1, ms: 110 },
  SH: { f: [900, 2400, 3600], n: 1, ms: 135 },
  ZH: { f: [900, 2200, 3400], n: 1, v: 1, ms: 110 },
  HH: { f: [500, 1500, 2500], n: 1, ms: 80 },

  /* stops: silence, then a burst */
  P: { f: [500, 1200, 2300], n: 1, ms: 55, hold: 55 },
  B: { f: [400, 1000, 2200], n: 1, v: 1, ms: 45, hold: 45 },
  T: { f: [700, 1900, 3200], n: 1, ms: 55, hold: 55 },
  D: { f: [500, 1700, 2600], n: 1, v: 1, ms: 45, hold: 45 },
  K: { f: [700, 1800, 2600], n: 1, ms: 60, hold: 60 },
  G: { f: [500, 1600, 2400], n: 1, v: 1, ms: 50, hold: 50 },

  _: { f: [400, 1200, 2400], ms: 120 },      // pause
};

/* diphthongs, said as two targets */
const DIPH = {
  AY: ["AA", "IY"], EY: ["EH", "IY"], OY: ["AO", "IY"],
  AW: ["AA", "UW"], JH: ["D", "ZH"], CH: ["T", "SH"],
};

/* --- letters to phonemes -------------------------------------------
   Longest match first, with a little left/right context. Crude, and
   the errors it makes are part of the voice.                          */

const RULES = [
  ["TION", ["SH", "AH", "N"]], ["SION", ["ZH", "AH", "N"]],
  ["OUGH", ["AO"]], ["IGHT", ["AY", "T"]], ["EIGH", ["EY"]],
  ["TCH", ["CH"]], ["DGE", ["JH"]], ["ING", ["IH", "NG"]],
  ["ALK", ["AO", "K"]], ["OOK", ["UH", "K"]],
  ["TH", ["TH"]], ["SH", ["SH"]], ["CH", ["CH"]], ["PH", ["F"]],
  ["WH", ["W"]], ["CK", ["K"]], ["NG", ["NG"]], ["QU", ["K", "W"]],
  ["OO", ["UW"]], ["EE", ["IY"]], ["EA", ["IY"]], ["OA", ["OW"]],
  ["AI", ["EY"]], ["AY", ["EY"]], ["OI", ["OY"]], ["OY", ["OY"]],
  ["OU", ["AW"]], ["OW", ["OW"]], ["AU", ["AO"]], ["AW", ["AO"]],
  ["EW", ["UW"]], ["IE", ["IY"]], ["EI", ["IY"]], ["UI", ["UW"]],
  ["AR", ["AA", "R"]], ["OR", ["AO", "R"]], ["IR", ["ER"]],
  ["UR", ["ER"]], ["ER", ["ER"]],
];

const SINGLE = {
  A: ["AE"], B: ["B"], C: ["K"], D: ["D"], E: ["EH"], F: ["F"], G: ["G"],
  H: ["HH"], I: ["IH"], J: ["JH"], K: ["K"], L: ["L"], M: ["M"], N: ["N"],
  O: ["AA"], P: ["P"], Q: ["K"], R: ["R"], S: ["S"], T: ["T"], U: ["AH"],
  V: ["V"], W: ["W"], X: ["K", "S"], Y: ["IY"], Z: ["Z"],
  "0": ["Z", "IY", "R", "OW"], "1": ["W", "AH", "N"], "2": ["T", "UW"],
  "3": ["TH", "R", "IY"], "4": ["F", "AO", "R"], "5": ["F", "AY", "V"],
  "6": ["S", "IH", "K", "S"], "7": ["S", "EH", "V", "AH", "N"],
  "8": ["EY", "T"], "9": ["N", "AY", "N"],
};

/** Split a word into phonemes, badly but consistently. */
function phonemes(word) {
  const w = word.toUpperCase();
  const out = [];
  let i = 0;
  while (i < w.length) {
    let hit = null;
    for (const [pat, ph] of RULES) {
      if (w.startsWith(pat, i)) { hit = [pat.length, ph]; break; }
    }
    if (!hit) {
      /* a final E is usually silent, and usually lengthens what came
         before it -- half a rule, which is about as much as English
         deserves */
      if (w[i] === "E" && i === w.length - 1 && w.length > 2) { i++; continue; }
      const s = SINGLE[w[i]];
      hit = s ? [1, s] : [1, null];
    }
    if (hit[1]) out.push(...hit[1]);
    i += hit[0];
  }
  return out;
}

/**
 * How open and how wide the mouth is for a given phoneme.
 *
 * Taken from the same two numbers that are making the sound, because
 * they already describe it. F1 tracks how far the jaw is open -- IY as
 * in `beet` is 270Hz and nearly shut, AA as in `father` is 730Hz and
 * wide. F2 tracks how far forward the tongue is and how spread the
 * lips are -- IY is 2290Hz and drawn back in a grin, UW as in `boot` is
 * 870Hz and pushed forward into a circle.
 *
 * So the aperture is not animated to look like it is talking. It is
 * driven by the articulation, and it agrees with the sound because it
 * is reading off the same table.
 *
 * The exceptions are the two things formants cannot tell you. A stop is
 * a closure -- the whole point of P or K is that the mouth is shut --
 * and its formants describe the burst afterwards, not the silence. And
 * a nasal is made with the lips together and the sound going elsewhere.
 */
export function shapeOf(name) {
  const ph = P[name];
  if (!ph || name === "_") return { open: 0, wide: 0.4 };
  if (ph.hold) return { open: 0.04, wide: 0.35 };      // a stop is a closure
  if (ph.nasal) return { open: 0.1, wide: 0.4 };
  const open = Math.max(0, Math.min(1, (ph.f[0] - 250) / 500));
  const wide = Math.max(0, Math.min(1, (ph.f[1] - 700) / 1600));
  return { open, wide };
}

export function toPhonemes(text) {
  const out = [];
  for (const word of String(text).trim().split(/\s+/)) {
    if (!word) continue;
    if (out.length) out.push("_");
    out.push(...phonemes(word.replace(/[^A-Za-z0-9]/g, "")));
  }
  return out;
}

/* --- the instrument ------------------------------------------------ */

export class Voice {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.speaking = false;
    this.onDone = null;

    const now = ctx.currentTime;

    /* glottal buzz: a sawtooth is close enough to a pulse train once
       three bandpasses have had it */
    this.src = ctx.createOscillator();
    this.src.type = "sawtooth";
    this.src.frequency.value = 92;
    this.voiced = ctx.createGain();
    this.voiced.gain.value = 0;
    this.src.connect(this.voiced);

    /* a slow drift, so it never sits exactly on a pitch */
    this.drift = ctx.createOscillator();
    this.drift.type = "sine";
    this.drift.frequency.value = 0.7;
    this.driftAmt = ctx.createGain();
    this.driftAmt.gain.value = 2.4;
    this.drift.connect(this.driftAmt).connect(this.src.frequency);

    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer(ctx);
    this.noise.loop = true;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.noise.connect(this.hiss);

    /* three formants */
    this.bands = [];
    this.mix = ctx.createGain();
    this.mix.gain.value = 0;
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = P.AH.f[i];
      bp.Q.value = i === 0 ? 9 : 7;
      const g = ctx.createGain();
      g.gain.value = [1, 0.62, 0.34][i];
      this.voiced.connect(bp);
      this.hiss.connect(bp);
      bp.connect(g).connect(this.mix);
      this.bands.push(bp);
    }

    /* the chip: quantise hard, then throw away everything above 3.6k */
    this.crush = ctx.createWaveShaper();
    this.crush.curve = quantise(6);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 3600;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;

    this.mix.connect(this.crush).connect(this.lp).connect(this.out);
    this.out.connect(destination || ctx.destination);

    this.src.start(now);
    this.drift.start(now);
    this.noise.start(now);
  }

  /** Schedule an utterance. Returns its length in seconds. */
  say(text, { rate = 1, pitch = 92 } = {}) {
    const ctx = this.ctx;
    if (ctx.state === "suspended") ctx.resume();

    const list = toPhonemes(text);
    if (!list.length) return 0;

    this.cancel();
    const t0 = ctx.currentTime + 0.04;
    let t = t0;

    this.src.frequency.setValueAtTime(pitch, t0);

    for (const name of list) {
      const parts = DIPH[name] || [name];
      for (const key of parts) {
        const ph = P[key] || P.AH;
        const dur = (ph.ms / 1000) / rate / parts.length + 0.012;

        if (ph.hold) {
          /* a stop is a gap and then a burst; the gap is what makes it
             audible as a consonant at all */
          this.mix.gain.setValueAtTime(0.0001, t);
          t += (ph.hold / 1000) / rate;
        }

        /* formants step rather than glide -- the giveaway of a machine
           that stores vowels as numbers */
        for (let i = 0; i < 3; i++) {
          this.bands[i].frequency.setTargetAtTime(ph.f[i], t, 0.012);
        }
        this.voiced.gain.setTargetAtTime(ph.v ? 0.5 : 0.0001, t, 0.008);
        this.hiss.gain.setTargetAtTime(ph.n ? (ph.v ? 0.09 : 0.16) : 0.0001, t, 0.008);

        const level = key === "_" ? 0.0001 : ph.nasal ? 0.5 : 0.85;
        this.mix.gain.setTargetAtTime(level, t, 0.01);
        t += dur;
        this.mix.gain.setTargetAtTime(level * 0.8, t - 0.01, 0.02);
      }
    }

    this.mix.gain.setTargetAtTime(0.0001, t, 0.02);
    this.voiced.gain.setTargetAtTime(0.0001, t, 0.02);
    this.hiss.gain.setTargetAtTime(0.0001, t, 0.02);

    const secs = t - t0 + 0.12;
    this.speaking = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.speaking = false;
      if (this.onDone) this.onDone();
    }, secs * 1000);
    return secs;
  }

  cancel() {
    const t = this.ctx.currentTime;
    for (const g of [this.mix.gain, this.voiced.gain, this.hiss.gain]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0.0001, t, 0.01);
    }
    for (const b of this.bands) b.frequency.cancelScheduledValues(t);
    clearTimeout(this._timer);
    this.speaking = false;
  }

  set volume(v) { this.out.gain.value = Math.max(0, Math.min(1, v)); }
}

function noiseBuffer(ctx) {
  const n = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Hard quantisation to `bits`, which is most of the chip sound. */
function quantise(bits) {
  const steps = Math.pow(2, bits);
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}
