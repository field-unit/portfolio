/* A band of dithered grain, drawn as square dots: the printed rule under the footer. The name above the desk
   is its own thing (title.js); this is the quiet relative of it.
   Used by app.js. */
window.GrainType = (function () {
  "use strict";

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v)
      + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
  }

  /* How much room a canvas has to draw in: its parent's box, less that parent's padding. Measuring the
     parent alone counts the padding twice, so the canvas comes out wider than the column it sits in and the
     whole page scrolls sideways. */
  function room(canvas) {
    const parent = canvas.parentElement;
    if (!parent) return Math.floor(canvas.clientWidth);
    const style = window.getComputedStyle(parent);
    const width = parent.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    return Math.max(0, Math.floor(width));
  }

  /* The rule itself. */
  function rule(canvas, options) {
    const o = Object.assign({ grain: "#a19d93", accent: null, dot: 3, rows: 4, drift: true }, options || {});
    const ctx = canvas.getContext("2d");
    let frame = 0, timer = 0, cols = 0, stale = true;

    function paint() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = room(canvas);
      if (!width) { stale = true; return; }
      stale = false;
      cols = Math.max(1, Math.floor(width / o.dot));
      const w = cols * o.dot, h = o.rows * o.dot;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = frame * 0.35;
      for (let y = 0; y < o.rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Thickest along the top, thinning downwards, so it reads as a rule rather than a field.
          const value = Math.pow(1 - y / o.rows, 0.85) * (0.6 + 0.45 * noise(x * 0.09 + t * 0.12, y * 0.4));
          if (value <= (BAYER[(y + frame) & 3][(x + (frame >> 1)) & 3] + 0.5) / 16) continue;
          ctx.fillStyle = o.accent && hash(x + frame * 0.5, y) > 0.995 ? o.accent : o.grain;
          ctx.fillRect(x * o.dot, y * o.dot, o.dot, o.dot);
        }
      }
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paint();
    return {
      draw: paint,
      start() { if (stale) paint(); if (!timer && !reduced && o.drift) timer = setInterval(() => { if (!document.hidden) { frame += 1; paint(); } }, 900); },
      stop() { clearInterval(timer); timer = 0; }
    };
  }

  return { rule };
})();

/* The name, projected on the wall behind the desk.

   One dark rectangle, the way a projector would throw it on the pale wall, holding "JAMES MASON" as shallow green
   slabs. The picture is made the way Field Unit makes its null-set logo: a field of values — the letters' faces lit
   by one light, their sides in shade, a soft spill of light round them, and value noise drifting through all of
   it — printed through a 4 x 4 Bayer dither onto the same five greens. The dither's phase steps each frame, so the
   grain crawls rather than sits still.

   The letters themselves move: the word turns a degree or two either way and drifts a little inside the frame, on
   slow loops of about twelve seconds, and the slabs' sides and shading follow the turn. The frame never moves or
   changes size. No scan lines, no sweeping bands, no flashing.

   The letters are drawn from outlines written out below — a chamfered geometric face, one weight throughout — so
   there is no font to load and the name is the same everywhere. The words are in the page as a plain heading for
   search engines and screen readers, and are what prints.

   Cheap by design: the picture is worked out at half the frame's size (so each dot is two pixels across, as on
   Field Unit), twelve times a second, and only while the desk is showing and the tab is visible. With reduced
   motion it draws one finished frame. Used by app.js for the desk heading. */
