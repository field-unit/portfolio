import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import {
  faceted, extrude, roundedBox, screw, ringControl, nubs, decal, speaker, led,
} from "../lib/parts.js";
import { label, vents } from "../lib/textures.js";
import { damp } from "../lib/math.js";

/* RO-404 AUDIO RECLAMATION UNIT.
 *
 * The heaviest thing on the ring, and the only one with a working
 * interface.
 *
 * WHAT THIS IS NOT
 *
 * The first version of this was a Game Boy. Rounded rectangle, screen
 * at the top, four-way pad bottom left, two round buttons at thumb
 * reach, rectangular grid of speaker holes. Every one of those is a
 * consequence of having hands: the pad is a thumb-cross, the buttons
 * sit where the other thumb lands, the silhouette is what survives a
 * pocket, and the corners are radiused because a mould has to release.
 *
 * The fiction is a non-human system reconstructing this class of object
 * from incomplete evidence. A reconstruction that arrives at a Game Boy
 * is not incomplete -- it is a copy. So the ergonomics are gone and the
 * materials stay:
 *
 *   - faceted and tapered rather than radiused and rectangular; cut
 *     corners read as machined, radiused ones read as retail
 *   - the aperture over the screen is NOT the shape of the screen. The
 *     panel is a scavenged rectangular part sitting behind a hole that
 *     was cut by something working from a description of it, so you can
 *     see the panel's own edge and a void at the corners
 *   - a continuous ring where the pad was: no directions, no handedness,
 *     and no way to tell by looking whether it turns or presses
 *   - a column of identical unmarked nubs instead of labelled buttons
 *   - vents on a spiral instead of a grid
 *
 * What stays is the recovered-hardware language the whole piece runs
 * on: smoke polycarbonate over a visible board, brass screws, printed
 * labels slightly askew, a green backlit panel. It should still read as
 * manufactured. Just not for us.
 */

const D = 0.92;
const FRONT_Z = D / 2;

/* Tapered, faceted, and not quite bilaterally symmetric -- the right
   shoulder drops lower than the left. Symmetry in handheld objects is a
   consequence of paired hands. */
const OUTLINE = [
  [-2.30, 2.80],
  [2.42, 2.80],
  [2.42, 0.90],
  [1.80, -2.72],
  [-1.72, -2.80],
  [-2.30, 0.20],
];

/* Deliberately larger than the panel behind it, and not its shape. */
const APERTURE = [
  [-1.80, 1.26],
  [1.88, 1.18],
  [1.74, -1.20],
  [-1.70, -1.28],
];

/* The surround the aperture is cut through. Stated outright rather than
   derived from the casing outline: a hole has to be strictly inside the
   thing it is a hole in, and a derived outline is one edit away from
   not being. */
const BEZEL = [
  [-2.12, 1.64],
  [2.20, 1.56],
  [2.08, -1.60],
  [-2.02, -1.68],
];

