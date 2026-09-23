import * as THREE from "three";
import { clamp, damp, TAU } from "../lib/math.js";

/* Thread, and what happens to it once it is cut free.
 *
 * Stitches are real geometry rather than lines drawn into a canvas
 * texture: each one is a short cylinder, instanced, so two hundred of
 * them cost a single draw call and every one of them catches the light
 * and casts a shadow the way a raised thread does. A texture would be
 * flat, and the whole point of a stitch is that it sits proud of the
 * cloth.
 *
 * A stitch is a straight segment between two points, because that is
 * what a stitch is. You cannot draw a curve with one pass of a needle,
 * and refusing to let the user do so is what makes this read as
 * embroidery rather than as a paint tool -- the angular, faceted look
 * of the results is not a limitation, it is the medium.
 */

const THREAD_R = 0.018;
const UP = new THREE.Vector3(0, 1, 0);

/* Five reels, and the spool cycles them in order.
 *
 * Five rather than nine, and ordered rather than random, because this
 * is the one device on the ring where the visitor is AUTHORING
 * something. Everywhere else -- the treatment unit, the rotor -- taking
 * what you are given is the point. Here you need to be able to get back
 * to the colour you used two stitches ago, and a random draw from nine
 * cannot promise you that.
 *
 * Dyed, faded, and none of them clean. */
export const THREADS = [
  0xb4433a,   // rust
  0xc9873f,   // ochre
  0x7d8f4a,   // olive
  0x3f6f79,   // petrol
  0xd8cdb8,   // bone
];

/**
 * An instanced run of stitches. Rebuilt in place whenever the list
 * changes, which for a hoop being worked on is once per stitch.
 */
