/* Material somebody put in themselves.
 *
 * Drop an audio file anywhere on the page and it is filed as an object.
 * It keeps working after a reload, on that machine, in that browser, and
 * it never goes anywhere: the file is held in IndexedDB and served to
 * the player as a blob URL.
 *
 * Blob rather than a data URI on purpose. A data URI for a five-megabyte
 * track is a seven-megabyte string sitting in memory and in every
 * structured clone; a blob URL is a pointer. Both count as same-origin,
 * which is the part that matters -- a file:// audio element feeding a
 * MediaElementSource is treated as cross-origin and outputs silence, so
 * the deck would look right and play nothing at all.
 *
 * The object model in the brief already has a name for this state, and
 * it is not ATTACHED. Something you added yourself, that nobody else can
 * hear, that exists on one machine only, is LOCAL.
 */

const DB = "remote-object";
const STORE = "local";
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) { reject(new Error("no indexeddb")); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
export const isAudio = (f) =>
  (f.type && f.type.startsWith("audio/")) || AUDIO.test(f.name || "");

/** A filename, made to look like everything else in the archive. */
function titleOf(name) {
  return (name || "UNTITLED")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 22) || "UNTITLED";
}

export class Local {
  constructor() {
    this.objects = [];
    this.db = null;
    this.onChange = null;
  }

  /** Read back whatever this machine already has. Never throws. */
  async load() {
    try {
      this.db = await open();
      const rows = await tx(this.db, "readonly", (s) => s.getAll());
      for (const row of rows || []) this.attach(row);
      this.renumber();
    } catch {
      /* private window, or a browser with storage switched off. The
         object still works, it just cannot remember anything. */
      this.db = null;
    }
    return this.objects;
  }

  attach(row) {
    const url = URL.createObjectURL(row.blob);
    this.objects.push({
      code: "L00",
      title: row.title,
      origin: "THIS CLIENT",
      status: "local",
      received: row.received,
      type: "audio",
      relations: 0,
      src: url,
      localId: row.id,
    });
  }

  renumber() {
    this.objects.forEach((o, i) => {
      o.code = "L" + String(i + 1).padStart(2, "0");
    });
  }

  /** @returns the new object, or null if it was not audio. */
  async add(file) {
    if (!isAudio(file)) return null;
    const now = new Date();
    const row = {
      id: (Date.now() + Math.random()).toString(36),
      title: titleOf(file.name),
      received: [now.getDate(), now.getMonth() + 1, now.getFullYear() % 100]
        .map((n) => String(n).padStart(2, "0")).join("."),
      blob: file,
    };
    this.attach(row);
    this.renumber();
    if (this.db) {
      try { await tx(this.db, "readwrite", (s) => s.put(row)); }
      catch { /* it plays this session and is forgotten after it */ }
    }
    this.onChange?.();
    return this.objects[this.objects.length - 1];
  }

  async remove(o) {
    const i = this.objects.indexOf(o);
    if (i < 0) return;
    this.objects.splice(i, 1);
    URL.revokeObjectURL(o.src);
    this.renumber();
    if (this.db && o.localId) {
      try { await tx(this.db, "readwrite", (s) => s.delete(o.localId)); }
      catch { /* nothing to do */ }
    }
    this.onChange?.();
  }

  /** Wipe everything this machine has been given. */
  async forget() {
    for (const o of this.objects) URL.revokeObjectURL(o.src);
    this.objects = [];
    if (this.db) {
      try { await tx(this.db, "readwrite", (s) => s.clear()); }
      catch { /* nothing to do */ }
    }
    this.onChange?.();
  }
}

/**
 * Files dropped on the window become objects.
 *
 * Bound to the window rather than to a device, because there is no
 * device for it and inventing one would mean inventing a story about
 * where uploaded material goes -- which is A-17's job, and A-17 does
 * not work yet. Dropping a file on the whole object is honest about
 * that: the thing accepts material, and says so, and nothing about it
 * pretends to be a network.
 */
export function acceptDrops(local, say) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  addEventListener("dragover", (e) => {
    stop(e);
    e.dataTransfer.dropEffect = "copy";
  });

  addEventListener("drop", async (e) => {
    stop(e);
    const files = [...(e.dataTransfer?.files || [])].filter(isAudio);
    if (!files.length) {
      if (e.dataTransfer?.files?.length) say("NOT AUDIO");
      return;
    }
    say("READING " + files.length);
    let n = 0;
    for (const f of files) { if (await local.add(f)) n++; }
    say(n === 1 ? "1 OBJECT FILED" : n + " OBJECTS FILED");
  });
}
