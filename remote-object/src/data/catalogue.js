/* The archive, as the Receiver understands it.
 *
 * Five objects are attached and will play. The rest are listed but do
 * not resolve -- the numbering starts at 019 and has gaps in it, which
 * is the cheapest honest way to say that this network was running
 * before you found it and that things have already left it.
 *
 * `unresolved` entries are not decoration. When the hidden layer is
 * built, this is where it attaches.
 */

export const ATTACHED = "attached";
export const UNRESOLVED = "unresolved";
export const REMOVED = "removed";
/* Material the visitor put in themselves. Playable, and on one
   machine only -- the object model in the brief already had a name
   for that and it is not ATTACHED. */
export const LOCAL = "local";

export const CATALOGUE = [
  {
    code: "019", title: "ALKALINE", origin: "[unknown]",
    status: UNRESOLVED, received: "11.02.26", type: "audio", relations: 2,
  },
  {
    code: "020", title: "UNTITLED_6", origin: "[unknown]",
    status: UNRESOLVED, received: "11.02.26", type: "audio", relations: 0,
  },
  {
    code: "021", title: "TUCKSHOP", origin: "FIELD UNIT",
    status: ATTACHED, received: "14.03.26", type: "audio", relations: 3,
    src: "https://field-unit.co.uk/tuckshop.mp3",
  },
  {
    code: "022", title: "TRENCHCOAT", origin: "TBC",
    status: ATTACHED, received: "14.03.26", type: "audio", relations: 1,
    src: "https://field-unit.co.uk/trenchcoat.mp3",
  },
  {
    code: "023", title: "CRS-02", origin: "[unknown]",
    status: UNRESOLVED, received: "02.04.26", type: "unknown", relations: 5,
  },
  {
    code: "024", title: "NAVVY", origin: "TBC",
    status: ATTACHED, received: "19.05.26", type: "audio", relations: 2,
    src: "https://field-unit.co.uk/Navvy_Demo.mp3",
  },
  {
    code: "025", title: "POCKET MUCK", origin: "TBC",
    status: ATTACHED, received: "19.05.26", type: "audio", relations: 0,
    src: "https://field-unit.co.uk/Pocket_Muck_Demo.mp3",
  },
  {
    /* There is no 026. There was. */
    code: "027", title: "LAN 33", origin: "TBC",
    status: ATTACHED, received: "28.07.26", type: "audio", relations: 4,
    src: "https://field-unit.co.uk/LAN_33_Demo.mp3",
  },
  {
    code: "028", title: "GRAVEL", origin: "REMOTE OBJECT",
    status: UNRESOLVED, received: "07.09.26", type: "audio", relations: 4,
  },
  {
    code: "029", title: "[ RETURNED ]", origin: "--",
    status: REMOVED, received: "--.--.--", type: "--", relations: 0,
  },
  {
    code: "030", title: "SWAN / CANAL", origin: "[unknown]",
    status: UNRESOLVED, received: "07.09.26", type: "image", relations: 1,
  },
  {
    /* Numbered for the token, which is not electronic and does not
       explain itself. Leave it that way. */
    code: "031", title: "SOMETHING PLAYS", origin: "--",
    status: UNRESOLVED, received: "--.--.--", type: "unknown", relations: 31,
  },
];

/**
 * Object 000.
 *
 * Not in the catalogue at load. It is filed partway through a visit,
 * above the first entry, so that the list you have been reading turns
 * out to have had something above the top of it. Its metadata page is
 * the object's record of you -- visits, time, what you played, how
 * often it broke off looking at you -- laid out in exactly the same
 * fields as every other object, with no comment of any kind.
 *
 * That flatness is the whole effect. It is not accusing you of
 * anything. It has simply catalogued you alongside the music, using
 * the same form, because to it there was never a difference.
 */
export const INTRUDER = {
  code: "000",
  title: "[ THIS ]",
  origin: "HERE",
  status: UNRESOLVED,
  received: "--.--.--",
  type: "record",
  relations: 1,
  intruder: true,
};

export const playable = (o) => (o.status === ATTACHED || o.status === LOCAL) && !!o.src;
export const attachedCount = CATALOGUE.filter(playable).length;

/* ---- what the object remembers about you -------------------------
   Local only, and deliberately dull: how many times each object has
   been opened. Nothing about who you are, nothing sent anywhere. The
   Receiver shows it back on the metadata page, so returning to the
   object after a week is visibly not the same as arriving at it. */

const KEY = "remote-object.opened.v1";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}

let opened = load();

export function openedCount(code) {
  return opened[code] | 0;
}

export function noteOpened(code) {
  opened[code] = (opened[code] | 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(opened)); } catch { /* private window */ }
  return opened[code];
}
