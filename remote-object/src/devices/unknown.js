import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { reuleaux, extrude, decal, screw, led } from "../lib/parts.js";
import { label } from "../lib/textures.js";
import { damp, clamp } from "../lib/math.js";

/* UNLABELLED.
 *
 * Clear triangular casing, one aperture, and "see more." moulded into
 * the front. What it does is still not settled -- the brief is explicit
 * that some functionality should exist before its purpose does.
 *
 * What it does now is look at you.
 *
 * Three things make an eye read as alive rather than as a tracker:
 *
 *  1. It does not track smoothly. Eyes saccade -- they hold, jump, and
 *     hold again. Smooth pursuit reads as machinery; a jump that lands
 *     and settles reads as a decision.
 *  2. It leads. The target is offset along your pointer's velocity, so
 *     it is looking very slightly at where you are about to be rather
 *     than where you are. Almost nobody notices this consciously and
 *     almost everybody finds it unpleasant.
 *  3. It breaks off. Hold its gaze and eventually it looks away and
 *     will not look back for a while.
 *
 * It also only works when the device is facing you, because the eye is
 * physically on the front. Turn it away and it cannot see you, which is
 * the only reliable way to stop it.
 */

const R = 1.5, D = 0.5;
const REACH = 0.19;          // how far the pupil can travel in its socket

export class Unknown extends Device {
  constructor() {
    super({ code: "??", name: "UNLABELLED", mass: 0.72, reach: 0.76 });
    const b = this.body;

    /* A three-lobed curve of constant width rather than a rounded
       triangle. It rolls like a circle and is not one, and product
       design essentially never uses it because there is no reason to --
       which is exactly the reason to use it here. */
    const case_ = new THREE.Mesh(extrude(reuleaux(R, 3), D, 0.05), MAT.clear);
    case_.castShadow = true;
    case_.renderOrder = 4;
    b.add(case_);

    const board = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.08, 3), MAT.board);
    board.rotation.x = Math.PI / 2;
    board.rotation.z = Math.PI;
    board.position.z = -0.08;
    b.add(board);

    /* the socket, cut as a set of concentric steps rather than a bezel
       -- machined in one operation by something with no reason to stop
       at one ring */
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.3, 20), MAT.metalDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, D / 2 - 0.06);
    b.add(barrel);

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.46 + i * 0.115, 0.026, 6, 34), MAT.metalDark);
      ring.position.set(0, 0.1, D / 2 - 0.02 - i * 0.022);
      b.add(ring);
    }

    const well = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 22),
      new THREE.MeshStandardMaterial({ color: 0x05090b, roughness: 0.95 }),
    );
    well.position.set(0, 0.1, D / 2 + 0.02);
    b.add(well);

    /* the part that moves */
    this.eye = new THREE.Group();
    this.eye.position.set(0, 0.1, D / 2 + 0.03);
    b.add(this.eye);

    this.pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 20),
      new THREE.MeshStandardMaterial({ color: 0x02060a, roughness: 1 }),
    );
    this.eye.add(this.pupil);

    this.iris = led(this.eye, 0, 0, 0.012, 0x5fd8ff, 0.055, 0);

    /* the glass over it, which does not move */
    this.lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 20, 14),
      new THREE.MeshPhysicalMaterial({
        color: 0x0a1418, roughness: 0.06, metalness: 0.3,
        clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false,
      }),
    );
    this.lens.position.set(0, 0.1, D / 2 + 0.06);
    this.lens.scale.z = 0.45;
    this.lens.renderOrder = 6;
    b.add(this.lens);

    /* moulded into the shell rather than printed on it, and set in the
       same clinical face as every other marking here */
    decal(b, 1.0, 0.24, label(["see more."], {
      bg: "#00000000", fg: "#1b2226", size: 28, lh: 34, align: "center", w: 384,
    }), 0.04, -0.66, D / 2 + 0.006, -0.02);

    screw(b, -0.72, -0.72, D / 2 - 0.02, 0.1, 0.3);
    screw(b, 0.72, -0.72, D / 2 - 0.02, 0.1, 1.4);
    screw(b, 0, 0.92, D / 2 - 0.02, 0.1, 2.1);

    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 18), MAT.metal);
    eyelet.position.set(0, R + 0.1, 0);
    b.add(eyelet);

    const rear = decal(b, 1.1, 0.5, label(["NO FUNCTION", "ASSIGNED"], {
      bg: "#39434a", fg: "#c8d2d6", size: 24, lh: 30, align: "center", w: 384,
    }), 0, -0.2, -D / 2 - 0.008);
    rear.rotation.y = Math.PI;

    this.claim();

    this.attention = 0;
    this._look = new THREE.Vector2();      // where the pupil is
    this._target = new THREE.Vector2();    // where it has decided to look
    this._hold = 0;                        // time until the next saccade
    this._self = new THREE.Vector3();
  }

  get anchorY() { return R + 0.24; }

  onHover(on) { this.watched = on; }

  tick(dt, camera, ctx) {
    const att = ctx && ctx.attention;
    const regard = att ? att.regard : 0;

    this.attention = damp(
      this.attention,
      this.watched || this.approach > 0.1 ? 1 : regard, 2.2, dt);

    /* --- where to look ------------------------------------------- */
    this._hold -= dt;
    if (this._hold <= 0) {
      /* jump. Sooner when it is interested, and to somewhere other than
         you when it has decided to look away. */
      this._hold = att && att.averted > 0
        ? 0.9 + Math.random() * 1.4
        : 0.22 + (1 - regard) * 1.5 + Math.random() * 0.5;

      if (att && att.averted > 0) {
        const a = Math.random() * Math.PI * 2;
        this._target.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85);
      } else if (att && att.present && this.facing === "SCREEN SIDE") {
        this._target.copy(this.aimAt(att, camera));
      } else {
        /* nothing to look at: it drifts, slowly, the way an eye does
           when it is not being used */
        this._target.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
      }
    }

    /* the jump itself is fast, the settle after it is not */
    this._look.x = damp(this._look.x, this._target.x, 22, dt);
    this._look.y = damp(this._look.y, this._target.y, 22, dt);

    this.eye.position.x = this._look.x * REACH;
    this.eye.position.y = 0.1 + this._look.y * REACH;

    /* --- how it looks -------------------------------------------- */
    const seeing = att && att.averted > 0 ? 0 : this.attention;
    this.iris.material.emissiveIntensity = seeing * 3.1;
    /* the pupil opens when it is interested. Pupils are involuntary,
       which is exactly why this reads as something it cannot help. */
    this.pupil.scale.setScalar(1 + seeing * 0.34 - (att ? att.averted > 0 : 0) * 0.2);
    this.lens.scale.setScalar(1 + seeing * 0.03);
    this.lens.scale.z = 0.45;
  }

  /**
   * Screen-space direction from this device to the pointer, with a lead
   * along the pointer's travel. Screen space rather than a world raycast
   * because what matters is that it appears to be looking at the cursor
   * from where the reader is sitting, and that is a 2D fact.
   */
  aimAt(att, camera) {
    this._self.setFromMatrixPosition(this.body.matrixWorld).project(camera);
    const lead = clamp(att.speed / 1400, 0, 0.35);
    const dx = att.x - this._self.x + (att.x - this._self.x) * lead;
    const dy = att.y - this._self.y + (att.y - this._self.y) * lead;
    const m = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, m * 2.2);
    return this._target.set((dx / m) * reach, (dy / m) * reach);
  }
}
