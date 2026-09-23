import * as THREE from "three";
import { MAT, ledMaterial } from "./materials.js";
import { rng } from "./math.js";

/* Shared hardware.
 *
 * Every builder here returns geometry centred on its own origin, in all
 * three axes. That is not a style preference -- the prototype's worst
 * bug was a rounded slab authored as if it had a corner origin, which
 * put a black bezel across the middle of the screen. Centre everything,
 * once, here, and that class of mistake cannot happen again.
 */

/**
 * A closed outline from bare points, with the corners cut rather than
 * radiused.
 *
 * Radiused corners are the signature of injection-moulded consumer
 * goods -- they exist because a mould has to release and because a
 * product has to survive a pocket. A chamfer reads as machined or cast
 * instead, which is most of the distance between "a thing that was sold
 * to people" and "a thing that was made".
 *
 * `cut` is the length taken off each corner.
 */
export function faceted(pts, cut = 0.18) {
  const s = new THREE.Shape();
  const n = pts.length;
  const V = (p) => new THREE.Vector2(p[0], p[1]);
  for (let i = 0; i < n; i++) {
    const prev = V(pts[(i + n - 1) % n]);
    const cur = V(pts[i]);
    const next = V(pts[(i + 1) % n]);
    const a = new THREE.Vector2().subVectors(prev, cur).normalize()
      .multiplyScalar(Math.min(cut, prev.distanceTo(cur) * 0.45)).add(cur);
    const b = new THREE.Vector2().subVectors(next, cur).normalize()
      .multiplyScalar(Math.min(cut, next.distanceTo(cur) * 0.45)).add(cur);
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.lineTo(b.x, b.y);
  }
  s.closePath();
  return s;
}

/**
 * A curve of constant width with `lobes` sides -- the Reuleaux family.
 *
 * It rolls like a circle but is not one, and human product design
 * essentially never uses it because there is no reason to. Which is
 * exactly the reason to use it here: it is unmistakably a deliberate
 * geometric form and unmistakably not one of ours.
 */
export function reuleaux(r, lobes = 3, samples = 96, phase = Math.PI / 2) {
  const s = new THREE.Shape();
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    /* bulge outward between vertices, so every side is a shallow arc.
       The default phase puts a lobe at the top, where the eyelet goes. */
    const rad = r * (1 + 0.085 * Math.cos(lobes * t - lobes * phase));
    const x = Math.cos(t) * rad, y = Math.sin(t) * rad;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

/** Rounded rectangle, centred on (0,0). */
export function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Rounded slab, centred on the origin in x, y AND z, and measuring
 * exactly w x h x d including its bevel.
 */
export function roundedBox(w, h, d, r, bevel = 0.035) {
  const b = Math.min(bevel, d / 2 - 0.001, w / 2 - 0.001, h / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(
    roundedShape(w - b * 2, h - b * 2, Math.max(0.001, r - b)),
    {
      depth: d - b * 2,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: b,
      bevelThickness: b,
      steps: 1,
      curveSegments: 14,
    },
  );
  g.center();
  return g;
}

/**
 * A rounded frame: outer rectangle with a rectangular hole through it.
 *
 * Screen surrounds are built with this rather than as a slab placed
 * behind the display. A slab has to be positioned to a tolerance finer
 * than its own thickness or it covers the screen -- which is exactly the
 * bug that made the last prototype unusable. A frame has a hole in it,
 * so there is no position at which it can hide anything.
 */
export function roundedFrame(ow, oh, iw, ih, r = 0.16, ir = 0.06) {
  const s = roundedShape(ow, oh, r);
  const hole = new THREE.Path(roundedShape(iw, ih, ir).getPoints(24).reverse());
  s.holes.push(hole);
  return s;
}

/** Triangle with rounded corners, centred -- the Unknown device's shell. */
export function roundedTriangle(size, r) {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    pts.push(new THREE.Vector2(Math.cos(a) * size, Math.sin(a) * size));
  }
  const s = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const prev = pts[(i + 2) % 3];
    const cur = pts[i];
    const next = pts[(i + 1) % 3];
    // where the straight run arrives at this corner, and where it leaves
    const arrive = new THREE.Vector2().subVectors(prev, cur).normalize().multiplyScalar(r).add(cur);
    const leave = new THREE.Vector2().subVectors(next, cur).normalize().multiplyScalar(r).add(cur);
    if (i === 0) s.moveTo(arrive.x, arrive.y);
    else s.lineTo(arrive.x, arrive.y);
    s.quadraticCurveTo(cur.x, cur.y, leave.x, leave.y);
  }
  s.closePath();
  return s;
}

