import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { faceted, extrude, decal, led, screw } from "../lib/parts.js";
import { label, canvasTexture } from "../lib/textures.js";
import { TAU } from "../lib/math.js";

/* ACCESS A-17.
 *
 * Contributor authentication. It does not exist yet and the device says
 * so rather than pretending -- an interface that fakes a login is worse
 * than one that refuses.
 *
 * WHAT THIS IS NOT
 *
 * It was a USB stick. Rectangular body, USB-A shield on the end, smiley
 * face printed on the front. USB-A is possibly the most recognisable
 * manufactured object of the last thirty years, and a smiley is the most
 * human mark there is, so between them they undid everything the rest of
 * the piece was doing.
 *
 * What survives is the material: cheap pink translucent plastic with a
 * board showing through it and a red lamp behind. What changed is the
 * grammar of the thing:
 *
 *   - the plug is a TAPERED TRIANGULAR PRONG, not a flat blade. Three
 *     contact collars at irregular spacing, none of which line up with
 *     anything. It is unmistakably a thing that inserts into another
 *     thing, and unmistakably not a connector you own a cable for.
 *   - three-fold symmetry rather than two. Bilateral symmetry in a
 *     handheld object comes from paired hands; a triangular section
 *     comes from nothing you have.
 *   - the mark on the front is three dots and an arc that does not sit
 *     under them. It reads as a face for about a third of a second and
 *     then stops being one, which is the effect a smiley cannot have.
 */

const D = 0.5;
const FRONT_Z = D / 2;

const HEAD = [
  [-0.72, 0.98],
  [0.76, 0.92],
  [0.69, -0.84],
  [-0.65, -0.90],
];

export class Access extends Device {
  constructor() {
    super({ code: "A-17", name: "ACCESS KEY", mass: 0.5, reach: 0.62 });
    const b = this.body;

    const head = new THREE.Mesh(extrude(faceted(HEAD, 0.14), D, 0.04), MAT.pink);
    head.castShadow = true;
    head.renderOrder = 4;
    b.add(head);

    /* Small, and set back. It is meant to be a board glimpsed through
       cloudy plastic, not a black slab clamped to the front of it. */
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.98, 0.07), MAT.board);
    board.position.set(-0.02, 0.06, -0.1);
    b.add(board);

    /* --- the prong ------------------------------------------------ */
    /* A tapered triangular prism. Nothing accepts this. */
    const prong = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.15, 1.24, 3), MAT.plasticDark);
    prong.position.y = -1.5;
    prong.rotation.y = 0.4;
    b.add(prong);

    /* Contact collars, at spacings that are not a series. */
    for (const [y, r] of [[-1.12, 0.33], [-1.46, 0.28], [-1.92, 0.21]]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.96, 0.09, 3), MAT.metal);
      band.position.y = y;
      band.rotation.y = 0.4;
      b.add(band);
    }

    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.34, 0.16, 3), MAT.metalDark);
    shoulder.position.y = -0.94;
    shoulder.rotation.y = 0.4;
    b.add(shoulder);

    /* --- front ---------------------------------------------------- */
    decal(b, 0.9, 0.9, notQuiteAFace(), 0.02, 0.3, FRONT_Z + 0.005);

    decal(b, 0.86, 0.24, label(["IDENT ?"], {
      bg: "#00000000", fg: "#5d2436", size: 30, lh: 36, align: "center", w: 384,
    }), -0.02, -0.5, FRONT_Z + 0.005, -0.03);

    this.led = led(b, 0.46, 0.82, FRONT_Z - 0.05, 0xff2b4e, 0.07, 3.6);
    screw(b, -0.46, -0.62, FRONT_Z - 0.02, 0.1, 0.7);

    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 18), MAT.pink);
    eye.position.set(0.02, 1.12, 0);
    b.add(eye);

    const rear = decal(b, 1.05, 0.28, label(["A-17 / ?"], {
      bg: "#6b4150", fg: "#e6cdd6", size: 28, lh: 34, align: "center", w: 384,
    }), 0, 0.2, -FRONT_Z - 0.008);
    rear.rotation.y = Math.PI;

    this.claim();
    this._t = Math.random() * 10;
  }

  get anchorY() { return 1.28; }

  onApproach(on) { this.refused = on; }

  tick(dt) {
    this._t += dt;
    /* An irregular blink. Regular would read as a heartbeat; irregular
       reads as a device trying and failing to find something. */
    const s = Math.sin(this._t * 2.1) * Math.sin(this._t * 0.7 + 1.3);
    this.led.material.emissiveIntensity = 0.5 + Math.max(0, s) * 4.4;
  }
}

/**
 * Three dots and an arc that is not under them.
 *
 * Two dots and a curve is a face and you cannot unsee it. Three dots is
 * a constellation, until the arc arrives and your eye tries to make a
 * face out of it anyway and cannot decide which two of the three are
 * the eyes. It resolves and unresolves while you look at it, which is
 * the whole trick and is not available to a smiley.
 */
function notQuiteAFace() {
  return canvasTexture(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#5d2436";
    c.fillStyle = "#5d2436";
    c.lineWidth = 6;
    c.lineCap = "round";

    const R = 26;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU + 0.18;
      c.beginPath();
      c.arc(64 + Math.cos(a) * R, 56 + Math.sin(a) * R, 5.5, 0, TAU);
      c.fill();
    }

    /* off-centre, and the wrong width for the dots above it */
    c.beginPath();
    c.arc(72, 74, 26, 0.16 * Math.PI, 0.72 * Math.PI);
    c.stroke();

    /* the enclosure, not quite closed */
    c.lineWidth = 4;
    c.beginPath();
    c.arc(64, 64, 50, 0.12 * Math.PI, 1.82 * Math.PI);
    c.stroke();
  });
}
