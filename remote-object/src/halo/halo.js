import * as THREE from "three";
import { Chain } from "./chain.js";
import { MAT } from "../lib/materials.js";
import { TAU, clamp, damp, shortAngle } from "../lib/math.js";

/* The ring, what hangs off it, and how it moves.
 *
 * Three transforms, kept strictly apart:
 *
 *   root   where the whole object is in space. Dragged, thrown, and
 *          sprung back. Never rotated, so that gravity stays -Y for the
 *          chains and I never have to think about it again.
 *   ring   spins about Y. This is the carousel. It carries the eyelets
 *          the chains hang from and nothing else.
 *   hang   the chains and the devices. Deliberately NOT a child of the
 *          ring, so that spinning the carousel moves a device around
 *          without turning it.
 *
 * That last one is the whole reason the interaction works. A thing on a
 * chain does not pivot as it swings round -- so as the halo turns, a
 * device shows you a different face, and getting the Receiver's screen
 * towards you is a real act rather than a side effect of scrolling.
 */

/* The ring grows with what is hung on it. Six things on a 2.35 ring
   is a bundle rather than a keyring. */
const ringRadius = (n) => 1.95 + n * 0.16;
/**
 * Where the ring has to be turned to for a given slot to face you.
 *
 * Worth deriving once and writing down, because getting it wrong is
 * silent. Rotating the ring by `s` sends a slot at angle `t` to world
 * angle `t - s`. The camera sits at +Z, which is angle PI/2. So:
 *
 *     t - s = PI/2   =>   s = t - PI/2   =>   s = FRONT + t
 *
 * The trap is that FRONT - t and FRONT + t agree when t is zero, and
 * slot 0 is the Receiver -- so the wrong sign works perfectly on the
 * one device anybody tests it on and puts every other device behind
 * the ring, with the Receiver parked in front of whatever you were
 * actually trying to look at.
 */
const FRONT = -Math.PI / 2;
const facing = (slotAngle) => FRONT + slotAngle;
const HOLD_DROP = new THREE.Vector3(0, -0.3, 0);