window.DeskTitle = (function () {
  "use strict";

  // Field Unit's greens, darkest first (its RAMP), and its ordered dither.
  const RAMP = [[14, 16, 13], [43, 51, 31], [105, 130, 70], [140, 170, 85], [228, 226, 214]];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* The letters, as filled outlines on a 10-unit cap height with a 2-unit stroke and chamfered corners. Each is a
     list of polygons; holes are wound the other way and filled even-odd. */
  const GLYPHS = {
    J: { w: 6, polys: [[[4, 0], [6, 0], [6, 8.8], [4.8, 10], [1.2, 10], [0, 8.8], [0, 6.4], [2, 6.4], [2, 8], [4, 8]]] },
    A: { w: 8, polys: [[[2.6, 0], [5.4, 0], [8, 10], [5.9, 10], [4, 3.3], [2.1, 10], [0, 10]], [[1.7, 6.1], [6.3, 6.1], [6.8, 7.9], [1.2, 7.9]]] },
    M: { w: 9, polys: [[[0, 0], [2, 0], [2, 10], [0, 10]], [[7, 0], [9, 0], [9, 10], [7, 10]],
                       [[0.4, 0], [2.6, 0], [4.5, 3.4], [6.4, 0], [8.6, 0], [4.5, 7]]] },
    E: { w: 6.5, polys: [[[0, 0], [6.5, 0], [6.5, 2], [2, 2], [2, 4], [5.6, 4], [5.6, 6], [2, 6], [2, 8], [6.5, 8], [6.5, 10], [0, 10]]] },
    S: { w: 7, polys: [[[1.2, 0], [7, 0], [7, 2], [2, 2], [2, 4], [5.8, 4], [7, 5.2], [7, 8.8], [5.8, 10], [0, 10], [0, 8], [5, 8],
                        [5, 6], [1.2, 6], [0, 4.8], [0, 1.2]]] },
    O: { w: 8, polys: [[[1.2, 0], [6.8, 0], [8, 1.2], [8, 8.8], [6.8, 10], [1.2, 10], [0, 8.8], [0, 1.2]],
                       [[2.6, 2], [2, 2.6], [2, 7.4], [2.6, 8], [5.4, 8], [6, 7.4], [6, 2.6], [5.4, 2]]] },
    N: { w: 7.5, polys: [[[0, 0], [2, 0], [2, 10], [0, 10]], [[5.5, 0], [7.5, 0], [7.5, 10], [5.5, 10]],
                         [[0.2, 0], [2.5, 0], [7.3, 10], [5, 10]]] }
  };
  const CAP = 10, TRACK = 1.4, WORDGAP = 4.4;
  const ASPECT = 6.9;                                  // the frame's width to height, to hold the word in one line

  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise(x, y) {                               // value noise, as Field Unit's
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
  }

  // The lines of the name, each a list of placed letters, in units.
  function setLines(words, stacked) {
    const lines = stacked ? words.split(" ") : [words];
    return lines.map((text) => {
      const out = [];
      let x = 0;
      [...text].forEach((ch, i) => {
        if (ch === " ") { x += WORDGAP; return; }
        const g = GLYPHS[ch];
        if (!g) return;
        if (i && text[i - 1] !== " ") x += TRACK;
        out.push({ g, x });
        x += g.w;
      });
      return { letters: out, width: x };
    });
  }

  function make(canvas, options) {
    const o = Object.assign({
      words: "JAMES MASON",
      height: 92,           // the frame's height in CSS pixels; a function is asked each time it is laid out
      within: null,         // the element whose width the frame must fit (default: the canvas's parent)
      dot: 2,               // CSS pixels per dot
      fps: 12,
      turn: 12000,          // one slow loop of the turn, in ms
      drift: 14000          // one loop of the drift
    }, options || {});
    const ctx = canvas.getContext("2d");
    const lo = document.createElement("canvas");
    const lc = lo.getContext("2d", { willReadFrequently: true });
    let W = 0, H = 0, w = 0, h = 0, lines = null, stacked = false;
    let timer = 0, running = false, paused = false, phase = 0, started = 0, stale = true;
    let image = null, blurCache = null;

    // Draw the name's slabs into the small canvas as grey values: the sides first (each layer a step deeper),
    // then the face. Red holds the tone; green marks where the letters are, for the spill.
    function slabs(t) {
      const turn = Math.sin((t / o.turn) * Math.PI * 2);
      const lift = Math.sin((t / o.turn) * Math.PI * 2 + Math.PI / 2);
      const yaw = (10 + 1.8 * turn) * Math.PI / 180;           // the word turned a little, and turning
      const tilt = (7 + 1.2 * lift) * Math.PI / 180;           // and seen a little from below, and nodding
      const dx = 0.012 * Math.sin((t / o.drift) * Math.PI * 2);
      const dy = 0.035 * Math.sin((t / o.drift) * Math.PI * 2 + 1.3);
      const widest = Math.max(...lines.map((l) => l.width));
      const rows = lines.length, lead = 3.2;
      const blockH = rows * CAP + (rows - 1) * lead;
      const unit = Math.min((w * 0.84) / widest, (h * 0.62) / blockH);
      const depth = 5;                                           // how deep the slabs are, in units
      const ex = Math.sin(yaw) * depth, ey = Math.sin(tilt) * depth;   // the side faces show down and to the right
      const sx = Math.cos(yaw), sy = Math.cos(tilt);
      const ox = w / 2 + dx * w, oy = h / 2 + dy * h;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, w, h);
      const put = (layer, colour) => {
        lc.fillStyle = colour;
        lines.forEach((line, r) => {
          const top = -blockH / 2 + r * (CAP + lead);
          line.letters.forEach((L) => {
            lc.setTransform(unit * sx, 0, 0, unit * sy, ox + (L.x - line.width / 2 + layer * ex) * unit * sx, oy + (top + layer * ey) * unit * sy);
            lc.beginPath();
            L.g.polys.forEach((poly) => poly.forEach(([x, y], k) => (k ? lc.lineTo(x, y) : lc.moveTo(x, y))));
            lc.fill("evenodd");
          });
        });
      };
      // The sides: lit a little more as the word turns towards the light (upper left), so the shading moves with it.
      const side = Math.round(70 + 30 * turn);
      const steps = 6;
      for (let k = steps; k >= 1; k--) put(k / steps, `rgb(${side - k * 3},255,0)`);
      put(0, "rgb(236,255,0)");
      return unit;
    }

    // A soft copy of the letters' coverage, for the light they spill round themselves.
    function spill(src) {
      const n = w * h;
      if (!blurCache || blurCache.length !== n) blurCache = new Float32Array(n);
      const a = blurCache, tmp = new Float32Array(n), r = Math.max(2, Math.round(h * 0.08));
      for (let i = 0; i < n; i++) a[i] = src[i * 4 + 3] > 128 ? 1 : 0;
      for (let pass = 0; pass < 2; pass++) {                    // two box blurs, across then down
        for (let y = 0; y < h; y++) {
          let s = 0;
          for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
          for (let x = 0; x < w; x++) {
            tmp[y * w + x] = s / (2 * r + 1);
            s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
          }
        }
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
          for (let y = 0; y < h; y++) {
            a[y * w + x] = s / (2 * r + 1);
            s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
          }
        }
      }
      return a;
    }

    function paint(t) {
      if (!lines || !w || !h) return;
      slabs(t);
      const src = lc.getImageData(0, 0, w, h).data;
      const glow = spill(src);
      const d = image.data;
      const px = phase & 3, py = (phase >> 1) & 3, s = t / 1000;
      const F = Math.max(3, h * 0.2);                           // how far in from the edges the throw is full
      for (let y = 0; y < h; y++) {
        const v = y / h, fy = Math.min(y, h - 1 - y) / F;
        for (let x = 0; x < w; x++) {
          const i = y * w + x, u = x / w;
          const g = noise(u * 26 + s * 0.7, v * 9 - s * 0.5);     // Field Unit's drifting grain
          const j = i * 4;
          let f, th;
          if (src[i * 4 + 3] > 128) {
            th = (BAYER[((y + py) & 3) * 4 + ((x + px) & 3)] + 0.5) / 16;   // the letters' grain crawls
            f = src[i * 4] / 255 + (g - 0.5) * 0.18;              // a face or a side, with grain through it
          } else {
            // The frame: a dim olive with a faint speckle and the light the letters spill, its edges dissolving
            // into the wall through the same dither, the way a projector's throw fades. Kept calm (James, 23 Sep):
            // its dither doesn't step with the frames and its speckle drifts slowly, so the edges hold still and
            // only the lettering and its light move.
            th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
            const fall = Math.min(1, fy, Math.min(x, w - 1 - x) / F);
            if (fall < th) { d[j + 3] = 0; continue; }
            const calm = noise(u * 26 + s * 0.1, v * 9 - s * 0.07);
            f = 0.14 + 0.08 * calm + glow[i] * 0.3;
          }
          f = f < 0 ? 0 : f > 1 ? 1 : f;
          const lv = f * 4, b = lv | 0;
          const c = RAMP[lv - b > th ? Math.min(b + 1, 4) : b];
          d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    }

    function layout() {
      // The width to fit: the column given (the frame's own wrapper takes its width from the frame, so it can't say).
      const box = o.within || canvas.parentElement;
      const cs = box ? getComputedStyle(box) : null;
      const room = box ? box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) : 0;
      if (room < 40) { stale = true; return false; }
      stale = false;
      const want = typeof o.height === "function" ? o.height() : o.height;
      // The frame fits the word with a margin all round: as wide as the height allows, or as the column allows.
      W = Math.round(Math.min(room, want * ASPECT));
      H = Math.round(Math.min(want, W / ASPECT));
      w = Math.max(40, Math.round(W / o.dot));
      h = Math.max(16, Math.round(H / o.dot));
      W = w * o.dot; H = h * o.dot;
      canvas.width = w; canvas.height = h;                      // one canvas pixel per dot; CSS blows it up square
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      lo.width = w; lo.height = h;
      lines = setLines(o.words, stacked);
      image = ctx.createImageData(w, h);
      return true;
    }

    function draw() {
      if (!layout()) return;
      paint(running ? performance.now() - started : 2600);
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function tick() {
      if (document.hidden) return;
      phase++;
      paint(performance.now() - started);
    }
    return {
      draw,
      frame(ms) { if (stale) layout(); paint(ms || 0); },       // one moment, on demand (tools/title-preview.html)
      start() {
        if (stale) draw();
        if (running || reduced || paused) return;               // still, but finished, when motion is turned down
        running = true;
        started = performance.now() - 2600;
        timer = setInterval(tick, Math.round(1000 / o.fps));
      },
      stop() { running = false; clearInterval(timer); timer = 0; },
      // The pause control: stops the motion and leaves the frame as it was.
      setPaused(value) {
        paused = !!value;
        if (paused) { running = false; clearInterval(timer); timer = 0; } else this.start();
      },
      get paused() { return paused; },
      get moving() { return !reduced; }
    };
  }

  return { make };
})();

/* Desk portfolio: the desk of objects and its labels, category filters, routing and reading views.
   All content comes from the embedded JSON; text is set with textContent only.

   Every page arrives already written (build.py makes each one with pages.py from the same content), so nothing
   here is needed to read the portfolio. This script adds the rest: it renders the open page again with the same
   markup, moves between pages without a reload (keeping real addresses, so refresh, back, forward and shared links
   all work), and brings in the 3D desk, its code and models only when the desk is shown. Markup made here must
   match pages.py. */
