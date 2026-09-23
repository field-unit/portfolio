import * as THREE from "three";

/* Pointer, wheel, key and touch, routed to one thing at a time.
 *
 * THE GRIP
 *
 * The prototype decided what the wheel meant on every single event, by
 * asking what the pointer was over right then. That is the one genuinely
 * broken thing in the old grammar, because the halo is moving while you
 * scroll: a device swings under a stationary cursor and your wheel
 * silently stops rotating the carousel and starts turning a device
 * instead. You cannot learn a rule that changes underneath you.
 *
 * So the wheel is gripped. The first event of a gesture decides the
 * target -- hovered device, or the halo -- and that target keeps the
 * wheel until you stop scrolling for GRIP_MS. Immediate, so there is no
 * lag before the object responds, but stable for the whole gesture.
 */

const GRIP_MS = 260;
const CLICK_SLOP = 6;      // px of travel still counted as a click
const CLICK_MS = 550;

export class Input {
  constructor({ canvas, stage, halo, hud }) {
    this.canvas = canvas;
    this.stage = stage;
    this.camera = stage.camera;
    this.halo = halo;
    this.hud = hud;

    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.drawing = null;
    this._plane = new THREE.Plane();
    this._n = new THREE.Vector3();
    this._o = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._hit = new THREE.Vector3();
    this.targets = [];
    for (const d of halo.devices) this.targets.push(...d.hitTargets);

    this.hover = null;
    this.grip = null;          // device | "halo" | null
    this.gripAt = 0;
    this.down = false;
    this.dragDevice = null;
    this.dragged = 0;
    this.downAt = 0;
    this.last = { x: 0, y: 0 };

    canvas.addEventListener("pointermove", this.onMove, { passive: true });
    canvas.addEventListener("pointerdown", this.onDown);
    addEventListener("pointerup", this.onUp);
    addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    addEventListener("keydown", this.onKey);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /* ---------- picking ---------- */

  /** The nearest mesh under the pointer, or null. */
  pickObject(x, y) {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.targets, false);
    return hits.length ? hits[0].object : null;
  }

  pick(x, y) {
    const o = this.pickObject(x, y);
    return o ? o.userData.device : null;
  }

  /**
   * Where the pointer lands on a device's own front plane, in that
   * device's local coordinates.
   *
   * Deliberately a plane intersection rather than a mesh hit: while you
   * are drawing a stitch you will drag past the edge of the cloth, and
   * the needle should keep tracking so the device can clamp it back to
   * the fabric itself. A mesh test would simply stop reporting.
   */
  surfacePoint(device, x, y) {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    device.body.getWorldQuaternion(this._q);
    this._n.set(0, 0, 1).applyQuaternion(this._q);
    device.body.getWorldPosition(this._o);
    this._plane.setFromNormalAndCoplanarPoint(this._n, this._o);
    if (!this.ray.ray.intersectPlane(this._plane, this._hit)) return null;
    return device.body.worldToLocal(this._hit.clone());
  }

  setHover(d) {
    if (d === this.hover) return;
    this.hover?.onHover(false);
    this.hover = d;
    d?.onHover(true);
    this.hud.hover(d, this.halo.focused);
    const c = this.canvas.classList;
    c.toggle("is-over", !!d && !d.usable);
    c.toggle("is-ready", !!d && d.usable);
  }

  /* ---------- pointer ---------- */

  onMove = (e) => {
    if (this.drawing) {
      const local = this.surfacePoint(this.drawing, e.clientX, e.clientY);
      if (local) this.drawing.dragDraw(local);
      return;
    }
    if (this.down) {
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.dragged += Math.abs(dx) + Math.abs(dy);
      this.last = { x: e.clientX, y: e.clientY };

      if (this.dragged > CLICK_SLOP) {
        if (this.dragDevice) {
          this.dragDevice.dragging = true;
          this.dragDevice.yaw += dx * 0.012;
          this.dragDevice.yawVel = dx * 0.5;
        } else if (!this.halo.focused) {
          this.halo.dragBy(dx * 0.016, -dy * 0.016);
        }
        this.canvas.classList.add("is-held");
      }
      return;
    }
    this.setHover(this.pick(e.clientX, e.clientY));
  };

  onDown = (e) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.down = true;
    this.dragged = 0;
    this.downAt = performance.now();
    this.last = { x: e.clientX, y: e.clientY };

    /* touch has no hover, so the press has to establish it */
    const hit = this.pick(e.clientX, e.clientY);
    this.setHover(hit);

