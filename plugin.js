// Cider Vim: vim-style keys for Cider 2. Normal mode whenever no text field is focused.

const IDENTIFIER = "com.sx.cidervim";

// Rows J/K can land on (from Cider's own context-menu row list + queue/table rows).
const ROWS = ".ri-list-item, .library-song-item, .local-song-item, .queue-item, .mediaitem-card, .ri-shelf-item, .brick-item-container, .hero-card";
// Rows where double-click plays (RichAlbumGridTrack); everything else is activated with click.
const SONG_ROWS = ".ri-list-item, .library-song-item, .local-song-item";

const HINT_KEYS = "asdfghjkl";
const CLICKABLE = `a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"]), ${ROWS}`;

const GO = {
  h: "/am/home",
  s: "/am/library/songs",
  a: "/am/library/albums",
  r: "/am/library/artists",
  n: "/am/library/recently-added",
  l: "/am/listen-now",
  b: "/am/browse",
};

const NAMES = { home: GO.h, songs: GO.s, albums: GO.a, artists: GO.r, recent: GO.n, listen: GO.l, browse: GO.b };

const HELP = `j/k  scroll line        d/u  half page         gg/G  top/bottom
J/K  next/prev row     ^d/^u  ±10 rows       f  link hints (type label, Esc cancels)
Enter  play/open row   H/L  history back/fwd   gt/gT  next/prev tab
h/l  seek ∓5s          p  play/pause           n/N  next/prev track
+/-  volume ±5%        s  shuffle   r  repeat  *  favorite
/  search              Esc  leave field        ?  this help
g + h home  s songs  a albums  r artists  n recent  l listen now  b browse
Counts work: 5j  30l  3+
:  command line  vol 40 · seek 1:30 / +10 · go songs · search <q>
               play pause next prev shuffle repeat`;

const am = () => window.__PLUGINSYS__?.Stores?.appleMusicStore;
const pod = () => window.CiderApp?.PodRouter?.();

let count = "";
let pending = ""; // "g" after the first g
let sel = null;
let note = ""; // one-shot HUD message (command errors), cleared on the next key
let hints = null; // { layer, items: [{ el, tag, label }], typed } while hint mode is open
let hud;

const typing = (el) =>
  el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

function rows() {
  return [...document.querySelectorAll(ROWS)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function select(list, i) {
  if (!list.length) return;
  sel?.classList.remove("cvim-sel");
  sel = list[Math.max(0, Math.min(list.length - 1, i))];
  sel.classList.add("cvim-sel");
  sel.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function move(delta) {
  const list = rows();
  const cur = list.indexOf(sel);
  // Nothing selected: j counts from just above the first row, k from just below the last.
  select(list, cur < 0 ? (delta > 0 ? delta - 1 : list.length + delta) : cur + delta);
}

function activate(el = sel) {
  if (!el?.isConnected) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus();
  else if (el.matches(SONG_ROWS)) el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  else el.click();
}

// Cider scrolls an inner container, not the page: find the one under the selection or viewport centre.
function scroller() {
  let el = sel?.isConnected ? sel : document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (; el; el = el.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return document.scrollingElement;
}

const scroll = (px) => scroller().scrollBy({ top: px });
const scrollTo = (top) => scroller().scrollTo({ top });
const half = () => scroller().clientHeight / 2;

const inView = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
};

function label(i, len) {
  let s = "";
  for (let j = 0; j < len; j++, i = Math.floor(i / HINT_KEYS.length)) s = HINT_KEYS[i % HINT_KEYS.length] + s;
  return s;
}

function showHints() {
  const els = [...document.querySelectorAll(CLICKABLE)].filter(inView);
  if (!els.length) return;
  let len = 1;
  while (HINT_KEYS.length ** len < els.length) len++;
  const layer = document.createElement("div");
  const items = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const tag = document.createElement("span");
    tag.className = "cvim-hint";
    tag.textContent = label(i, len);
    tag.style.left = `${Math.max(0, r.left)}px`;
    tag.style.top = `${Math.max(0, r.top)}px`;
    layer.appendChild(tag);
    return { el, tag, label: tag.textContent };
  });
  document.body.appendChild(layer);
  hints = { layer, items, typed: "" };
}

function closeHints() {
  hints?.layer.remove();
  hints = null;
}

function hintKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  stop(e);
  const k = e.key.toLowerCase();
  if (k === "escape") closeHints();
  else {
    if (k === "backspace") hints.typed = hints.typed.slice(0, -1);
    else if (HINT_KEYS.includes(k) && hints.items.some((i) => i.label.startsWith(hints.typed + k))) hints.typed += k;
    const left = hints.items.filter((i) => i.label.startsWith(hints.typed));
    hints.items.forEach((i) => (i.tag.hidden = !left.includes(i)));
    if (left.length === 1 && left[0].label === hints.typed) {
      const { el } = left[0];
      closeHints();
      activate(el);
    }
  }
  render();
}

