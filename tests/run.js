import assert from "node:assert";
import fs from "node:fs";
import { distanceOf, newerOf } from "../wrap.js";
import { step, close } from "../wraprun.js";
import { render } from "../app.js";

const fresh = () => ({ last: -1, judge: [], ledger: [], applied: [] });
const base = {
  budget: 2, span: 100,
  state: fresh(),
  events: [
    { id: 1, kind: "set", seq: 95 },
    { id: 2, kind: "set", seq: 5 },
    { id: 3, kind: "judge", a: 5, b: 95 },
    { id: 4, kind: "judge", a: 95, b: 5 },
    { id: 5, kind: "set", seq: 40 }
  ],
  bad_seq_code: "E_BAD_SEQ", too_old_code: "E_TOO_OLD",
  ambiguous_code: "E_AMBIGUOUS", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("distanceOf wraps around the span", () => {
  assert.strictEqual(distanceOf(5, 95, 100), 10);
  assert.strictEqual(distanceOf(95, 5, 100), 90);
  assert.strictEqual(distanceOf(0, 0, 100), 0);
});

check("newerOf returns 1 / 0 / -1", () => {
  assert.strictEqual(newerOf(5, 95, 100), 1);
  assert.strictEqual(newerOf(95, 5, 100), 0);
  assert.strictEqual(newerOf(5, 5, 100), 0);
  assert.strictEqual(newerOf(0, 50, 100), -1);
});

check("step spends budget and parks the rest on the ledger", () => {
  const r = step(base);
  assert.strictEqual(r.served, 2);
  assert.strictEqual(r.state.last, 5);
  assert.strictEqual(r.ledger_before, 3);
  assert.deepStrictEqual(r.ledger, [
    ["judge", null, 5, 95],
    ["judge", null, 95, 5],
    ["set", 40, null, null]
  ]);
});

check("close drains the ledger with catchup count", () => {
  const r = step(base);
  const c = close(Object.assign({}, base, { state: r.state }));
  assert.strictEqual(c.catchup, 3);
  assert.strictEqual(c.state.ledger.length, 0);
  assert.strictEqual(c.state.last, 40);
  assert.deepStrictEqual(c.state.judge, [[5, 95, 1], [95, 5, 0]]);
  const replay = step(Object.assign({}, base, { state: c.state }));
  assert.strictEqual(replay.served, 0);
});

check("invalid events raise the right codes and render keeps its shape", () => {
  const expectCode = (spec, code) => {
    try { step(spec); throw new Error("expected " + code); }
    catch (e) { assert.strictEqual(e.code, code); }
  };
  expectCode(Object.assign({}, base, { budget: 1, state: fresh(),
    events: [{ id: 1, kind: "set", seq: 100 }] }), "E_BAD_SEQ");
  expectCode(Object.assign({}, base, { budget: 1, state: fresh(),
    events: [{ id: 1, kind: "judge", a: 0, b: 50 }] }), "E_AMBIGUOUS");
  expectCode(Object.assign({}, base, { budget: 1, state: fresh(),
    events: [{ id: 1, kind: "peek", seq: 1 }] }), "E_BAD_EVENT");
  const state2 = { last: 95, judge: [], ledger: [], applied: [] };
  expectCode(Object.assign({}, base, { budget: 1, state: state2,
    events: [{ id: 1, kind: "set", seq: 95 }] }), "E_TOO_OLD");
  const view = render(JSON.parse(fs.readFileSync(new URL("../sample/seqs.json", import.meta.url), "utf8")));
  assert.strictEqual(view.last, 40);
  assert.strictEqual(view.span, 100);
  assert.strictEqual(view.full_diff, 0);
  assert.deepStrictEqual(view.judge, [[5, 95, 1], [95, 5, 0]]);
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
