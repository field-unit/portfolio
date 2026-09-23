import { span } from "../system/witness.js";

/* The diagnostics line.
 *
 * This is the only teaching the object does, and it teaches by
 * reporting rather than instructing. It never says "scroll to rotate";
 * it says SCREEN SIDE, or EDGE, or REVERSE, and lets you work out that
 * those are three states of the same thing and that one of them is the
 * one you want.
 *
 * And when there is nothing under the pointer and it has been attending
 * to you for a while, the readout fills its three fields in anyway --
 * with you. Same panel, same layout, same flat wording it uses for a
 * piece of hardware. It is not addressing you. It is logging you, in
 * the slot where it logs objects, which is worse.
 */

export class Hud {
  constructor(ctx = {}) {
    this.el = document.getElementById("hud");
    this.read = document.getElementById("hudRead");
    this.code = document.getElementById("hudCode");
    this.name = document.getElementById("hudName");
    this.face = document.getElementById("hudFace");
    this.modeEl = document.getElementById("hudMode");
    this.playEl = document.getElementById("hudPlay");
    this.session = document.getElementById("hudSession");

    this.witness = ctx.witness;
    this.attention = ctx.attention;

    this.current = null;
    this.focused = null;
    this.msg = "";
    this.msgUntil = 0;
    this.t = 0;
    this._observer = false;
  }

  show() {
    this.el.hidden = false;
    const w = this.witness;
    /* the corner label keeps pace with the entry sequence */
    this.session.textContent =
      !w || w.visits <= 1 ? "CLIENT UNREGISTERED"
      : w.visits === 2 ? "CLIENT RECOGNISED"
      : "CLIENT EXPECTED";
  }

  hover(device, focused) {
    this.current = device || focused || null;
    this._observer = false;
    this.read.hidden = !this.current;
    if (!this.current) return;
    this.code.textContent = this.current.code;
    this.name.textContent = this.current.name;
  }

  focus(device) {
    this.focused = device;
    if (device) {
      this.mode(device.readout
        || (device.shell ? device.shell.wheelMeaning || device.code : device.code));
      this.hover(device, device);
    } else {
      this.mode("HALO");
      this.hover(null, null);
    }
  }

  refuse(device) {
    /* Not an error. A statement of fact about which way round it is.
       The readout has to be forced open here: on a touch screen there
       is no hover, so tapping a device that is facing away is the first
       time the reader sees this panel at all. */
    this.hover(device, device);
    this.witness?.note("refused");
    this.msg = device.refusal;
    this.msgUntil = this.t + 2.4;
  }

  /** A passing remark with nothing under the pointer to attach it to. */
  note(text) {
    this._observer = false;
    this._note = true;
    this.current = null;
    this.read.hidden = false;
    this.code.textContent = "--";
    this.name.textContent = "OBJECT";
    this.msg = text;
    this.msgUntil = this.t + 2.8;
  }

  mode(text) { this.modeEl.textContent = text; }

  wheel(device) {
    if (device.shell) this.mode(device.shell.wheelMeaning || device.code);
  }

  playing(player) {
    const on = player.object && player.playing;
    this.playEl.hidden = !on;
    if (on) this.playEl.textContent = "▶ " + player.object.title;
  }

  /** The three fields, filled in with the person reading them. */
  observe(att) {
    if (!this._observer) {
      this._observer = true;
      this.current = null;
      this.read.hidden = false;
      this.code.textContent = "--";
      this.name.textContent = "OBSERVER";
    }
    const w = this.witness;
    this.face.textContent =
      att.averted > 0 ? "LOOKED AWAY"
      : att.unrest > 0.6 ? "UNATTENDED " + span(att.idle)
      : w && w.visits > 1 && att.session < 30 ? "RETURNED"
      : "PRESENT " + span(att.still);
  }

  tick(dt, player) {
    this.t += dt;
    const att = this.attention;

    if (this._note && this.t < this.msgUntil) {
      this.face.textContent = this.msg;
    } else if (this.current) {
      this.face.textContent = this.msg && this.t < this.msgUntil
        ? this.msg
        : this.current.faceLabel;
    } else if (att && !this.focused && att.regard > 0.62) {
      this.observe(att);
    } else if (this._observer && (!att || att.regard < 0.45)) {
      /* it stops reporting on you without ever having said it started */
      this._observer = false;
      this.read.hidden = true;
    }

    if (this.msg && this.t >= this.msgUntil) {
      this.msg = "";
      if (this._note) { this._note = false; this.read.hidden = true; }
    }
    this.playing(player);
  }
}
