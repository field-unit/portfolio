import * as THREE from "three";
import { clamp, damp } from "../lib/math.js";

/* The thing in the background.
 *
 * There is one. Never two, never a scatter -- a field of objects reads
 * as a system, and a system is furniture. One thing that will not hold
 * a shape and will not keep to a habit reads as an animal, and you
 * cannot stop checking on an animal.
 *
 * WHY IT IS NOT A BLOB
 *
 * The first version displaced a sphere along its own normals. That can
 * only ever make a lumpy sphere: push a ball about radially and you get
 * a slightly worse ball. Genuinely strange forms need deformations that
 * break the topology of the thing they start from, so there are five
 * here and they stack:
 *
 *   lobes      two to five attractor directions that vertices are
 *              dragged out along. Sharp ones make spikes and limbs,
 *              broad ones make swellings. This stops it being radially
 *              symmetric and is doing most of the work.
 *   twist      rotation about Y proportional to height, shearing it
 *              into a helix
 *   bend       lateral offset by the square of height, which folds it
 *   stretch    non-uniform scale, often severe -- 3:1 reads as nothing
 *              like the same creature
 *   noise      the original layered displacement, now the least of it
 *
 * All five scale by the same `amount`, so when it gathers they release
 * together and it becomes very nearly a regular solid for a few seconds
 * -- it almost becomes something -- before losing it again.
 *
 * WHERE IT GOES
 *
 * Bounds are computed from the camera every frame rather than
 * hardcoded, so it roams the whole visible frame whatever shape the
 * window is. Fixed bounds either strand it in the middle of a wide
 * monitor or send it off the side of a narrow one.
 *
 * And when the object on the ring starts attending to you, this stops
 * moving and turns to face you. Two things noticing you at once is a
 * different proposition from one.
 */

const DETAIL = 3;
const NEAR = -44, FAR = -68;      // near enough to see, far enough not to read
/* It is allowed closer than NEAR, but only while it is coming for
   something you made. That is the one time it should be legible. */