export function extrude(shape, d, bevel = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - bevel * 2, bevelEnabled: true, bevelSegments: 2,
    bevelSize: bevel, bevelThickness: bevel, steps: 1, curveSegments: 12,
  });
  g.center();
  return g;
}

/* ---------- fittings ---------- */

const SCREW_HEAD = new THREE.CylinderGeometry(1, 1, 0.34, 14);
const SLOT = new THREE.BoxGeometry(1.62, 0.1, 0.16);

/** A crosshead screw. Each one sits at its own angle; they always do. */
export function screw(parent, x, y, z, s = 0.16, angle = 0) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(SCREW_HEAD, MAT.brass);
  head.rotation.x = Math.PI / 2;        // axis along z, so the face points at us
  g.add(head);
  for (let i = 0; i < 2; i++) {
    const slot = new THREE.Mesh(SLOT, MAT.metalDark);
    slot.rotation.z = (i * Math.PI) / 2;
    slot.position.z = 0.15;             // cut into the top of the head
    g.add(slot);
  }
  g.scale.setScalar(s);
  g.position.set(x, y, z);
  g.rotation.z = angle;
  parent.add(g);
  return g;
}

/** A soft rubber button. */
export function domeButton(parent, x, y, z, r = 0.2, mat = MAT.rubber) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.scale.z = 0.55;
  parent.add(m);
  return m;
}

export function pillButton(parent, x, y, z, w = 0.5, h = 0.24, mat = MAT.plasticDark) {
  const m = new THREE.Mesh(roundedBox(w, h, 0.12, h / 2, 0.03), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Four-way pad, one piece, as they were moulded. */
export function dpad(parent, x, y, z, size = 0.95) {
  const g = new THREE.Group();
  const arm = roundedBox(size * 2.1, size * 0.72, 0.2, 0.1, 0.04);
  const a = new THREE.Mesh(arm, MAT.plasticDark);
  const b = new THREE.Mesh(arm, MAT.plasticDark);
  b.rotation.z = Math.PI / 2;
  g.add(a, b);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.3, size * 0.3, 0.1, 14), MAT.plasticDark);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.05;
  g.add(hub);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function led(parent, x, y, z, color = 0xff2b4e, r = 0.075, intensity = 3.4) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), ledMaterial(color, intensity));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * A sunken ring with a boss in the middle of it.
 *
 * This replaces the four-way pad. A D-pad is a thumb-cross: it exists
 * because a hand has one opposable digit and four directions is what
 * that digit can reach. A continuous ring has no directions and no
 * handedness, and you cannot tell by looking whether it turns, presses,
 * or does nothing at all.
 */
export function ringControl(parent, x, y, z, outer = 0.62, inner = 0.26) {
  const g = new THREE.Group();

  const well = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 40),
    new THREE.MeshStandardMaterial({ color: 0x111614, roughness: 0.95 }),
  );
  g.add(well);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry((outer + inner) / 2, (outer - inner) * 0.3, 8, 44),
    MAT.plasticDark,
  );
  rim.position.z = 0.03;
  g.add(rim);

  const boss = new THREE.Mesh(
    new THREE.CylinderGeometry(inner * 0.82, inner * 0.9, 0.12, 20),
    MAT.metalDark,
  );
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.04;
  g.add(boss);

  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * A run of identical unmarked nubs at uneven spacing.
 *
 * Nothing distinguishes one from another and nothing says what any of
 * them is for. Human controls are differentiated because a person has
 * to find the right one without looking; these are not.
 */
export function nubs(parent, x, y, z, count = 5, pitch = 0.34, seed = 5) {
  const r = rng(seed);
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.078, 0.09, 0.11, 12);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, MAT.plasticDark);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, -i * pitch - (r() - 0.5) * pitch * 0.5, 0);
    g.add(m);
  }
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** A printed label lying on a surface. */
export function decal(parent, w, h, texture, x, y, z, rotZ = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.78, metalness: 0,
      transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  );
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  parent.add(m);
  return m;
}

/** Rows of punched holes over a dark cavity. */
export function speaker(parent, x, y, z, w, h, holeTex) {
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.rubber);
  back.position.set(x, y, z - 0.03);
  parent.add(back);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: 0x3a403e, roughness: 0.7, alphaMap: holeTex,
      transparent: true, alphaTest: 0.45,
    }),
  );
  face.position.set(x, y, z);
  parent.add(face);
  return face;
}