export class Receiver extends Device {
  constructor(shell) {
    super({ code: "RO-404", name: "AUDIO RECLAMATION UNIT", mass: 1.9, reach: 1.0 });
    this.shell = shell;

    const b = this.body;

    /* --- casing --------------------------------------------------- */
    const case_ = new THREE.Mesh(extrude(faceted(OUTLINE, 0.3), D, 0.06), MAT.smoke);
    case_.castShadow = true;
    case_.renderOrder = 4;
    b.add(case_);

    // the board you can just about see through the shell
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, 0.14), MAT.board);
    board.position.set(0, -0.1, -0.1);
    b.add(board);

    /* An opaque back half, so the internals only read from the front. */
    const inner = new THREE.Mesh(
      extrude(faceted(OUTLINE.map(([x, y]) => [x * 0.94, y * 0.95]), 0.28), 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x2c3331, roughness: 0.8, metalness: 0.04 }),
    );
    inner.position.z = -0.26;
    b.add(inner);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 12), MAT.metal);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(-1.3, -0.5, 0.06);
    b.add(cap);

    /* One internal wire, soldered at one end and going nowhere at the
       other. The detail that says somebody opened this. */
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(-1.4, -1.8, 0.04),
          new THREE.Vector3(-0.7, -1.35, 0.16),
          new THREE.Vector3(0.3, -1.6, 0.12),
          new THREE.Vector3(1.0, -1.2, -0.02),
        ]), 22, 0.032, 7, false),
      new THREE.MeshStandardMaterial({ color: 0x9b5b4e, roughness: 0.78 }),
    );
    b.add(wire);

    /* --- display -------------------------------------------------- */
    const SCR_W = 3.24, SCR_H = SCR_W * (112 / 176);
    const SCR_Y = 1.05;

    /* The void behind the aperture, so the corners the panel does not
       reach read as an opening into the body rather than as board. */
    const wellShape = faceted(APERTURE, 0.1);
    const well = new THREE.Mesh(
      new THREE.ShapeGeometry(wellShape),
      new THREE.MeshStandardMaterial({ color: 0x080c0b, roughness: 0.96 }),
    );
    well.position.set(0, SCR_Y, FRONT_Z - 0.1);
    b.add(well);

    const lcd = shell.lcd;
    /* Purely emissive: a backlit panel makes its own light and takes
       none from the room. */
    this.screenMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: lcd.texture,
      emissiveIntensity: 0,
      roughness: 1,
      metalness: 0,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), this.screenMat);
    screen.position.set(0, SCR_Y, FRONT_Z - 0.055);
    b.add(screen);
    this.screen = screen;

    /* The surround: a frame with the aperture cut through it, so it can
       never sit over the panel however it is positioned. */
    const frame = faceted(BEZEL, 0.16);
    frame.holes.push(new THREE.Path(wellShape.getPoints(6).reverse()));
    const bezel = new THREE.Mesh(extrude(frame, 0.2, 0.03), MAT.plasticDark);
    bezel.position.set(0, SCR_Y, FRONT_Z - 0.04);
    b.add(bezel);

    const glass = new THREE.Mesh(new THREE.ShapeGeometry(wellShape), MAT.glass);
    glass.position.set(0, SCR_Y, FRONT_Z + 0.03);
    glass.renderOrder = 5;
    b.add(glass);

    /* The backlight is a real light: it goes on lighting whatever swings
       past it while the thing is left playing on the ring. */
    this.glow = new THREE.PointLight(0xa8d0ac, 0, 6, 2);
    this.glow.position.set(0, SCR_Y, FRONT_Z + 1.6);
    b.add(this.glow);

    /* --- controls, such as they are ------------------------------- */
    this.ring = ringControl(b, -0.62, -1.42, FRONT_Z + 0.02, 0.66, 0.27);
    this.nubs = nubs(b, 1.28, -0.72, FRONT_Z + 0.03, 5, 0.32, 5);

    this.power = led(b, -2.02, 2.22, FRONT_Z + 0.02, 0x63ff9a, 0.058, 2.2);
    this.act = led(b, 2.12, 2.06, FRONT_Z + 0.02, 0xff7a3c, 0.052, 0);

    speaker(b, 0.72, -2.22, FRONT_Z + 0.005, 1.05, 1.05, vents(34, 9));

    /* --- print ---------------------------------------------------- */
    decal(b, 2.2, 0.34, label(["REMOTE OBJECT"], {
      bg: "#1f2422", fg: "#cfd6c8", size: 40, lh: 46, align: "center", w: 640,
    }), -0.2, 2.46, FRONT_Z + 0.006, 0.005);

    decal(b, 1.5, 0.44, label(["RO-404", "AUDIO RECLAMATION"], {
      bg: "#b3ab93", fg: "#33342c", size: 24, lh: 30, w: 640,
    }), -1.02, -2.32, FRONT_Z + 0.006, -0.02);

    screw(b, -2.02, 2.44, FRONT_Z - 0.01, 0.15, 0.4);
    screw(b, 2.12, 2.44, FRONT_Z - 0.01, 0.15, 1.9);
    screw(b, -1.42, -2.5, FRONT_Z - 0.01, 0.15, 2.6);
    screw(b, 1.5, -2.46, FRONT_Z - 0.01, 0.15, 0.9);

    /* --- reverse -------------------------------------------------- */
    const back = -FRONT_Z;

    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x363d3b, roughness: 0.8, metalness: 0.04,
    });
    const door = new THREE.Mesh(
      extrude(faceted([[-1.2, 1.05], [1.2, 1.15], [1.05, -1.1], [-1.15, -1.0]], 0.16), 0.1, 0.025),
      doorMat);
    door.position.set(-0.12, -0.72, back - 0.015);
    b.add(door);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.055, 0.04), doorMat);
      rib.position.set(-0.12, -1.3 + i * 0.13, back - 0.07);
      b.add(rib);
    }
    const catch_ = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.07), MAT.metalDark);
    catch_.position.set(-0.12, 0.46, back - 0.09);
    b.add(catch_);

    const rear = (w, h, tex, x, y, rot) => {
      const m = decal(b, w, h, tex, x, y, back - 0.012, rot);
      m.rotation.y = Math.PI;
      return m;
    };
    rear(2.35, 0.78, label(["PROPERTY OF", "NO KNOWN USER"], {
      bg: "#aca690", fg: "#34342c", size: 30, lh: 40, w: 640,
    }), 0.1, 1.78, 0.01);
    rear(1.5, 0.32, label(["SERIAL 7713-9"], {
      bg: "#4a4f49", fg: "#c2c3b4", size: 30, lh: 36, w: 512,
    }), -0.2, -2.3, -0.02);

    /* The front says RO-404 and the back says RO-404-B. Neither is
       wrong, exactly, and there is no way to find out which is right. */
    rear(1.05, 0.3, label(["RO-404-B"], {
      bg: "#9fa093", fg: "#2b2c26", size: 30, lh: 36, align: "center", w: 384,
    }), 1.05, -2.3, 0.015);

    /* The screws sit at a different angle every visit. Nobody notices
       deliberately; it registers as the object not being quite as it
       was left, with nothing to point at. */
    const turn = (shell.witness?.visits || 0) * 0.77;
    screw(b, -2.02, 2.44, back + 0.01, 0.15, 1.1 + turn);
    screw(b, 1.5, -2.46, back + 0.01, 0.15, 2.2 - turn);

    // eyelet the ring passes through
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.075, 8, 20), MAT.metal);
    eye.position.set(0.1, 2.96, 0);
    b.add(eye);

    this.claim();
  }

  get anchorY() { return 3.1; }

  onWheel(delta) {
    this.shell.move(delta > 0 ? 1 : -1);
    return true;
  }

  onKey(key) {
    const s = this.shell;
    switch (key) {
      case "ArrowUp": s.up(); return true;
      case "ArrowDown": s.down(); return true;
      case "Enter": case " ": s.enter(); return true;
      case "ArrowRight": s.inspect(); return true;
      case "ArrowLeft": case "Backspace": return s.back();
      default: return false;
    }
  }

  onApproach(on) {
    if (on) this.shell.awake ? this.shell.resume() : this.shell.wake();
    else this.shell.release();
  }

  tick(dt, camera, ctx) {
    const s = this.shell;
    s.tick(dt);
    const regard = ctx && ctx.attention ? ctx.attention.regard : 0;

    // dim on the ring, full when you have it in your hand
    const want = s.lcd.power ? (this.approach > 0.2 ? 1 : 0.5) : 0;
    s.lcd.backlight = damp(s.lcd.backlight, want, 5, dt);
    this.screenMat.emissiveIntensity = s.lcd.backlight * 1.5;
    this.glow.intensity = s.lcd.backlight * 1.5;

    const playing = this.shell.player.playing;
    const now = performance.now();
    this.act.material.emissiveIntensity = playing
      ? 2.2 + Math.sin(now / 140) * 1.4
      /* and when nothing is playing it still ticks over, slowly, if the
         object is attending to you -- something is running that has
         nothing to do with the music */
      : regard > 0.6 ? Math.max(0, Math.sin(now / 900)) * regard * 1.6
      : 0;
    this.power.material.emissiveIntensity = s.lcd.power ? 2.2 : 0.25;
  }
}
