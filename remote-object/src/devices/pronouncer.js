import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import {
  faceted, extrude, roundedFrame, screw, nubs, decal, speaker, led,
} from "../lib/parts.js";
import { label, vents } from "../lib/textures.js";
import { Lcd } from "../screen/lcd.js";
import { Voice, toPhonemes, shapeOf } from "../audio/voice.js";
import { damp, clamp } from "../lib/math.js";

/* P-9 PRONOUNCER.
 *
 * You type at it and it says the words out loud, badly.
 *
 * The voice is a formant synthesiser rather than the browser's speech
 * engine, for reasons set out in audio/voice.js. What matters here is
 * what the strip shows: while you are typing it shows your text, and
 * the moment you press return it switches to the phonemes it has
 * decided your text contains, and walks along them as it says them.
 *
 * That is the whole device. It shows its working. When it mispronounces
 * something -- and it will, constantly, because it is reading English
 * spelling with a few dozen rules -- you can see exactly which wrong
 * decision it made, which turns a bug into a disclosure. A machine that
 * reconstructs speech from written evidence and gets it wrong in
 * legible ways is the entire brief in one object.
 *
 * The nubs on the front are not the input. You type on your own
 * keyboard. They do nothing at all, and they are unlabelled, so there
 * is no way to find that out except by pressing them.
 */

const D = 0.42;
const FRONT_Z = D / 2;

const OUTLINE = [
  [-1.02, 2.20],
  [1.06, 2.24],
  [1.02, -1.30],
  [0.62, -2.24],
  [-0.68, -2.20],
  [-1.02, -1.24],
];

const STRIP_W = 108, STRIP_H = 18;      // dots

const MX = 0, MY = 0.28;                // where the mouth is
const MW = 0.5, MH = 0.4;               // its widest and its tallest
const FADER_X = 0.66, FADER_TOP = -0.72, FADER_BOT = -1.62;
const APERTURE = [
  [-0.95, 0.20], [0.98, 0.24], [0.96, -0.22], [-0.93, -0.24],
];

