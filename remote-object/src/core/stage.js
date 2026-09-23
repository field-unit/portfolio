import * as THREE from "three";
import { Presence } from "./field.js";
import { Patches } from "./patch.js";

/* Renderer, camera and the dark the object hangs in.
 *
 * The lighting is doing most of the work of making a procedural model
 * read as a physical thing: one hard key so the mouldings catch an
 * edge, a cold rim to separate the object from the background, and a
 * weak warm bounce from below so the underside is not simply black.
 */

const ZERO = { crush: 0, grain: 0, scan: 0, warmth: 0, exposure: 0, pulse: 0, pulseRate: 2 };

export const reducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060809);
    this.scene.fog = new THREE.FogExp2(0x060809, 0.021);

    /* The ring hangs at y=0 and the Receiver's foot reaches about -7,
       so the object's centre of mass is well below the origin and the
       camera has to sit down there with it. */
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 140);
    this.camera.position.set(0, -3.6, 21);

    this.scene.add(new THREE.HemisphereLight(0x6d8a85, 0x0d1011, 1.15));

    const key = new THREE.DirectionalLight(0xdbe8e0, 4.4);
    key.position.set(-6, 9, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    const s = 9;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0012;
    this.scene.add(key);

    const rim = new THREE.PointLight(0x6f8cff, 44, 30, 2);
    rim.position.set(7, 0, 5);
    this.scene.add(rim);

    const bounce = new THREE.PointLight(0xff9f6a, 22, 24, 2);
    bounce.position.set(-5.5, -7, 4.5);
    this.scene.add(bounce);

    const fill = new THREE.DirectionalLight(0xbcd2cc, 1.1);
    fill.position.set(3, -6, 9);
    this.scene.add(fill);

    this.dust = makeDust();
    this.scene.add(this.dust);

    /* Something else, a long way out, that will not hold a shape.
       See field.js -- it is the only other thing in here and it is
       alive. */
    this.presence = new Presence();
    this.scene.add(this.presence.group);

    /* Cut-free work drifts here, and the presence can see it. */
    this.patches = new Patches(this.scene, this.camera);
    this.presence.patches = this.patches;

    this.key = key;
    this._keyBase = key.intensity;
    this._keyHue = key.color.clone();
    this._basePR = Math.min(devicePixelRatio, 2);
    this._pr = this._basePR;
    this._css = { grain: -1, scan: -1 };
    this._camBase = this.camera.position.clone();
    this.t = 0;

    this.resize();
    addEventListener("resize", () => this.resize(), { passive: true });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    /* On a narrow screen the object has to sit further away or it will
       not fit between the edges at all. */
    /* the breathing in update() reads from _camBase, so the resting
       distance has to be recorded there and not just on the camera */
    this._camBase.z = w / h < 0.85 ? 27 : 21;
    this.camera.position.z = this._camBase.z;
    this.camera.updateProjectionMatrix();
  }

  update(dt, ctx) {
    this.t += dt;

    /* The treatment unit's visual signature is applied whether or not
       motion is reduced -- it is a change of picture, not of movement,
       and a visitor who has asked for less animation has not asked to
       be lied to about what the audio is doing. */
    this.treat(ctx && ctx.treat ? ctx.treat.look : null);

    if (reducedMotion) return;

    this.dust.rotation.y += dt * 0.012;
    this.dust.position.y = Math.sin(this.t * 0.19) * 0.4;

    const regard = ctx && ctx.attention ? ctx.attention.regard : 0;
    /* the camera goes in so it can work out how big the frame is */
    this.presence.update(dt, regard, this.camera);
    this.patches.update(dt);

    /* Breathing. Far too small to see happening and just large enough
       to stop the frame feeling like a photograph. */
    const b = Math.sin(this.t * 0.42);
    this.camera.position.y = this._camBase.y + b * 0.09;
    /* and it leans in fractionally when it is paying attention */
    this.camera.position.z = this._camBase.z - regard * 0.55 + b * 0.05;

    /* the room gets darker the more interested it is */
    this.key.intensity = this._keyBase * (1 - regard * 0.3);
    this.scene.fog.density = 0.021 + regard * 0.006;
  }

  /**
   * What K-4 is doing to the sound, done to the picture.
   *
   * The interesting one is `crush`. There is no post-processing pass
   * here, and adding one for this would be a lot of machinery -- but
   * bit reduction has an exact analogue that costs nothing: render at a
   * lower resolution. Dropping the device pixel ratio genuinely
   * quantises the image, in the same way and for the same reason the
   * waveshaper quantises the signal. It is only reset when it moves
   * enough to matter, because resizing the drawing buffer is not free.
   */
  treat(look) {
    const L = look || ZERO;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    const pulse = L.pulse
      ? Math.sin(this.t * (L.pulseRate || 2) * Math.PI * 2) * clamp01(L.pulse) * 0.17
      : 0;
    this.renderer.toneMappingExposure = 1.06 * (1 + L.exposure * 0.3 + pulse);

    /* warm and dull, or thin and cold */
    const w = Math.max(-1, Math.min(1, L.warmth));
    this.key.color.setRGB(
      this._keyHue.r + w * 0.16,
      this._keyHue.g - Math.abs(w) * 0.05,
      this._keyHue.b - w * 0.18,
    );

    const want = this._basePR * (1 - clamp01(L.crush) * 0.66);
    if (Math.abs(want - this._pr) > 0.09) {
      this._pr = want;
      this.renderer.setPixelRatio(Math.max(0.34, want));
      this.renderer.setSize(innerWidth, innerHeight, false);
    }

    /* the two flat passes live in CSS, so they are set there */
    const grain = clamp01(L.grain), scan = clamp01(L.scan);
    if (Math.abs(grain - this._css.grain) > 0.02) {
      this._css.grain = grain;
      document.documentElement.style.setProperty("--fx-grain", grain.toFixed(2));
    }
    if (Math.abs(scan - this._css.scan) > 0.02) {
      this._css.scan = scan;
      document.documentElement.style.setProperty("--fx-scan", scan.toFixed(2));
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function makeDust() {
  const N = 240;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x93a9a1, size: 0.02, transparent: true, opacity: 0.22, depthWrite: false,
  }));
}
