import { Lcd, LCD_W, LCD_H } from "./lcd.js";
import { GLYPH, ADV } from "./font.js";
import {
  CATALOGUE, INTRUDER, ATTACHED, UNRESOLVED, REMOVED,
  playable, openedCount, noteOpened,
} from "../data/catalogue.js";
import { clock, clamp } from "../lib/math.js";
import { span } from "../system/witness.js";

/* The firmware.
 *
 * Menus are lists, lists invert to show a selection, and BACK always
 * gets you out. That part is deliberately ordinary -- the strangeness
 * belongs to reaching the device and to what the device turns out to
 * know, not to operating it. Weird to find, plain to use.
 *
 * What is not ordinary: the panel degrades in proportion to how much
 * the object is attending to you, the archive gains an entry above its
 * own first entry partway through a visit, and the display occasionally
 * renders something its framebuffer cannot hold.
 */

const HEAD_Y = 2;
const RULE_Y = 12;
const BODY_Y = 16;
const FOOT_RULE = LCD_H - 12;
const FOOT_Y = LCD_H - 9;
const ROW = 10;
const ROWS = 7;

const LOGO = [
  "...#####...",
  ".##.....##.",
  ".#...#...#.",
  "#....#....#",
  "#....#....#",
  "###########",
  "#....#....#",
  "#....#....#",
  ".#...#...#.",
  ".##.....##.",
  "...#####...",
];

export class Shell {
  constructor(player, sys = {}) {
    this.lcd = new Lcd();
    this.player = player;
    this.witness = sys.witness;
    this.attention = sys.attention;
    this.local = sys.local || null;

    this.lcd.power = true;
    this.view = "standby";
    this.sel = 0;
    this.top = 0;
    this.menuSel = 0;
    this.t = 0;
    this.bootAt = 0;
    this.flash = "";
    this.flashUntil = 0;
    this.awake = false;

    this.filed = false;      // has object 000 been added to the archive
    this._eye = 0;           // seconds left of the intrusion
    this._nextEye = 40 + Math.random() * 90;

    this.player.onEnded = () => this.advance();
    this.player.onChange = () => { this.lcd.dirty = true; };
  }

  /** The archive as the device currently understands it. */
  get list() {
    const base = this.filed ? [INTRUDER, ...CATALOGUE] : CATALOGUE;
    const mine = this.local ? this.local.objects : null;
    return mine && mine.length ? base.concat(mine) : base;
  }

  /* ---------- power ---------- */

  wake() {
    if (this.awake) return;
    this.awake = true;
    this.lcd.power = true;
    this.view = "boot";
    this.bootAt = this.t;
  }

  release() { this.view = "standby"; }

  resume() {
    if (!this.awake) { this.wake(); return; }
    this.view = this.lastView || "menu";
  }

  /* ---------- input ---------- */

  up() { this.move(-1); }
  down() { this.move(1); }

  move(d) {
    switch (this.view) {
      case "menu":
        this.menuSel = (this.menuSel + d + MENU.length) % MENU.length;
        break;
      case "library": {
        const n = this.list.length;
        this.sel = (this.sel + d + n) % n;
        if (this.sel < this.top) this.top = this.sel;
        if (this.sel > this.top + ROWS - 1) this.top = this.sel - ROWS + 1;
        this.top = clamp(this.top, 0, Math.max(0, n - ROWS));
        break;
      }
      case "play":
        this.player.seekBy(d * 5);
        break;
      default:
        break;
    }
    this.lcd.dirty = true;
  }

  enter() {
    switch (this.view) {
      case "boot":
        this.view = "menu";
        break;

      case "menu": {
        const item = MENU[this.menuSel];
        if (item.go === "library") { this.view = "library"; this.syncToPlaying(); }
        else this.view = item.go;
        break;
      }

      case "library": {
        const o = this.list[this.sel];
        if (!o) break;
        if (o.intruder) {
          /* It opens. It is a record like any other, it is simply a
             record of you, and it is filed in the same drawer. */
          this.metaOf = o;
          this.view = "meta";
        } else if (playable(o)) {
          this.open(o);
        } else if (o.status === REMOVED) {
          this.say("OBJECT RETURNED");
        } else {
          this.witness?.count("turned", o.code);
          this.say(this.refusal(o));
        }
        break;
      }

      case "play":
        this.player.toggle();
        break;

      case "meta":
        this.view = this.player.object ? "play" : "library";
        break;

      default:
        this.view = "menu";
    }
    this.lcd.dirty = true;
  }

