// wraprun.js：按处理预算处理并留账，收尾把账做完
import { newerOf } from "./wrap.js";

const E_BAD_EVENT = "E_BAD_EVENT";
const E_BAD_SEQ = "E_BAD_SEQ";
const E_TOO_OLD = "E_TOO_OLD";
const E_AMBIGUOUS = "E_AMBIGUOUS";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isInt(x) {
  return typeof x === "number" && Number.isInteger(x);
}

function inSpan(x, span) {
  return isInt(x) && x >= 0 && x < span;
}

function cloneState(state) {
  const src = state || {};
  return {
    last: src.last === undefined ? -1 : src.last,
    judge: (src.judge || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: (src.ledger || []).map(function (row) {
      const next = [row[0], row[1], row[2], row[3]];
      if (row.id !== undefined) Object.defineProperty(next, "id", { value: row.id, enumerable: false });
      return next;
    }),
    applied: (src.applied || []).slice()
  };
}

function eventKey(ev) {
  if (ev.kind === "set") return "set:" + ev.seq;
  return "judge:" + ev.a + ":" + ev.b;
}

// 账条固定四元组；id 以不可枚举属性带着走，用于跨轮去重。
function toRow(ev) {
  const row = ev.kind === "set"
    ? ["set", ev.seq, null, null]
    : ["judge", null, ev.a, ev.b];
  if (ev.id !== undefined) Object.defineProperty(row, "id", { value: ev.id, enumerable: false });
  return row;
}

function fromRow(row) {
  if (row[0] === "set") return { id: row.id, kind: "set", seq: row[1] };
  return { id: row.id, kind: "judge", a: row[2], b: row[3] };
}

// 结构与取值范围都先校验，再按预算逐个处理；非法事件照常花预算。
function run(spec, unbounded) {
  const span = spec.span;
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let remaining = unbounded ? Infinity : (isInt(spec.budget) && spec.budget > 0 ? spec.budget : 0);

  const work = state.ledger.slice();
  state.ledger = [];
  events.forEach(function (ev) {
    if (ev.id !== undefined && state.applied.indexOf(ev.id) !== -1) return;
    work.push(toRow(ev));
  });

  let served = 0;
  let judged = 0;

  work.forEach(function (row) {
    if (remaining <= 0) {
      state.ledger.push(row);
      return;
    }
    remaining -= 1;
    served += 1;

    const ev = fromRow(row);
    if (ev.kind !== "set" && ev.kind !== "judge") fail(E_BAD_EVENT);
    if (ev.kind === "set") {
      if (!isInt(ev.seq)) fail(E_BAD_EVENT);
      if (!inSpan(ev.seq, span)) fail(E_BAD_SEQ);
      if (state.last !== -1 && newerOf(ev.seq, state.last, span) !== 1) fail(E_TOO_OLD);
      state.last = ev.seq;
    } else {
      if (!isInt(ev.a) || !isInt(ev.b)) fail(E_BAD_EVENT);
      if (!inSpan(ev.a, span) || !inSpan(ev.b, span)) fail(E_BAD_SEQ);
      const verdict = newerOf(ev.a, ev.b, span);
      if (verdict === -1) fail(E_AMBIGUOUS);
      state.judge.push([ev.a, ev.b, verdict]);
      judged += 1;
    }
    if (ev.id !== undefined) state.applied.push(ev.id);
  });

  return {
    state: state,
    served: served,
    judged: judged,
    ledger_before: state.ledger.length
  };
}

export function step(spec) {
  const out = run(spec, false);
  return {
    state: out.state,
    served: out.served,
    ledger_before: out.ledger_before,
    ledger: out.state.ledger.map(function (row) { return [row[0], row[1], row[2], row[3]]; }),
    judged: out.judged,
    judged_bound: out.served
  };
}

export function close(spec) {
  const out = run(Object.assign({}, spec, { events: [] }), true);
  return { state: out.state, catchup: out.served };
}
