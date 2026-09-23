import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { extrude, decal } from "../lib/parts.js";
import { canvasTexture } from "../lib/textures.js";
import { TAU } from "../lib/math.js";

/* UNMARKED TOKEN.
 *
 * Not electronic. No screen, no light, no port, nothing to operate. It
 * is a milled disc with a hole through it and SOMETHING PLAYS running
 * round the rim, and its whole job is to be the one object on the ring
 * that cannot be used.
 *
 * Its number is 31, which is also the number of an object in the
 * catalogue that does not resolve. That is the only connection drawn
 * anywhere, and it is not explained.
 */

const R = 1.24, D = 0.22, TEETH = 26, LOBES = 7;

export class Token extends Device {
  constructor() {
    super({ code: "31", name: "UNMARKED TOKEN", mass: 0.85, reach: 0.55 });
    const b = this.body;

    /* Not a disc.
     *
     * A seven-lobed curve of constant width, milled on top of that. It
     * rolls like a coin and it is not one, and seven is a number no
     * currency has ever used because it divides into nothing. Under a
     * casual glance it is round; the moment you actually look at the
     * edge it stops being round, and there is no point at which you can
     * say what it is instead.
     */
    const s = new THREE.Shape();
    for (let i = 0; i <= TEETH * 2; i++) {
      const a = (i / (TEETH * 2)) * TAU;
      const lobe = 1 + 0.055 * Math.cos(LOBES * a);
      const r = (i % 2 ? R : R * 0.945) * lobe;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    /* and the hole is not through the middle of it */
    const hole = new THREE.Path();
    hole.absarc(0.15, -0.08, R * 0.12, 0, TAU, true);
    s.holes.push(hole);

    const disc = new THREE.Mesh(extrude(s, D, 0.02), MAT.stone);
    disc.castShadow = true;
    b.add(disc);

    const faceTex = tokenFace();
    decal(b, R * 2, R * 2, faceTex, 0, 0, D / 2 + 0.004);
    const rear = decal(b, R * 2, R * 2, faceTex, 0, 0, -D / 2 - 0.004);
    rear.rotation.y = Math.PI;

    /* The ring goes through a hole drilled through the rim, off-centre,
       by somebody in a hurry. */
    const lug = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 16), MAT.metalDark);
    lug.position.set(0.07, R + 0.06, 0);
    b.add(lug);

    this.claim();
  }

  get anchorY() { return R + 0.2; }

  /* Deliberately inert. It does not respond to being approached, which
     is information in itself -- and the readout says so plainly rather
     than reporting a face state for an object with no faces. */
  get usable() { return false; }
  get faceLabel() { return "NO INTERFACE"; }
  get refusal() { return "NOTHING TO OPEN"; }
  onApproach() {}
}

function tokenFace() {
  return canvasTexture(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    c.fillStyle = "rgba(46,42,34,.82)";

    // SOMETHING PLAYS, struck around the rim
    const text = "SOMETHING  PLAYS";
    c.save();
    c.translate(cx, cy);
    c.font = "600 34px ui-monospace, 'Courier New', monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const arc = Math.PI * 1.34;
    const start = -Math.PI / 2 - arc / 2;
    for (let i = 0; i < text.length; i++) {
      const a = start + (i / (text.length - 1)) * arc;
      c.save();
      c.rotate(a);
      c.translate(0, -(cx - 46));
      c.fillText(text[i], 0, 0);
      c.restore();
    }
    c.restore();

    // the mark
    c.beginPath();
    c.moveTo(cx, cy + 20);
    c.lineTo(cx - 40, cy + 82);
    c.lineTo(cx + 40, cy + 82);
    c.closePath();
    c.strokeStyle = "rgba(46,42,34,.86)";
    c.lineWidth = 9;
    c.lineJoin = "miter";
    c.stroke();

    // wear across the strike
    c.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.3})`;
      c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 26, 2);
    }
  });
}
