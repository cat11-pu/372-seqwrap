import assert from "node:assert";
import { distanceOf, newerOf } from "../wrap.js";
import { step, close } from "../wraprun.js";
import { render } from "../app.js";

const base = {
  budget: 1, span: 100,
  state: { last: -1, judge: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "set", seq: 95 }],
  bad_seq_code: "E_BAD_SEQ", too_old_code: "E_TOO_OLD",
  ambiguous_code: "E_AMBIGUOUS", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("distanceOf returns a number", () => {
  assert.strictEqual(typeof distanceOf(5, 95, 100), "number");
});

check("newerOf returns a number", () => {
  assert.strictEqual(typeof newerOf(5, 95, 100), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
