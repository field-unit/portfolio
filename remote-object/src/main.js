import { Stage, reducedMotion } from "./core/stage.js";
import { Input } from "./core/input.js";
import { Halo } from "./halo/halo.js";
import { Receiver } from "./devices/receiver.js";
import { Access } from "./devices/access.js";
import { Unknown } from "./devices/unknown.js";
import { Token } from "./devices/token.js";
import { Pronouncer } from "./devices/pronouncer.js";
import { Rotor } from "./devices/rotor.js";
import { Treat } from "./devices/treat.js";
import { Hoop } from "./devices/hoop.js";
import { Shell } from "./screen/shell.js";
import { Player } from "./audio/player.js";
import { Hud } from "./ui/hud.js";
import { entry, entryFailed } from "./ui/entry.js";
import { Witness } from "./system/witness.js";
import { Attention } from "./system/attention.js";
import { Local, acceptDrops } from "./data/local.js";

/* REMOTE OBJECT
   Assembly and the frame loop. */

let stage;
try {
  stage = new Stage(document.getElementById("stage"));
} catch (err) {
  entryFailed("This client cannot render the object. WebGL is unavailable.");
  throw err;
}

/* The two things that make it awake. `witness` is what it retains
   between visits; `attention` is what it is doing about you right now.
   Everything else reads from them, and nothing writes to them except
   the events they listen for themselves. */
const witness = new Witness();
const attention = new Attention(witness);
/* Anything the visitor drops on the page. Read back from IndexedDB, so
   it is still there on the next visit, on that machine only. */
const local = new Local();
const ctx = { witness, attention, local };

const player = new Player();
const shell = new Shell(player, ctx);
const hud = new Hud(ctx);

const receiver = new Receiver(shell);
/* Order is position on the ring. The Receiver takes slot 0 so that it
   is the thing facing you when the object arrives. */
const devices = [
  receiver,
  new Pronouncer(player, ctx),
  new Access(),
  new Unknown(),
  new Rotor(player),
  new Treat(player),
  new Hoop(stage.patches),
  new Token(),
];

/* The stage reads this every frame to find out what the treatment unit
   is doing to the picture. */
ctx.treat = devices[5];

const halo = new Halo(devices);
stage.scene.add(halo.root);

/* Held above the frame until the route closes, so that its arrival is
   still an event and not something that happened behind the window
   while you were reading. */
halo.root.position.y = 9.5;
receiver.yaw = 2.5;

const input = new Input({ canvas: stage.canvas, stage, halo, hud });

/* Drop audio anywhere on the object and it is filed. Started without
   awaiting: the archive reads the list live, so whatever this machine
   already had simply appears in it a moment later. */
local.load();
acceptDrops(local, (text) => hud.note(text));

/* The audio graph needs a real user gesture, and the entry no longer
   contains one. So it is armed by the first click or keypress the
   visitor makes anywhere -- which, since nothing plays until they pick
   an object, always happens well before it is needed. */
const GESTURES = ["pointerdown", "keydown", "click", "touchstart"];
const arm = () => {
  player.wake();
  for (const g of GESTURES) removeEventListener(g, arm);
};
/* More than one kind of event, because there is exactly one chance to
   get this right: if the graph is not built on the visitor's first
   gesture, nothing on the ring makes a sound and there is no second
   prompt to tell them why. */
for (const g of GESTURES) addEventListener(g, arm, { passive: true });

/* A handle on the object's insides. Left in deliberately: this is a
   thing you were not expected to find, and the console is part of the
   surface. `REMOTE.witness.forget()` wipes what it has on you -- a thing
   that cannot be made to forget is a trap rather than a work. */
window.REMOTE = { stage, halo, devices, receiver, shell, player, input, hud, witness, attention, local, ctx };

/* The loop starts before the route does: the handshake gate needs to
   know whether you are holding still, and stillness is measured here. */
let ready = false;
let last = performance.now();
let lastFrameAt = performance.now();
let firstFrame = null;          // resolves once the object has actually drawn

function frame(now) {
  /* Clamped so that a background tab or a slow first paint cannot hand
     the chains a huge timestep and fire the whole object off-screen. */
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  witness.tick(dt);
  attention.update(dt, input.hover);
  stage.update(dt, ctx);
  if (ready) halo.update(dt, stage.camera, ctx);
  input.update();
  hud.tick(dt, player);
  stage.render();

  lastFrameAt = performance.now();
  if (ready && firstFrame) { firstFrame(); firstFrame = null; }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Watchdog.
 *
 * Some embedded browsers, throttled tabs and power-saving modes starve
 * requestAnimationFrame completely rather than merely slowing it. With
 * no defence, the entry -- which runs on timers -- finishes happily,
 * the window dissolves, and the visitor is left looking at an empty
 * black page with a status line on it, unable to tell whether the thing
 * is broken or simply strange. Which is the worst possible confusion
 * for this particular site to cause.
 *
 * Detecting the starvation and setting the fallback rate have to be two
 * different numbers. Using one threshold for both -- draw a frame
 * whenever the last one was 250ms ago -- means the fallback runs at
 * exactly the detection threshold, which is four frames a second. So:
 * a quarter of a second with no frame means rAF has stopped, and from
 * then on the timer drives at its own interval instead, which is about
 * sixteen a second. Not the intended experience, emphatically better
 * than a black screen.
 *
 * The rate guard also stops it fighting a healthy rAF: at 60fps the gap
 * is never more than about 16ms, so the second test never passes and
 * this costs one subtraction sixteen times a second and nothing else.
 */
let starved = false;
setInterval(() => {
  if (document.hidden) return;
  const gap = performance.now() - lastFrameAt;
  if (gap > 250) starved = true;
  if (starved && gap > 55) frame(performance.now());
}, 60);

await entry({
  witness,
  attention,
  /* Fired a beat before the window dissolves, so the object is already
     falling in behind it. */
  onRelease: () => {
    witness.begin();

    /* Let go. It drops in, swinging, already turned away from you: the
       first thing the object says is that it has a back, and therefore
       a front you have not seen yet. */
    ready = true;
    halo.spinVel = 1.1;

    /* Somebody who has been here before does not get the same
       arrangement twice. It has been turning while they were gone. */
    if (witness.returning) {
      halo.spin += witness.visits * 1.37;
      devices[7].yaw = witness.visits * 0.9;
    }

    /* Hold the window up until the object has genuinely been drawn at
       least once. "receiving object" should finish when the object is
       actually there -- not when a timer says so and the screen behind
       is still empty. Capped, so a stalled renderer cannot trap anyone
       behind the dialog forever. */
    return new Promise((res) => {
      firstFrame = res;
      setTimeout(res, 1800);
    });
  },
});

hud.show();
hud.mode("HALO");

if (reducedMotion) {
  halo.spinVel = 0;
  halo.root.position.y = 0;
}
