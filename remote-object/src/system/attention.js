import { clamp, damp } from "../lib/math.js";

/* How much the object is attending to you, and how likely it is to do
 * something about it.
 *
 * Everything unnerving in this build hangs off these two numbers. That
 * is the point: a dozen separate tricks read as a pile of gimmicks,
 * whereas one internal state driving the lens, the lamps, the panel
 * noise, the chains and the audio at once reads as one thing paying
 * attention. Coherence is what makes it feel conscious rather than
 * merely reactive.
 *
 * The governing rule is inverted from what people expect:
 *
 *   IT WATCHES YOU WHEN YOU ARE STILL.
 *
 * Thrash the mouse and it loses interest. Stop, and it turns to you.
 * That is the wrong way round for a user interface and the right way
 * round for an animal, and it means the exact moment you pause to work
 * out what you are looking at is the moment it looks back.
 *
 * And it does not stare indefinitely. Hold its gaze long enough and it
 * looks away -- which reads as a decision, and a thing that decides is
 * a thing that is present.
 */

export class Attention {
  constructor(witness) {
    this.witness = witness;

    /* the observer */
    this.x = 0;             // pointer, normalised -1..1
    this.y = 0;
    this.speed = 0;         // smoothed px/sec
    this.still = 0;         // seconds since meaningful movement
    this.idle = 0;          // seconds since any input at all
    this.session = 0;       // seconds since the route opened
    this.present = false;   // has the pointer ever been in the window
    this.dwell = new Map(); // device -> seconds held on it
    this.held = null;       // device currently under the pointer

    /* the object */
    this.regard = 0;        // 0..1 how much it is attending to you
    this.unrest = 0;        // 0..1 how ready it is to act unprompted
    this.averted = 0;       // seconds left of deliberately looking away
    this._stare = 0;

    /* set when the tab was hidden and has come back */
    this.away = 0;
    this._hidAt = 0;

    this._lx = 0; this._ly = 0; this._raw = 0;

    /* Wall-clock stamp of the last real movement, kept separately from
       `still` so that anything needing to know how long you have been
       motionless can ask without waiting on the frame loop. The entry
       handshake runs before the object is live and depends on this. */
    this.lastMoveAt = performance.now();

    addEventListener("pointermove", this.onMove, { passive: true });
    addEventListener("keydown", this.poke, { passive: true });
    addEventListener("wheel", this.poke, { passive: true });
    addEventListener("blur", () => { this.present = false; });

    /* The one behaviour the brief asks for most directly: the thing
       should seem to exist when nobody is watching. So it keeps time
       while the tab is hidden, and when you come back it has moved. */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this._hidAt = performance.now();
      else if (this._hidAt) {
        this.away = (performance.now() - this._hidAt) / 1000;
        this._hidAt = 0;
        this.witness?.note("away", this.away);
      }
    });
  }

  onMove = (e) => {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = -((e.clientY / innerHeight) * 2 - 1);
    this._raw = Math.hypot(e.clientX - this._lx, e.clientY - this._ly);
    this._lx = e.clientX; this._ly = e.clientY;
    this.x = nx; this.y = ny;
    this.idle = 0;
    this.present = true;
    if (this._raw > 2) { this.still = 0; this.lastMoveAt = performance.now(); }
  };

  poke = () => { this.idle = 0; this.still = 0; this.lastMoveAt = performance.now(); };

  /** Seconds motionless, straight off the clock. */
  get motionless() { return (performance.now() - this.lastMoveAt) / 1000; }

  /** Called each frame with whichever device the pointer is over. */
  update(dt, over) {
    this.session += dt;
    this.idle += dt;
    this.still += dt;

    this.speed = damp(this.speed, this._raw / Math.max(dt, 1e-3), 6, dt);
    this._raw = 0;

    this.held = over;
    if (over) this.dwell.set(over, (this.dwell.get(over) || 0) + dt);

    /* --- regard -------------------------------------------------- */
    const stillness = clamp(this.still / 2.2, 0, 1);
    const lingering = over ? clamp((this.dwell.get(over) || 0) / 3, 0, 1) * 0.35 : 0;
    const familiar = clamp((this.witness?.visits ?? 1) / 6, 0, 1) * 0.25;
    const rushing = clamp(this.speed / 900, 0, 1);

    /* Standing still on a first visit has to be enough on its own to
       get it looking at you and then, a few seconds later, looking
       away. If the ceiling sits at the threshold the whole arc chatters
       instead of happening once, clearly. */
    let want = clamp(stillness * 0.72 + lingering + familiar - rushing * 0.85, 0, 1);
    if (!this.present) want *= 0.35;

    /* It will not hold your gaze forever. Once it has been looking at
       you for a while it breaks off and refuses to look for a bit --
       which is far more unpleasant than being stared at, because it
       reads as having reached a conclusion. */
    if (this.averted > 0) {
      this.averted -= dt;
      want = Math.min(want, 0.08);
      this._stare = 0;
    } else if (this.regard > 0.72) {
      this._stare += dt;
      if (this._stare > 5.5 + Math.random() * 3) {
        this.averted = 3 + Math.random() * 5;
        this.witness?.note("averted", 1);
      }
    } else {
      this._stare = Math.max(0, this._stare - dt * 0.5);
    }

    this.regard = damp(this.regard, want, want > this.regard ? 1.6 : 2.6, dt);

    /* --- unrest -------------------------------------------------- */
    /* Leave it alone and it starts doing things by itself. */
    const wantUnrest = clamp((this.idle - 6) / 14, 0, 1);
    this.unrest = damp(this.unrest, wantUnrest, 0.9, dt);
  }

  /** Consume the "you were gone for N seconds" flag. */
  takeAway() {
    const a = this.away;
    this.away = 0;
    return a;
  }

  /** Longest-dwelt device, for the things that want to know. */
  favourite() {
    let best = null, top = 0;
    for (const [d, t] of this.dwell) if (t > top) { top = t; best = d; }
    return top > 4 ? best : null;
  }
}
