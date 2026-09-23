import * as THREE from "three";
import { glyph, CW, CH, ADV, LH, measure } from "./font.js";

/* A dot-matrix panel.
 *
 * A real framebuffer, not text drawn on a canvas: every dot is blitted
 * as a square with a gap around it. Doing it properly costs almost
 * nothing and buys the two things that actually sell a cheap LCD --
 * you cannot draw a curve the grid does not allow, and dots that
 * switch off fade instead of vanishing.
 *
 * The panel refreshes at 12Hz whether or not the scene is running at
 * 144. Displays of this kind were slow, and matching that is free
 * performance as well as free authenticity.
 *
 * Dimensions are per instance. The Receiver has a 176x112 panel; the
 * Pronouncer has a single-line strip. They are the same part number as
 * far as this file is concerned.
 */

const W = 176;
const H = 112;
const SCALE = 4;

const OFF_R = 0xa5, OFF_G = 0xb6, OFF_B = 0x9b;   // backlight through glass
const ON_R = 0x27, ON_G = 0x34, ON_B = 0x28;      // an energised dot
const GHOST = 0.42;                               // what a dying dot keeps

export class Lcd {
  constructor(w = W, h = H, scale = SCALE) {
    this.w = w;
    this.h = h;
    this.scale = scale;
    this.buf = new Uint8Array(w * h);
    this.prev = new Uint8Array(w * h);
    this.dirty = true;
    this.power = false;
    this.backlight = 0;

    this.dots = document.createElement("canvas");
    this.dots.width = w;
    this.dots.height = h;
    this.dctx = this.dots.getContext("2d", { willReadFrequently: true });
    this.image = this.dctx.createImageData(w, h);

    this.canvas = document.createElement("canvas");
    this.canvas.width = w * scale;
    this.canvas.height = h * scale;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.grid = makeGrid(w, h, scale);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;

    this._acc = 0;
  }

  /* ---------- drawing ---------- */

  clear(v = 0) {
    this.buf.fill(v & 1);
    this.dirty = true;
  }

  /** v: 0 off, 1 on, 2 = 50% checker (used for anything unresolved). */
  px(x, y, v = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (v === 2) v = (x + y) & 1 ? 1 : 0;
    this.buf[y * this.w + x] = v;
  }

  hline(x, y, len, v = 1) { for (let i = 0; i < len; i++) this.px(x + i, y, v); this.dirty = true; }
  vline(x, y, len, v = 1) { for (let i = 0; i < len; i++) this.px(x, y + i, v); this.dirty = true; }