    /* A device you can draw on takes the drag before anything else does
       -- one press-drag-release is one stitch. */
    const focused = this.halo.focused;
    if (focused && focused.beginDraw) {
      const obj = this.pickObject(e.clientX, e.clientY);
      if (obj && obj.userData.surface && obj.userData.device === focused) {
        const local = this.surfacePoint(focused, e.clientX, e.clientY);
        if (local && focused.beginDraw(local)) { this.drawing = focused; return; }
      }
    }

    if (hit && !this.halo.focused) this.dragDevice = hit;
    else if (!this.halo.focused) this.halo.grab();
  };

  onUp = (e) => {
    if (this.drawing) {
      this.drawing.endDraw();
      this.hud.focus(this.drawing);
      this.drawing = null;
      this.down = false;
      return;
    }
    if (!this.down) return;
    this.down = false;
    this.canvas.classList.remove("is-held");
    if (this.dragDevice) this.dragDevice.dragging = false;
    this.halo.release();

    const quick = performance.now() - this.downAt < CLICK_MS;
    if (this.dragged <= CLICK_SLOP && quick) this.click(e);

    this.dragDevice = null;
  };

  click(e) {
    const hit = this.pick(e.clientX, e.clientY);
    const focused = this.halo.focused;

    if (focused) {
      /* Clicking the device you are holding operates it. Clicking past
         it puts it back on the ring. */
      if (hit === focused) {
        /* A device with more than one control gets to decide which part
           of itself you actually hit, rather than the input layer
           guessing from a bounding box. */
        if (focused.press && focused.press(this.pickObject(e.clientX, e.clientY))) {
          this.hud.focus(focused);
          return;
        }
        if (focused.shell) focused.shell.enter();
      } else this.blur();
      return;
    }
    if (!hit) return;

    if (hit.usable) {
      this.halo.focus(hit);
      hit.onApproach(true);
      this.hud.focus(hit);
    } else {
      /* The rule teaches itself here: you clicked, nothing opened, and
         the readout tells you which way round the thing is. */
      this.hud.refuse(hit);
    }
  }

  blur() {
    const f = this.halo.focused;
    if (!f) return;
    f.onApproach(false);
    this.halo.blur();
    this.hud.focus(null);
  }

  /* ---------- wheel ---------- */

  onWheel = (e) => {
    e.preventDefault();
    const raw = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const delta = Math.max(-2.2, Math.min(2.2, raw / 90));

    const focused = this.halo.focused;
    if (focused) {
      focused.onWheel(delta);
      this.hud.wheel(focused);
      return;
    }

    const now = performance.now();
    if (now - this.gripAt > GRIP_MS) this.grip = null;
    if (!this.grip) this.grip = this.hover || "halo";
    this.gripAt = now;

    if (this.grip === "halo") {
      this.halo.rotate(delta * 1.5);
      this.hud.mode("HALO");
    } else {
      this.grip.spin(delta * 2.6);
      this.hud.mode(this.grip.code);
    }
  };

  /* ---------- keys ---------- */

  onKey = (e) => {
    const focused = this.halo.focused;

    if (e.key === "Escape") {
      /* Esc puts the object down. It is not a Back button and it never
         steps through the firmware first -- the physical act of letting
         go of a thing should not depend on which menu it is showing.
         Backing up inside the device is Left or Backspace. */
      this.blur();
      return;
    }

    if (focused && focused.onKey(e.key)) { e.preventDefault(); return; }

    switch (e.key) {
      case "ArrowLeft": this.halo.rotate(-1.4); e.preventDefault(); break;
      case "ArrowRight": this.halo.rotate(1.4); e.preventDefault(); break;
      case "Tab": {
        /* keyboard-only way round the ring */
        e.preventDefault();
        const ds = this.halo.devices;
        const i = ds.indexOf(this.hover);
        this.setHover(ds[(i + (e.shiftKey ? -1 : 1) + ds.length) % ds.length]);
        break;
      }
      case "Enter": case " ":
        if (this.hover) {
          if (this.hover.usable) {
            this.halo.focus(this.hover);
            this.hover.onApproach(true);
            this.hud.focus(this.hover);
          } else this.hud.refuse(this.hover);
          e.preventDefault();
        }
        break;
      default: break;
    }
  };

  update() {
    if (performance.now() - this.gripAt > GRIP_MS) this.grip = null;
  }
}
