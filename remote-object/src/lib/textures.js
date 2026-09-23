import * as THREE from "three";
import { rng } from "./math.js";

/* Everything on this object is drawn at runtime into a canvas. Not for
   purity -- it keeps the whole thing under two megabytes and lets the
   wrongness be authored rather than painted, which is the part that
   matters. */

export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Grime, moulding flow lines and the scratches of twenty-five years. */
export function wear(base = "#6f736c", seed = 7, strength = 0.2) {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = rng(seed);

    // blotchy discolouring
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, rad = 12 + r() * 90;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.5;
      g.addColorStop(0, `rgba(${dark ? "0,0,0" : "255,255,255"},${(0.02 + r() * 0.05) * strength * 5})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }

    // fine scratches, mostly along one axis as handling produces
    c.lineCap = "round";
    for (let i = 0; i < 170; i++) {
      const x = r() * w, y = r() * h;
      const len = 4 + r() * 46;
      const ang = (r() < 0.75 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.5;
      c.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.09})`;
      c.lineWidth = r() < 0.85 ? 0.6 : 1.4;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c.stroke();
    }
    return c;
  }, { srgb: true });
}

/** A printed label. Slightly too small for its backing, as they were. */
export function label(lines, o = {}) {
  const {
    bg = "#b7b09a", fg = "#2e2f28", size = 34, lh = 42,
    pad = 10, align = "left", w = 512, mono = true,
  } = o;
  const h = Math.max(64, lines.length * lh + pad * 2);
  return canvasTexture(w, h, (c, W, H) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // ink sits unevenly on a cheap printed label
    c.fillStyle = "rgba(0,0,0,.05)";
    for (let i = 0; i < 60; i++) c.fillRect(Math.random() * W, Math.random() * H, 2, 1);
    c.fillStyle = fg;
    c.font = `${size}px ${mono ? "ui-monospace, 'Courier New', monospace" : "system-ui, sans-serif"}`;
    c.textBaseline = "top";
    lines.forEach((s, i) => {
      const y = pad + i * lh;
      if (align === "center") {
        c.textAlign = "center";
        c.fillText(s, W / 2, y);
      } else {
        c.textAlign = "left";
        c.fillText(s, pad, y);
      }
    });
  });
}

/**
 * Board.
 *
 * The routing is where the incorrectness budget gets spent hardest:
 * a couple of traces run to nothing, one crosses another on the same
 * layer, and there are vias with no trace attached. Nobody reads a PCB
 * consciously, but the pattern of "this could not have been made"
 * registers, which is the whole effect the brief is asking for.
 */
export function pcb(seed = 31) {
  return canvasTexture(512, 512, (c, w, h) => {
    const r = rng(seed);
    c.fillStyle = "#1f3a2c";
    c.fillRect(0, 0, w, h);

    // solder mask mottle
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
      c.fillRect(r() * w, r() * h, 3, 3);
    }

    // traces
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 3;
    c.lineCap = "square";
    for (let i = 0; i < 46; i++) {
      let x = r() * w, y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      const legs = 2 + Math.floor(r() * 4);
      for (let k = 0; k < legs; k++) {
        if (r() < 0.5) x += (r() - 0.5) * 190; else y += (r() - 0.5) * 190;
        c.lineTo(x, y);
      }
      c.stroke();
      // every so often the trace simply stops in open board
      if (r() < 0.22) { c.fillStyle = "#c9a24a"; c.fillRect(x - 2, y - 2, 5, 5); }
    }

    // pads and vias, including some attached to nothing at all
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h;
      c.fillStyle = "#d7b463";
      c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#16241d";
      c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
    }

    // components
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, bw = 8 + r() * 26, bh = 6 + r() * 14;
      c.fillStyle = r() < 0.6 ? "#20242a" : "#8b8c86";
      c.fillRect(x, y, bw, bh);
      c.fillStyle = "rgba(255,255,255,.16)";
      c.fillRect(x, y, bw, 1);
    }

    // silkscreen. The reference designators do not run in any order.
    c.fillStyle = "rgba(226,232,220,.5)";
    c.font = "13px ui-monospace, monospace";
    for (let i = 0; i < 22; i++) {
      const tag = "RCDQUL"[Math.floor(r() * 6)] + (1 + Math.floor(r() * 60));
      c.fillText(tag, r() * w, r() * h);
    }
  });
}

/**
 * Vents arranged on a spiral rather than a grid.
 *
 * A rectangular grid of holes is how a speaker gets drilled when the
 * thing behind it is a rectangular driver and the thing in front of it
 * is a person who expects rows. This is the same operation performed by
 * something that had no such expectations: an even angular sweep, hole
 * size falling off with radius. It still reads as an acoustic opening
 * and it is not an arrangement anyone would ship.
 */
export function vents(count = 34, seed = 9) {
  return canvasTexture(256, 256, (c, w, h) => {
    const r = rng(seed);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#000000";
    const cx = w / 2, cy = h / 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i <= count; i++) {
      const t = i * golden;
      const rad = (Math.sqrt(i / count) * w) / 2.35;
      const size = (w / 34) * (1 - (rad / (w / 2)) * 0.45) + (r() - 0.5);
      c.beginPath();
      c.arc(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad, Math.max(1.5, size), 0, Math.PI * 2);
      c.fill();
    }
  }, { srgb: false });
}

/**
 * Woven cloth: warp and weft, unevenly spun.
 *
 * A wireframe overlay looks like a weave for about a second and then
 * reads as the triangulation it actually is -- long diagonals no loom
 * would produce. Threads have to run in two directions and only two.
 */
export function weave(seed = 5) {
  return canvasTexture(128, 128, (c, w, h) => {
    const r = rng(seed);
    c.fillStyle = "#c3bba6";
    c.fillRect(0, 0, w, h);
    const step = 8;
    for (let i = 0; i < w; i += step) {
      c.fillStyle = `rgba(120,112,96,${0.1 + r() * 0.16})`;
      c.fillRect(i, 0, 1 + (r() < 0.3 ? 1 : 0), h);
      c.fillStyle = `rgba(120,112,96,${0.1 + r() * 0.16})`;
      c.fillRect(0, i, w, 1 + (r() < 0.3 ? 1 : 0));
    }
    /* a few slubs, because handloom */
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(150,142,124,${0.1 + r() * 0.2})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 5, 1);
    }
  }, { repeat: [5, 5] });
}

/** Speaker grille: a field of holes, punched slightly off-centre. */
export function grille(cols = 7, rows = 5, seed = 3) {
  return canvasTexture(256, 256, (c, w, h) => {
    const r = rng(seed);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, w, h);
    const gx = w / (cols + 1), gy = h / (rows + 1);
    c.fillStyle = "#000000";
    for (let i = 1; i <= cols; i++) {
      for (let j = 1; j <= rows; j++) {
        c.beginPath();
        c.arc(i * gx + (r() - 0.5) * 2, j * gy + (r() - 0.5) * 2, gx * 0.27, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, { srgb: false });
}