  fill(x, y, w, h, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, v);
    this.dirty = true;
  }

  rect(x, y, w, h, v = 1) {
    this.hline(x, y, w, v);
    this.hline(x, y + h - 1, w, v);
    this.vline(x, y, h, v);
    this.vline(x + w - 1, y, h, v);
  }

  /** Swap on and off inside a box -- how this era showed a selection. */
  invert(x, y, w, h) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i, py = y + j;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const k = py * this.w + px;
        this.buf[k] = this.buf[k] ? 0 : 1;
      }
    }
    this.dirty = true;
  }

  /**
   * Dirt on the panel, driven by how much the object is attending to
   * you -- so that concentration and degradation are the same gesture,
   * with no line of text anywhere saying so.
   */
  speckle(amount) {
    if (amount <= 0) return;
    const n = Math.round(amount * 260);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * this.w) | 0;
      const y = (Math.random() * this.h) | 0;
      this.buf[y * this.w + x] ^= 1;
    }
    if (n) this.dirty = true;
  }

  /**
   * Something the hardware cannot do.
   *
   * Drawn straight onto the output canvas after the dots are blitted,
   * so it is not constrained by the one-bit grid underneath: smooth
   * gradients, real curves, anti-aliased edges. Pass null to stop.
   */
  intrude(fn) {
    this._intruder = fn;
    this.dirty = true;
  }

  text(x, y, str, v = 1) {
    let cx = x;
    for (const ch of String(str)) {
      const cols = glyph(ch);
      for (let i = 0; i < CW; i++) {
        const bits = cols[i];
        if (bits) for (let j = 0; j < CH; j++) if (bits & (1 << j)) this.px(cx + i, y + j, v);
      }
      cx += ADV;
    }
    this.dirty = true;
    return cx - 1;
  }

  textRight(right, y, str, v = 1) { return this.text(right - measure(str), y, str, v); }
  textCentre(cx, y, str, v = 1) { return this.text(Math.round(cx - measure(str) / 2), y, str, v); }

  /** Cut a string to fit `dots` across, with a trailing dot if clipped. */
  static ellipsis(str, dots) {
    const max = Math.floor((dots + 1) / ADV);
    return str.length <= max ? str : str.slice(0, Math.max(0, max - 1)) + ".";
  }

  /* ---------- output ---------- */

  /** Called every frame; only actually redraws at panel refresh rate. */
  tick(dt) {
    this._acc += dt;
    if (this._acc < 1 / 12) return;
    this._acc = 0;
    if (this.dirty) this.commit();
  }

  commit() {
    const d = this.image.data;
    const lit = this.power ? 1 : 0;
    let ghosting = false;

    for (let i = 0, p = 0; i < this.buf.length; i++, p += 4) {
      const now = this.buf[i];
      let a = now;
      /* a dot that has just switched off keeps some charge for one
         refresh, which is what gives a slow panel its smear */
      if (!now && this.prev[i]) { a = GHOST; ghosting = true; }

      if (!lit) {
        d[p] = 0x4c; d[p + 1] = 0x53; d[p + 2] = 0x49;
        d[p + 3] = 255;
        continue;
      }
      d[p] = OFF_R + (ON_R - OFF_R) * a;
      d[p + 1] = OFF_G + (ON_G - OFF_G) * a;
      d[p + 2] = OFF_B + (ON_B - OFF_B) * a;
      d[p + 3] = 255;
    }
    this.prev.set(this.buf);

    this.dctx.putImageData(this.image, 0, 0);

    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.dots, 0, 0, this.canvas.width, this.canvas.height);

    /* the gaps between dots */
    c.globalAlpha = this.power ? 0.22 : 0.1;
    c.drawImage(this.grid, 0, 0);
    c.globalAlpha = 1;

    if (this.power) {
      /* One LED, bottom left, behind the glass. Cheap panels were never
         evenly lit and the corner furthest from the lamp always went
         grey, so this is a gradient rather than a flat wash. */
      const g = c.createRadialGradient(
        this.canvas.width * 0.16, this.canvas.height * 0.94, 0,
        this.canvas.width * 0.16, this.canvas.height * 0.94, this.canvas.width * 1.05);
      g.addColorStop(0, "rgba(214,236,196,.34)");
      g.addColorStop(0.5, "rgba(180,206,168,.10)");
      g.addColorStop(1, "rgba(40,58,44,.22)");
      c.fillStyle = g;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this._intruder) {
      c.save();
      this._intruder(c, this.canvas.width, this.canvas.height);
      c.restore();
      this.dirty = true;      // whatever it is, it is moving
    }

    this.texture.needsUpdate = true;
    /* If anything smeared this refresh it has to be redrawn once more to
       let the charge drain. Without this the ghost of the previous
       screen is the last thing committed on a static page, and it stays
       burned across the display until something else changes. */
    this.dirty = ghosting;
  }
}

/** Dot separation, baked once into a transparent overlay. */
function makeGrid(w, h, scale) {
  const g = document.createElement("canvas");
  g.width = w * scale;
  g.height = h * scale;
  const c = g.getContext("2d");
  c.fillStyle = "rgba(38,48,40,1)";
  for (let x = 0; x < g.width; x += scale) c.fillRect(x, 0, 1, g.height);
  for (let y = 0; y < g.height; y += scale) c.fillRect(0, y, g.width, 1);
  return g;
}

export { W as LCD_W, H as LCD_H, LH, ADV };