  /**
   * Why an object will not open.
   *
   * The first two times it is a failure. After you have been turned
   * away from the same object enough times it stops being a failure and
   * becomes a decision, and it never goes back to being a failure.
   */
  refusal(o) {
    const n = this.witness?.turned(o.code) ?? 0;
    if (n >= 4) return "NOT FOR YOU";
    if (n >= 2) return "STILL NO";
    return "CANNOT RESOLVE " + o.code;
  }

  inspect() {
    if (this.view === "library" || this.view === "play") {
      this.metaOf = this.view === "play" ? this.player.object : this.list[this.sel];
      if (this.metaOf) { this.view = "meta"; this.lcd.dirty = true; }
    }
  }

  back() {
    switch (this.view) {
      case "meta": this.view = this.player.object ? "play" : "library"; break;
      case "play": this.view = "library"; break;
      case "library":
      case "search":
      case "history":
      case "about": this.view = "menu"; break;
      default: return false;
    }
    this.lcd.dirty = true;
    return true;
  }

  /* ---------- playback ---------- */

  open(o) {
    this.player.load(o);
    this.player.play();
    noteOpened(o.code);
    this.witness?.count("played", o.code);
    this.view = "play";
    this.lcd.dirty = true;
  }

  advance() {
    const cur = this.player.object;
    const list = this.list;
    const i = list.indexOf(cur);
    for (let k = 1; k <= list.length; k++) {
      const o = list[(i + k + list.length) % list.length];
      if (playable(o)) { this.open(o); return; }
    }
  }

  syncToPlaying() {
    const i = this.list.indexOf(this.player.object);
    if (i >= 0) {
      this.sel = i;
      this.top = clamp(i - 2, 0, Math.max(0, this.list.length - ROWS));
    }
  }

  say(msg) {
    this.flash = msg;
    this.flashUntil = this.t + 1.8;
    this.lcd.dirty = true;
  }

  get wheelMeaning() {
    if (this.view === "play") return "SEEK";
    if (this.view === "library") return "OBJECTS";
    if (this.view === "menu") return "MENU";
    return "";
  }

  /* ---------- the parts that are awake ---------- */

  /**
   * File object 000.
   *
   * Deliberately timed to land while the archive is on screen, so that
   * the list grows under you rather than having quietly grown before
   * you got there. The selection is nudged down by one at the same
   * moment so that you stay on whatever you were reading -- it has to
   * be unambiguous that the LIST changed and not your cursor.
   */
  file() {
    if (this.filed) return;
    this.filed = true;
    if (this.view === "library") { this.sel += 1; this.top += 1; }
    this.lcd.dirty = true;
  }

  dueToFile() {
    if (this.filed || !this.witness) return false;
    if (this.view !== "library") return false;
    return this.witness.returning || this.witness.session > 40;
  }