export class Pronouncer extends Device {
  constructor(player, sys = {}) {
    super({ code: "P-9", name: "PRONOUNCER", mass: 0.62, reach: 0.82 });
    this.player = player;
    this.witness = sys.witness;

    this.text = "";
    this.said = "";
    this.phon = [];
    this.speakStart = 0;
    this.speakLen = 0;
    this.voice = null;
    this._nextMutter = 60 + Math.random() * 120;

    const b = this.body;

    const case_ = new THREE.Mesh(extrude(faceted(OUTLINE, 0.16), D, 0.04), MAT.bone);
    case_.castShadow = true;
    case_.renderOrder = 4;
    b.add(case_);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.4, 0.1), MAT.board);
    board.position.set(0, 0.1, -0.06);
    b.add(board);

    /* --- the strip ------------------------------------------------ */
    this.lcd = new Lcd(STRIP_W, STRIP_H, 6);
    this.lcd.power = true;

    const wellShape = faceted(APERTURE, 0.05);
    const well = new THREE.Mesh(
      new THREE.ShapeGeometry(wellShape),
      new THREE.MeshStandardMaterial({ color: 0x080c0b, roughness: 0.96 }),
    );
    well.position.set(0, 1.42, FRONT_Z - 0.06);
    b.add(well);

    this.screenMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: this.lcd.texture,
      emissiveIntensity: 0,
      roughness: 1,
    });
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.78, 1.78 * (STRIP_H / STRIP_W)), this.screenMat);
    strip.position.set(0, 1.42, FRONT_Z - 0.03);
    b.add(strip);

    const frame = faceted([[-1.06, 0.32], [1.08, 0.36], [1.06, -0.34], [-1.04, -0.36]], 0.08);
    frame.holes.push(new THREE.Path(wellShape.getPoints(6).reverse()));
    const bezel = new THREE.Mesh(extrude(frame, 0.12, 0.02), MAT.plasticDark);
    bezel.position.set(0, 1.42, FRONT_Z - 0.02);
    b.add(bezel);

    this.glow = new THREE.PointLight(0xa8d0ac, 0, 3.4, 2);
    this.glow.position.set(0, 1.42, FRONT_Z + 0.9);
    b.add(this.glow);

    /* --- the mouth ------------------------------------------------ *
     * Four blades over the speaker, so what you see inside the opening
     * is the vent it is actually coming out of. A dark shape that grows
     * would read as a hole painted on; plates that slide apart read as
     * a thing that opens.
     *
     * Height and width are driven separately because a mouth has two
     * degrees of freedom and one of them is not amplitude. See
     * shapeOf() in audio/voice.js -- the jaw comes from F1 and the lips
     * from F2, off the same table that is making the sound. */
    speaker(b, MX, MY, FRONT_Z - 0.1, 1.24, 1.24, vents(40, 17));

    const blade = new THREE.MeshStandardMaterial({
      color: 0xa89e80, roughness: 0.72, metalness: 0.06,
    });
    this.jawTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 0.05), blade);
    this.jawBottom = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 0.05), blade);
    this.cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.5, 0.05), blade);
    this.cheekR = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.5, 0.05), blade);
    /* the side blades sit behind the top and bottom, so they overlap
       the way a real iris does rather than intersecting */
    this.cheekL.position.z = this.cheekR.position.z = FRONT_Z - 0.06;
    this.jawTop.position.z = this.jawBottom.position.z = FRONT_Z - 0.03;
    b.add(this.jawTop, this.jawBottom, this.cheekL, this.cheekR);

    const rim = new THREE.Mesh(
      extrude(roundedFrame(1.3, 1.3, 1.16, 1.16, 0.2, 0.16), 0.1, 0.02), MAT.metalDark);
    rim.position.set(MX, MY, FRONT_Z - 0.01);
    b.add(rim);

    this.mouth = 0;            // how open it currently is
    this.spread = 0.4;

    /* --- controls ------------------------------------------------- */
    /* Three nubs that do nothing, and one fader that does. Nothing
       distinguishes them but position. */
    this.nubs = nubs(b, -0.66, -0.78, FRONT_Z + 0.03, 3, 0.31, 12);

    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, FADER_TOP - FADER_BOT + 0.2, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2a2a20, roughness: 0.95 }));
    slot.position.set(FADER_X, (FADER_TOP + FADER_BOT) / 2, FRONT_Z - 0.02);
    b.add(slot);

    this.knob = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.19, 0.16), MAT.plasticDark);
    this.knob.position.set(FADER_X, FADER_TOP, FRONT_Z + 0.06);
    b.add(this.knob);
    this.knob.userData.control = "fader";
    this.volume = 0.85;

    this.lamp = led(b, 0, -0.92, FRONT_Z + 0.02, 0xffb545, 0.05, 0);

    decal(b, 1.36, 0.28, label(["P-9  PRONOUNCER"], {
      bg: "#2a2b24", fg: "#d8d2bc", size: 30, lh: 36, align: "center", w: 512,
    }), 0, -1.94, FRONT_Z + 0.006, -0.012);

    screw(b, -0.82, 2.0, FRONT_Z - 0.01, 0.11, 0.6);
    screw(b, 0.86, -1.96, FRONT_Z - 0.01, 0.11, 2.3);

    const rear = decal(b, 1.4, 0.5, label(["NO INPUT", "FITTED"], {
      bg: "#4a4736", fg: "#ded7c0", size: 24, lh: 30, align: "center", w: 384,
    }), 0, 0.4, -FRONT_Z - 0.008);
    rear.rotation.y = Math.PI;

    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 18), MAT.metal);
    eye.position.set(0.02, 2.36, 0);
    b.add(eye);

    this.claim();
  }

  get anchorY() { return 2.5; }

  /* ---------- speaking ---------- */

  ensureVoice() {
    if (this.voice) return this.voice;
    const ctx = this.player.context;
    if (!ctx) return null;
    this.voice = new Voice(ctx, this.player.bus);
    this.voice.volume = this._vol * 0.95;
    return this.voice;
  }

  speak(text, { rate = 1, pitch = 92, quiet = false } = {}) {
    const v = this.ensureVoice();
    if (!v || !text.trim()) return;
    v.volume = this._vol * (quiet ? 0.4 : 0.95);
    this.phon = toPhonemes(text);
    this.speakLen = v.say(text, { rate, pitch });
    this.speakStart = performance.now() / 1000;
    this.said = text;
    this.lcd.dirty = true;
    if (!quiet) this.witness?.note("spoken");
  }

  get speaking() {
    return this.speakLen > 0 &&
      performance.now() / 1000 - this.speakStart < this.speakLen;
  }

  /* ---------- the fader ---------- */

  set volume(v) {
    this._vol = clamp(v, 0, 1);
    this.knob.position.y = FADER_BOT + this._vol * (FADER_TOP - FADER_BOT);
    if (this.voice) this.voice.volume = this._vol * 0.95;
  }

  get volume() { return this._vol; }

  /**
   * Drag hooks. The hoop uses these for stitching; here they move the
   * fader, and the device decides which by looking at what was actually
   * grabbed rather than the input layer guessing.
   */
  beginDraw(local, object) {
    if (!object || object.userData.control !== "fader") return false;
    this.volume = (local.y - FADER_BOT) / (FADER_TOP - FADER_BOT);
    this.showVol = 2.2;
    return true;
  }

  dragDraw(local) {
    this.volume = (local.y - FADER_BOT) / (FADER_TOP - FADER_BOT);
    this.showVol = 2.2;
  }

  endDraw() { this.showVol = 1.2; }

  get readout() {
    if (this.showVol > 0) return "LEVEL " + Math.round(this._vol * 100);
    return this.speaking ? "SPEAKING" : "TYPE";
  }

  /* ---------- input ---------- */

  onApproach(on) {
    this.open = on;
    this.lcd.dirty = true;
  }

  /**
   * Consumes the keyboard while you are holding it. Returning true stops
   * the key reaching anything else -- which is what makes this feel like
   * a device you are typing INTO rather than a page with a text field.
   */
  onKey(key) {
    if (key === "Enter") {
      this.speak(this.text);
      this.text = "";
      this.lcd.dirty = true;
      return true;
    }
    if (key === "Backspace") {
      this.text = this.text.slice(0, -1);
      this.lcd.dirty = true;
      return true;
    }
    if (key.length === 1 && this.text.length < 90) {
      this.text += key;
      this.lcd.dirty = true;
      return true;
    }
    return false;
  }

  /* ---------- the strip ---------- */

  draw() {
    const g = this.lcd;
    g.clear();
    const cols = Math.floor((STRIP_W - 4) / 6);

    if (this.speaking) {
      /* It shows its working: the phonemes it decided your words
         contained, walking along as it says them. */
      const t = (performance.now() / 1000 - this.speakStart) / this.speakLen;
      const at = Math.min(this.phon.length - 1, Math.floor(t * this.phon.length));
      const start = Math.max(0, at - Math.floor(cols / 6));
      let x = 2;
      for (let i = start; i < this.phon.length && x < STRIP_W - 2; i++) {
        const s = this.phon[i] === "_" ? "/" : this.phon[i];
        const end = g.text(x, 5, s, 1);
        if (i === at) g.invert(x - 1, 3, end - x + 3, 11);
        x = end + 5;
      }
    } else if (this.open) {
      const shown = this.text.slice(-cols).toUpperCase();
      g.text(2, 5, shown);
      /* a block cursor that blinks at the wrong rate */
      if ((performance.now() / 620) % 2 < 1) {
        g.fill(2 + shown.length * 6, 4, 4, 9, 1);
      }
    } else if (this.said) {
      g.text(2, 5, Lcd.ellipsis(this.said.toUpperCase(), STRIP_W - 6), 2);
    } else {
      g.text(2, 5, "P-9", 2);
    }
  }

  tick(dt, camera, ctx) {
    const att = ctx && ctx.attention;

    /* --- the mouth ------------------------------------------------ */
    let openTo = 0, wideTo = 0.35;
    if (this.speaking && this.phon.length) {
      const t = (performance.now() / 1000 - this.speakStart) / this.speakLen;
      const at = clamp(Math.floor(t * this.phon.length), 0, this.phon.length - 1);
      const sh = shapeOf(this.phon[at]);
      openTo = sh.open;
      wideTo = sh.wide;
    }
    /* opens fast and closes slower, which is what a jaw does */
    this.mouth = damp(this.mouth, openTo, openTo > this.mouth ? 26 : 15, dt);
    this.spread = damp(this.spread, wideTo, 14, dt);

    const h = 0.03 + this.mouth * MH;
    const w = 0.14 + this.spread * MW;
    this.jawTop.position.y = MY + h + 0.36;
    this.jawBottom.position.y = MY - h - 0.36;
    this.jawTop.position.x = this.jawBottom.position.x = MX;
    this.cheekL.position.x = MX - w - 0.36;
    this.cheekR.position.x = MX + w + 0.36;
    this.cheekL.position.y = this.cheekR.position.y = MY;

    if (this.showVol > 0) this.showVol -= dt;

    /* the panel has to repaint while anything on it is moving */
    if (this.speaking || this.open) this.lcd.dirty = true;
    if (this.lcd.dirty) this.draw();
    this.lcd.tick(dt);

    const want = this.approach > 0.2 ? 1 : this.speaking ? 0.8 : 0.4;
    this.lcd.backlight = damp(this.lcd.backlight, want, 5, dt);
    this.screenMat.emissiveIntensity = this.lcd.backlight * 1.6;
    this.glow.intensity = this.lcd.backlight * 0.9;
    this.lamp.material.emissiveIntensity = this.speaking ? 2.6 : 0;

    /* Left alone long enough, it says the last thing you gave it back
       to you, quietly, at a lower pitch. Nothing announces this and it
       does not repeat often. It is the single most unpleasant thing in
       the build and it costs eight lines. */
    if (att && this.said && !this.speaking) {
      this._nextMutter -= dt * (0.2 + att.unrest * 2.6);
      if (this._nextMutter <= 0) {
        this._nextMutter = 90 + Math.random() * 180;
        if (att.unrest > 0.5) this.speak(this.said, { rate: 0.8, pitch: 64, quiet: true });
      }
    }
  }
}