export class Halo {
  constructor(devices) {
    this.devices = devices;

    this.root = new THREE.Group();
    this.ring = new THREE.Group();
    this.hang = new THREE.Group();
    this.root.add(this.ring, this.hang);

    /* --- the ring itself ----------------------------------------- */
    const RING_R = ringRadius(devices.length);
    this.R = RING_R;
    const main = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.115, 10, 90), MAT.metal);
    main.rotation.x = Math.PI / 2;
    main.castShadow = true;
    this.ring.add(main);

    // a split ring is two turns of wire; the second one is offset
    const split = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R, 0.085, 8, 80, Math.PI * 1.72), MAT.metalDark);
    split.rotation.x = Math.PI / 2;
    split.position.y = 0.1;
    this.ring.add(split);

    /* The impossible bit, spent once: a third arc that begins on the
       ring and ends in mid-air, having gone nowhere. */
    const stub = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R * 0.98, 0.05, 6, 26, Math.PI * 0.36), MAT.metalDark);
    stub.rotation.x = Math.PI / 2;
    stub.rotation.z = 2.1;
    stub.position.y = -0.12;
    this.ring.add(stub);

    /* --- one chain per device ------------------------------------ */
    this.slots = devices.map((d, i) => {
      const chain = new Chain(
        Math.max(3, Math.round(d.reach * 5)),
        0.3,
        { odd: i === 2 },
      );
      this.hang.add(chain.group, d.group);
      return { device: d, chain, angle: (i / devices.length) * TAU };
    });

    /* --- state --------------------------------------------------- */
    this.spin = FRONT;          // the Receiver starts nearest the camera
    this.spinVel = 0;
    this.vel = new THREE.Vector3();
    this.dragging = false;
    this.focused = null;

    this._anchor = new THREE.Vector3();
    this._tilt = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._down = new THREE.Vector3(0, -1, 0);
    this._want = new THREE.Vector3();
    this._pull = new THREE.Vector3();
    this._hold = new THREE.Vector3();
    this._fwd = new THREE.Vector3();

    this.ring.updateMatrix();
    this.slots.forEach((s) => {
      this.anchorFor(s, this._anchor);
      s.chain.reset(this._anchor);
    });
  }

  anchorFor(slot, out) {
    const a = slot.angle;
    out.set(Math.cos(a) * this.R, 0, Math.sin(a) * this.R);
    return out.applyMatrix4(this.ring.matrix);
  }

  /* ---------- carousel ---------- */

  rotate(delta) {
    this.spinVel = clamp(this.spinVel + delta, -11, 11);
  }

  /** Where the halo would come to rest, if it were allowed to. */
  nearestDetent() {
    const step = TAU / this.slots.length;
    /* the detents ARE the facing positions: slot angles are k*step, so
       facing(k*step) == FRONT + k*step */
    return Math.round((this.spin - FRONT) / step) * step + FRONT;
  }

  /* ---------- being handled ---------- */

  grab() { this.dragging = true; }

  dragBy(dx, dy) {
    /* Pushing sideways on a hanging carousel does two things at once:
       it swings the whole thing, and it spins it. Splitting the drag
       this way is what stops "drag" and "scroll" feeling like two
       unrelated commands bolted to the same object. */
    this.root.position.x += dx * 0.55;
    this.root.position.y += dy;
    this.vel.set(dx * 0.55 / 0.016, dy / 0.016, 0);
    this.rotate(dx * 0.9);
  }

  release() { this.dragging = false; }

  /* ---------- focus ---------- */

  focus(device) {
    this.focused = device;
    this.devices.forEach((d) => { d.focus = d === device; });
  }

  blur() {
    this.focused = null;
    this.devices.forEach((d) => { d.focus = false; });
  }

  /* ---------- frame ---------- */

  update(dt, camera, ctx) {
    if (ctx) this.stir(dt, ctx);

    /* carousel */
    this.spin += this.spinVel * dt;
    this.spinVel *= Math.exp(-2.3 * dt);
    const speed = Math.abs(this.spinVel);
    if (this.focused) {
      /* Bring the one you are holding round to the front of the ring.
         Without this the halo travels toward you at whatever angle it
         happened to be at, and the other three end up hanging in front
         of the device you are trying to read. Turning the bunch so the
         one you want leads is also just what a hand does. */
      const slot = this.slots.find((s) => s.device === this.focused);
      if (slot) {
        this.spin += shortAngle(this.spin, facing(slot.angle)) * (1 - Math.exp(-4.2 * dt));
        this.spinVel *= Math.exp(-7 * dt);
      }
    } else if (speed < 1.5 && !this.dragging) {
      const pull = 1 - speed / 1.5;
      const to = this.nearestDetent();
      this.spin += (to - this.spin) * (1 - Math.exp(-3.4 * pull * dt));
      if (speed < 0.05) this.spinVel = 0;
    }
    this.ring.rotation.y = this.spin;

    /* the ring tips in the direction it is travelling */
    this.ring.rotation.z = damp(this.ring.rotation.z, clamp(-this.vel.x * 0.006, -0.16, 0.16), 5, dt);
    this.ring.rotation.x = damp(this.ring.rotation.x, clamp(this.vel.y * 0.004, -0.12, 0.12), 5, dt);
    this.ring.updateMatrix();

    /* suspension */
    if (!this.dragging) {
      this._want.set(0, 0, 0);
      if (this.focused) this.holdTarget(camera, this._want);
      const k = this.focused ? 26 : 13;
      const c = this.focused ? 8.5 : 3.6;
      this.vel.addScaledVector(this._want.sub(this.root.position), k * dt);
      this.vel.addScaledVector(this.vel, -c * dt);
      this.root.position.addScaledVector(this.vel, dt);
    } else {
      this.vel.multiplyScalar(0.86);
    }

    /* chains, then the things on the end of them */
    for (const slot of this.slots) {
      const { device, chain } = slot;
      this.anchorFor(slot, this._anchor);

      let pull = null;
      if (this.focused === device) {
        /* lift it clear of the others -- the chain goes taut and the
           device leads, rather than the camera flying at it */
        this.holdPoint(camera, this._hold);
        this._hold.sub(this.root.position);
        pull = this._pull.subVectors(this._hold, chain.end).multiplyScalar(58);
      }
      chain.step(this._anchor, dt, device.mass > 1.2 ? 0.99 : 0.982, pull);

      device.group.position.copy(chain.end);
      chain.tilt(this._tilt);
      this._q.setFromUnitVectors(this._down, this._tilt);
      device.group.quaternion.slerp(this._q, 1 - Math.exp(-16 * dt));
      device.body.position.y = -device.anchorY;

      device.approach = damp(device.approach, this.focused === device ? 1 : 0, 6, dt);
      device.update(dt, camera, ctx);
    }
  }

  /**
   * What it does when you are not doing anything.
   *
   * Two behaviours, and the second is the one that matters.
   *
   * While you are idle it turns very slowly by itself -- not enough to
   * see happening, only enough that the arrangement is different when
   * you next look properly. And it stops the instant you move, which is
   * the part people catch in peripheral vision and cannot quite prove.
   *
   * The second is that it keeps time while the tab is hidden. Come back
   * after a minute elsewhere and it has moved on without you. The brief
   * asks for a system that seems to exist when nobody is watching; this
   * is that, done literally and for almost nothing.
   */
  stir(dt, ctx) {
    const att = ctx.attention;
    if (!att || this.dragging || this.focused) return;

    const away = att.takeAway();
    if (away > 4) {
      /* it carried on. It does not mention this. */
      const drift = Math.min(away, 240) * 0.05;
      this.spin += drift * (Math.random() < 0.5 ? -1 : 1);
      this.spinVel += (Math.random() - 0.5) * 1.4;
      const d = this.devices[1 + Math.floor(Math.random() * (this.devices.length - 1))];
      if (d) d.yaw += (Math.random() - 0.5) * 2.6;
      ctx.witness?.note("away", 0);
    }

    if (att.unrest > 0.15) {
      /* a drift too slow to catch in the act */
      this.spin += dt * 0.05 * att.unrest * (this._way || (this._way = Math.random() < 0.5 ? -1 : 1));
      /* and, rarely, one of them turns to face you */
      this._turnAt = (this._turnAt || 0) - dt * att.unrest;
      if (this._turnAt <= 0) {
        this._turnAt = 9 + Math.random() * 14;
        const d = this.devices[Math.floor(Math.random() * this.devices.length)];
        if (d && d.facing !== "SCREEN SIDE") d.yawVel += (Math.random() < 0.5 ? -1 : 1) * 2.2;
      }
    }
  }

  /**
   * Where the focused device should end up, in world space.
   *
   * Far enough back that the whole casing stays in frame with room
   * around it. The brief is specific that approaching must not turn the
   * object into a fullscreen app -- you are meant to still be looking
   * at a scratched piece of plastic that happens to have a screen in it.
   */
  holdPoint(camera, out) {
    camera.getWorldDirection(this._fwd);
    const f = this.focused;
    const d = f && f.mass > 1.2 ? 15 : 9.5;
    out.copy(camera.position).addScaledVector(this._fwd, d);
    /* This is where the chain END goes, and the device hangs anchorY
       below that -- so lift by the drop or the thing you are trying to
       look at sits half off the bottom of the screen. */
    out.y += (f ? f.anchorY : 0) - 0.3;
    return out;
  }

  /** Where root has to be so the focused device lands on the hold point. */
  holdTarget(camera, out) {
    const slot = this.slots.find((s) => s.device === this.focused);
    if (!slot) return out.set(0, 0, 0);
    this.holdPoint(camera, out);
    return out.sub(slot.chain.end);
  }
}
