// wraprun.js：按处理预算处理并留账，收尾扫账
import { newerOf } from "./wrap.js";

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cloneState(state) {
  return {
    last: state.last,
    judge: state.judge.map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: state.ledger.map(function (row) { return row.slice(); }),
    applied: state.applied.map(function (row) { return row.slice(); })
  };
}

function tokenOf(event) {
  if (event.kind === "set") return ["set", event.seq, null, null];
  return ["judge", null, event.a, event.b];
}

function isIntegerLike(value) {
  return typeof value === "number" && Number.isInteger(value);
}

// 先校验结构，再校验序号范围；越界事件即使排在预算之后也照样报。
function validateEvents(events, span) {
  for (const event of events) {
    if (!event || typeof event !== "object" || typeof event.kind !== "string") {
      throw makeError("E_BAD_EVENT", "事件缺少 kind");
    }
    if (event.kind === "set") {
      if (!isIntegerLike(event.seq)) {
        throw makeError("E_BAD_EVENT", "set 事件缺少整数序号");
      }
    } else if (event.kind === "judge") {
      if (!isIntegerLike(event.a) || !isIntegerLike(event.b)) {
        throw makeError("E_BAD_EVENT", "judge 事件缺少整数序号");
      }
    } else {
      throw makeError("E_BAD_EVENT", "不支持的事件类型");
    }
  }
  for (const event of events) {
    const values = event.kind === "set" ? [event.seq] : [event.a, event.b];
    for (const value of values) {
      if (value < 0 || value >= span) {
        throw makeError("E_BAD_SEQ", "序号不在跨度内");
      }
    }
  }
}

function applyRow(state, row) {
  if (row[0] === "set") {
    const seq = row[1];
    if (state.last !== -1) {
      const newer = newerOf(seq, state.last, state.span);
      if (newer === -1) {
        throw makeError("E_TOO_OLD", "序号与上次正好差半圈");
      }
      if (newer !== 1) {
        throw makeError("E_TOO_OLD", "序号不比上次新");
      }
    }
    state.last = seq;
  } else {
    const newer = newerOf(row[2], row[3], state.span);
    if (newer === -1) {
      throw makeError("E_AMBIGUOUS", "两个序号正好差半个循环");
    }
    state.judge.push([row[2], row[3], newer]);
  }
  state.applied.push(row.slice());
}

function run(spec, unlimited) {
  const span = spec.span;
  const state = cloneState(spec.state);
  state.span = span;
  const events = spec.events || [];

  validateEvents(events, span);

  const seen = Object.create(null);
  for (const row of state.applied) seen[row.join("|")] = true;

  // 队列：先压账的旧账（FIFO），再排本轮新事件；已处理过的令牌直接跳过。
  const queue = state.ledger
    .map(function (row) { return { row: row.slice(), fresh: false }; })
    .concat(events.map(function (event) {
      return { row: tokenOf(event), fresh: true };
    }));

  state.ledger = [];
  let budget = unlimited ? Infinity : spec.budget;
  let served = 0;
  let judged = 0;

  for (const item of queue) {
    const key = item.row.join("|");
    if (seen[key]) continue;
    if (budget <= 0) {
      state.ledger.push(item.row);
      continue;
    }
    applyRow(state, item.row);
    seen[key] = true;
    budget -= 1;
    served += 1;
    judged += 1;
  }

  const ledger = state.ledger.map(function (row) { return row.slice(); });
  delete state.span;
  return {
    state: state,
    served: served,
    ledger_before: ledger.length,
    ledger: ledger,
    judged: judged,
    judged_bound: queue.length
  };
}

export function step(spec) {
  return run(spec, false);
}

export function close(spec) {
  const result = run(Object.assign({}, spec, { budget: Infinity }), true);
  return { state: result.state, catchup: result.served };
}
