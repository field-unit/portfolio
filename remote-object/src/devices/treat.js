import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { faceted, extrude, screw, decal, speaker, led } from "../lib/parts.js";
import { label, vents } from "../lib/textures.js";
import { Treatment, TREATMENTS } from "../audio/treatment.js";
import { damp } from "../lib/math.js";

/* K-4 TREATMENT UNIT.
 *
 * The only device here with more than one thing to press, and it has
 * exactly two:
 *
 *   the lever    in or out. Nothing else.
 *   the plunger  throws away whatever it is doing and takes another
 *                two to four effects at random, with random settings.
 *
 * There is no way to choose an effect and no way to get one back. That
 * is the point: you are not configuring a signal chain, you are asking
 * a machine for another opinion and taking what it gives you.
 *
 * It treats the master bus, so everything the object makes goes through
 * it at once -- the archive, the voice, the rotor's weather. And the
 * chain it lands on also changes how the whole scene LOOKS, because the
 * effects declare visual consequences that get summed and handed to the
 * stage. Bit reduction coarsens the picture, drive raises the exposure,
 * a lowpass warms and dims it, ring modulation puts interference across
 * it. A machine that mangles its own audio and leaves its display
 * pristine is two machines.
 *
 * The seven lamps are the only readout. Each one is an effect type, and
 * nothing says which. You learn the mapping by hearing what changed
 * while watching which lamp came on, or you never learn it at all.
 */

const D = 0.52;
const FRONT_Z = D / 2;

const OUTLINE = [
  [-1.16, 1.24],
  [1.20, 1.30],
  [1.14, -0.86],
  [0.66, -1.36],
  [-0.72, -1.32],
  [-1.16, -0.80],
];

export class Treat extends Device {
  constructor(player) {
    super({ code: "K-4", name: "TREATMENT UNIT", mass: 0.9, reach: 0.72 });
    this.player = player;
    this.fx = null;
    this.leverAt = 0;         // 0 out, 1 in
    this.plungeAt = 0;

    const b = this.body;

    const case_ = new THREE.Mesh(extrude(faceted(OUTLINE, 0.18), D, 0.05), MAT.olive);
    case_.castShadow = true;
    case_.renderOrder = 4;
    b.add(case_);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.08), MAT.board);
    board.position.set(0, 0.05, -0.1);
    b.add(board);

    /* --- the lamps ------------------------------------------------ */
    /* One per effect type, in the palette's own order, unlabelled. */
    this.lamps = TREATMENTS.map((name, i) => {
      const x = -0.84 + i * 0.28;
      const l = led(b, x, 0.92, FRONT_Z + 0.01, i % 3 === 1 ? 0xffb545 : 0x7fe0a8, 0.042, 0);
      l.userData.fx = name;
      return l;
    });

    /* --- the lever ------------------------------------------------ */
    const pivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.16, 14), MAT.metalDark);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.set(-0.58, 0.06, FRONT_Z);
    b.add(pivot);

    this.lever = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.66, 0.11), MAT.metal);
    arm.position.y = 0.28;
    this.lever.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), MAT.rubber);
    knob.position.y = 0.6;
    this.lever.add(knob);
    this.lever.position.set(-0.58, 0.06, FRONT_Z + 0.12);
    b.add(this.lever);
    this.lever.traverse((o) => { if (o.isMesh) o.userData.control = "power"; });

    /* --- the plunger ---------------------------------------------- */
    this.plunger = new THREE.Group();
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.16, 22), MAT.rubber);
    cap.rotation.x = Math.PI / 2;
    this.plunger.add(cap);
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 26), MAT.metalDark);
    ridge.position.z = 0.08;
    this.plunger.add(ridge);
    this.plunger.position.set(0.52, 0.02, FRONT_Z + 0.06);
    b.add(this.plunger);
    this.plunger.traverse((o) => { if (o.isMesh) o.userData.control = "generate"; });

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.44, 0.1, 22), MAT.metalDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0.52, 0.02, FRONT_Z - 0.03);
    b.add(collar);

    /* --- the rest ------------------------------------------------- */
    speaker(b, -0.36, -0.72, FRONT_Z + 0.004, 0.66, 0.66, vents(22, 23));

    decal(b, 1.4, 0.26, label(["K-4  TREATMENT"], {
      bg: "#2b2c1c", fg: "#d6d3ae", size: 28, lh: 34, align: "center", w: 512,
    }), 0.08, -1.12, FRONT_Z + 0.006, 0.014);

    screw(b, -0.98, 1.06, FRONT_Z - 0.01, 0.11, 0.5);
    screw(b, 1.02, -0.66, FRONT_Z - 0.01, 0.11, 2.1);

    const rear = decal(b, 1.5, 0.5, label(["NO SETTINGS", "RETAINED"], {
      bg: "#43442e", fg: "#dedaba", size: 24, lh: 30, align: "center", w: 384,
    }), 0, 0.1, -FRONT_Z - 0.008);
    rear.rotation.y = Math.PI;

    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 18), MAT.metal);
    eye.position.set(0.02, 1.42, 0);
    b.add(eye);

    this.claim();
  }

  get anchorY() { return 1.56; }

  ensure() {
    if (this.fx) return this.fx;
    const ctx = this.player.context;
    if (!ctx || !this.player.bus) return null;
    this.fx = new Treatment(ctx, this.player.bus, ctx.destination);
    return this.fx;
  }

  /**
   * A click landed on one of my meshes. Returns true if it was one of
   * the two controls, so the caller knows not to do anything else with
   * it.
   */
  press(object) {
    const which = object && object.userData.control;
    if (!which) return false;
    const fx = this.ensure();
    if (!fx) return true;                 // no audio yet; the press still counts

    if (which === "power") {
      fx.enabled = !fx.enabled;
      this.leverAt = fx.enabled ? 1 : 0;
    } else {
      fx.generate();
      this.plungeAt = 1;
      /* pressing it while it is out switches it in: nobody presses a
         generate button hoping to hear nothing */
      if (!fx.enabled) { fx.enabled = true; this.leverAt = 1; }
    }
    return true;
  }

  /** What the diagnostics say while you are holding it. */
  get readout() {
    if (!this.fx || !this.fx.enabled) return "OUT";
    return this.fx.label;
  }

  /** Handed to the stage so the picture degrades with the sound. */
  get look() { return this.fx ? this.fx.look : null; }

  onKey(key) {
    if (key === "Enter" || key === " ") {
      const fx = this.ensure();
      if (fx) { fx.enabled = !fx.enabled; this.leverAt = fx.enabled ? 1 : 0; }
      return true;
    }
    return false;
  }

  tick(dt) {
    /* the lever swings, the plunger springs back */
    this.lever.rotation.z = damp(this.lever.rotation.z, this.leverAt ? -0.44 : 0.44, 11, dt);
    this.plungeAt = damp(this.plungeAt, 0, 7, dt);
    this.plunger.position.z = (D / 2) + 0.06 - this.plungeAt * 0.1;

    const on = this.fx && this.fx.enabled;
    const set = on ? this.fx.lamps : null;
    for (const l of this.lamps) {
      const lit = on && set.has(l.userData.fx);
      l.material.emissiveIntensity = damp(
        l.material.emissiveIntensity, lit ? 2.8 : 0.05, 6, dt);
    }
  }
}