  /**
   * The panel renders an eye.
   *
   * Smooth, gradient-shaded, far beyond what a 176x112 one-bit display
   * can express -- which is the point. It is drawn over the dots rather
   * than into them, so for a few seconds the Receiver is showing
   * something its own hardware cannot produce, and then it stops and
   * goes back to being a cheap LCD with no acknowledgement.
   *
   * It looks wherever the unlabelled device is looking. The two objects
   * hang on the same ring.
   */
  openEye(att) {
    this._eye = 3.2;
    this.lcd.intrude((c, w, h) => {
      const k = clamp(this._eye / 3.2, 0, 1);
      const open = Math.sin(clamp((1 - k) * 3.4, 0, Math.PI));
      if (open <= 0.01) return;

      const cx = w / 2 + (att ? att.x : 0) * w * 0.16;
      const cy = h / 2 - (att ? att.y : 0) * h * 0.16;
      const r = h * 0.34 * open;

      c.globalCompositeOperation = "multiply";
      const g = c.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
      g.addColorStop(0, "rgba(6,12,8,.96)");
      g.addColorStop(0.34, "rgba(20,34,24,.72)");
      g.addColorStop(0.72, "rgba(96,120,98,.28)");
      g.addColorStop(1, "rgba(160,182,150,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy, r, r * (0.42 + open * 0.5), 0, 0, Math.PI * 2);
      c.fill();
    });
  }

  /* ---------- frame ---------- */

  tick(dt) {
    this.t += dt;
    const att = this.attention;

    if (this.view === "boot" && this.t - this.bootAt > 2.3) {
      this.view = "menu";
      this.lcd.dirty = true;
    }
    if (this.flash && this.t > this.flashUntil) {
      this.flash = "";
      this.lcd.dirty = true;
    }

    if (this.dueToFile()) this.file();

    /* the intrusion */
    if (this._eye > 0) {
      this._eye -= dt;
      if (this._eye <= 0) this.lcd.intrude(null);
    } else if (att && this.awake) {
      this._nextEye -= dt * (0.2 + att.regard * 2.4);
      if (this._nextEye <= 0 && att.regard > 0.72) {
        this._nextEye = 90 + Math.random() * 150;
        this.openEye(att);
      }
    }

    if (this.view === "play" || this.view === "boot" ||
       (this.view === "standby" && this.player.playing)) this.lcd.dirty = true;
    /* while it is attending to you the panel is never clean, so it is
       never static either */
    if (att && att.regard > 0.3) this.lcd.dirty = true;

    if (this.lcd.dirty) this.draw();
    this.lcd.tick(dt);
    if (this.view !== "standby" && this.view !== "off") this.lastView = this.view;
  }

  draw() {
    const g = this.lcd;
    g.clear();
    switch (this.view) {
      case "boot": this.drawBoot(g); break;
      case "menu": this.drawMenu(g); break;
      case "library": this.drawLibrary(g); break;
      case "play": this.drawPlay(g); break;
      case "meta": this.drawMeta(g); break;
      case "search": this.drawSearch(g); break;
      case "history": this.drawHistory(g); break;
      case "about": this.drawAbout(g); break;
      case "standby": this.drawStandby(g); break;
      default: break;
    }
    if (this.flash) {
      g.fill(0, FOOT_RULE - 1, LCD_W, 13, 0);
      g.hline(2, FOOT_RULE - 1, LCD_W - 4, 1);
      g.text(4, FOOT_Y, Lcd.ellipsis(this.flash, LCD_W - 8));
    }
    const att = this.attention;
    if (att) g.speckle(Math.max(0, att.regard - 0.28) * 0.22);
  }

  head(g, left, right) {
    g.text(4, HEAD_Y, left);
    if (right) g.textRight(LCD_W - 4, HEAD_Y, right);
    g.hline(2, RULE_Y, LCD_W - 4);
  }

  foot(g, left, right) {
    g.hline(2, FOOT_RULE, LCD_W - 4);
    if (left) g.text(4, FOOT_Y, left);
    if (right) g.textRight(LCD_W - 4, FOOT_Y, right);
  }

  status() { return GLYPH.SIG + " " + GLYPH.BATT; }

  drawBoot(g) {
    const x0 = (LCD_W >> 1) - 5;
    for (let y = 0; y < LOGO.length; y++) {
      for (let x = 0; x < 11; x++) if (LOGO[y][x] === "#") g.px(x0 + x, 12 + y, 1);
    }
    g.textCentre(LCD_W / 2, 30, "REMOTE OBJECT");

    const w = this.witness;
    /* It counts. It does not remark on the count. */
    if (w && w.visits > 1) {
      g.textCentre(LCD_W / 2, 42, "SESSION " + String(w.visits).padStart(2, "0"));
      g.textCentre(LCD_W / 2, 52, "PREVIOUS " + span(w.previous), 2);
    } else {
      g.textCentre(LCD_W / 2, 42, this.list.length + " OBJECTS");
    }

    const p = Math.min(1, (this.t - this.bootAt) / 1.9);
    const bw = 96, x = (LCD_W - bw) >> 1;
    g.rect(x, 70, bw, 7);
    g.fill(x + 2, 72, Math.round((bw - 4) * p), 3);
    if (p >= 1) g.textCentre(LCD_W / 2, 90, w && w.visits > 2 ? "EXPECTED" : "READY");
  }

  drawMenu(g) {
    this.head(g, "REMOTE OBJECT", this.status());
    MENU.forEach((item, i) => {
      const y = BODY_Y + i * ROW;
      g.text(8, y + 1, item.label);
      if (i === this.menuSel) {
        g.text(2, y + 1, GLYPH.CARET);
        g.invert(0, y - 1, LCD_W, ROW);
      }
    });
    const n = this.list.filter(playable).length;
    this.foot(g, n + " ATTACHED", this.list.length + " LISTED");
  }

  drawLibrary(g) {
    const list = this.list;
    this.head(g, "OBJECTS (" + list.length + ")", this.status());
    for (let r = 0; r < ROWS; r++) {
      const i = this.top + r;
      if (i >= list.length) break;
      const o = list[i];
      const y = BODY_Y + r * ROW - 3;
      const dim = playable(o) ? 1 : 2;

      g.text(4, y, o.code, dim);
      g.text(4 + 4 * ADV, y, Lcd.ellipsis(o.title, 108), dim);

      if (o.intruder) g.textRight(LCD_W - 3, y, GLYPH.MARK, 1);
      else if (o.status === UNRESOLVED) g.textRight(LCD_W - 3, y, GLYPH.UNRES, 2);
      if (o.status === REMOVED) g.hline(4, y + 3, LCD_W - 8, 2);
      if (o === this.player.object && this.player.playing) {
        g.textRight(LCD_W - 3, y, GLYPH.PLAY, 1);
      }
      if (i === this.sel) g.invert(0, y - 2, LCD_W, ROW);
    }
    const track = FOOT_RULE - RULE_Y - 6;
    const h = Math.max(6, Math.round((track * ROWS) / list.length));
    const y = RULE_Y + 3 +
      Math.round((track - h) * (this.top / Math.max(1, list.length - ROWS)));
    g.vline(LCD_W - 1, RULE_Y + 3, track, 2);
    g.fill(LCD_W - 2, y, 2, h, 1);
  }

  drawPlay(g) {
    const p = this.player;
    const o = p.object;
    if (!o) { this.view = "library"; return; }

    const i = this.list.indexOf(o) + 1;
    this.head(g, i + " / " + this.list.length, this.status());

    const icon = p.loading ? GLYPH.UNRES : p.playing ? GLYPH.PLAY : GLYPH.PAUSE;
    g.text(5, 18, icon);
    g.text(16, 18, Lcd.ellipsis(o.title, LCD_W - 22));
    g.text(16, 28, Lcd.ellipsis(o.origin, LCD_W - 22));

    const d = p.duration;
    const frac = isFinite(d) && d > 0 ? p.time / d : 0;
    g.text(5, 42, clock(p.time));
    g.textRight(LCD_W - 5, 42, clock(d));
    const bx = 38, bw = LCD_W - 76;
    g.hline(bx, 45, bw, 2);
    g.fill(bx, 44, Math.round(bw * frac), 3, 1);
    g.fill(bx + Math.round(bw * frac) - 1, 42, 2, 7, 1);

    const bins = p.sample();
    const wy = 55, wh = 34, mid = wy + (wh >> 1);
    for (let k = 0; k < bins.length; k++) {
      const a = Math.max(1, Math.round(bins[k] * (wh / 2)));
      g.vline(Math.round(6 + k * 2.75), mid - a, a * 2, 1);
    }
    g.hline(2, wy + wh + 2, LCD_W - 4, 2);

    /* The one place it says out loud that somebody is here, and it says
       it as a hardware status line next to the sample rate. */
    const att = this.attention;
    const watched = att && att.regard > 0.66;
    this.foot(g, watched ? "OBSERVED" : "44.1 KHZ",
      p.error ? "READ ERROR" : "LOCAL COPY: NO");
  }

  drawMeta(g) {
    const o = this.metaOf || this.player.object;
    if (!o) { this.view = "library"; return; }
    this.head(g, "OBJECT " + o.code, "");

    const rows = o.intruder ? this.selfRows() : [
      ["title", o.title],
      ["origin", o.origin],
      ["received", o.received],
      ["length", o === this.player.object ? clock(this.player.duration) : "--:--"],
      ["opened", openedCount(o.code) + " times"],
      ["type", o.type],
      ["relations", String(o.relations).padStart(2, "0")],
    ];
    rows.forEach(([k, v], i) => {
      const y = BODY_Y + i * ROW - 4;
      g.text(4, y, k, 2);
      g.text(62, y, Lcd.ellipsis(String(v), LCD_W - 66));
    });
    this.foot(g, "", o.intruder ? "HELD LOCALLY" : "MORE...");
  }

  /** Object 000's metadata: the same seven fields, about you. */
  selfRows() {
    const w = this.witness;
    const att = this.attention;
    if (!w) return [["status", "no record"]];
    const played = Object.values(w.data.played).reduce((a, b) => a + b, 0);
    return [
      ["origin", "THIS CLIENT"],
      ["sessions", String(w.visits).padStart(2, "0")],
      ["present", span(w.session)],
      ["total", span(w.data.total)],
      ["opened", played + " objects"],
      ["turned", Object.keys(w.data.turned).length + " away"],
      ["regard", att ? Math.round(att.regard * 100) + "%" : "--"],
    ];
  }

  drawSearch(g) {
    this.head(g, "SEARCH", this.status());
    g.text(6, 30, "NO INDEX");
    g.text(6, 42, "THE ARCHIVE IS SMALL", 2);
    g.text(6, 52, "ENOUGH TO READ.", 2);
    const w = this.witness;
    if (w && w.visits > 3) g.text(6, 72, "YOU HAVE READ IT.", 2);
    this.foot(g, "BACK", "");
  }

  drawHistory(g) {
    this.head(g, "HISTORY", this.status());
    const seen = CATALOGUE
      .map((o) => [o, openedCount(o.code)])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, ROWS);
    if (!seen.length) {
      g.text(6, 34, "NOTHING OPENED YET", 2);
    } else {
      seen.forEach(([o, n], i) => {
        const y = BODY_Y + i * ROW - 3;
        g.text(4, y, o.code, 2);
        g.text(4 + 4 * ADV, y, Lcd.ellipsis(o.title, 96));
        g.textRight(LCD_W - 3, y, String(n).padStart(2, "0"), 2);
      });
    }
    this.foot(g, "ON THIS CLIENT ONLY", "");
  }

