import * as THREE from "three";
import { MAT } from "../lib/materials.js";

/* A length of keyring chain, simulated as Verlet points with distance
 * constraints.
 *
 * Verlet rather than a rigid-body engine on purpose. The only dynamics
 * on this object are four chains and a ring on a suspension; a real
 * solver would cost a megabyte of wasm and give up the one thing that
 * actually matters here, which is being able to author the settle by
 * hand. Lag and swing are a feel target, not a physics target.
 *
 * The device on the end is not simulated as a body -- it is hung off
 * the last point, and its tilt is read from the last link's direction.
 * Cheap, stable, and indistinguishable at this scale.
 */

const GRAVITY = new THREE.Vector3(0, -26, 0);
const ITERATIONS = 7;

export class Chain {
  constructor(links, linkLen, { odd = false } = {}) {
    this.n = links + 1;
    this.len = linkLen;
    this.p = [];
    this.prev = [];
    for (let i = 0; i < this.n; i++) {
      this.p.push(new THREE.Vector3(0, -i * linkLen, 0));
      this.prev.push(new THREE.Vector3(0, -i * linkLen, 0));
    }

    this.group = new THREE.Group();
    this.meshes = [];
    const geo = new THREE.TorusGeometry(linkLen * 0.42, linkLen * 0.14, 7, 16);
    for (let i = 0; i < links; i++) {
      const m = new THREE.Mesh(geo, MAT.metal);
      m.castShadow = true;
      this.group.add(m);
      this.meshes.push(m);
    }

    /* One link on one chain is a size too big and sits at an angle its
       neighbours could not actually allow. One. Not all of them --
       if every link is wrong the object just reads as broken. */
    if (odd && this.meshes.length > 2) {
      this.meshes[1].scale.setScalar(1.34);
      this.meshes[1].userData.skew = 0.5;
    }

    this._d = new THREE.Vector3();
    this._m = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._q = new THREE.Quaternion();
  }

  /** Drop the whole chain at the anchor, so it does not fly in from 0,0,0. */
  reset(anchor) {
    for (let i = 0; i < this.n; i++) {
      this.p[i].set(anchor.x, anchor.y - i * this.len, anchor.z);
      this.prev[i].copy(this.p[i]);
    }
  }

  /**
   * @param anchor  world position of the ring eyelet, this frame
   * @param dt      clamped timestep
   * @param drag    0..1, how much velocity survives (heavier = less)
   * @param pull    extra force applied to the last point, e.g. from a
   *                device being lifted toward the camera
   */
  step(anchor, dt, drag = 0.986, pull = null) {
    const { p, prev } = this;

    /* Damping has to be per SECOND, not per step. Applied once a frame
       as a flat multiplier it is frame-rate dependent: the same chain
       swings roughly four times as long at fifteen frames a second as
       at sixty, because the drag lands a quarter as often. Since the
       entire deliverable here is how the thing feels, it cannot feel
       different on a slower machine. */
    const damping = Math.pow(drag, dt * 60);

    for (let i = 1; i < this.n; i++) {
      const v = this._d.subVectors(p[i], prev[i]).multiplyScalar(damping);
      prev[i].copy(p[i]);
      p[i].add(v).addScaledVector(GRAVITY, dt * dt);
    }
    if (pull) p[this.n - 1].addScaledVector(pull, dt * dt);

    p[0].copy(anchor);
    prev[0].copy(anchor);

    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < this.n - 1; i++) {
        const a = p[i], b = p[i + 1];
        const d = this._d.subVectors(b, a);
        const dist = d.length() || 1e-5;
        const diff = (dist - this.len) / dist;
        /* point 0 is pinned to the ring; everything below shares the
           correction evenly */
        if (i === 0) b.addScaledVector(d, -diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
    }
    this.render();
  }

  render() {
    for (let i = 0; i < this.meshes.length; i++) {
      const a = this.p[i], b = this.p[i + 1];
      const m = this.meshes[i];
      m.position.copy(this._m.addVectors(a, b).multiplyScalar(0.5));
      this._d.subVectors(b, a).normalize();
      this._q.setFromUnitVectors(this._up, this._d);
      m.quaternion.copy(this._q);
      // real chain alternates plane every link
      m.rotateY(i % 2 ? Math.PI / 2 : 0);
      if (m.userData.skew) m.rotateX(m.userData.skew);
    }
  }

  get end() { return this.p[this.n - 1]; }

  /** Direction of the last link, for hanging the device off it. */
  tilt(out) {
    return out.subVectors(this.p[this.n - 1], this.p[this.n - 2]).normalize();
  }
}
