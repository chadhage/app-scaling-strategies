(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C044Cursor', { value: factory() });
}(globalThis, function () {
  'use strict';

  // Server-owned event ids carry run, epoch and sequence: "synthetic-run-001:3:42". The same module builds the typed
  // failures (C019 shape: closed code -> group, fixed reason, closed list of allowed recovery actions) and checks them in the page.
  const ID = /^(synthetic-run-\d{3}):([1-9]\d{0,5}):([1-9]\d{0,8})$/;
  const RUN_ID = /^synthetic-run-\d{3}$/;

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const actions = freeze({
    reinspect: {
      label: 'Reinspect read-only',
      description: 'Read the run snapshot without opening a stream. Nothing is repaired, reset or replayed.',
    },
    'resync-from-snapshot': {
      label: 'Resync from snapshot',
      description: 'Explicitly discard the cursor and open a fresh stream from the oldest retained event. Events you already applied are dropped as duplicates; a range the server no longer retains is named as a gap, never invented.',
    },
    'confirm-operator-review': {
      label: 'Confirm operator review is needed',
      description: 'Acknowledge that this cursor does not belong to the run or its history. No automatic recovery is offered and no review is claimed.',
    },
    stop: {
      label: 'Stop reconnecting',
      description: 'Stop opening streams. Recorded events, counters and failures stay.',
    },
  });
  const reasons = freeze({
    input: 'The cursor is not a canonical event id of the form run:epoch:sequence. It was neither echoed nor interpreted.',
    attributionRun: 'The cursor is attributed to another run. No stream of this run was opened and no cursor was substituted.',
    attributionEpoch: 'The cursor is attributed to another epoch of this run. Events of different epochs are never mixed.',
    future: 'The cursor points beyond the head of the run. An acknowledged event never disappears, so this run did not produce the cursor.',
    stale: 'The cursor is older than the bounded replay window. The events after it are no longer retained for resumption.',
    capacity: 'The bounded number of concurrent streams is in use. No stream was opened.',
    request: 'The request is outside the closed read-only loopback contract. Nothing was served.',
    unavailable: 'The local fixture is unavailable. No successful observation was made.',
    unrecognized: 'The failure is not a recognized C044 typed code. Message and details were not retained. Operator review is needed.',
  });
  const entries = [
    ['CURSOR_MALFORMED', 'input', 400, reasons.input, ['resync-from-snapshot', 'reinspect', 'stop']],
    ['CURSOR_RUN_MISMATCH', 'attribution', 409, reasons.attributionRun, ['confirm-operator-review', 'reinspect', 'stop']],
    ['CURSOR_EPOCH_MISMATCH', 'attribution', 409, reasons.attributionEpoch, ['resync-from-snapshot', 'reinspect', 'stop']],
    ['CURSOR_FROM_FUTURE', 'integrity', 409, reasons.future, ['confirm-operator-review', 'reinspect', 'stop']],
    ['CURSOR_EXPIRED', 'stale', 410, reasons.stale, ['resync-from-snapshot', 'reinspect', 'stop']],
    ['STREAM_CAPACITY', 'capacity', 503, reasons.capacity, ['reinspect', 'stop']],
    ['LOCAL_HOST_REQUIRED', 'request', 421, reasons.request, ['reinspect', 'stop']],
    ['CROSS_ORIGIN_DENIED', 'request', 403, reasons.request, ['reinspect', 'stop']],
    ['METHOD_NOT_ALLOWED', 'request', 405, reasons.request, ['reinspect', 'stop']],
    ['UNEXPECTED_BODY', 'request', 400, reasons.request, ['reinspect', 'stop']],
    ['URL_TOO_LONG', 'request', 414, reasons.request, ['reinspect', 'stop']],
    ['INVALID_URL', 'request', 400, reasons.request, ['reinspect', 'stop']],
    ['INVALID_QUERY', 'request', 400, reasons.request, ['reinspect', 'stop']],
    ['NOT_FOUND', 'request', 404, reasons.request, ['reinspect', 'stop']],
    ['SERVER_UNAVAILABLE', 'unavailable', 500, reasons.unavailable, ['reinspect', 'stop']],
  ];
  const map = {};
  for (const [code, group, status, reason, allowed] of entries) map[code] = { group, status, reason, actions: allowed };
  map.UNRECOGNIZED_ERROR = { group: 'unknown', status: 0, reason: reasons.unrecognized, actions: ['confirm-operator-review', 'stop'] };
  freeze(map);
  const codes = Object.freeze(Object.keys(map).filter((code) => code !== 'UNRECOGNIZED_ERROR'));

  const isCount = (value) => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

  function format(runId, epoch, seq) {
    if (typeof runId !== 'string' || !RUN_ID.test(runId) || !Number.isSafeInteger(epoch) || !Number.isSafeInteger(seq)) {
      throw new TypeError('A canonical run id, epoch and sequence are required.');
    }
    const id = `${runId}:${epoch}:${seq}`;
    if (!ID.test(id)) throw new TypeError('The cursor fields are outside the canonical range.');
    return id;
  }

  function parse(text) {
    const match = typeof text === 'string' ? ID.exec(text) : null;
    if (!match) return { ok: false };
    const epoch = Number(match[2]);
    const seq = Number(match[3]);
    return { ok: true, cursor: Object.freeze({ runId: match[1], epoch, seq }) };
  }

  function cursorContext(value) {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'string' ? parse(value) : { ok: true, cursor: value };
    return parsed.ok ? { runId: parsed.cursor.runId, epoch: parsed.cursor.epoch, seq: parsed.cursor.seq } : null;
  }

  function normalizeContext(view, cursor = null) {
    const source = view && typeof view === 'object' ? view : {};
    const integer = (value) => (isCount(value) ? value : null);
    return {
      runId: typeof source.runId === 'string' && RUN_ID.test(source.runId) ? source.runId : null,
      epoch: integer(source.epoch),
      headSeq: integer(source.headSeq),
      firstRetainedSeq: integer(source.firstRetainedSeq),
      replayWindow: integer(source.replayWindow),
      cursor: cursorContext(cursor),
    };
  }

  function failure(code, view, cursor) {
    const entry = Object.hasOwn(map, code) ? map[code] : map.UNRECOGNIZED_ERROR;
    const known = Object.hasOwn(map, code) ? code : 'UNRECOGNIZED_ERROR';
    return freeze({
      schemaVersion: 1,
      ok: false,
      error: { code: known, group: entry.group, message: entry.reason },
      status: entry.status,
      context: normalizeContext(view, cursor),
      allowedActions: entry.actions.map((name) => ({ action: name, label: actions[name].label, description: actions[name].description })),
      businessData: 'synthetic',
      localOnly: true,
    });
  }

  function record(value, keys) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const names = Reflect.ownKeys(descriptors);
      if (names.length !== keys.length || names.some((key) => typeof key !== 'string' || !keys.includes(key)
        || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) return null;
      return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
    } catch {
      return null;
    }
  }

  function canonicalCursor(value) {
    try {
      return parse(format(value.runId, value.epoch, value.seq)).cursor;
    } catch {
      return null;
    }
  }

  // The page never trusts a failure body: it must match the closed shape and the fixed table exactly, else it is unrecognized.
  function inspectFailure(value) {
    const outer = record(value, ['schemaVersion', 'ok', 'error', 'status', 'context', 'allowedActions', 'businessData', 'localOnly']);
    const error = outer && record(outer.error, ['code', 'group', 'message']);
    const context = outer && record(outer.context, ['runId', 'epoch', 'headSeq', 'firstRetainedSeq', 'replayWindow', 'cursor']);
    const known = error && typeof error.code === 'string' && codes.includes(error.code);
    if (!outer || outer.schemaVersion !== 1 || outer.ok !== false || !error || !context || !known) return failure('UNRECOGNIZED_ERROR');
    const entry = map[error.code];
    const given = Array.isArray(outer.allowedActions) ? outer.allowedActions.map((item) => record(item, ['action', 'label', 'description'])) : null;
    const cursor = context.cursor === null ? null : record(context.cursor, ['runId', 'epoch', 'seq']);
    const echoed = cursor && canonicalCursor(cursor);
    if (outer.status !== entry.status || error.group !== entry.group || error.message !== entry.reason
      || outer.businessData !== 'synthetic' || outer.localOnly !== true || !given || given.some((item) => !item || typeof item.action !== 'string')
      || given.map((item) => item.action).join() !== entry.actions.join()
      || given.some((item) => item.label !== actions[item.action].label || item.description !== actions[item.action].description)
      || (context.cursor !== null && !echoed)) return failure('UNRECOGNIZED_ERROR');
    return failure(error.code, context, echoed);
  }

  // header wins: a browser re-sends its original URL (and its stale ?lastEventId=) on an automatic reconnect.
  function resolve(view, input) {
    const query = Array.isArray(input.query) ? input.query : [];
    if (query.length > 1) return { ok: false, failure: failure('CURSOR_MALFORMED', view) };
    let source = 'none';
    let raw;
    if (input.header !== undefined) { source = 'header'; raw = input.header; } else if (query.length === 1) { source = 'query'; raw = query[0]; }
    if (source === 'none') return { ok: true, source, afterSeq: null, cursor: null };
    const parsed = parse(raw);
    if (!parsed.ok) return { ok: false, failure: failure('CURSOR_MALFORMED', view) };
    const { cursor } = parsed;
    const refuse = (code) => ({ ok: false, failure: failure(code, view, cursor) });
    if (cursor.runId !== view.runId) return refuse('CURSOR_RUN_MISMATCH');
    if (cursor.epoch !== view.epoch) return refuse('CURSOR_EPOCH_MISMATCH');
    if (cursor.seq > view.headSeq) return refuse('CURSOR_FROM_FUTURE');
    if (cursor.seq + 1 < view.firstRetainedSeq) return refuse('CURSOR_EXPIRED');
    return { ok: true, source, afterSeq: cursor.seq, cursor };
  }

  return Object.freeze({ format, parse, failure, inspectFailure, resolve, actions, map, codes });
}));
