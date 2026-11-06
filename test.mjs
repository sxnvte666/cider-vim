// Smoke test: node test.mjs. Stubs the DOM + Cider store; checks counts, chords and fall-through.
import assert from "node:assert/strict";
const calls = [];
const store = { currentTime: 30, volume: 0.5, skipToNext: () => calls.push(["next"]), seekTo: (t) => calls.push(["seek", t]), playpause: () => calls.push(["pp"]) };
const rowEl = (i) => ({ i, classList: { add() {}, remove() {} }, scrollIntoView() {}, getBoundingClientRect: () => ({ width: 1, height: 1, top: 1, left: 1, bottom: 2, right: 2 }), isConnected: true, matches: () => false, click: () => calls.push(["click", i]) });
const list = [0, 1, 2, 3, 4, 5, 6, 7].map(rowEl);
let handlers;
globalThis.window = { __PLUGINSYS__: { Stores: { appleMusicStore: store } }, CiderApp: { PodRouter: () => ({ openInCurrentTab: (p) => calls.push(["go", p]), activateNextTab: () => calls.push(["tab+"]) }) }, addEventListener: (_, f) => (handlers = f), dispatchEvent() {}, innerWidth: 1000, innerHeight: 800 };
globalThis.getComputedStyle = () => ({ overflowY: "visible" });
globalThis.document = { activeElement: null, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, querySelectorAll: () => list, createElement: () => (globalThis.last = { classList: {}, dataset: {}, style: {}, appendChild() {}, remove() {}, focus() {}, blur() {}, addEventListener(ev, f) { this[ev] = f; } }), elementFromPoint: () => null, scrollingElement: { clientHeight: 800, scrollHeight: 5000, scrollBy: (o) => calls.push(["scroll", o.top]), scrollTo: (o) => calls.push(["top", o.top]) } };
globalThis.KeyboardEvent = class {};
globalThis.MouseEvent = class {};
const mod = await import("./plugin.js");
mod.default.setup();
const press = (key, extra = {}) => { let swallowed = false; handlers({ key, target: {}, preventDefault() { swallowed = true; }, stopImmediatePropagation() {}, ...extra }); return swallowed; };

press("3"); press("J");
press("Enter");
assert.deepEqual(calls.pop(), ["click", 2]); // 3j from nothing -> third row
press("g"); press("g"); assert.deepEqual(calls.pop(), ["top", 0]);   // gg scrolls to top
press("G"); assert.deepEqual(calls.pop(), ["top", 5000]);            // G scrolls to bottom
press("K"); press("Enter"); assert.deepEqual(calls.pop(), ["click", 1]); // K moves selection up one (was row 2)
press("2"); press("0"); press("l");
assert.deepEqual(calls.pop(), ["seek", 130]); // 20 * 5s
press("J"); press("l");
assert.deepEqual(calls.pop(), ["seek", 35]);   // count did not leak past one command
press("g"); press("s");
assert.deepEqual(calls.pop(), ["go", "/am/library/songs"]);
assert.equal(press(" "), false);               // Space/unknown keys fall through to Cider
assert.equal(press("/"), false);
assert.equal(press("p"), true); calls.pop();
assert.equal(press("j", { ctrlKey: true }), false);
assert.equal(press("j", { target: { tagName: "INPUT" } }), false);
press("j"); assert.deepEqual(calls.pop(), ["scroll", 60]);
press("3"); press("k"); assert.deepEqual(calls.pop(), ["scroll", -180]);
press("d"); assert.deepEqual(calls.pop(), ["scroll", 400]);

assert.equal(press("f"), true);                // hint mode: 8 clickables -> single-letter labels a s d f g h j k
assert.equal(press("z"), true);                // swallowed, not a hint key
assert.equal(calls.length, 0);
press("d"); assert.deepEqual(calls.pop(), ["click", 2]);  // third label -> third element
assert.equal(press("p"), true); assert.deepEqual(calls.pop(), ["pp"]); // hint mode closed again
press("f"); press("Escape"); assert.equal(calls.length, 0);
assert.equal(press("p"), true); calls.pop();
const cmd = (line) => { press(":"); last.value = line; last.keydown({ key: "Enter" }); };
cmd(":vol 40"); assert.equal(store.volume, 0.4);
cmd(":seek 1:30"); assert.deepEqual(calls.pop(), ["seek", 90]);
cmd(":seek +10"); assert.deepEqual(calls.pop(), ["seek", 40]);
cmd(":seek -100"); assert.deepEqual(calls.pop(), ["seek", 0]);  // clamped at start
cmd(":go songs"); assert.deepEqual(calls.pop(), ["go", "/am/library/songs"]);
cmd(":search daft punk"); assert.deepEqual(calls.pop(), ["go", "/am/search/daft%20punk"]);
cmd(":next"); assert.deepEqual(calls.pop(), ["next"]);
cmd(":vol 400"); assert.equal(store.volume, 0.4);                   // rejected, unchanged
cmd(":bogus"); assert.equal(calls.length, 0);
console.log("ok");
