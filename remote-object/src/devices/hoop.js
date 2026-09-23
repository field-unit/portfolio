import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { reuleaux, extrude, decal, screw } from "../lib/parts.js";
import { label, weave } from "../lib/textures.js";
import { Stitching, THREADS } from "../core/patch.js";
import { TAU } from "../lib/math.js";

/* S-7 SAMPLER.
 *
 * A hoop with cloth stretched in it, a spool, and a cutter.
 *
 * `Sampler` is the name a machine reconstructing this equipment from
 * incomplete evidence would land on, and it would not notice that the
 * word means two entirely different things depending on which trade you
 * took it from. It is on the same ring as an audio archive. Nothing
 * anywhere says which sense is meant.
 *
 * HOW YOU WORK IT
 *
 * One drag is one stitch. The needle goes in where you press and comes
 * out where you let go, and a taut length of thread appears between the
 * two. You cannot draw a curve, because you cannot draw a curve with one
 * pass of a needle -- and refusing to let you is exactly what makes this
 * read as embroidery instead of as a paint tool. The angular, faceted
 * look of what you end up with is the medium, not a limitation.
 *
 * The spool changes thread. The cutter frees the work: the patch comes
 * off the hoop and drifts away into the scene, and the hoop is empty
 * again.
 *
 * What happens to it after that is not up to you. See core/field.js --
 * the thing in the dark can see the patches, and it wants them.
 */

const R = 1.5;
const D = 0.2;
const MAX = 200;

export class Hoop extends Device {
  constructor(patches) {
    super({ code: "S-7", name: "SAMPLER", mass: 0.8, reach: 0.9 });
    this.patches = patches;
    this.stitches = [];
    this.pending = null;
    this.thread = Math.floor(Math.random() * THREADS.length);

    const b = this.body;

    /* --- the hoop ------------------------------------------------- */
    /* Five-lobed and of constant width: it rolls like a hoop and is not
       one, which is the same joke the token is telling. */
    const outer = reuleaux(R, 5);
    outer.holes.push(new THREE.Path(reuleaux(R * 0.87, 5).getPoints(72).reverse()));
    const frame = new THREE.Mesh(extrude(outer, D, 0.03), MAT.metal);
    frame.castShadow = true;
    b.add(frame);

    /* the tensioning collar, and its screw, which is not in line with
       anything */
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, D + 0.14), MAT.metalDark);
    collar.position.set(R * 0.62, R * 0.72, 0);
    collar.rotation.z = -0.7;
    b.add(collar);
    screw(b, R * 0.62, R * 0.72, D / 2 + 0.09, 0.11, 0.9);

    /* --- the cloth ------------------------------------------------ */
    const cloth = new THREE.Mesh(
      new THREE.ShapeGeometry(reuleaux(R * 0.92, 5), 40),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: weave(5), roughness: 0.96, metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    cloth.position.z = -0.02;
    cloth.userData.surface = true;      // this is the bit you draw on
    b.add(cloth);
    this.cloth = cloth;

    /* --- the work ------------------------------------------------- */
    this.work = new Stitching(MAX);
    this.work.mesh.position.z = 0.01;
    b.add(this.work.mesh);

    /* --- fittings ------------------------------------------------- */
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.38, 0.3), MAT.metalDark);
    post.position.set(0, -R - 0.3, 0.04);
    b.add(post);

    this.spool = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.3, 16), MAT.plasticDark);
    barrel.rotation.z = Math.PI / 2;
    this.spool.add(barrel);
    this.wound = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.24, 16),
      new THREE.MeshStandardMaterial({ color: THREADS[this.thread], roughness: 0.85 }),
    );
    this.wound.rotation.z = Math.PI / 2;
    this.spool.add(this.wound);
    this.spool.position.set(-0.62, -R - 0.3, 0.24);
    b.add(this.spool);
    this.spool.traverse((o) => { if (o.isMesh) o.userData.control = "spool"; });

    /* the cutter: a small blade in a slot */
    this.cutter = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.04), MAT.metal);
    blade.rotation.z = 0.4;
    this.cutter.add(blade);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), MAT.rubber);
    grip.position.set(-0.2, -0.09, 0.02);
    this.cutter.add(grip);
    this.cutter.position.set(0.62, -R - 0.3, 0.24);
    b.add(this.cutter);
    this.cutter.traverse((o) => { if (o.isMesh) o.userData.control = "cut"; });

    /* the needle, parked */
    const needle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.028, 0.62, 6), MAT.metal);
    needle.position.set(-R * 0.75, -R * 0.62, 0.1);
    needle.rotation.z = -0.9;
    b.add(needle);

    decal(b, 1.2, 0.24, label(["S-7  SAMPLER"], {
      bg: "#2b2a26", fg: "#d5d0c0", size: 28, lh: 34, align: "center", w: 512,
    }), 0.05, -R - 0.62, 0.1, 0.01);

    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 18), MAT.metal);
    eye.position.set(0, R + 0.18, 0);
    b.add(eye);

    this.claim();
  }

  get anchorY() { return R + 0.32; }

  get readout() {
    if (!this.stitches.length) return "EMPTY";
    return this.stitches.length + " STITCHES";
  }

  /* ---------- stitching ---------- */

  /** Keep the needle on the cloth. */
  inside(p) {
    const r = Math.hypot(p.x, p.y);
    if (r <= R * 0.88) return { x: p.x, y: p.y };
    const k = (R * 0.88) / r;
    return { x: p.x * k, y: p.y * k };
  }

  beginDraw(local) {
    if (this.stitches.length >= MAX) return false;
    const a = this.inside(local);
    /* the colour is fixed when the needle goes in, not when it comes
       out, and not retroactively */
    this.pending = { ax: a.x, ay: a.y, bx: a.x, by: a.y, c: THREADS[this.thread] };
    this.redraw();
    return true;
  }

  dragDraw(local) {
    if (!this.pending) return;
    const b = this.inside(local);
    this.pending.bx = b.x;
    this.pending.by = b.y;
    this.redraw();
  }

  endDraw() {
    if (!this.pending) return;
    const s = this.pending;
    this.pending = null;
    /* a stab in one place is not a stitch */
    if (Math.hypot(s.bx - s.ax, s.by - s.ay) > 0.06) this.stitches.push(s);
    this.redraw();
  }

  redraw() {
    this.work.rebuild(this.pending ? [...this.stitches, this.pending] : this.stitches);
  }

  /* ---------- the two controls ---------- */

  press(object) {
    const which = object && object.userData.control;
    if (!which) return false;

    if (which === "spool") {
      this.thread = (this.thread + 1) % THREADS.length;
      this.wound.material.color.setHex(THREADS[this.thread]);
      return true;
    }

    if (which === "cut") {
      this.cut();
      return true;
    }
    return false;
  }

  /** Free the work. It leaves the hoop and does not come back. */
  cut() {
    if (!this.stitches.length || !this.patches) return;
    const at = new THREE.Vector3();
    this.body.getWorldPosition(at);
    at.z += 1.4;
    this.patches.add(this.stitches, at);
    this.stitches = [];
    this.pending = null;
    this.redraw();
    this.cutAt = 1;
  }

  onKey(key) {
    if (key === "Enter") { this.cut(); return true; }
    if (key === "Backspace") { this.stitches.pop(); this.redraw(); return true; }
    return false;
  }

  tick(dt) {
    /* the blade springs back after a cut */
    if (this.cutAt > 0) {
      this.cutAt = Math.max(0, this.cutAt - dt * 3);
      this.cutter.position.x = 0.62 - this.cutAt * 0.16;
    }
  }
}
