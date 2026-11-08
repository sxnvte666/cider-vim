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

// [section, [[keys, description]]]: keys split on spaces into keycaps, except ":commands".
const HELP = [
  ["Scroll", [["j k", "line down / up"], ["d u", "half page"], ["gg G", "top / bottom"]]],
  ["Rows & hints", [["J K", "select next / prev"], ["^d ^u", "select ±10"], ["Enter", "play / open"], ["f", "link hints"]]],
  ["Playback", [["p", "play / pause"], ["n N", "next / prev track"], ["h l", "seek ∓5s"], ["+ -", "volume ±5%"], ["s r", "shuffle / repeat"], ["*", "favorite"]]],
  ["Go", [["H L", "history back / fwd"], ["gt gT", "next / prev tab"], ["g h/s/a/r/n/l/b", "home songs albums artists recent listen browse"], ["/", "search"]]],
  ["Commands", [[":vol 40", "set volume"], [":seek 1:30", "or +10 / -10"], [":go songs", "open a page"], [":search q", "search"], [":play", "pause next prev shuffle repeat"]]],
];

const am = () => window.__PLUGINSYS__?.Stores?.appleMusicStore;
const pod = () => window.CiderApp?.PodRouter?.();
// The volume slider binds to musicKitStore.normalizedVolume; its watcher also applies the volume curve and persists it.
const mkStore = () => {
  const s = window.CiderApp?.musicKitStore;
  return typeof s === "function" ? s() : s;
};

const make = (tag, className = "", textContent = "") =>
  Object.assign(document.createElement(tag), { className, textContent });

let count = "";
let pending = ""; // "g" after the first g
let sel = null;
let note = null; // { id, text, err, bar }: transient HUD message, expires on its own
let noteId = 0;
let noteTimer;
let hints = null; // { layer, items: [{ el, tag, hit, rest, label }], typed } while hint mode is open
let help = null;
let hud;
let shown = ""; // signature of what the HUD last displayed, so it only reappears when something changes
let fade;

const typing = (el) =>
  el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

function say(text, { err = false, bar } = {}) {
  note = { id: ++noteId, text, err, bar };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => (note = null), err ? 3000 : 1500);
}

function setVol(v) {
  const s = mkStore();
  if (!s) return say("volume control unavailable", { err: true });
  s.normalizedVolume = Math.min(1, Math.max(0, v));
  say(`Volume ${Math.round(s.normalizedVolume * 100)}%`, { bar: s.normalizedVolume });
}

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
  const layer = make("div");
  const items = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const tag = make("span", "cvim-hint");
    const hit = make("b");
    const rest = make("span", "", label(i, len));
    tag.append(hit, rest);
    tag.style.left = `${Math.max(0, r.left)}px`;
    tag.style.top = `${Math.max(0, r.top)}px`;
    layer.appendChild(tag);
    return { el, tag, hit, rest, label: rest.textContent };
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
    hints.items.forEach((i) => {
      i.tag.hidden = !left.includes(i);
      i.hit.textContent = hints.typed; // typed prefix is dimmed, the rest is what's still to type
      i.rest.textContent = i.label.slice(hints.typed.length);
    });
    if (left.length === 1 && left[0].label === hints.typed) {
      const { el } = left[0];
      closeHints();
      activate(el);
    }
  }
  render();
}

function view() {
  const keys = `${count}${pending}`;
  if (hints) return { mode: "hint", chip: "HINT", text: hints.typed };
  if (keys) return { mode: "normal", chip: "NORMAL", text: keys };
  if (note) return { mode: note.err ? "err" : "info", chip: note.err ? "ERROR" : "INFO", text: note.text, bar: note.bar, id: note.id };
  if (typing(document.activeElement)) return { mode: "insert", chip: "INSERT", text: "" };
  return { mode: "normal", chip: "NORMAL", text: "" };
}

