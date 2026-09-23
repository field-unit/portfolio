import { span } from "../system/witness.js";

/* Entry.
 *
 * There is no button.
 *
 * You do not start the transfer -- it is already running when the page
 * loads, and you have walked in on it. It gets most of the way through
 * on its own, and then stops at one line:
 *
 *     listener present   [..........]
 *
 * and will not go any further until you hold still.
 *
 * That gate is the whole reason this is not a button. The rule that
 * governs everything inside -- that the object attends to you when you
 * stop moving and loses interest when you thrash about -- is taught
 * here, before you are in, without a word of instruction. Waggle the
 * mouse and the gauge visibly empties. Stop and it fills. Almost
 * everyone works it out inside three seconds and nobody has to be told,
 * and by the time the object appears they already know how to be looked
 * at by it.
 *
 * It cannot strand anybody: on touch there is nothing to hold still so
 * it passes immediately, and after six seconds it gives up waiting and
 * continues anyway, which is a thing it already says it does.
 *
 * The close box now works. Once. The window goes away, there is nothing
 * behind it, and then it comes back somewhere slightly different and
 * carries on from where it was. Declining is available; it is simply
 * not honoured.
 */

const GATE_NEED = 1.7;      // seconds of stillness
const GATE_GIVE_UP = 6000;  // ms before it stops waiting for you
const CELLS = 10;
const MOVING = 0.34;        // under this many seconds still = actively moving

const pad = (s) => s.padEnd(22, " ");
const ok = (s) => pad(s) + " ...... ok";
const wait = (s) => pad(s) + " .....";
const flat = (s, v) => pad(s) + " " + v;

/* Somebody who bounced straight back out has a previous session of a
   second or two, and "0S" reads as a broken field rather than as a
   fact. It has a word for that instead. */
const lastSession = (w) => (w.previous < 5 ? "incomplete" : span(w.previous));

function script(w) {
  const v = w ? w.visits : 0;          // visits BEFORE this one
  const gate = { gate: true, label: "listener present" };

  if (v === 0) {
    return [
      { line: ok("contacting node"), wait: 420 },
      { line: wait("verifying client"), wait: 520, fx: "status-open" },
      { line: "client unregistered", wait: 320 },
      { line: ok("continuing anyway"), wait: 520 },
      gate,
      { line: wait("receiving object"), wait: 700, fx: "type-count" },
    ];
  }

  if (v === 1) {
    return [
      { line: ok("contacting node"), wait: 400 },
      { line: ok("verifying client"), wait: 440, fx: "status-open" },
      { line: "client recognised", wait: 420 },
      { line: flat("previous session", lastSession(w)), wait: 520, fx: "opened" },
      gate,
      { line: wait("receiving object"), wait: 620, fx: "type-count" },
    ];
  }

  if (v < 5) {
    return [
      { line: ok("contacting node"), wait: 360 },
      { line: ok("verifying client"), wait: 400, fx: "status-open" },
      { line: "client expected", wait: 460 },
      { line: flat("previous session", lastSession(w)), wait: 480, fx: "opened" },
      gate,
      { line: wait("resuming object"), wait: 600, fx: "type-count" },
    ];
  }

  /* By now it has stopped pretending the connection was ever closed. */
  return [
    { line: "route already open", wait: 440, fx: "status-open" },
    { line: "client expected", wait: 400 },
    { line: flat("time away", span(w.gap)), wait: 480, fx: "opened" },
    { line: flat("sessions", String(w.visits + 1).padStart(2, "0")), wait: 400 },
    gate,
    { line: wait("resuming object"), wait: 560, fx: "type-count" },
  ];
}

