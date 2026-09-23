import * as THREE from "three";
import { wear, pcb } from "./textures.js";

/* The material set, taken from the reference sheet: dirty smoke
 * polycarbonate, cheap pink clear plastic, yellowed ivory, worn nickel,
 * brass screws, dark rubber and one piece of stone that is not
 * electronic at all.
 *
 * The clear shells use opacity rather than `transmission`. Real
 * transmission costs a full render target per frame per object and
 * looks, on a scuffed 2001 casing, very slightly too good -- these
 * mouldings were cloudy, and cloudy is cheaper.
 */

const scuffPoly  = wear("#6b706a", 11, 0.24);
const scuffMetal = wear("#7d817c", 23, 0.30);
const scuffStone = wear("#8b8579", 41, 0.34);
const board = pcb(31);

function shell(color, opacity, roughness = 0.22) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    transparent: true,
    opacity,
    clearcoat: 0.85,
    clearcoatRoughness: 0.28,
    roughnessMap: scuffPoly,
    depthWrite: false,      // so the internals stay visible through it
    side: THREE.DoubleSide,
  });
  return m;
}

export const MAT = {
  /* Receiver casing: smoke grey, thick, scratched to hell. Dark and
     fairly opaque -- a 2001 smoke moulding let you see that there was a
     board in there, not read the silkscreen off it. */
  smoke: shell(0x3c4442, 0.78),

  /* Access A-17: cheap pink translucent plastic. The only thing kept
     from the novelty-USB reference the device used to be. */
  pink: shell(0xc2708f, 0.62, 0.18),

  /* Unknown device: colder and clearer than the Receiver, but still
     a smoked moulding -- too light and it reads as white plastic. */
  clear: shell(0x62707a, 0.56, 0.14),

  /* Pronouncer casing: yellowed bone, cloudier than the Receiver's
     smoke and warmer than any of the others. */
  bone: shell(0xb2a888, 0.8, 0.4),

  /* K-4 casing: olive, heavier and more industrial than the rest --
     the only thing on the ring that looks like equipment rather than a
     consumer object. */
  olive: shell(0x6b6b3e, 0.76, 0.5),

  ivory: new THREE.MeshStandardMaterial({
    color: 0xbdb59b, roughness: 0.62, metalness: 0.02, roughnessMap: scuffPoly,
  }),

  metal: new THREE.MeshStandardMaterial({
    color: 0x9aa0a0, roughness: 0.38, metalness: 0.92, roughnessMap: scuffMetal,
  }),

  metalDark: new THREE.MeshStandardMaterial({
    color: 0x4a5150, roughness: 0.52, metalness: 0.78, roughnessMap: scuffMetal,
  }),

  brass: new THREE.MeshStandardMaterial({
    color: 0xb08b45, roughness: 0.42, metalness: 0.95,
  }),

  rubber: new THREE.MeshStandardMaterial({
    color: 0x1b1e1e, roughness: 0.88, metalness: 0.02,
  }),

  plasticDark: new THREE.MeshStandardMaterial({
    color: 0x24292a, roughness: 0.66, metalness: 0.04, roughnessMap: scuffPoly,
  }),

  board: new THREE.MeshStandardMaterial({
    color: 0xffffff, map: board, roughness: 0.74, metalness: 0.18,
  }),

  stone: new THREE.MeshStandardMaterial({
    color: 0x8e8878, roughness: 0.94, metalness: 0.06,
    roughnessMap: scuffStone, map: scuffStone,
  }),

  /* The window over the LCD. A haze and a highlight, not a filter --
     it wants to look like scratched acrylic somebody has had in their
     pocket, without stealing the backlight it is covering. */
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xb4c6bc, roughness: 0.34, metalness: 0.02,
    clearcoat: 0.55, clearcoatRoughness: 0.4,
    transparent: true, opacity: 0.07, depthWrite: false,
  }),
};

/** A tiny saturated indicator. Emissive so it survives the dark. */
export function ledMaterial(color, intensity = 3.4) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    transparent: true,
    opacity: 0.94,
  });
}