(function () {
  "use strict";

  const data = JSON.parse(document.getElementById("desk-data").textContent);
  const media = data.media || {};
  const cats = data.categories;
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const projects = data.projects;
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p]));
  const inCat = (id) => projects.filter((p) => p.category === id);
  const deskObjects = (data.desk && data.desk.objects) || [];
  const objById = Object.fromEntries(deskObjects.map((o) => [o.id, o]));
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");
  const touchFirst = window.matchMedia("(hover: none)").matches;
  const KINDS = { professional: "Professional", freelance: "Freelance", university: "University", personal: "Personal" };
  const homeTitle = data.site.name + " — " + data.site.strap;

  /* ---- addresses ----
     On the website every page has an address of its own (/projects/type-totem-2/), and moving between them updates
     it through the History API. The offline file is a single page, so there the same paths follow a #
     (#/projects/type-totem-2/). */
  const root = document.documentElement;
  const BASE = root.dataset.base || "/";
  const pathMode = !!root.dataset.base && /^https?:$/.test(location.protocol);
  const href = (path) => (pathMode ? BASE + path.replace(/^\//, "") : "#" + path);
  const projectPath = (p) => "/projects/" + p.slug + "/";
  const catPath = (id) => (id === "cv" ? "/cv/" : projectPath(inCat(id)[0]));
  function pathOf(r) {
    if (r.view === "index") return "/projects/" + (r.group ? "#group-" + r.group : "");
    if (r.view === "reader") return r.cat === "cv" ? "/cv/" : projectPath(byId[r.project] || inCat(r.cat)[0]);
    return "/";
  }
  // The addresses the site had before its pages had their own (#index, #cv, #sound, #music/remote-object), for old
  // links and bookmarks. Eminence and Precision were one project, "wilson-benesch", until 24 Sep 2026.
  const renamed = { "wilson-benesch": "eminence" };
  function legacy(frag) {
    const parts = frag.replace(/^#/, "").split("/");
    if (parts[0] === "index") return { view: "index", group: null };
    if (parts[0] === "cv") return { view: "reader", cat: "cv", project: null };
    if (catById[parts[0]]) {
      const p = byId[renamed[parts[1]] || parts[1]];
      return { view: "reader", cat: parts[0], project: p && p.category === parts[0] ? p.id : inCat(parts[0])[0].id };
    }
    return null;
  }
  // A path within the site (its #fragment included) as a route, or null when it isn't one of the pages.
  function routeOf(path) {
    if (!path.startsWith("/")) return legacy(path);
    const at = path.indexOf("#");
    const frag = at < 0 ? "" : path.slice(at + 1);
    let p = (at < 0 ? path : path.slice(0, at)).replace(/index\.html$/, "");
    if (!p.endsWith("/")) p += "/";
    if (p === "/") return legacy(frag) || { view: "desk" };
    if (p === "/projects/") {
      const g = /^group-(.+)$/.exec(frag);
      return { view: "index", group: g && catById[g[1]] ? g[1] : null };
    }
    if (p === "/cv/") return { view: "reader", cat: "cv", project: null };
    const m = /^\/projects\/([^/]+)\/$/.exec(p);
    return m && bySlug[m[1]] ? { view: "reader", cat: bySlug[m[1]].category, project: bySlug[m[1]].id } : null;
  }
  function currentPath() {
    if (!pathMode) return decodeURIComponent(location.hash.slice(1)) || "/";
    const p = location.pathname;
    return (p.startsWith(BASE) ? "/" + p.slice(BASE.length) : p) + location.hash;
  }

  /* A row that scrolls sideways on a phone — the categories, the project list — brings one of its items into
     view. It moves the row itself, never the page, so nothing jumps under the reader. */
  function keepInStrip(strip, item) {
    if (!strip || !item || strip.scrollWidth <= strip.clientWidth + 1) return;
    const box = strip.getBoundingClientRect(), r = item.getBoundingClientRect();
    strip.scrollLeft += (r.left - box.left) - (box.width - r.width) / 2;
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    // An image starts loading the moment it has a src, so "lazy" has to be set first to count.
    if (props && props.loading) node.setAttribute("loading", props.loading);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach((c) => c && node.append(c));
    return node;
  }
  const text = (t) => document.createTextNode(t);
  const newTab = () => el("span", { class: "visually-hidden", text: " (opens in a new tab)" });
  // The kind of work as a tag, then the project's context, without the words the tag already says (as pages.py).
  const REPEATS = { personal: /^personal projects?$/i, freelance: /^freelance$/i };
  function kindLine(p) {
    const rest = (p.context || "").split(" · ").filter((s) => !(REPEATS[p.kind] && REPEATS[p.kind].test(s.trim()))).join(" · ");
    if (!KINDS[p.kind]) return [text(rest)];
    return [el("span", { class: "kind", text: KINDS[p.kind] }), ...(rest ? [text(" · " + rest)] : [])];
  }

  /* ---- static frame ---- */
  const stage = $("stage");
  $("desk-title").replaceChildren(text(data.site.name), el("span", { class: "visually-hidden", text: " — " + data.site.strap }));
  // The role and how long, as plain text under the name, and what the work covers.
  $("desk-line").replaceChildren(el("b", { text: data.site.strap }), ...(data.site.experience ? [el("span", { text: " · " + data.site.experience })] : []));
  $("desk-focus").textContent = data.site.focus || "";
  $("footer-left").textContent = data.site.name + " · " + data.site.footer;

  // The name itself, projected on the wall behind the desk in Field Unit's grain (title.js).
  const plate = window.DeskTitle
    ? window.DeskTitle.make($("desk-title-canvas"), {
      words: (data.site.name || "").toUpperCase(),
      within: $("intro"),
      // Tall window, tall frame; a short one gives the room to the desk instead.
      height: () => Math.max(46, Math.min(104, window.innerHeight * 0.092))
    })
    : null;
  if (!plate) {
    // Nothing to draw it with: the plain heading takes its place rather than leaving a gap.
    $("desk-title").classList.remove("visually-hidden");
    $("desk-title").classList.add("intro__plain");
    $("projection").hidden = true;
  } else if (plate.moving) {
    // The name moves for as long as the desk shows, so it can be stopped (and it stays stopped).
    const pause = $("title-pause");
    pause.hidden = false;
    pause.addEventListener("click", () => {
      plate.setPaused(!plate.paused);
      pause.setAttribute("aria-pressed", String(plate.paused));
    });
  }
  const footRule = window.GrainType ? window.GrainType.rule($("foot-rule"), { grain: "#c0c7b8", drift: false }) : null;
  if (plate || footRule) {
    let redraw = 0, seen = -1;
    const relayout = () => {
      clearTimeout(redraw);
      redraw = setTimeout(() => { if (plate) plate.draw(); if (footRule) footRule.draw(); }, 110);
    };
    window.addEventListener("resize", relayout);           // width, height, zoom, another monitor
    if (window.ResizeObserver) {
      // The room the heading has can change without the window doing anything: coming back to the desk from
      // a project, or a pane that was hidden while the page loaded. Width only, so a redraw can't set off
      // another one by changing the heading's own height.
      new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w === seen) return;
        seen = w;
        relayout();
      }).observe($("intro"));
    }
  }
  const idleHint = touchFirst ? "Tap an object, then its label to open" : "Point at an object to see what it is · click to open";
  const shelfHint = "Swipe along the shelf · tap the object in front to open it";
  const countText = pad2(projects.length) + " projects on the desk";
  $("hud-bl").textContent = idleHint;
  // On a short desk the hint moves up beside the header's links, where there is room (see desk.css).
  $("top-hint").textContent = idleHint;
  $("hud-br").textContent = countText;

  /* ---- what each object opens ---- */
  function targetsOf(o) {
    if (o.link) return [{ kind: "link", href: o.link, label: o.label, title: o.title || o.label }];
    if (o.route) return [{ kind: "route", path: catPath(o.route), href: href(catPath(o.route)), label: o.label, title: o.title || o.label }];
    return (o.open || []).map((id) => ({ kind: "project", id, path: projectPath(byId[id]), href: href(projectPath(byId[id])), label: (o.labels || {})[id] || byId[id].title, title: byId[id].title }));
  }

  let scene = null, hovered = null, selected = null, region = null, lastObject = null, route = { view: "desk" };
  let lastState = null, shelfFocus = null;

  /* ---- labels: one per target, so every object has a named HTML equivalent. A label shows only for the
     object pointed at, selected or reached with the keyboard (and on the shelf, the one in front). ---- */
  const tags = {};          // object id -> [{node, target}]
  $("tags").replaceChildren();
  deskObjects.forEach((o) => {
    const list = targetsOf(o);
    const cat = catById[o.region];
    tags[o.id] = list.map((t, i) => {
      const kicker = t.kind === "link" ? "Music site · opens in a new tab" : t.kind === "route" ? "Experience, skills and contact" : (cat ? cat.number + " · " + cat.name : "");
      const node = el("a", {
        class: "tag", href: t.href, "data-object": o.id, "data-region": o.region, "data-kind": t.kind,
        target: t.kind === "link" ? "_blank" : null, rel: t.kind === "link" ? "noopener noreferrer" : null,
        "aria-label": t.kind === "link" ? t.title + ", music site, opens in a new tab" : t.title
      }, [
        el("span", { class: "tag__cat", text: kicker }),
        el("span", { class: "tag__title", text: t.title }),
        el("span", { class: "tag__open", "aria-hidden": "true", text: t.kind === "link" ? "Open site ↗" : "Open →" })
      ]);
      node.addEventListener("pointerenter", () => hover(o.id));
      node.addEventListener("pointerleave", () => hover(null));
      node.addEventListener("focus", () => {
        if (!node.matches(":focus-visible")) return;
        hover(o.id);
        if (scene) scene.showObject(o.id);
      });
      node.addEventListener("blur", () => hover(null));
      node.addEventListener("click", () => { lastObject = o.id; });
      $("tags").append(node);
      return { node, target: t, index: i, count: list.length };
    });
  });

  // Category names, printed on the board at the start of each group's rule.
  const groupLayer = el("div", { class: "grouplabels", "aria-hidden": "true" });
  stage.append(groupLayer);
  const groupLabels = Object.fromEntries(cats.map((c) => {
    const n = el("span", { class: "grouplabel" }, [el("b", { text: c.number }), el("span", { text: c.name })]);
    groupLayer.append(n);
    return [c.id, n];
  }));

  // The shelf's steps, for phones: previous and next object.
  const shelfPrev = el("button", { type: "button", class: "shelfnav shelfnav--prev", "aria-label": "Previous object", text: "‹", onclick: () => scene && scene.step(-1) });
  const shelfNext = el("button", { type: "button", class: "shelfnav shelfnav--next", "aria-label": "Next object", text: "›", onclick: () => scene && scene.step(1) });
  stage.append(shelfPrev, shelfNext);

  function setHud(id) {
    const o = objById[id];
    if (o) {
      const t = targetsOf(o);
      $("hud-bl").textContent = (catById[o.region] ? catById[o.region].name + " · " : "") + t.map((x) => x.title).join(" / ");
    } else {
      $("hud-bl").textContent = lastState && lastState.mode === "shelf" ? shelfHint : idleHint;
    }
  }

  function hover(id) {
    hovered = objById[id] ? id : null;
    stage.dataset.hovering = String(!!(hovered || selected));
    setHud(selected || hovered || shelfFocus);
    if (scene) scene.setHover(hovered);
    if (lastState) place(lastState);
  }

  function select(id) {
    selected = objById[id] ? id : null;
    if (scene) scene.setSelected(selected);
    hover(hovered);
  }

  /* ---- the PC: two projects share it, so clicking it asks which ---- */
  const pcMenu = $("pc-menu");
  function openMenu(objId, at) {
    const o = objById[objId];
    pcMenu.replaceChildren(
      el("p", { class: "pcmenu__title", text: o.menuTitle || "Open which project?" }),
      ...targetsOf(o).map((t) => el("a", { class: "pcmenu__item", href: t.href, onclick: () => { lastObject = objId; closeMenu(); } }, [
        el("span", { text: t.title }), el("small", { text: byId[t.id] ? byId[t.id].context : "" })
      ])),
      el("button", { type: "button", class: "pcmenu__close", "aria-label": "Close", text: "×", onclick: () => closeMenu(true) })
    );
    pcMenu.hidden = false;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(Math.max(12, at.x - rect.left - 130), rect.width - 272), y = Math.min(Math.max(12, at.y - rect.top - 40), rect.height - 150);
    pcMenu.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    pcMenu.dataset.object = objId;
    pcMenu.querySelector(".pcmenu__item").focus({ preventScroll: true });
  }
  function closeMenu(restore) {
    if (pcMenu.hidden) return;
    const objId = pcMenu.dataset.object;
    pcMenu.hidden = true;
    if (restore && tags[objId]) tags[objId][0].node.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(true); select(null); } });
  document.addEventListener("pointerdown", (e) => { if (!pcMenu.hidden && !pcMenu.contains(e.target) && e.target !== scene?.canvas) closeMenu(); });

  function activate(objId, pointerType, at) {
    const o = objById[objId];
    if (!o) {
      select(null);
      closeMenu();
      return;
    }
    const list = targetsOf(o);
    if (scene && scene.mode === "shelf") {
      // On the shelf the object in front already shows its label: a tap there opens it; a tap on a
      // neighbour brings that one to the front.
      if (objId !== shelfFocus) {
        scene.showObject(objId);
        closeMenu();
        return;
      }
    } else if (pointerType === "touch" && selected !== objId) {
      // On touch, the first tap selects and shows the label with its Open control.
      hovered = null;
      select(objId);
      closeMenu();
      return;
    }
    lastObject = objId;
    if (list.length > 1) { openMenu(objId, at); return; }
    const t = list[0];
    if (t.kind === "link") window.open(t.href, "_blank", "noopener");
    else go(t.path);
  }

  /* ---- label layout: the active object's card above it, joined by a short rule; the category names on
     the board; the shelf's count and steps ---- */
  function place(state) {
    lastState = state;
    const W = state.width, H = state.height;
    if (stage.dataset.mode !== state.mode) {
      stage.dataset.mode = state.mode;
      $("hud-br").textContent = countText;
      setHud(selected || hovered);
    }
    const seen = new Set();
    (state.groups || []).forEach((g) => {
      const n = groupLabels[g.region];
      if (!n) return;
      seen.add(g.region);
      n.dataset.faded = String(g.faded);
      n.style.transform = "translate3d(" + Math.round(g.x) + "px," + Math.round(g.y + 7) + "px,0)";
    });
    Object.entries(groupLabels).forEach(([id, n]) => { n.hidden = !seen.has(id); });
    if (state.mode === "shelf" && state.shelf) {
      if (shelfFocus !== state.focus) {
        shelfFocus = state.focus;
        if (!hovered && !selected) setHud(shelfFocus);
      }
      shelfPrev.disabled = state.shelf.index <= 0;
      shelfNext.disabled = state.shelf.index >= state.shelf.count - 1;
      $("hud-br").textContent = pad2(state.shelf.index + 1) + " / " + pad2(state.shelf.count);
    } else {
      shelfFocus = null;
    }
    deskObjects.forEach((o) => {
      const a = state.anchors[o.id];
      const list = tags[o.id];
      const focused = list.some((t) => t.node === document.activeElement);
      const active = o.id === hovered || o.id === selected || o.id === shelfFocus || focused;
      list.forEach((t) => {
        const show = !!a && a.inView && !a.faded && active;
        const faded = !a || a.faded;
        t.node.dataset.show = String(show);
        if (t.node.dataset.faded !== String(faded)) {
          t.node.dataset.faded = String(faded);
          t.node.tabIndex = faded ? -1 : 0;     // labels of objects set aside aren't in the tab order
        }
        if (!show) return;
        const w = t.node.offsetWidth, h = t.node.offsetHeight;
        // An object that opens two projects (the PC) shows both names. Side by side they would be clamped to
        // the screen edges and overlap on a phone, so below a certain width they stack instead, first on top.
        const stack = t.count > 1 && t.count * w + (t.count - 1) * 8 > W - 16;
        const spread = t.count > 1 && !stack ? (t.index - (t.count - 1) / 2) * (w + 8) : 0;
        const rise = stack ? (t.count - 1) * (h + 6) : 0;        // the same for each, so they flip together
        let y, side;
        if (a.top - h - 16 - rise >= 8) {
          side = "above";
          y = a.top - h - 16 - (t.count - 1 - t.index) * (stack ? h + 6 : 0);
        } else {
          side = "below";
          y = Math.min(a.y + 16 + t.index * (stack ? h + 6 : 0), H - h - 8);
        }
        const x = Math.min(Math.max(8, a.topX + spread - w / 2), W - w - 8);
        t.node.dataset.side = side;
        t.node.dataset.tail = String(!stack || t.index === (side === "above" ? t.count - 1 : 0));
        t.node.style.setProperty("--lead", Math.round(Math.min(w - 10, Math.max(10, a.topX + spread - x))) + "px");
        t.node.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
      });
    });
  }

  /* ---- category filters ---- */
  // Beside the chips: the same section in the project index, for anyone who would rather read than swipe. It is a
  // page of its own, so the desk page itself never has to grow a list and start scrolling.
  const sectionLink = el("a", { class: "chip chip--go", href: href("/projects/"), hidden: true });
  function setRegion(id) {
    region = catById[id] ? id : null;
    document.querySelectorAll("#filters [data-filter]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.filter || null) === (region || ""))));
    stage.dataset.region = region || "all";
    sectionLink.hidden = !region;
    if (region) {
      sectionLink.href = href(pathOf({ view: "index", group: region }));
      sectionLink.textContent = catById[region].name + " as a list →";
    }
    keepInStrip($("filters"), $("filters").querySelector('[aria-pressed="true"]'));
    if (scene) scene.setRegion(region);
  }
  $("filters").replaceChildren(
    el("button", { type: "button", class: "chip", "data-filter": "", "aria-pressed": "true", onclick: () => setRegion(null) }, [el("span", { text: "All work" })]),
    ...cats.filter((c) => c.id !== "cv").map((c) => el("button", { type: "button", class: "chip", "data-filter": c.id, "aria-pressed": "false", onclick: () => setRegion(c.id) },
      [el("span", { class: "chip__num", text: c.number }), el("span", { text: c.name })])),
    sectionLink
  );

  /* ---- cards: the project index, and the list shown in place of the desk without WebGL ---- */
  function cardImage(p) {
    return (p.gallery || [])[0] || ((p.sections || []).find((s) => s.image) || {}).image;
  }

  // A picture on a plain backdrop continues it into the bars its frame leaves beside it (x) or above and below
  // it (y), so it reads edge to edge. Cards and thumbnails are 4:3; the gallery measures its frame.
  function backdrop(id, frameAspect) {
    const m = media[id];
    if (!m || !m.bg) return null;
    const fill = m.w / m.h < frameAspect ? m.bg.x : m.bg.y;
    return fill ? "background:" + fill : null;
  }
  let refitGallery = null;         // the open gallery's backdrop, chosen again when the window changes size
  window.addEventListener("resize", () => refitGallery && refitGallery());

  function card(p) {
    const c = catById[p.category], id = cardImage(p), m = id && media[id];
    return el("li", {}, [el("a", { class: "card", href: href(projectPath(p)) }, [
      m ? el("span", { class: "card__media", style: backdrop(id, 4 / 3) }, [
        el("img", { src: m.thumb || m.src, alt: "", width: m.tw || m.w, height: m.th || m.h, loading: "lazy", decoding: "async" })
      ]) : el("span", { class: "card__media" }, [el("span", { class: "noimg", text: c.name })]),
      el("span", { class: "card__text" }, [
        el("strong", { class: "card__title", text: p.title }),
        el("span", { class: "card__short", text: p.short || "" }),
        el("small", { class: "card__meta" }, kindLine(p))
      ])
    ])]);
  }

  // Every project by section; `level` is the heading level of the section names, `ids` gives them anchors.
  function indexGroups(container, level, ids) {
    container.replaceChildren(...cats.filter((c) => c.id !== "cv").map((c) => {
      const items = inCat(c.id);
      return el("section", { class: "index__group", id: ids ? "group-" + c.id : null }, [
        el("h" + level, {}, [el("span", { "aria-hidden": "true", text: c.number }), text(c.name + " · " + pad2(items.length))]),
        el("ul", { class: "cards" }, items.map(card))
      ]);
    }));
  }
  $("index-title").textContent = "Project index";
  indexGroups($("index-groups"), 2, true);

  // The slim bar shown while reading: back to the desk, and the sections.
  $("readbar-links").replaceChildren(...cats.map((c) => el("a", { href: href(catPath(c.id)), "data-cat": c.id, "aria-current": "false" }, [el("span", { class: "chip__num", text: c.number }), el("span", { text: c.name })])));

  /* ---- reading ---- */
  // A collection shown all at once (the patches): equal tiles with captions, instead of one image at a time.
  function galleryGrid(items, captions) {
    return el("div", { class: "gallery gallery--grid" }, items.map((id) => {
      const m = media[id];
      return el("figure", { class: m.fill ? "fill" : null }, [
        el("img", { src: m.src, alt: m.alt, width: m.w, height: m.h, loading: "lazy", decoding: "async" }),
        captions === false ? null : el("figcaption", {}, [el("span", { class: "gallery__caption", text: m.caption }), el("span", { class: "gallery__credit", text: m.credit || "" })])
      ]);
    }));
  }

  // Technical drawings ("sheets"): each on a large sheet of its own with a short title and caption, opening into
  // the viewer below.
  function gallerySheets(items) {
    return el("div", { class: "sheets" }, items.map((id, i) => {
      const m = media[id];
      const open = el("button", { type: "button", class: "sheet__open", "aria-label": "Enlarge " + (m.title || m.caption) }, [
        el("img", { src: m.src, alt: m.alt, width: m.w, height: m.h, loading: i > 1 ? "lazy" : null, decoding: "async" }),
        el("span", { class: "sheet__zoom", "aria-hidden": "true", text: "Enlarge" })
      ]);
      open.addEventListener("click", () => viewer.open(items, i, open));
      return el("figure", { class: "sheet" }, [open, el("figcaption", {}, [
        m.title ? el("strong", { class: "sheet__title", text: m.title }) : null,
        el("span", { class: "sheet__caption", text: m.caption }),
        el("span", { class: "gallery__credit", text: m.credit || "" })
      ])]);
    }));
  }

  // The enlarged view: the drawing's high-resolution copy, fetched only now, over the page. Wheel, pinch or the
  // buttons zoom about a point; drag pans; double-click toggles between the whole sheet and a close look. Arrow
  // keys step through the set, Esc closes and focus goes back to the sheet that opened it.
  const viewer = (() => {
    let list = [], index = 0, opener = null, scale = 1, fit = 1, x = 0, y = 0, iw = 1, ih = 1;
    const pointers = new Map();
    let pinch = null, drag = null;
    const img = el("img", { class: "viewer__img", alt: "", draggable: "false" });
    const stage = el("div", { class: "viewer__stage" }, [img]);
    const heading = el("p", { class: "viewer__title", id: "viewer-title" });
    const note = el("p", { class: "viewer__caption" });
    const count = el("span", { class: "viewer__count" });
    const button = (label, text, fn) => el("button", { type: "button", class: "viewer__btn", "aria-label": label, title: label, text, onclick: fn });
    const prev = button("Previous drawing", "←", () => show(index - 1));
    const next = button("Next drawing", "→", () => show(index + 1));
    const tools = [prev, next, button("Zoom out", "−", () => zoomAt(1 / 1.6)), button("Whole sheet", "Fit", () => place(fit, null)),
      button("Zoom in", "+", () => zoomAt(1.6)), button("Close", "×", () => close())];
    const dialog = el("div", { class: "viewer", role: "dialog", "aria-modal": "true", "aria-labelledby": "viewer-title", hidden: true }, [
      el("div", { class: "viewer__bar" }, [el("div", { class: "viewer__text" }, [heading, note]), el("div", { class: "viewer__tools" }, [count, ...tools])]),
      stage
    ]);
    document.body.append(dialog);

    function bounds() { return stage.getBoundingClientRect(); }
    // Keep some of the drawing on screen however far it is pushed or zoomed out.
    function clamp() {
      const b = bounds(), w = iw * scale, h = ih * scale;
      x = w <= b.width ? (b.width - w) / 2 : Math.min(0, Math.max(b.width - w, x));
      y = h <= b.height ? (b.height - h) / 2 : Math.min(0, Math.max(b.height - h, y));
    }
    function draw() { clamp(); img.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale + ")"; }
    // Scale to `s` keeping the point (px, py) of the stage still; with no point, the middle.
    function place(s, at) {
      const b = bounds(), p = at || { x: b.width / 2, y: b.height / 2 };
      const s2 = Math.min(Math.max(s, fit), Math.max(fit * 8, 1.5));
      x = p.x - ((p.x - x) / scale) * s2;
      y = p.y - ((p.y - y) / scale) * s2;
      scale = s2;
      draw();
    }
    function zoomAt(k, at) { place(scale * k, at); }
    function refit() {
      const b = bounds();
      fit = Math.min(b.width / iw, b.height / ih) * 0.96;
      scale = fit;
      x = (b.width - iw * scale) / 2;
      y = (b.height - ih * scale) / 2;
      draw();
    }
    function show(i) {
      index = (i + list.length) % list.length;
      const m = media[list[index]];
      iw = m.lw || m.w;
      ih = m.lh || m.h;
      img.style.width = iw + "px";
      img.style.height = ih + "px";
      img.alt = m.alt;
      img.src = m.src;                                   // the sheet's own copy at once, then the sharp one
      if (m.large && m.large !== m.src) {
        const id = list[index], sharp = new Image();
        sharp.onload = () => { if (!dialog.hidden && list[index] === id) img.src = m.large; };
        sharp.src = m.large;
      }
      heading.textContent = m.title || "";
      note.textContent = m.caption;
      count.textContent = pad2(index + 1) + " / " + pad2(list.length);
      prev.hidden = next.hidden = list.length < 2;
      refit();
    }
    function open(items, i, from) {
      list = items;
      opener = from;
      dialog.hidden = false;
      document.documentElement.classList.add("viewing");
      show(i);
      tools[tools.length - 1].focus({ preventScroll: true });
    }
    function close() {
      if (dialog.hidden) return;
      dialog.hidden = true;
      document.documentElement.classList.remove("viewing");
      img.removeAttribute("src");
      pointers.clear();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }

    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "+" || e.key === "=") zoomAt(1.6);
      else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.6);
      else if (e.key === "0") place(fit, null);
      else if (e.key === "Tab") {
        // Focus stays in the viewer while it is open.
        const f = [...dialog.querySelectorAll("button:not([hidden])")];
        const at = f.indexOf(document.activeElement);
        if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && at === f.length - 1) { e.preventDefault(); f[0].focus(); }
        return;
      } else return;
      e.preventDefault();
    });
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const b = bounds();
      zoomAt(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - b.left, y: e.clientY - b.top });
    }, { passive: false });
    stage.addEventListener("dblclick", (e) => {
      const b = bounds(), at = { x: e.clientX - b.left, y: e.clientY - b.top };
      place(scale > fit * 1.05 ? fit : Math.max(1, fit * 2.5), at);
    });
    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, c] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), s: scale };
        drag = null;
      } else if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, ox: x, oy: y };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, c] = [...pointers.values()], b = bounds();
        place(pinch.s * Math.hypot(a.x - c.x, a.y - c.y) / pinch.d, { x: (a.x + c.x) / 2 - b.left, y: (a.y + c.y) / 2 - b.top });
      } else if (drag) {
        x = drag.ox + e.clientX - drag.x;
        y = drag.oy + e.clientY - drag.y;
        draw();
      }
    });
    const lift = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) drag = null;
    };
    stage.addEventListener("pointerup", lift);
    stage.addEventListener("pointercancel", lift);
    window.addEventListener("resize", () => { if (!dialog.hidden) refit(); });
    return { open, close };
  })();

  function gallery(ids, layout, captions) {
    const items = ids.filter((id) => media[id]);
    if (!items.length) return null;
    if (layout === "grid") return galleryGrid(items, captions);
    if (layout === "sheets") return gallerySheets(items);
    let current = 0;
    const main = el("img", { class: "gallery__main", decoding: "async" });
    const caption = el("span", { class: "gallery__caption" });
    const credit = el("span", { class: "gallery__credit" });
    const count = el("span", { class: "gallery__count" });
    const thumbs = el("ul", { class: "thumbs" });
    const buttons = items.map((id, i) => {
      const b = el("button", { type: "button", class: "thumb", "aria-label": "Image " + (i + 1) + ": " + media[id].caption, "aria-pressed": "false" },
        [el("img", { src: media[id].thumb || media[id].src, alt: "", style: backdrop(id, 4 / 3) })]);
      b.addEventListener("click", () => show(i));
      thumbs.append(el("li", {}, [b]));
      return b;
    });
    const figure = el("figure", {}, [main, el("figcaption", {}, [caption, credit])]);
    function show(i) {
      current = (i + items.length) % items.length;
      const m = media[items[current]];
      main.src = m.src;
      main.alt = m.alt;
      main.width = m.w;
      main.height = m.h;
      fitBackdrop();
      caption.textContent = m.caption;
      credit.textContent = m.credit || "";
      count.textContent = pad2(current + 1) + " / " + pad2(items.length);
      buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(current === j)));
    }
    // The frame's shape depends on the layout, so the backdrop is chosen once the picture is on the page, and
    // again whenever the window changes size.
    function fitBackdrop() {
      requestAnimationFrame(() => {
        if (!main.isConnected || !main.clientHeight) return;
        main.setAttribute("style", backdrop(items[current], main.clientWidth / main.clientHeight) || "");
      });
    }
    refitGallery = fitBackdrop;
    show(0);
    if (items.length === 1) return el("div", { class: "gallery" }, [figure]);
    const steps = el("div", { class: "gallery__steps" }, [
      count,
      el("button", { type: "button", class: "step", "aria-label": "Previous image", text: "←", onclick: () => show(current - 1) }),
      el("button", { type: "button", class: "step", "aria-label": "Next image", text: "→", onclick: () => show(current + 1) })
    ]);
    return el("div", { class: "gallery" }, [figure, el("div", { class: "gallery__bar" }, [thumbs, steps])]);
  }

  const bullets = (items) => el("ul", {}, items.map((t) => el("li", { text: t })));

  function modules(p) {
    if (!p.sections || !p.sections.length) return null;
    return el("div", { class: "modules" }, p.sections.map((s, i) => el("section", { class: "module" }, [
      el("h2", {}, [el("span", { "aria-hidden": "true", text: pad2(i + 1) }), text(s.title)]),
      s.text ? el("p", { text: s.text }) : null,
      s.list ? bullets(s.list) : null,
      s.note ? el("p", { class: "note", text: s.note }) : null
    ])));
  }

  // A project you can try (Remote Object): a prominent link to its page beside the site, which loads the whole
  // instrument only when opened. The offline file has no such page, so there it opens the live one in a new tab.
  function action(p) {
    const a = p.action;
    if (!a) return null;
    return el("div", { class: "action" }, [
      el("a", { class: "action__go", href: a.href, target: a.external ? "_blank" : null, rel: a.external ? "noopener" : null }, [
        text(a.label), a.external ? newTab() : null, el("span", { "aria-hidden": "true", text: a.external ? "↗" : "→" })
      ]),
      a.note ? el("p", { class: "action__note", text: a.note }) : null
    ]);
  }

  // What I did, first and plainly: one sentence, then the particulars.
  function myRole(p) {
    const mine = p.mine && p.mine.length ? p.mine : null;
    if (!p.role && !mine) return null;
    return el("section", { class: "myrole" }, [
      el("h2", { text: "My role" }),
      p.role ? el("p", { class: "myrole__lead", text: p.role }) : null,
      mine ? bullets(mine) : null
    ]);
  }

  function story(p) {
    const pictures = gallery(p.gallery || [], p.galleryLayout, p.captions);
    const summary = p.summary ? el("p", { class: "summary", text: p.summary }) : null;
    const siblings = inCat(p.category);
    const next = siblings.length > 1 ? siblings[(siblings.indexOf(p) + 1) % siblings.length] : null;
    const facts = [
      p.outcome ? el("section", {}, [el("h2", { text: "Outcome" }), el("p", { text: p.outcome })]) : null,
      p.credits && p.credits.length ? el("section", {}, [el("h2", { text: "Credits" }), bullets(p.credits)]) : null
    ].filter(Boolean);
    const links = (p.links || []).map((l) => el("a", { href: l.href, target: "_blank", rel: "noopener noreferrer" },
      [text(l.label), newTab(), el("span", { "aria-hidden": "true", text: "↗" })]));
    return [
      el("p", { class: "eyebrow" }, kindLine(p)),
      el("h1", { id: "story-title", tabindex: "-1", text: p.title }),
      // A page of drawings reads its short introduction first; elsewhere the pictures lead.
      ...(p.galleryLayout === "sheets" ? [summary, pictures] : [pictures, summary]),
      action(p),
      myRole(p),
      modules(p),
      facts.length ? el("div", { class: "facts" }, facts) : null,
      links.length ? el("p", { class: "links" }, links) : null,
      next ? el("p", { class: "next" }, [el("a", { href: href(projectPath(next)) }, [
        el("span", { text: "Next in " + catById[p.category].name }), text(next.title + " →")
      ])]) : null
    ];
  }

  // A message form for the Contact section. It appears only once the site has a form endpoint (a hosted form service
  // James has set up and verified; `cv.form` in desk.json). Until then, and always in the offline file, the email
  // link is the way, and no Send button pretends to work.
  function contactForm(cfg) {
    if (!cfg || !cfg.endpoint) return null;
    const status = el("p", { class: "cform__status", role: "status", "aria-live": "polite" });
    const field = (label, input) => el("label", { class: "cform__field" }, [el("span", { text: label }), input]);
    const email = el("input", { name: "email", type: "email", autocomplete: "email", required: true, maxlength: "254" });
    const message = el("textarea", { name: "message", required: true, maxlength: "2000", rows: "6" });
    const name = el("input", { name: "name", type: "text", autocomplete: "name", maxlength: "100" });
    const trap = el("input", { name: "_gotcha", type: "text", tabindex: "-1", autocomplete: "off" });
    const send = el("button", { type: "submit", class: "action__go", text: "Send" });
    const form = el("form", { class: "cform", novalidate: true }, [
      field("Your email (so I can reply)", email), field("Message", message), field("Name (optional)", name),
      el("label", { class: "cform__trap", "aria-hidden": "true" }, [text("Leave this empty"), trap]),
      el("div", { class: "cform__row" }, [send, status]),
      el("p", { class: "cform__note", text: "Your message and email address are sent to me through " + (cfg.provider || "a form service") + "." })
    ]);
    const say = (t) => { status.textContent = t; };
    let busy = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;                                  // one send at a time
      const from = email.value.trim(), body = message.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(from)) { say("Please add your email address, so I can reply."); email.focus(); return; }
      if (!body) { say("Please write a message."); message.focus(); return; }
      if (body.length > 2000) { say("That's a little long: 2000 characters at most."); message.focus(); return; }
      if (trap.value) { say("Sent."); return; }         // a form-filling robot: nothing is sent
      busy = true; send.disabled = true; say("Sending…");
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 15000);
      const fallback = (data.cv.contact.find((c) => c.href.startsWith("mailto:")) || {}).label;
      const kept = " Your message is still here: try again" + (fallback ? ", or email " + fallback : "") + ".";
      try {
        const r = await fetch(cfg.endpoint, {
          method: "POST", signal: stop.signal, headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email: from, message: body, name: name.value.trim(), site: cfg.site || location.host, _subject: "Message from " + (cfg.site || location.host) })
        });
        if (r.ok) { form.reset(); say("Sent. Thank you: I'll reply to " + from + "."); }
        else {
          const j = await r.json().catch(() => null), why = j && j.errors && j.errors[0] && j.errors[0].message;
          say("That didn't send" + (why ? " (" + why + ")" : "") + "." + kept);
        }
      } catch (err) {
        say((err.name === "AbortError" ? "No answer from the form service, so it may not have sent." : "That didn't send: there seems to be no connection.") + kept);
      } finally { clearTimeout(timer); busy = false; send.disabled = false; }
    });
    return form;
  }

  function cvStory() {
    const cv = data.cv;
    const jobs = cv.experience.map((j) => el("div", { class: "job" }, [
      el("h3", { class: "role", text: j.role + ", " + j.org }),
      el("p", { class: "dates", text: j.dates }),
      el("p", { class: "desc", text: j.text }),
      j.points && j.points.length ? el("ul", { class: "points" }, j.points.map((t) => el("li", { text: t }))) : null
    ]));
    const skills = el("dl", { class: "skills" }, cv.skills.map((s) => el("div", {}, [el("dt", { text: s.group }), el("dd", { text: s.items })])));
    const contact = el("p", { class: "contact-lines" }, cv.contact.map((c) => el("a", { href: c.href, text: c.label })));
    return [
      el("p", { class: "eyebrow", text: cv.location }),
      el("h1", { id: "story-title", tabindex: "-1", text: data.site.name }),
      el("p", { class: "headline", text: cv.headline }),
      el("p", { class: "summary", text: cv.profile }),
      el("section", {}, [el("h2", { text: "Experience" })].concat(jobs)),
      el("section", {}, [el("h2", { text: "Education" }), el("p", { text: cv.education })]),
      el("section", {}, [el("h2", { text: "Skills" }), skills]),
      el("section", {}, [el("h2", { text: "Also" }), el("p", { text: cv.extra })]),
      el("section", {}, [el("h2", { text: "Contact" }), contact,
        // The CV as a PDF to attach, where the site has one (as pages.py); otherwise, and in the offline file, the page
        // prints as a plain document, which also makes a PDF.
        cv.pdf ? el("p", { class: "cvfile" }, [el("a", { class: "textlink", href: cv.pdf.href, download: true }, [
          text("Download CV "), el("span", { class: "cvfile__size", text: "(PDF, " + cv.pdf.kb + " KB)" })])]) : null,
        contactForm(cv.form),
        cv.pdf ? null : el("p", {}, [el("button", { type: "button", class: "textlink printlink", text: "Print or save as PDF", onclick: () => window.print() })])])
    ];
  }

  function renderReader(catId, projectId) {
    const c = catById[catId];
    $("folio-eyebrow").textContent = "Section " + c.number + " / " + pad2(cats.length);
    $("folio-title").textContent = c.name;
    const storyEl = $("story"), plist = $("plist");
    storyEl.replaceChildren();
    plist.replaceChildren();
    storyEl.classList.toggle("cv", catId === "cv");
    if (catId === "cv") {
      plist.hidden = true;
      $("folio-body").classList.add("folio__body--single");
      storyEl.append(...cvStory());
      document.title = c.name + " — " + data.site.name;
    } else {
      plist.hidden = false;
      $("folio-body").classList.remove("folio__body--single");
      const items = inCat(catId);
      const current = byId[projectId] && byId[projectId].category === catId ? byId[projectId] : items[0];
      items.forEach((p, i) => plist.append(el("a", { href: href(projectPath(p)), "aria-current": p === current ? "page" : "false" }, [
        el("span", { class: "code", text: c.number + "." + (i + 1) }),
        el("span", { text: p.title }),
        el("small", { text: p.context })
      ])));
      storyEl.append(...story(current).filter(Boolean));
      document.title = current.title + " — " + data.site.name;
      keepInStrip(plist, plist.querySelector('a[aria-current="page"]'));
    }
    document.querySelectorAll("#readbar-links a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.cat === catId)));
  }

  /* ---- routing ---- */
  function apply(next, how, y) {
    const prev = route;
    route = next;
    const moved = how !== "initial";
    document.body.dataset.view = next.view;
    $("intro").hidden = next.view !== "desk";
    $("desk-view").hidden = next.view !== "desk";
    $("reader").hidden = next.view !== "reader";
    $("index-view").hidden = next.view !== "index";
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = (a.dataset.nav === "index" && next.view === "index") || (a.dataset.nav === "cv" && next.cat === "cv");
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    closeMenu();
    viewer.close();
    if (scene) scene.setPaused(next.view !== "desk");
    if (plate) { if (next.view === "desk") plate.start(); else plate.stop(); }
    select(null);
    hover(null);
    // The tab and history name what is open; the reader and index set their own below.
    document.title = homeTitle;

    let settled = false;                     // whether the page is already where it should stand
    if (next.view === "reader") {
      const sameCat = prev.view === "reader" && prev.cat === next.cat;
      renderReader(next.cat, next.project);
      if (moved && sameCat && how === "push") {
        // Another project in the same section: the list stays put, and the story comes into view if it isn't.
        const top = $("story").getBoundingClientRect().top;
        if (top < $("readbar").getBoundingClientRect().bottom || top > window.innerHeight * 0.6) $("story").scrollIntoView({ block: "start" });
        settled = true;
      }
      if (moved) $("story-title").focus({ preventScroll: true });
    } else if (next.view === "index") {
      document.title = "Project index — " + data.site.name;
      document.querySelectorAll("#readbar-links a").forEach((a) => a.setAttribute("aria-current", "false"));
      if (moved) $("index-title").focus({ preventScroll: true });
      const group = next.group && $("group-" + next.group);
      if (group && how !== "pop") { group.scrollIntoView({ block: "start" }); settled = true; }
    } else {
      if (moved && prev.view !== "desk") {
        // Back on the desk: the filter and camera are as they were; focus returns to the object that was opened.
        const back = lastObject && tags[lastObject] ? tags[lastObject][0].node : null;
        if (back) requestAnimationFrame(() => back.focus({ preventScroll: true }));
      }
      ensureDesk();
    }
    // Back and forward (and a reload) return to where the page stood; anything else starts at its top.
    if (how === "pop" || (how === "initial" && y)) window.scrollTo(0, y || 0);
    else if (moved && !settled) window.scrollTo(0, 0);
  }

  // What the desk looked like (its section and the object last opened), kept with its history entry so coming back
  // to it, even after a reload, finds it as it was.
  function deskState() {
    return { region, object: lastObject };
  }
  function restoreDesk(state) {
    if (!state) return;
    if (state.region && catById[state.region]) setRegion(state.region);
    if (state.object && objById[state.object]) lastObject = state.object;
  }

  // The scroll position (and the desk's state) go with each history entry.
  let saveTimer = 0;
  function remember() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      history.replaceState(Object.assign({}, history.state, { y: Math.round(window.scrollY) }, route.view === "desk" ? { desk: deskState() } : {}), "");
    } catch (e) { /* a browser limiting how often this may be called: skip this one */ }
  }

  function go(path) {
    const next = routeOf(path);
    if (!next) { location.href = href(path); return; }
    if (!pathMode) { location.hash = path; return; }        // the offline file: hashchange does the rest
    remember();
    const url = href(path);
    if (url === location.pathname + location.hash) history.replaceState(Object.assign({}, history.state, { y: 0 }), "", url);
    else history.pushState({ y: 0 }, "", url);
    apply(next, "push");
  }

  if (pathMode) {
    history.scrollRestoration = "manual";
    window.addEventListener("scroll", () => { if (!saveTimer) saveTimer = setTimeout(remember, 300); }, { passive: true });
    window.addEventListener("pagehide", remember);
    window.addEventListener("popstate", (e) => {
      const next = routeOf(currentPath()) || { view: "desk" };
      if (next.view === "desk" && e.state) restoreDesk(e.state.desk);
      apply(next, "pop", e.state && e.state.y);
    });
    // Links between the pages move without a reload. Anything else (another site, the instrument's own page, a
    // modified click for a new tab) is left to the browser.
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
      const path = "/" + url.pathname.slice(BASE.length) + url.hash;
      if (!routeOf(path)) return;
      e.preventDefault();
      go(path);
    });
  } else {
    window.addEventListener("hashchange", () => apply(routeOf(currentPath()) || { view: "desk" }, "push"));
  }

  // "Skip to content" moves focus past the header and section navigation without changing the address.
  document.querySelector(".skip").addEventListener("click", (e) => {
    e.preventDefault();
    if (route.view === "reader") {
      $("story-title").focus({ preventScroll: true });
      $("story").scrollIntoView({ block: "start" });
    } else {
      (route.view === "index" ? $("index-title") : $("main")).focus();
    }
  });

  /* ---- the 3D desk, loaded when it is first shown; a plain list when it can't be (or would crawl) ---- */
  // `message` says why; with `offer`, the reason is software rendering and the note offers the desk anyway.
  function fallback(message, offer) {
    document.body.classList.add("no-3d");
    stage.querySelectorAll("canvas").forEach((c) => c.remove());
    if (offer) root.classList.add("slow-3d");
    else $("deck-note").replaceChildren(text(message));
    indexGroups($("fallback-index"), 3, false);
  }
  const anyway = $("desk-anyway");
  if (anyway) anyway.addEventListener("click", () => {
    root.classList.remove("slow-3d");
    document.body.classList.remove("no-3d");
    deskLoad = null;
    ensureDesk(true);
    window.scrollTo(0, 0);
  });

  const sleeveSpec = (data.desk && data.desk.sleeve) || null;
  const sleeve = sleeveSpec && media[sleeveSpec.texture] ? { texture: media[sleeveSpec.texture].src } : null;

  let patch = null;
  if (data.desk && data.desk.patch && media[data.desk.patch.texture]) {
    patch = {
      texture: media[data.desk.patch.texture].src,
      normalMap: data.desk.patch.normalMap && media[data.desk.patch.normalMap] ? media[data.desk.patch.normalMap].src : null,
      outline: data.desk.patch.outline, aspect: data.desk.patch.aspect, edgeColour: data.desk.patch.edgeColour
    };
  }

  // With `fast`, only WebGL with graphics acceleration counts (not software rendering).
  function webglAvailable(fast) {
    try {
      const c = document.createElement("canvas"), o = { failIfMajorPerformanceCaveat: !!fast };
      const gl = window.WebGLRenderingContext && (c.getContext("webgl2", o) || c.getContext("webgl", o));
      if (!gl) return false;
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();                      // only a test: give the context back
      return true;
    } catch (e) {
      return false;
    }
  }

  // Three.js and the scene code: in the page (the offline file) or one file beside it (the website).
  function loadDeskCode() {
    const src = root.dataset.desk;
    if (!src || window.DeskScene) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = el("script", { src });
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("desk code: " + src + " didn't load"));
      document.head.append(s);
    });
  }

  // A file read as it arrives, so the desk can say how far along it is (`total`: its size as it arrives).
  function download(src, total) {
    return fetch(src).then(async (r) => {
      if (!r.ok) throw new Error(src + ": HTTP " + r.status);
      if (!r.body || !r.body.getReader || !total) return new Uint8Array(await r.arrayBuffer());
      const reader = r.body.getReader(), chunks = [];
      let got = 0, shown = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        const pc = Math.min(99, Math.floor((got / total) * 100));
        if (pc >= shown + 5) { shown = pc; $("stage-status").textContent = "Setting out the desk… " + pc + "%"; }
      }
      const all = new Uint8Array(got);
      let at = 0;
      chunks.forEach((c) => { all.set(c, at); at += c.length; });
      return all;
    });
  }

  // The packed models (build.py, pack_models): a header in JSON, then each mesh's positions as zigzag varint
  // differences, its normals as three planes of bytes and its indices counted down from the highest so far.
  function unpackModels(u8) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "DSK1") throw new Error("models: not a packed model file");
    const length = view.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + length)));
    let at = 8 + length;
    const varint = () => {
      let v = 0, scale = 1, b;
      do { b = u8[at++]; v += (b & 0x7f) * scale; scale *= 128; } while (b & 0x80);
      return v;
    };
    Object.values(header).forEach((model) => {
      model.meshes.forEach((m) => {
        const n = m.v, pos = new Int16Array(n * 3), nrm = new Int8Array(n * 3), idx = m.wide ? new Uint32Array(m.i) : new Uint16Array(m.i);
        for (let c = 0; c < 3; c++) {
          let last = 0;
          for (let k = 0; k < n; k++) {
            const z = varint();
            last += z % 2 ? -(z + 1) / 2 : z / 2;
            pos[k * 3 + c] = last;
          }
        }
        for (let c = 0; c < 3; c++) {
          for (let k = 0; k < n; k++) nrm[k * 3 + c] = (u8[at + k] << 24) >> 24;
          at += n;
        }
        let high = 0;
        for (let k = 0; k < m.i; k++) {
          const code = varint();
          idx[k] = high - code;
          if (code === 0) high += 1;
        }
        Object.assign(m, { pos: pos.buffer, nrm: nrm.buffer, idx: idx.buffer });
      });
    });
    return header;
  }

  // The models: in the page (the offline file), or beside it: packed where the browser can unpack them, otherwise
  // (or if that fails) as JSON.
  function loadModels() {
    const packed = root.dataset.modelsPacked, src = root.dataset.models;
    if (!src) {
      const inline = $("desk-models");
      return Promise.resolve(inline ? JSON.parse(inline.textContent) : {});
    }
    const json = () => download(src, Number(root.dataset.modelsBytes) || 0).then((u8) => JSON.parse(new TextDecoder().decode(u8)));
    if (!packed || !window.DecompressionStream) return json();
    return download(packed, Number(root.dataset.modelsPackedBytes) || 0).then(async (gz) => {
      // Gzipped as published; a server or proxy that has already unpacked it leaves the plain file.
      const raw = gz[0] === 0x1f && gz[1] === 0x8b
        ? new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())
        : gz;
      return unpackModels(raw);
    }).catch((e) => {
      console.warn("Packed models didn't load (" + e.message + "); loading them as JSON instead.");
      return json();
    });
  }

  // Below this the desk has no room for the hint along its foot (see desk.css).
  if (window.ResizeObserver) {
    new ResizeObserver((entries) => {
      stage.dataset.short = String(entries[0].contentRect.height < 430);
    }).observe(stage);
  }

  let deskLoad = null, deskAsked = false;
  function ensureDesk(force) {
    if (deskLoad) return;
    // On the desk's own page the first lines asked already, before anything was drawn (slow-3d); coming to the desk
    // from another page, ask now. `force`: the "show the desk anyway" button.
    let fast;
    if (force) fast = true;
    else if (root.hasAttribute("data-home") && !deskAsked) fast = !root.classList.contains("slow-3d");
    else fast = webglAvailable(true);
    deskAsked = true;
    if (!fast) {
      deskLoad = Promise.resolve();
      if (webglAvailable(false)) fallback(null, true);
      else fallback("The 3D desk isn't available in this browser, so every project is listed below.");
      return;
    }
    deskLoad = Promise.all([loadDeskCode(), loadModels()]).then(([, models]) => startScene(models)).catch((e) => {
      console.error(e);
      fallback("The 3D desk couldn't load, so every project is listed below.");
    });
  }

  function startScene(models) {
    try {
      scene = window.DeskScene ? window.DeskScene.start({
        stage,
        models,
        objects: deskObjects,
        layout: data.desk.layout,
        patch,
        sleeve,
        // A phone gets the shelf: one object at a time, large enough to see, instead of the whole desk shrunk. So
        // does a desk with little height (a phone on its side).
        mode: (W, H) => (W < 640 || H < 260 ? "shelf" : "desk"),
        // Room above the objects for the active label, and below the front row for the category names. On a
        // short desk that room is a big share of it, so it is asked for more sparingly: a label with nowhere
        // to go above an object drops below it anyway.
        margins: (W, H) => {
          const tall = Math.max(0, Math.min(1, (H - 300) / 260));
          return { top: Math.min(0.3, (44 + 48 * tall) / H), bottom: Math.min(0.22, (26 + 32 * tall) / H), left: 0.02, right: 0.02 };
        },
        shelfMargins: () => ({ top: 0.24, bottom: 0.14, left: 0.2, right: 0.2 }),
        onHover: (id) => { if (!touchFirst) hover(id); },
        onPick: (id, pointerType, at) => activate(id, pointerType, at),
        onFrame: place
      }) : null;
    } catch (e) {
      console.error(e);
      scene = null;
    }
    if (scene) {
      $("stage-status").hidden = true;
      scene.canvas = stage.querySelector("canvas");
      window.DeskScene.stats = scene.stats;
      // The page may already be on a section or a project by the time the models arrive; a desk restored from
      // its history entry brings the object last opened back into view.
      if (region) scene.setRegion(region);
      if (lastObject && objById[lastObject]) scene.showObject(lastObject, true);
      scene.setPaused(route.view !== "desk");
    } else {
      fallback("The 3D desk isn't available in this browser, so every project is listed below.");
    }
  }

  // The page as it was asked for: an old #address is swapped for the page's own, a desk coming back from a reload
  // finds its section, and the view is rendered again with the same markup it arrived with.
  const first = routeOf(currentPath()) || { view: "desk" };
  if (location.hash.length > 1 && first.view !== "desk" && (pathMode ? location.pathname === BASE : !location.hash.startsWith("#/"))) {
    history.replaceState(history.state, "", href(pathOf(first)));
  }
  const saved = history.state || {};
  if (first.view === "desk") restoreDesk(saved.desk);
  apply(first, "initial", saved.y);
})();