export function entry({ witness, attention, onRelease }) {
  const veil = document.getElementById("veil");
  const log = document.getElementById("routeLog");
  const meter = document.getElementById("routeMeter");
  const closeBox = document.getElementById("winClose");
  const title = document.getElementById("winTitle");
  const head = document.getElementById("winHead");
  const fields = document.getElementById("winFields");

  let lines = [];
  let gateLine = "";
  const paint = () => {
    log.textContent = lines.concat(gateLine ? [gateLine] : []).join("\n");
  };

  if (witness && witness.visits > 0) {
    title.textContent = "remote object (open)";
    head.textContent = "RESUMING OBJECT";
    document.getElementById("fOrigin").textContent = "[this client]";
  }

  /* --- the close box ------------------------------------------- */
  let reopened = false;
  closeBox.addEventListener("click", () => {
    veil.classList.add("is-shut");
    setTimeout(() => {
      veil.classList.remove("is-shut");
      veil.classList.add("is-back");
      if (!reopened) {
        reopened = true;
        lines.push("route reopened");
        paint();
      }
    }, 2400);
  });

  const effect = (name) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (name === "status-open") set("fStatus", "open");
    if (name === "type-count") set("fType", "unknown (4)");
    if (name === "opened" && witness) {
      /* a fourth field, which was not there when you started reading */
      if (!document.getElementById("fOpened")) {
        fields.insertAdjacentHTML("beforeend",
          '<dt>opened</dt><dd id="fOpened">' +
          String(witness.visits + 1).padStart(2, "0") + " times</dd>");
      }
    }
  };

  return new Promise((resolve) => {
    (async () => {
      const steps = script(witness);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        meter.style.width = Math.round((i / steps.length) * 100) + "%";

        if (s.gate) {
          await hold(s.label, i / steps.length, 1 / steps.length);
        } else {
          lines.push(s.line);
          paint();
          if (s.fx) effect(s.fx);
          await sleep(s.wait);
        }
      }
      meter.style.width = "100%";
      await sleep(420);

      /* Let go of the object while the window is still up, so that it
         is already dropping in behind the dialog as that dissolves.
         The thing should turn out to have arrived before the paperwork
         finished, rather than appearing once the paperwork is cleared
         away like the next screen of a website. */
      await onRelease?.();
      await sleep(340);

      veil.classList.add("is-going");
      await sleep(520);
      veil.hidden = true;
      resolve();
    })();
  });

  /**
   * The handshake that waits for you to stop.
   *
   * It has to be unmistakable that the thing is alive and responding to
   * you, or the pause just reads as a page that has failed to load. So
   * three things move at once: the text gauge, the big segmented meter
   * -- the most prominent object in the window -- and a `motion`
   * readout that appears while you are the reason it is not filling.
   * That last one is a diagnostic and not an instruction, which is the
   * register this machine speaks in, but it is enough for anybody to
   * work out what to do inside a second or two.
   */
  function hold(labelText, meterBase, meterSpan) {
    return new Promise((done) => {
      const started = performance.now();
      const draw = (frac, tail) => {
        const on = Math.round(frac * CELLS);
        gateLine = pad(labelText) + " [" +
          "#".repeat(on) + ".".repeat(CELLS - on) + "]" + (tail ? " " + tail : "");
        meter.style.width = Math.round((meterBase + meterSpan * frac) * 100) + "%";
        paint();
      };

      const step = () => {
        /* Straight off the clock rather than off the frame loop, so the
           handshake still works if the loop is throttled. With no
           pointer at all it climbs freely, which is why touch and
           keyboard visitors are through before they notice a gate. */
        const still = attention ? attention.motionless : GATE_NEED;
        const frac = Math.min(still / GATE_NEED, 1);
        const timedOut = performance.now() - started > GATE_GIVE_UP;

        if (frac >= 1 || timedOut) {
          gateLine = "";
          lines.push(pad(labelText) + (timedOut ? " ...... no" : " ...... ok"));
          if (timedOut) lines.push(ok("continuing anyway"));
          paint();
          done();
          return;
        }
        draw(frac, still < MOVING ? "motion" : "");
        /* Timer rather than a frame callback. The gauge is ten
           characters of text and does not need sixty of them a second,
           and requestAnimationFrame can be starved to nothing in a
           background tab or an embedded view -- which would leave the
           handshake hanging with no way through it. */
        setTimeout(step, 60);
      };
      step();
    });
  }
}

export function entryFailed(message) {
  const route = document.getElementById("winRoute");
  if (route) route.hidden = true;
  const fail = document.getElementById("winFail");
  fail.hidden = false;
  document.getElementById("failNote").textContent = message;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
