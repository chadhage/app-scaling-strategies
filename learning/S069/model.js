(function (scope) {
  'use strict';
  const MAX_HISTORY = 6;
  const FIXTURE = Object.freeze({
    oldWriter: 'writer-old', oldEpoch: 41, newWriter: 'writer-new', newEpoch: 42,
  });
  const OPTIONS = Object.freeze({
    authority: Object.freeze(['confirmed', 'bypassed', 'unavailable']),
    retention: Object.freeze(['complete', 'missing-effect']),
  });
  const ORIGINAL = [
    { id: 'SYN-691', payload: 10, writer: FIXTURE.oldWriter, epoch: FIXTURE.oldEpoch },
    { id: 'SYN-692', payload: 20, writer: FIXTURE.oldWriter, epoch: FIXTURE.oldEpoch },
  ];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(ORIGINAL);
  function noArgs(args) {
    if (args.length !== 0) throw new Error('This action accepts no arguments.');
  }
  function configuration(value) {
    if (!value || typeof value !== 'object'
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error('Configuration must be a plain object with exact enum properties.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes('authority') || !keys.includes('retention')) {
      throw new Error('Configuration requires exactly two own properties: authority and retention.');
    }
    const result = {};
    for (const key of ['authority', 'retention']) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property.enumerable || !Object.hasOwn(property, 'value')) {
        throw new Error('Configuration properties must be enumerable data properties, never accessors.');
      }
      if (typeof property.value !== 'string' || !OPTIONS[key].includes(property.value)) {
        throw new Error(`Configuration ${key} requires an exact primitive enum value.`);
      }
      result[key] = property.value;
    }
    return result;
  }
  function empty(attempt) {
    return {
      attempt, phase: 'idle', config: null, authority: null,
      originalAcknowledged: [], writes: [], ledger: [], trace: [],
      replayResult: null, assertions: [], verdict: 'NOT_EVALUATED',
      metrics: null, prediction: null,
    };
  }
  function createLesson() {
    noArgs(arguments);
    let state = empty(1);
    let history = [];
    function snapshot() {
      noArgs(arguments);
      return freeze(clone({ ...state, history }));
    }
    function phase(expected) {
      if (state.phase !== expected) throw new Error(`Action requires phase ${expected}; current phase is ${state.phase}.`);
    }
    function trace(event, detail) {
      state.trace.push({ step: state.trace.length + 1, event, detail });
    }
    function write(id, writer, epoch, payload, kind) {
      let status;
      let reason;
      if (state.config.authority === 'unavailable') {
        status = kind === 'replacement' ? 'held' : 'unknown';
        reason = kind === 'replacement'
          ? 'Replacement admission held: no authoritative fence receipt.'
          : 'Authority observation unavailable; not evidence of rejection or zero effects.';
      } else {
        const authorized = state.authority.grants.some((grant) => grant.writer === writer && grant.epoch === epoch);
        status = authorized ? 'accepted' : 'rejected';
        reason = authorized ? 'Presented writer/epoch pair has an active synthetic grant.'
          : 'Writer/epoch pair is not authorized.';
      }
      const row = { id, writer, epoch, payload, kind, status, reason };
      state.writes.push(row);
      if (status === 'accepted') state.ledger.push({ id, payload, writer, epoch });
      trace(kind === 'replacement' ? 'replacement-write' : 'competing-write', `${id}: ${writer}@${epoch} — ${status}. ${reason}`);
    }
    function begin(config) {
      if (arguments.length !== 1) throw new Error('Begin requires exactly one configuration argument.');
      phase('idle');
      if (history.length >= MAX_HISTORY) throw new Error('Retained proof capacity is six attempts; reset explicitly to clear it.');
      const validated = configuration(config);
      state.config = validated;
      state.phase = 'begun';
      state.authority = {
        owner: FIXTURE.oldWriter, epoch: FIXTURE.oldEpoch, highWaterEpoch: FIXTURE.oldEpoch,
        receipt: 'initial', grants: [{ writer: FIXTURE.oldWriter, epoch: FIXTURE.oldEpoch }],
      };
      state.originalAcknowledged = clone(ORIGINAL);
      state.ledger = clone(ORIGINAL);
      state.writes = ORIGINAL.map((row) => ({
        ...row, kind: 'baseline', status: 'accepted', reason: 'Acknowledged before transfer.',
      }));
      trace('begin-acknowledged', 'Two fixed effects were acknowledged at writer-old@41 before handoff.');
      return snapshot();
    }
    function transfer() {
      noArgs(arguments);
      phase('begun');
      const mode = state.config.authority;
      if (mode === 'confirmed') {
        // This receipt is an assumed atomic authority fixture, not a distributed fencing implementation.
        state.authority = {
          owner: FIXTURE.newWriter, epoch: FIXTURE.newEpoch, highWaterEpoch: FIXTURE.newEpoch,
          receipt: 'confirmed', grants: [{ writer: FIXTURE.newWriter, epoch: FIXTURE.newEpoch }],
        };
        trace('fence-confirmed', 'Confirmed synthetic receipt revokes writer-old@41 before granting writer-new@42.');
      } else if (mode === 'bypassed') {
        state.authority = {
          owner: FIXTURE.newWriter, epoch: FIXTURE.newEpoch, highWaterEpoch: FIXTURE.newEpoch,
          receipt: 'bypassed', grants: [
            { writer: FIXTURE.oldWriter, epoch: FIXTURE.oldEpoch },
            { writer: FIXTURE.newWriter, epoch: FIXTURE.newEpoch },
          ],
        };
        trace('fence-bypassed', 'Deliberately broken fixture grants the replacement without revoking the old writer.');
      } else {
        state.authority = {
          owner: null, epoch: null, highWaterEpoch: FIXTURE.oldEpoch,
          receipt: 'unavailable', grants: null,
        };
        trace('fence-unavailable', 'No authoritative handoff receipt: actual authority is unknown; hold replacement admission.');
      }
      if (state.config.retention === 'missing-effect') {
        state.ledger = state.ledger.filter((row) => row.id !== 'SYN-692');
        trace('retention-fault', 'Synthetic readback omits acknowledged SYN-692; the original acknowledgement remains in evidence.');
      } else {
        trace('retention-readback', 'Synthetic readback retains both original IDs and their exact payloads.');
      }
      state.phase = 'transferred';
      return snapshot();
    }
    function probe() {
      noArgs(arguments);
      phase('transferred');
      write('SYN-693', FIXTURE.newWriter, FIXTURE.newEpoch, 30, 'replacement');
      write('SYN-694', FIXTURE.oldWriter, FIXTURE.oldEpoch, 40, 'old-delayed');
      write('SYN-695', FIXTURE.newWriter, FIXTURE.oldEpoch, 50, 'wrong-epoch');
      state.phase = 'probed';
      return snapshot();
    }
    function replay() {
      noArgs(arguments);
      phase('probed');
      if (state.config.authority === 'confirmed') {
        state.replayResult = 'rejected';
        trace('stale-grant-rejected', 'Replayed writer-old@41 grant cannot replace the confirmed writer-new@42 authority.');
      } else if (state.config.authority === 'bypassed') {
        state.replayResult = 'regained';
        state.authority.owner = FIXTURE.oldWriter;
        state.authority.epoch = FIXTURE.oldEpoch;
        trace('stale-grant-regained', 'Broken fixture lets writer-old@41 regain authority; observed epoch regresses below high-water 42.');
      } else {
        state.replayResult = 'unknown';
        trace('stale-grant-unknown', 'No authority receipt exists to establish whether a stale grant is rejected.');
      }
      write('SYN-696', FIXTURE.oldWriter, FIXTURE.oldEpoch, 60, 'stale-replay');
      state.phase = 'replayed';
      return snapshot();
    }
    function verify() {
      noArgs(arguments);
      phase('replayed');
      const authorityUnknown = state.authority.receipt === 'unavailable';
      const replacement = state.writes.find((row) => row.kind === 'replacement');
      const newGrantOnly = state.authority.grants?.length === 1
        && state.authority.grants[0].writer === FIXTURE.newWriter
        && state.authority.grants[0].epoch === FIXTURE.newEpoch;
      const acceptedNewWrites = state.writes.filter((row) => row.kind !== 'baseline' && row.status === 'accepted');
      const exclusive = newGrantOnly && replacement.status === 'accepted'
        && acceptedNewWrites.every((row) => row.writer === FIXTURE.newWriter && row.epoch === FIXTURE.newEpoch);
      const fenceIndex = state.trace.findIndex((row) => row.event === 'fence-confirmed');
      const replacementIndex = state.trace.findIndex((row) => row.event === 'replacement-write');
      const fenceFirst = exclusive && fenceIndex >= 0 && replacementIndex > fenceIndex;
      const oldRejected = state.writes.filter((row) => row.kind === 'old-delayed' || row.kind === 'stale-replay')
        .every((row) => row.status === 'rejected');
      const noRegain = oldRejected && state.replayResult === 'rejected'
        && state.authority.owner === FIXTURE.newWriter && state.authority.epoch === FIXTURE.newEpoch
        && state.authority.highWaterEpoch === FIXTURE.newEpoch;
      const measuredAuthority = (condition) => authorityUnknown ? 'UNKNOWN' : condition ? 'PASS' : 'FAIL';
      const missingIds = ORIGINAL.filter((original) => {
        const copies = state.ledger.filter((row) => row.id === original.id);
        return copies.length !== 1 || JSON.stringify(copies[0]) !== JSON.stringify(original);
      }).map((row) => row.id);
      state.assertions = [
        { id: 'fence-first', label: 'Old authority fenced before replacement admission', result: measuredAuthority(fenceFirst) },
        { id: 'exclusive-epoch', label: 'Only the current exact writer/epoch pair accepts new effects', result: measuredAuthority(exclusive) },
        { id: 'no-regain', label: 'Delayed writes and stale-grant replay cannot regain old authority', result: measuredAuthority(noRegain) },
        { id: 'retention', label: 'Both originally acknowledged effects retained exactly once and unchanged', result: missingIds.length ? 'FAIL' : 'PASS' },
      ];
      const count = (status) => state.writes.filter((row) => row.status === status).length;
      state.metrics = {
        accepted: count('accepted'), rejected: count('rejected'), held: count('held'),
        unknown: count('unknown'), attempted: state.writes.length,
        retained: ORIGINAL.length - missingIds.length, acknowledged: ORIGINAL.length, missingIds,
        knownEffects: state.ledger.length,
        replacement: replacement.status,
      };
      state.verdict = state.assertions.some((row) => row.result === 'FAIL') ? 'FAIL'
        : state.assertions.some((row) => row.result === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
      trace('verification', `${state.verdict}: ${state.metrics.retained}/2 original acknowledgements retained. Unknown observations are not successful writes or proven rejections.`);
      state.phase = 'complete';
      history.push(clone(state));
      return snapshot();
    }
    function predict(expected) {
      if (arguments.length !== 1) throw new Error('Prediction requires exactly one argument.');
      phase('complete');
      if (state.prediction) throw new Error('Learning prediction is checked only once per attempt.');
      if (typeof expected !== 'string' || !['PASS', 'FAIL', 'UNKNOWN'].includes(expected)) {
        throw new Error('Prediction requires the exact PASS, FAIL or UNKNOWN value.');
      }
      state.prediction = { expected, actual: state.verdict, correct: expected === state.verdict };
      history[history.length - 1] = clone(state);
      return snapshot();
    }
    function next() {
      noArgs(arguments);
      phase('complete');
      if (history.length >= MAX_HISTORY) throw new Error('Retained proof capacity is six attempts; reset explicitly to clear it.');
      state = empty(history.length + 1);
      return snapshot();
    }
    function reset() {
      noArgs(arguments);
      state = empty(1);
      history = [];
      return snapshot();
    }
    return {
      snapshot, begin, transfer, probe, replay, verify, predict, next, reset,
    };
  }
  const api = Object.freeze({ MAX_HISTORY, FIXTURE, OPTIONS, createLesson });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.S069 = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