const STALK_NEAR = -26;
const TAKE_RANGE = 9;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Presence {
  constructor() {
    this.geo = new THREE.IcosahedronGeometry(1, DETAIL);
    this.pos = this.geo.attributes.position;
    /* Base directions. Displacing along the vertex's own direction
       rather than its face normal keeps the surface watertight even
       though this geometry is non-indexed and every corner is
       duplicated three times over. */
    this.base = new Float32Array(this.pos.array);
    for (let i = 0; i < this.pos.count; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const m = Math.hypot(x, y, z) || 1;
      this.base[i * 3] = x / m; this.base[i * 3 + 1] = y / m; this.base[i * 3 + 2] = z / m;
    }

    /* Out of the scene fog on purpose: exponential fog at this depth
       leaves about a tenth of it, which is the difference between a
       thing you glimpse and a thing nobody ever finds. Its depth cue is
       applied by hand in update() on a far gentler curve. */
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({
      color: 0x1e2926, emissive: 0x0e1614, emissiveIntensity: 1,
      roughness: 0.95, metalness: 0.05,
      flatShading: true, transparent: true, opacity: 0.66, fog: false,
      /* It is the furthest thing in the scene and nothing renders
         behind it, so writing depth is safe -- and without it the
         back faces show through and the whole form reads as a
         tangle of planes rather than a solid with a soft edge. */
      depthWrite: true,
    }));
    this.mesh.scale.setScalar(5);
    this.mesh.position.set(-13, -6, -50);

    this.group = new THREE.Group();
    this.group.add(this.mesh);

    this.t = 0;
    this.hush = 0;
    this._normals = 0;

    this.p = {
      f1: 1.4, f2: 2.6, f3: 4.1, a1: 0.2, a2: 0.12, a3: 0.05,
      s1: 0.5, s2: 0.8, s3: 1.3,
      twist: 0, bendX: 0, bendZ: 0, sx: 1, sy: 1, sz: 1,
    };
    this.target = { ...this.p };
    this.lobes = [];
    this.reshape = 0;
    this.relimb = 0;

    this.coherence = 0;
    this.gathering = 0;
    this.nextGather = rand(25, 70);

    this.patches = null;      // set by the stage once there is a register
    this.quarry = null;       // the patch it is currently after

    this.vel = new THREE.Vector3();
    this.mode = "drift";
    this.nextMode = 5;
    this.spin = new THREE.Vector3(rand(-0.05, 0.05), rand(-0.09, 0.09), rand(-0.05, 0.05));

    this.redrift();
    this.relimbNow();
  }

  /**
   * New proportions, slid into rather than switched to.
   *
   * The stretch is CONSTRUCTED rather than drawn: one axis long, one
   * short, one in between, then shuffled. Drawing three independent
   * scales means they sometimes all land near one and the thing is a
   * sphere for twenty seconds, which is the one shape it must never
   * be. Same reasoning for the twist -- it is drawn away from zero,
   * because a twist of 0.1 is not a twist.
   */
  redrift() {
    const axes = [rand(1.55, 2.5), rand(0.42, 0.72), rand(0.8, 1.25)];
    for (let i = axes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [axes[i], axes[j]] = [axes[j], axes[i]];
    }
    const away = (lo, hi) => (Math.random() < 0.5 ? -1 : 1) * rand(lo, hi);

    this.target = {
      f1: rand(0.8, 2.6), f2: rand(1.8, 4.4), f3: rand(3.0, 7.0),
      a1: rand(0.12, 0.34), a2: rand(0.05, 0.19), a3: rand(0.02, 0.09),
      s1: rand(0.2, 0.9), s2: rand(0.4, 1.4), s3: rand(0.7, 2.2),
      twist: away(0.7, 2.4),
      bendX: away(0.18, 0.6),
      bendZ: away(0.18, 0.6),
      sx: axes[0], sy: axes[1], sz: axes[2],
    };
    this.reshape = rand(8, 22);
  }

  /** Grow a different set of limbs. */
  relimbNow() {
    const n = 3 + Math.floor(Math.random() * 4);
    this.lobes = [];
    for (let i = 0; i < n; i++) {
      /* a uniformly distributed direction on the sphere */
      const u = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
      this.lobes.push({
        x: r * Math.cos(a), y: u, z: r * Math.sin(a),
        amp: rand(0.4, 1.25),
        sharp: rand(1.4, 9),      // low is a swelling, high is a spike
      });
    }
    this.relimb = rand(11, 30);
  }

  /** A new way of moving. Nothing about the old one predicts it. */
  rebehave() {
    /* Anything the visitor made outranks everything else it might have
       done. This is the only channel between a person and the thing in
       the dark, and it runs one way. */
    const found = this.patches && this.patches.nearest(this.mesh.position);
    if (found && Math.random() < 0.75) {
      this.mode = "stalk";
      this.quarry = found;
      this.nextMode = rand(24, 55);
      this.spin.set(rand(-0.04, 0.04), rand(-0.06, 0.06), rand(-0.04, 0.04));
      return;
    }
    this.quarry = null;

    this.mode = pick(["drift", "drift", "cross", "cross", "hold", "circle", "recede", "approach", "dart"]);
    this.nextMode = rand(6, 22);
    this.spin.set(rand(-0.07, 0.07), rand(-0.12, 0.12), rand(-0.07, 0.07));

    const p = this.mesh.position;
    switch (this.mode) {
      case "drift": this.vel.set(rand(-2.4, 2.4), rand(-1.4, 1.4), rand(-0.5, 0.5)); break;
      /* a deliberate traverse, so it actually gets from one side of the
         frame to the other rather than milling about in the middle */
      case "cross":
        this.vel.set((p.x > 0 ? -1 : 1) * rand(3.2, 6.0), rand(-1.2, 1.2), rand(-0.4, 0.4));
        this.nextMode = rand(9, 18);
        break;
      case "hold": this.vel.set(0, 0, 0); break;
      case "circle":
        this.orbit = { x: 0, y: -5, r: rand(7, 17), a: Math.atan2(p.y + 5, p.x), w: rand(-0.28, 0.28) };
        break;
      case "recede": this.vel.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1.3, -0.5)); break;
      case "approach": this.vel.set(rand(-1, 1), rand(-0.6, 0.6), rand(0.4, 1.1)); break;
      case "dart": this.vel.set(rand(-9, 9), rand(-5, 5), rand(-1.5, 1.5)); this.nextMode = rand(1.1, 2.6); break;
      default: break;
    }
  }

  update(dt, regard = 0, camera = null) {
    this.t += dt;

    /* two things noticing you at once */
    this.hush += (clamp(regard, 0, 1) ** 2 - this.hush) * (1 - Math.exp(-1.3 * dt));
    const live = 1 - this.hush * 0.92;

    /* --- shape ---------------------------------------------------- */
    this.reshape -= dt;
    if (this.reshape <= 0) this.redrift();
    this.relimb -= dt;
    if (this.relimb <= 0) this.relimbNow();
    for (const k in this.p) this.p[k] = damp(this.p[k], this.target[k], 0.55, dt);

    this.nextGather -= dt;
    if (this.nextGather <= 0) { this.gathering = 3.5; this.nextGather = rand(35, 100); }
    if (this.gathering > 0) {
      this.gathering -= dt;
      this.coherence = damp(this.coherence, 1, 1.8, dt);
    } else {
      this.coherence = damp(this.coherence, 0, 0.8, dt);
    }

    this.warp(this.t * live, 1 - this.coherence * 0.94);

    /* --- movement ------------------------------------------------- */
    this.nextMode -= dt;
    if (this.nextMode <= 0) this.rebehave();

    const p = this.mesh.position;

    /* --- going after a patch -------------------------------------- */
    if (this.mode === "stalk") {
      /* NOT `taken > 0`: the moment it starts taking one, that test
         makes it abandon the thing it is in the middle of eating. */
      if (!this.quarry || this.quarry.dead) {
        this.quarry = null;
        this.mode = "drift";
      } else {
        const q = this.quarry.group.position;
        /* it comes forward, and the patch is drawn back toward it: they
           meet somewhere in between, which is the only time this thing
           is ever close enough to make out */
        this.vel.x = damp(this.vel.x, (q.x - p.x) * 0.55, 1.2, dt);
        this.vel.y = damp(this.vel.y, (q.y - p.y) * 0.55, 1.2, dt);
        this.vel.z = damp(this.vel.z, (q.z - p.z) * 0.32, 1.2, dt);
        /* and it stops holding its place in the frame */
        this.quarry.lure = 0.4;
        this.quarry.vel.z -= dt * 3.2;
        this.quarry.vel.x += (p.x - q.x) * dt * 0.5;
        this.quarry.vel.y += (p.y - q.y) * dt * 0.5;

        if (p.distanceTo(q) < TAKE_RANGE) {
          /* taking it. It shrinks and dims rather than blinking out,
             and afterwards this gathers -- which up to now has looked
             like a thing that occasionally becomes coherent for no
             reason, and now looks like digestion. */
          this.quarry.taken = clamp(this.quarry.taken + dt * 0.5, 0, 1);
          if (this.quarry.taken >= 1) {
            this.quarry = null;
            this.mode = "recede";
            this.vel.set(rand(-1, 1), rand(-0.4, 0.4), -1.4);
            this.nextMode = rand(8, 16);
            this.gathering = 4.5;
          }
        }
      }
    }

    if (this.mode === "circle" && this.orbit) {
      this.orbit.a += this.orbit.w * dt * live;
      p.x = damp(p.x, this.orbit.x + Math.cos(this.orbit.a) * this.orbit.r, 1.4, dt);
      p.y = damp(p.y, this.orbit.y + Math.sin(this.orbit.a) * this.orbit.r * 0.62, 1.4, dt);
    } else {
      p.addScaledVector(this.vel, dt * live);
    }

    /* --- where it is allowed to be -------------------------------- */
    const near = this.mode === "stalk" ? STALK_NEAR : NEAR;
    if (p.z > near) { p.z = near; this.vel.z = -Math.abs(this.vel.z); }
    if (p.z < FAR) { p.z = FAR; this.vel.z = Math.abs(this.vel.z); }

    /* Bounds from the camera, not from constants: the visible area at
       this depth is a different size on every window, and a creature
       meant to use the whole frame has to be told how big the frame
       currently is. */
    if (camera) {
      const dist = camera.position.z - p.z;
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist * 0.88;
      const halfW = halfH * camera.aspect;
      const cx = camera.position.x, cy = camera.position.y;
      if (p.x > cx + halfW) { p.x = cx + halfW; this.vel.x = -Math.abs(this.vel.x); }
      if (p.x < cx - halfW) { p.x = cx - halfW; this.vel.x = Math.abs(this.vel.x); }
      if (p.y > cy + halfH) { p.y = cy + halfH; this.vel.y = -Math.abs(this.vel.y); }
      if (p.y < cy - halfH) { p.y = cy - halfH; this.vel.y = Math.abs(this.vel.y); }
    }

    /* the depth cue the fog is no longer providing */
    const depth = clamp((near - p.z) / (near - FAR), 0, 1);
    this.mesh.material.opacity = 0.66 - depth * 0.26;

    if (this.hush > 0.4) {
      this.mesh.rotation.x = damp(this.mesh.rotation.x, 0, 1.4, dt);
      this.mesh.rotation.z = damp(this.mesh.rotation.z, 0, 1.4, dt);
      this.mesh.rotation.y = damp(this.mesh.rotation.y, 0, 1.4, dt);
    } else {
      this.mesh.rotation.x += this.spin.x * dt * live;
      this.mesh.rotation.y += this.spin.y * dt * live;
      this.mesh.rotation.z += this.spin.z * dt * live;
    }
  }

  /**
   * Five deformations, stacked, all scaled by `amount` so they release
   * together when it gathers.
   */
  warp(t, amount) {
    const { f1, f2, f3, a1, a2, a3, s1, s2, s3,
      twist, bendX, bendZ, sx, sy, sz } = this.p;
    const arr = this.pos.array;
    const b = this.base;
    const lobes = this.lobes;
    /* toward 1 as it gathers, so the stretch relaxes with the rest */
    const k1 = 1 + (sx - 1) * amount;
    const k2 = 1 + (sy - 1) * amount;
    const k3 = 1 + (sz - 1) * amount;

    for (let i = 0; i < this.pos.count; i++) {
      const j = i * 3;
      const x = b[j], y = b[j + 1], z = b[j + 2];

      let k = 1 +
        (Math.sin(x * f1 + t * s1) * Math.sin(y * f1 * 1.3 - t * s1 * 0.7) * a1 +
         Math.sin(y * f2 + t * s2) * Math.sin(z * f2 * 0.9 + t * s2 * 1.1) * a2 +
         Math.sin(z * f3 - t * s3) * Math.sin(x * f3 * 1.7 + t * s3 * 0.6) * a3) * amount;

      /* limbs */
      for (let L = 0; L < lobes.length; L++) {
        const lo = lobes[L];
        const d = x * lo.x + y * lo.y + z * lo.z;
        if (d > 0) k += Math.pow(d, lo.sharp) * lo.amp * amount;
      }

      let px = x * k * k1, py = y * k * k2, pz = z * k * k3;

      /* twist about Y, by height */
      const a = py * twist * amount;
      const ca = Math.cos(a), sa = Math.sin(a);
      const tx = px * ca - pz * sa;
      const tz = px * sa + pz * ca;

      /* and fold */
      arr[j] = tx + bendX * py * py * amount;
      arr[j + 1] = py;
      arr[j + 2] = tz + bendZ * py * py * amount;
    }
    this.pos.needsUpdate = true;

    /* Normals are only worth recomputing every few frames: flat shaded,
       a long way off, and mostly silhouette. */
    if ((this._normals = (this._normals + 1) % 3) === 0) this.geo.computeVertexNormals();
  }
}
