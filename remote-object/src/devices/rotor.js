import * as THREE from "three";
import { Device } from "./device.js";
import { MAT } from "../lib/materials.js";
import { decal, screw } from "../lib/parts.js";
import { label } from "../lib/textures.js";
import { Drone } from "../audio/drone.js";
import { TAU, clamp } from "../lib/math.js";

/* W-2 WEATHER UNIT.
 *
 * A bladed rotor. There is exactly one thing you can do to it and it is
 * the same thing you can do to everything else here: turn it. The
 * difference is that this one sings while it is turning.
 *
 * Set it going and it generates an atmosphere that has never existed
 * before -- new root, new partials, new drift rates, every time it comes
 * up from rest. Level and brightness are read continuously from how fast
 * it is actually spinning, so the sound is not something the device
 * plays. It is something the device is doing. Let it go and the sound
 * winds down with the rotor, and there is no stop button because there
 * is nothing to stop.
 *
 * No detents and no faces. Every other device on the ring eases round to
 * present a front to you, because every other device has one. This has
 * no screen, no label worth reading and no correct orientation, so it
 * spins free like the flywheel it looks like -- and that difference is
 * how you learn it is a different kind of thing, without being told.
 */

const R = 0.86;
const BLADES = 9;
const SPIN_TO_SOUND = 7.5;      // yaw rate that counts as full intensity
const WAKE = 1.6;               // crossing this from rest makes a new sound

export class Rotor extends Device {
  constructor(player) {
    super({ code: "W-2", name: "WEATHER UNIT", mass: 1.05, reach: 0.7 });
    this.player = player;
    this.drone = null;
    this.wasSlow = true;

    const b = this.body;

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1.36, 18), MAT.metalDark);
    b.add(hub);

    /* Blades, twisted the way something that had to catch air would be.
       Nothing here catches air. */
    for (let i = 0; i < BLADES; i++) {
      const a = (i / BLADES) * TAU;
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.18, 0.62), MAT.metal);
      vane.position.set(Math.cos(a) * (R * 0.62), 0, Math.sin(a) * (R * 0.62));
      vane.rotation.y = -a + 0.42;
      vane.castShadow = true;
      b.add(vane);
    }

    for (const y of [0.72, -0.72]) {
      const cap = new THREE.Mesh(new THREE.TorusGeometry(R * 0.66, 0.055, 8, 30), MAT.metal);
      cap.rotation.x = Math.PI / 2;
      cap.position.y = y;
      b.add(cap);
    }

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.22, 16), MAT.metalDark);
    collar.position.y = 0.86;
    b.add(collar);

    /* The label is on the hub, so it is only legible for the instant it
       sweeps past and never while the thing is doing anything. */
    const plate = decal(b, 0.44, 0.16, label(["W-2"], {
      bg: "#3b4140", fg: "#cfd4cc", size: 30, lh: 36, align: "center", w: 256,
    }), 0, 0.34, 0.25);
    plate.rotation.y = 0;

    screw(b, 0, -0.3, 0.26, 0.09, 0.8);

    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 18), MAT.metal);
    eye.position.set(0, 1.06, 0);
    b.add(eye);

    this.claim();
  }

  get anchorY() { return 1.2; }

  /* It has no front, so none of the face language applies to it. */
  get usable() { return false; }
  get faceLabel() {
    const s = Math.abs(this.yawVel);
    return s > 4 ? "TURNING FAST" : s > 0.5 ? "TURNING" : "AT REST";
  }
  get refusal() { return "NOTHING TO OPEN"; }

  /**
   * No detent, and far less drag than anything else on the ring. It is
   * the only object here that keeps going after you stop pushing it.
   */
  settle(dt) {
    this.yaw += this.yawVel * dt;
    this.yawVel *= Math.exp(-0.55 * dt);
    if (Math.abs(this.yawVel) < 0.02) this.yawVel = 0;
    this.body.rotation.y = this.yaw;
  }

  tick(dt) {
    const speed = Math.abs(this.yawVel);

    if (!this.drone) {
      const ctx = this.player.context;
      if (ctx) this.drone = new Drone(ctx, this.player.bus);
    }
    if (!this.drone) return;

    /* Coming up from rest is what makes a new one. Spinning it faster
       while it is already going just makes the same sound louder --
       which is the difference between an instrument and a button. */
    if (this.wasSlow && speed > WAKE) {
      this.drone.strike();
      this.wasSlow = false;
    } else if (speed < 0.35) {
      this.wasSlow = true;
    }

    this.drone.intensity = clamp(speed / SPIN_TO_SOUND, 0, 1);
  }
}
