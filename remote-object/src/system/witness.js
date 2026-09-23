/* What the object retains about having been found.
 *
 * Local only. Nothing is sent anywhere, nothing is read that the visitor
 * did not do inside this page, and there is no attempt to learn anything
 * true about the person -- the brief rules that out and it would be a
 * cheap effect anyway. This is only the object's record of its own
 * encounters, which is a much better one, because the visitor cannot
 * tell from the inside how far it goes.
 *
 * REGISTER
 *
 * Everything this produces is stated flatly and without comment.
 * "PREVIOUS SESSION 4M12S" is worse than "I REMEMBER YOU", because a
 * machine that is trying to unsettle you is a machine you can dismiss,
 * and a machine that is merely keeping records is not. Nothing here
 * should ever sound pleased with itself.
 */

const KEY = "remote-object.witness.v1";

const BLANK = {
  visits: 0,
  first: 0,
  total: 0,          // seconds across every visit
  last: 0,           // length of the previous session
  played: {},        // code -> times opened
  turned: {},        // code -> times selected and left unplayed
  refused: 0,        // tried to operate something facing away
  averted: 0,        // times it broke off looking at you
  away: 0,           // seconds spent in another tab, cumulative
  marks: 0,          // wear it has picked up, one per visit
  seen: {},          // things it has shown you once and need not repeat
};

export class Witness {
  constructor() {
    this.data = { ...BLANK, ...load() };
    this.session = 0;
    this._save = 0;

    /* How long it has been on its own, worked out at load rather than
       in begin(), because the entry sequence reads it before begin()
       has run and would otherwise always report nought. */
    this._gap = this.data.lastAt
      ? Math.max(0, Math.round((Date.now() - this.data.lastAt) / 1000))
      : 0;

    /* Written on the way out as well as periodically -- a visit that
       ends in a closed tab still has to count. */
    addEventListener("pagehide", () => this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.flush();
    });
  }

  /** Called once the route is open, not on page load. */
  begin() {
    const now = Date.now();
    this.data.last = Math.round(this.data.session || 0);
    this.data.gap = this._gap;
    this.data.lastAt = now;
    this.data.visits += 1;
    this.data.marks = Math.min(24, this.data.marks + 1);
    if (!this.data.first) this.data.first = now;
    this.flush();
  }

  /** Seconds between the end of the last visit and the start of this. */
  get gap() { return this._gap; }

  get visits() { return this.data.visits; }
  get marks() { return this.data.marks; }
  get returning() { return this.data.visits > 1; }

  /** Seconds of the previous visit, 0 if there wasn't one. */
  get previous() { return this.data.last | 0; }

  note(key, n = 1) {
    if (typeof this.data[key] === "number") this.data[key] += n;
  }

  count(bucket, code) {
    const b = this.data[bucket];
    if (!b) return;
    b[code] = (b[code] | 0) + 1;
  }

  played(code) { return this.data.played[code] | 0; }
  turned(code) { return this.data.turned[code] | 0; }

  /** True the first time only; used for things that should not repeat. */
  once(tag) {
    if (this.data.seen[tag]) return false;
    this.data.seen[tag] = 1;
    this.flush();
    return true;
  }

  tick(dt) {
    this.session += dt;
    this.data.session = this.session;
    this.data.total += dt;
    this._save += dt;
    if (this._save > 12) { this._save = 0; this.flush(); }
  }

  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch { /* private window: it forgets, which is its own kind of sad */ }
  }

  /** Wipe. Offered because a thing that cannot be forgotten is a trap. */
  forget() {
    this.data = { ...BLANK };
    this.session = 0;
    try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  }
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}

/** m:ss, or "Nh" once a total gets embarrassing. */
export function span(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + "S";
  if (sec < 3600) return Math.floor(sec / 60) + "M" + String(sec % 60).padStart(2, "0") + "S";
  return Math.floor(sec / 3600) + "H" + String(Math.floor((sec % 3600) / 60)).padStart(2, "0") + "M";
}