function render() {
  const insert = typing(document.activeElement);
  hud.textContent = note ? note : hints ? `HINT ${hints.typed}`.trim() : insert ? "-- INSERT --" : `NORMAL ${count}${pending}`.trim();
  hud.dataset.mode = insert ? "insert" : "normal";
}

function onKey(e) {
  note = "";
  if (hints) return hintKey(e);
  if (e.ctrlKey || e.metaKey || e.altKey) {
    // Ctrl-d / Ctrl-u are the only modified keys we own.
    if (e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target) && (e.code === "KeyD" || e.code === "KeyU")) {
      stop(e);
      move(e.code === "KeyD" ? 10 : -10);
    }
    return;
  }
  if (e.key === "Escape" && typing(e.target)) {
    e.target.blur();
    stop(e);
    return render();
  }
  if (typing(e.target) || e.isComposing) return;

  const k = e.key;
  const n = Math.max(1, parseInt(count, 10) || 1);
  const was = pending;
  pending = "";
  const handled = run(k, n, was);
  if (!/^\d$/.test(k) && !pending) count = ""; // digits and a fresh g prefix keep the count alive
  if (handled) stop(e);
  render();
}

const stop = (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
};

function run(k, n, was) {
  const store = am();
  if (/^[1-9]$/.test(k) || (k === "0" && count)) return ((count += k), true);
  if (was === "g") {
    if (k === "g") return (scrollTo(0), true);
    if (k === "t") return (pod()?.activateNextTab(), true);
    if (k === "T") return (pod()?.activatePreviousTab(), true);
    if (GO[k]) return (pod()?.openInCurrentTab(GO[k]), true);
    return false;
  }
  switch (k) {
    case "g": return ((pending = "g"), true);
    case "j": return (scroll(60 * n), true);
    case "k": return (scroll(-60 * n), true);
    case "G": return (scrollTo(scroller().scrollHeight), true);
    case "Enter": return (activate(), true);
    case "f": return (showHints(), true);
    case "d": return (scroll(half() * n), true);
    case "u": return (scroll(-half() * n), true);
    case "J": return (move(n), true);
    case "K": return (move(-n), true);
    case "H": return (pod()?.goBack(), true);
    case "L": return (pod()?.goForward(), true);
    case "h": return (store?.seekTo(Math.max(0, store.currentTime - 5 * n)), true);
    case "l": return (store?.seekTo(store.currentTime + 5 * n), true);
    case "p": return (store?.playpause(), true);
    case "n": return (store?.skipToNext(), true);
    case "N": return (store?.skipToPrevious(), true);
    case "s": return (store?.toggleQueueShuffle(), true);
    case "r": return (store?.toggleRepeatMode(), true);
    case "+": case "=": return (store && (store.volume = Math.min(1, store.volume + 0.05 * n)), true);
    case "-": return (store && (store.volume = Math.max(0, store.volume - 0.05 * n)), true);
    case "*": // reuse Cider's own Ctrl+Shift+L favorite handler
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", ctrlKey: true, shiftKey: true }));
      return true;
    case ":": return (openCmd(), true);
    case "?": return (toggleHelp(), true);
  }
  return false; // unknown keys fall through to Cider (type-ahead, Space, "/" search)
}