// The HUD pops in when the mode or its text changes, then fades out; staying in a mode keeps it hidden.
function render() {
  const v = view();
  const sig = JSON.stringify(v);
  if (sig === shown) return;
  shown = sig;
  hud.dataset.mode = v.mode;
  hud.replaceChildren(make("span", "cvim-chip", v.chip));
  if (v.text) hud.append(make("span", "cvim-txt", v.text));
  if (v.bar !== undefined) {
    const track = make("div", "cvim-bar");
    const fill = make("i");
    fill.style.width = `${Math.round(v.bar * 100)}%`;
    track.append(fill);
    hud.append(track);
  }
  hud.classList.add("on");
  clearTimeout(fade);
  fade = setTimeout(() => {
    hud.classList.remove("on");
    shown = JSON.stringify(view()); // whatever is current by now counts as already seen
  }, v.mode === "err" ? 3000 : 1800);
}

function onKey(e) {
  if (hints) return hintKey(e);
  if (e.key === "Escape" && help) {
    closeHelp();
    return stop(e);
  }
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
    case "+": case "=": return (setVol((mkStore()?.normalizedVolume ?? 0) + 0.05 * n), true);
    case "-": return (setVol((mkStore()?.normalizedVolume ?? 0) - 0.05 * n), true);
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
  vol: (a) => {
    const v = Number(a);
    if (a === "" || !(v >= 0 && v <= 100)) throw Error("usage: vol 0-100");
    setVol(v / 100);
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
    say(err.message, { err: true });
  }
}

// While the input is focused typing() is true, so every other binding stands down (INSERT mode).
function openCmd() {
  const bar = make("div", "cvim-cmd");
  const input = make("input");
  input.spellcheck = false;
  input.placeholder = "vol 40 · seek 1:30 · go songs · search …";
  bar.append(make("span", "cvim-prompt", ":"), input);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const line = input.value;
    input.blur();
    exec(line);
    render();
  });
  input.addEventListener("blur", () => bar.remove());
  document.body.appendChild(bar);
  input.focus();
}

function closeHelp() {
  help?.remove();
  help = null;
}

function toggleHelp() {
  if (help) return closeHelp();
  help = make("div", "cvim-help");
  const grid = make("div", "cvim-grid");
  for (const [title, items] of HELP) {
    const sec = make("section");
    sec.append(make("h4", "", title));
    for (const [keys, desc] of items) {
      const caps = keys.startsWith(":") ? [keys] : keys.split(" ");
      const row = make("div", "cvim-row");
      const k = make("span", "cvim-keys");
      k.append(...caps.map((c) => make("kbd", "", c)));
      row.append(k, make("span", "", desc));
      sec.append(row);
    }
    grid.append(sec);
  }
  help.append(make("h3", "", "Cider Vim"), grid, make("p", "cvim-foot", "Counts work (5j, 30l).  Esc or ? closes."));
  document.body.appendChild(help);
}

