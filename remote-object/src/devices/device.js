import * as THREE from "three";
import { shortAngle, clamp, wrap, TAU } from "../lib/math.js";

/* A thing hanging on the ring.
 *
 * Two rotations are kept apart on purpose. The chain decides where the
 * device is and how it is swinging; `yaw` is the only rotation the user
 * owns. Mixing them is what made the earlier prototype feel like a
 * menu -- if the carousel can spin your device for you, turning it to
 * read it stops meaning anything.
 *
 * Facing is measured against the camera, not against world axes, so
 * "the screen is towards me" stays true after you have thrown the whole
 * halo sideways.
 */

export const FRONT = "SCREEN SIDE";
export const EDGE = "EDGE";
export const BACK = "REVERSE";

const FACE_CONE = Math.cos(THREE.MathUtils.degToRad(52));

export class Device {
  constructor({ code, name, mass = 1, reach = 1 }) {
    this.code = code;
    this.name = name;
    this.mass = mass;
    this.reach = reach;            // how far below the ring it hangs

    this.group = new THREE.Group();   // positioned by the chain
    this.body = new THREE.Group();    // the part the user turns
    this.group.add(this.body);

    this.yaw = 0;
    this.yawVel = 0;
    this.hover = false;
    this.focus = false;
    this.approach = 0;             // 0 on the ring .. 1 held up to the camera

    this._face = EDGE;
    this._n = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  /** Call once the meshes are built: makes every one of them hit-testable. */
  claim() {
    this.body.traverse((o) => { if (o.isMesh) o.userData.device = this; });
    this.hitTargets = [];
    this.body.traverse((o) => { if (o.isMesh) this.hitTargets.push(o); });
  }

  /** Which way round it is, from where the camera happens to be. */
  face(camera) {
    this.body.getWorldDirection(this._n);            // local +Z in world space
    this.group.getWorldPosition(this._toCam);
    this._toCam.subVectors(camera.position, this._toCam).normalize();
    const d = this._n.dot(this._toCam);
    this._face = d > FACE_CONE ? FRONT : d < -FACE_CONE ? BACK : EDGE;
    return this._face;
  }

  get facing() { return this._face; }

  /**
   * What the diagnostics say about which way round this is.
   *
   * Overridable, because SCREEN SIDE / EDGE / REVERSE is nonsense for a
   * disc with nothing on either face or a rotor with no correct
   * orientation at all. Reporting a face state for an object that has
   * no faces is the kind of not-quite-right that reads as a bug rather
   * than as strangeness, and the two have to be kept apart.
   */
  get faceLabel() { return this._face; }

  /** Why it will not open. Also overridable, for the same reason. */
  get refusal() { return this._face === EDGE ? "EDGE ON" : "SCREEN FACING AWAY"; }

  /** Can this be operated from here? Only the front is an interface. */
  get usable() { return this._face === FRONT; }

  /** The user pushed the wheel, or dragged across it. */
  spin(delta) {
    this.yawVel += delta;
    this.yawVel = clamp(this.yawVel, -14, 14);
  }

  /**
   * Front and back are magnetic; the edge is not.
   *
   * The brief asks whether the Receiver should settle toward its screen
   * once you have turned it close enough. It should -- but only after
   * you stop pushing. A detent that pulls while you are still turning
   * feels like the object is arguing with you, so the pull is scaled by
   * how much momentum is left. Below a walking pace it takes over; above
   * it, you spin freely.
   */
  settle(dt) {
    this.yaw += this.yawVel * dt;
    this.yawVel *= Math.exp(-3.1 * dt);

    const speed = Math.abs(this.yawVel);
    if (speed < 2.4 && !this.dragging) {
      const a = wrap(this.yaw);
      const target = a < Math.PI / 2 || a > (3 * Math.PI) / 2 ? 0 : Math.PI;
      const pull = 1 - speed / 2.4;                 // full strength at rest
      this.yaw += shortAngle(a, target) * (1 - Math.exp(-7 * pull * dt));
      if (speed < 0.12) this.yawVel = 0;
    }
    if (this.yaw > TAU || this.yaw < -TAU) this.yaw = wrap(this.yaw);
    this.body.rotation.y = this.yaw;
  }

  /** Overridden by devices that have something to do when looked at. */
  onHover(/* on */) {}
  onApproach(/* on */) {}
  onWheel(/* delta */) { return false; }
  onKey(/* key */) { return false; }

  update(dt, camera, ctx) {
    this.settle(dt);
    this.face(camera);
    this.tick?.(dt, camera, ctx);
  }
}