const time = (a, now) => { // "90", "1:30", "+10", "-10"
  const sec = a.replace(/^[+-]/, "").split(":").reduce((t, p) => t * 60 + Number(p), 0);
  return /^[+-]/.test(a) ? now + (a[0] === "-" ? -sec : sec) : sec;
};

const CMDS = {
  vol: (a, s) => {
    const v = Number(a);
    if (a === "" || !(v >= 0 && v <= 100)) throw Error("usage: vol 0-100");
    s.volume = v / 100;
  },
  seek: (a, s) => {
    const t = a === "" ? NaN : time(a, s.currentTime);
    if (!Number.isFinite(t)) throw Error("usage: seek 90 | 1:30 | +10");
    s.seekTo(Math.max(0, t));
  },
  go: (a) => {
    if (!NAMES[a]) throw Error(`usage: go ${Object.keys(NAMES).join("|")}`);
    pod().openInCurrentTab(NAMES[a]);
  },
  search: (a) => pod().openInCurrentTab(`/am/search/${encodeURIComponent(a)}`),
  play: (_, s) => s.play(),
  pause: (_, s) => s.pause(),
  next: (_, s) => s.skipToNext(),
  prev: (_, s) => s.skipToPrevious(),
  shuffle: (_, s) => s.toggleQueueShuffle(),
  repeat: (_, s) => s.toggleRepeatMode(),
};

function exec(line) {
  const [name, ...rest] = line.replace(/^:/, "").trim().split(/\s+/);
  if (!name) return;
  try {
    if (!CMDS[name]) throw Error(`unknown command: ${name}`);
    CMDS[name](rest.join(" "), am());
  } catch (err) {
    note = err.message;
  }
}

// While the input is focused typing() is true, so every other binding stands down (INSERT mode).
function openCmd() {
  const input = document.createElement("input");
  input.className = "cvim-cmd";
  input.value = ":";
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const line = input.value;
    input.blur();
    exec(line);
    render();
  });
  input.addEventListener("blur", () => input.remove());
  document.body.appendChild(input);
  input.focus();
}

let help;
function toggleHelp() {
  if (help) return (help.remove(), (help = null));
  help = document.createElement("pre");
  help.className = "cvim-help";
  help.textContent = HELP;
  document.body.appendChild(help);
}

const CSS = `
.cvim-sel { outline: 2px solid var(--keyColor, #8f8); outline-offset: -2px; border-radius: 6px; }
.cvim-hud, .cvim-help { position: fixed; z-index: 99999; font: 12px/1.4 ui-monospace, monospace; background: #000c; color: #fff; padding: 4px 10px; border-radius: 6px; pointer-events: none; }
.cvim-hint { position: fixed; z-index: 99998; font: 700 11px/1 ui-monospace, monospace; text-transform: uppercase; background: #ffd54a; color: #000; padding: 2px 4px; border-radius: 3px; pointer-events: none; }
.cvim-cmd { position: fixed; z-index: 100000; left: 12px; bottom: 12px; width: 360px; font: 12px/1.4 ui-monospace, monospace; background: #000; color: #fff; border: 1px solid #8f8; border-radius: 6px; padding: 4px 10px; outline: none; }
.cvim-hud { left: 12px; bottom: 12px; }
.cvim-hud[data-mode=insert] { color: #8f8; }
.cvim-help { left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 14px 18px; white-space: pre; }`;

const plugin = {
  ce_prefix: "cider-vim",
  identifier: IDENTIFIER,
  name: "Cider Vim",
  description: "Vim-style keyboard navigation and playback control. Press ? for the cheat sheet.",
  version: "0.1.0",
  author: "sx",
  pluginKitVersion: 4,
  entry: { "plugin.js": { type: "main" } },

  setup() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    hud = document.createElement("div");
    hud.className = "cvim-hud";
    document.body.appendChild(hud);
    // Capture phase on window: we run before Cider's own bubble-phase keydown handler.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", render);
    document.addEventListener("focusout", () => setTimeout(render));
    render();
  },
};

export default plugin;