export class Stitching {
  constructor(max = 220) {
    this.max = max;
    this.geo = new THREE.CylinderGeometry(THREAD_R, THREAD_R, 1, 5);
    /* White, because the colour comes per instance. Changing the spool
       has to leave the thread already in the cloth alone -- recolouring
       the whole piece when you pick up a different reel is not a thing
       that can happen to embroidery. */
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.86, metalness: 0.03,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** @param list array of {ax, ay, bx, by} in the surface's own plane */
  rebuild(list) {
    const n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const len = Math.hypot(dx, dy) || 0.001;

      /* the cylinder runs along Y, so turn Y onto the stitch */
      this._d.set(dx, dy, 0).divideScalar(len);
      this._q.setFromUnitVectors(UP, this._d);
      /* a hair of lift, and a hair of jitter, so crossing threads sit
         over each other instead of z-fighting in the same plane */
      this._p.set((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.012 + (i % 5) * 0.0016);
      this._s.set(1, len, 1);

      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, this._c.setHex(s.c ?? THREADS[0]));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */

/**
 * A cut-free patch, adrift.
 *
 * It keeps the stitches and a scrap of the backing it was worked on,
 * and it tumbles slowly through the scene on its own. It is the only
 * thing here the visitor made, which is why the creature wants it.
 */
export class Patch {
  constructor(list, camera) {
    this.group = new THREE.Group();

    /* the scrap of cloth it was cut out of, following the stitching's
       own extent with a ragged margin */
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const s of list) {
      minX = Math.min(minX, s.ax, s.bx); maxX = Math.max(maxX, s.ax, s.bx);
      minY = Math.min(minY, s.ay, s.by); maxY = Math.max(maxY, s.ay, s.by);
    }
    const pad = 0.16;
    const w = Math.max(0.4, maxX - minX) + pad * 2;
    const h = Math.max(0.4, maxY - minY) + pad * 2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h, 6, 6),
      new THREE.MeshStandardMaterial({
        color: 0xbdb6a2, roughness: 0.94, metalness: 0,
        side: THREE.DoubleSide, transparent: true, opacity: 0.95,
      }),
    );
    cloth.position.set(cx, cy, 0);
    this.group.add(cloth);
    this.cloth = cloth;

    this.stitching = new Stitching(list.length);
    this.stitching.rebuild(list);
    this.group.add(this.stitching.mesh);

    /* pivot about the middle of the cloth, not the hoop's origin */
    this.group.children.forEach((c) => { c.position.x -= cx; c.position.y -= cy; });
    cloth.position.set(0, 0, 0);

    this.scale = 1;
    this.group.scale.setScalar(1);
    this.dead = false;
    /* set every frame by whatever is dragging it away; while it is
       being lured the patch stops holding its own depth and is
       allowed much further back than it could ever drift */
    this.lure = 0;
    this.taken = 0;              // 0..1 as the creature draws it in
    this.age = 0;

    /* thrown clear of the device, then left to drift */
    this.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9);
    this.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.5);
    this.camera = camera;
  }

  get position() { return this.group.position; }

  update(dt) {
    this.age += dt;
    const p = this.group.position;

    const lured = this.lure > 0;
    if (this.lure > 0) this.lure -= dt;

    if (this.taken > 0) {
      /* Whatever had hold of it has let go, so it comes back. A patch
         that can only ever be eaten is a countdown; one that can get
         away is a chase. */
      if (!lured) this.taken = Math.max(0, this.taken - dt * 0.45);

      this.group.scale.setScalar(Math.max(0.001, 1 - this.taken));
      this.cloth.material.opacity = 0.95 * (1 - this.taken);
      this.stitching.mat.transparent = true;
      this.stitching.mat.opacity = 1 - this.taken;
      if (this.taken >= 1) { this.dead = true; return; }
      if (this.taken > 0) return;
    }

    p.addScaledVector(this.vel, dt);
    /* a scrap of cloth does not fall, it settles -- unless something is
       pulling it, in which case it stops resisting */
    this.vel.y = damp(this.vel.y, -0.08, lured ? 0.15 : 0.6, dt);
    this.vel.x = damp(this.vel.x, lured ? this.vel.x : Math.sin(this.age * 0.5) * 0.35, 0.5, dt);
    if (!lured) this.vel.z = damp(this.vel.z, 0, 0.4, dt);

    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    /* keep it inside the frame it was cut into */
    const cam = this.camera;
    if (cam) {
      const dist = Math.max(4, cam.position.z - p.z);
      const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist * 0.86;
      const halfW = halfH * cam.aspect;
      if (!lured) {
        if (p.x > cam.position.x + halfW) { p.x = cam.position.x + halfW; this.vel.x *= -0.7; }
        if (p.x < cam.position.x - halfW) { p.x = cam.position.x - halfW; this.vel.x *= -0.7; }
        if (p.y > cam.position.y + halfH) { p.y = cam.position.y + halfH; this.vel.y *= -0.7; }
        if (p.y < cam.position.y - halfH) { p.y = cam.position.y - halfH; this.vel.y *= -0.5; }
      }
      if (p.z > 9) { p.z = 9; this.vel.z *= -0.7; }
      const back = lured ? -44 : -16;
      if (p.z < back) { p.z = back; this.vel.z *= -0.7; }
    }
  }

  dispose() {
    this.stitching.dispose();
    this.cloth.geometry.dispose();
    this.cloth.material.dispose();
  }
}

/**
 * The register of everything cut free so far.
 *
 * The creature reads this. It is the only channel between something the
 * visitor made and the thing in the dark, and it runs one way.
 */
export class Patches {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.list = [];
  }

  add(stitches, at) {
    if (!stitches.length) return null;
    const p = new Patch(stitches, this.camera);
    p.group.position.copy(at);
    this.scene.add(p.group);
    this.list.push(p);
    /* a keyring can only shed so much before the scene is a washing
       line; the oldest goes when the ninth arrives */
    if (this.list.length > 8) this.remove(this.list[0]);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(p.group);
    p.dispose();
  }

  /** The one nearest a given point, for the creature to go after. */
  nearest(to) {
    let best = null, d2 = Infinity;
    for (const p of this.list) {
      if (p.taken > 0) continue;
      const d = p.group.position.distanceToSquared(to);
      if (d < d2) { d2 = d; best = p; }
    }
    return best;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.update(dt);
      if (p.dead) this.remove(p);
    }
  }
}