  drawAbout(g) {
    this.head(g, "?", "");
    const w = this.witness;
    const lines = [
      "REMOTE OBJECT",
      "",
      "OBJECTS TRAVEL FURTHER",
      "THAN PEOPLE DO.",
      "",
      "SOME THINGS SHOULD NOT",
      "BE EASY TO FIND.",
    ];
    /* One extra line, only for somebody who has come back more than
       once, and never explained. */
    if (w && w.visits > 2) { lines[4] = "YOU FOUND IT."; }
    lines.forEach((s, i) => g.text(5, BODY_Y + i * ROW - 5, s, i === 0 || i === 4 ? 1 : 2));
    this.foot(g, "RO-404", "EST. 2001");
  }

  drawStandby(g) {
    const p = this.player;
    const att = this.attention;

    if (p.object && p.playing) {
      g.text(3, 6, GLYPH.PLAY);
      g.text(14, 6, Lcd.ellipsis(p.object.title, LCD_W - 20));
      g.text(14, 18, clock(p.time) + " / " + clock(p.duration), 2);

      const d = p.duration;
      const frac = isFinite(d) && d > 0 ? p.time / d : 0;
      g.hline(3, 32, LCD_W - 6, 2);
      g.fill(3, 31, Math.round((LCD_W - 6) * frac), 3, 1);

      const bins = p.sample();
      for (let k = 0; k < bins.length; k++) {
        const a = Math.max(1, Math.round(bins[k] * 20));
        g.vline(4 + Math.round(k * 2.9), 62 - a, a * 2, 1);
      }
      g.hline(2, 92, LCD_W - 4, 2);
      g.text(4, 98, att && att.regard > 0.7 ? "STILL HERE" : "STILL RECEIVING", 2);
    } else {
      const x0 = (LCD_W >> 1) - 5;
      for (let y = 0; y < LOGO.length; y++) {
        for (let x = 0; x < 11; x++) if (LOGO[y][x] === "#") g.px(x0 + x, 30 + y, 2);
      }
      g.textCentre(LCD_W / 2, 52, "REMOTE OBJECT", 2);
      /* left alone long enough, the idle screen stops being idle */
      if (att && att.unrest > 0.55) {
        g.textCentre(LCD_W / 2, 68, "WAITING", 2);
      } else if ((this.t * 1.4) % 2 < 1) {
        g.textCentre(LCD_W / 2, 68, GLYPH.BLOCK, 1);
      }
    }
  }
}

const MENU = [
  { label: "RECEIVE", go: "library" },
  { label: "SEARCH", go: "search" },
  { label: "HISTORY", go: "history" },
  { label: "?", go: "about" },
];