const CSS = `
.cvim-hud, .cvim-help, .cvim-cmd, .cvim-hint { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.cvim-hud, .cvim-help, .cvim-cmd {
  color: #f3eef6; background: rgba(22,18,28,.78); border: 1px solid rgba(255,255,255,.11);
  -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5);
  box-shadow: 0 10px 34px rgba(0,0,0,.45);
}

/* selection ring on the row J/K landed on */
.cvim-sel { outline: 2px solid #ff5a6e !important; outline-offset: -2px; border-radius: 10px;
  box-shadow: 0 0 0 4px rgba(255,90,110,.18), 0 8px 26px rgba(255,90,110,.2) !important; }

/* mode HUD: pops in on a mode change, fades out on its own */
.cvim-hud { --c: #ff5a6e; position: fixed; left: 18px; bottom: 18px; z-index: 99999; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 9px;
  max-width: 300px; padding: 6px 14px 6px 6px; border-radius: 18px; font-size: 12.5px; pointer-events: none;
  opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .18s ease; }
.cvim-hud.on { opacity: 1; transform: none; }
.cvim-hud[data-mode=insert] { --c: #7ee787; }
.cvim-hud[data-mode=hint] { --c: #ffcf5c; }
.cvim-hud[data-mode=info] { --c: #6cb6ff; }
.cvim-hud[data-mode=err] { --c: #ff4d4d; }
.cvim-chip { font: 800 10px/1 ui-monospace, "SF Mono", monospace; letter-spacing: .1em; padding: 5px 9px; border-radius: 999px; color: #15111b; background: var(--c); }
.cvim-txt { font: 600 13px ui-monospace, "SF Mono", monospace; }
.cvim-bar { flex-basis: 100%; height: 4px; margin: 3px 0 4px 3px; border-radius: 4px; background: rgba(255,255,255,.14); overflow: hidden; }
.cvim-bar i { display: block; height: 100%; border-radius: 4px; background: var(--c); }

/* link hints */
.cvim-hint { position: fixed; z-index: 99998; display: inline-flex; transform: translate(-2px, -2px); padding: 3px 5px; border-radius: 5px;
  font: 800 11px/1 ui-monospace, "SF Mono", monospace; letter-spacing: .05em; text-transform: uppercase; color: #2b1d00;
  background: linear-gradient(#ffe38f, #ffc83d); border: 1px solid #b88600; box-shadow: 0 2px 7px rgba(0,0,0,.5); pointer-events: none; }
.cvim-hint[hidden] { display: none; }
.cvim-hint b { color: rgba(43,29,0,.32); font-weight: 800; }

/* command line */
.cvim-cmd { position: fixed; z-index: 100000; left: 50%; bottom: 30px; transform: translateX(-50%); width: min(560px, calc(100vw - 36px));
  display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(255,90,110,.4); animation: cvim-pop .14s ease-out; }
.cvim-prompt { color: #ff5a6e; font: 800 17px/1 ui-monospace, "SF Mono", monospace; }
.cvim-cmd input { flex: 1; min-width: 0; height: auto; margin: 0; padding: 0; background: none; border: 0; outline: 0; box-shadow: none;
  color: #f3eef6; caret-color: #ff5a6e; font: 500 15px ui-monospace, "SF Mono", monospace; }
.cvim-cmd input::placeholder { color: rgba(243,238,246,.34); }
@keyframes cvim-pop { from { opacity: 0; transform: translateX(-50%) translateY(10px); } }

/* cheat sheet */
.cvim-help { position: fixed; z-index: 99999; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(780px, calc(100vw - 36px));
  max-height: calc(100vh - 60px); overflow: hidden; padding: 22px 26px 16px; border-radius: 20px; font-size: 13px; pointer-events: none;
  box-shadow: 0 26px 90px rgba(0,0,0,.6); animation: cvim-fade .16s ease-out; }
.cvim-help h3 { margin: 0 0 16px; font-size: 17px; font-weight: 800; letter-spacing: -.01em; background: linear-gradient(90deg, #ff7a7e, #ff3b55); -webkit-background-clip: text; background-clip: text; color: transparent; }
.cvim-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 18px 30px; }
.cvim-help h4 { margin: 0 0 8px; font-size: 10.5px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; color: #ff5a6e; }
.cvim-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
.cvim-keys { display: flex; flex: 0 0 auto; gap: 4px; min-width: 92px; }
.cvim-row > span:last-child { color: rgba(243,238,246,.72); }
.cvim-help kbd { padding: 2px 6px; border-radius: 6px; font: 700 11.5px ui-monospace, "SF Mono", monospace; color: #fff;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); border-bottom-width: 2px; }
.cvim-foot { margin: 16px 0 0; font-size: 11.5px; color: rgba(243,238,246,.45); }
@keyframes cvim-fade { from { opacity: 0; } }`;

const plugin = {
  ce_prefix: "cider-vim",
  identifier: IDENTIFIER,
  name: "Cider Vim",
  description: "Vim-style keyboard navigation and playback control. Press ? for the cheat sheet.",
  version: "0.2.0",
  author: "sx",
  pluginKitVersion: 4,
  entry: { "plugin.js": { type: "main" } },

  setup() {
    const style = make("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    hud = make("div", "cvim-hud");
    document.body.appendChild(hud);
    // Capture phase on window: we run before Cider's own bubble-phase keydown handler.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", render);
    document.addEventListener("focusout", () => setTimeout(render));
    render();
  },
};

export default plugin;
