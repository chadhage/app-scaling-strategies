'use strict';

// The preset journal: hash-chained, self-checked JSON Lines over the same io objects as the step journal (file or
// memory). Every line carries the SHA-256 of the previous line (a gap, a reordering or an edit breaks the chain) and a
// check of its own content (so even an edit of the LAST line, which no later line can vouch for, is detected). A torn
// final line is discarded, truncated AND reported (never silently); a damaged earlier line fails closed.
const contract = require('./contract.js');
const validate = require('./validate.js');
const presets = require('./preset.cjs');
const { GENESIS, JournalError, sha256 } = require('../C042/journal.cjs');

const MAX_BYTES = 1024 * 1024;
const SHAPES = Object.freeze({
  begin: ['seq', 'prev', 'type', 'key', 'presetSha256', 'preset', 'h'],
  start: ['seq', 'prev', 'type', 'key', 'index', 'h'],
  step: ['seq', 'prev', 'type', 'key', 'index', 'status', 'code', 'applied', 'byThis', 'reservedAfter', 'h'],
  resume: ['seq', 'prev', 'type', 'key', 'h'],
  cancel: ['seq', 'prev', 'type', 'key', 'elapsedMs', 'h'],
  end: ['seq', 'prev', 'type', 'key', 'state', 'elapsedMs', 'bound', 'h'],
});
const END_STATES = Object.freeze(['completed', 'stopped', 'bounded']);
const bad = (why) => { throw new JournalError('JOURNAL_CORRUPT', why); };
const selfCheck = (fields) => sha256(JSON.stringify(fields)).slice(0, 32);
const WINDOWS_DEVICES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const DATA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

// A user-supplied directory name: Windows device names, trailing dots and spaces create folders plain tools cannot delete.
const dataNameProblem = (name) => (typeof name === 'string' && DATA_NAME.test(name) && !WINDOWS_DEVICES.test(name) && !/[. ]$/.test(name) ? null : 'DATA_NAME_REJECTED');

const facts = (run, record) => {
  const spec = run.preset.steps[record.index - 1];
  return {
    index: record.index, key: spec.idempotencyKey, leaseId: spec.leaseId, units: spec.units, status: record.status, code: record.code,
    applied: record.applied, appliedByThisRequest: record.byThis, reservedAfter: record.reservedAfter,
  };
};

// The grammar of a run: begin, then start/step pairs (an acknowledgement per start), resumes, and at most one terminal record.
function createLedger() {
  const runs = new Map();
  function begin(record) {
    const parsed = presets.parsePreset(record.preset);
    if (runs.has(record.key)) bad('A key began twice.');
    if (!parsed.ok || parsed.sha256 !== record.presetSha256 || JSON.stringify(parsed.preset) !== JSON.stringify(record.preset) || parsed.preset.idempotencyKey !== record.key) {
      bad('A begin record does not match its preset.');
    }
    runs.set(record.key, { key: record.key, preset: parsed.preset, sha256: parsed.sha256, trail: [], acks: [], pending: null, done: 0, attempts: 1, terminal: null });
  }
  function apply(record) {
    if (record.type === 'begin') begin(record);
    const run = runs.get(record.key);
    if (!run) bad('A record names a run that never began.');
    if (record.type !== 'begin') {
      if (run.terminal) bad('A record follows a terminal record.');
      const count = run.preset.steps.length;
      if (record.type === 'start') {
        if (run.pending !== null || record.index !== run.done + 1 || record.index > count) bad('A start record is out of order.');
        run.pending = record.index;
      } else if (record.type === 'step') {
        const entry = facts(run, record);
        if (run.pending !== record.index || !validate.stepFactsOk(entry, record.index - 1, run.preset.steps[record.index - 1], 'run', false)) bad('A step acknowledgement is out of order or invalid.');
        run.pending = null;
        run.acks[record.index - 1] = entry;
        if (contract.SUCCESS_STATUSES.includes(record.status)) run.done += 1;
      } else if (record.type === 'resume') {
        run.pending = null;
        run.attempts += 1;
      } else {
        terminal(run, record);
      }
    }
    run.trail.push({ seq: record.seq, type: record.type });
  }
  function terminal(run, record) {
    if (run.pending !== null || !Number.isSafeInteger(record.elapsedMs) || record.elapsedMs < 0) bad('A terminal record is invalid or follows an unacknowledged start.');
    const { maxDurationMs } = run.preset.bounds;
    if (record.type === 'cancel') {
      run.terminal = { state: 'cancelled', elapsedMs: record.elapsedMs, bound: null };
      return;
    }
    const last = run.acks[run.done];
    const consistent = {
      completed: run.done === run.preset.steps.length && record.elapsedMs <= maxDurationMs && record.bound === null,
      stopped: last !== undefined && last.status === 'failed' && record.bound === null,
      bounded: validate.same(record.bound, { name: 'maxDurationMs', limit: maxDurationMs, observed: record.elapsedMs }) && record.elapsedMs > maxDurationMs,
    };
    if (!END_STATES.includes(record.state) || consistent[record.state] !== true) bad('An end record contradicts the acknowledged steps.');
    run.terminal = { state: record.state, elapsedMs: record.elapsedMs, bound: record.bound };
  }
  return { runs, apply };
}

function recordProblem(record, expectedSeq, previous) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'not an object';
  const keys = Object.hasOwn(SHAPES, record.type) ? SHAPES[record.type] : null;
  if (!keys || Object.keys(record).length !== keys.length || !keys.every((name) => Object.hasOwn(record, name))) return 'unexpected shape';
  const { h, ...content } = record;
  if (h !== selfCheck(content)) return 'content check failed';
  if (record.seq !== expectedSeq) return 'sequence gap';
  if (record.prev !== previous) return 'broken hash chain';
  return typeof record.key === 'string' && contract.c42.KEY_PATTERN.test(record.key) ? null : 'invalid key';
}

function replay(io) {
  const text = io.read();
  if (text.length > MAX_BYTES) throw new JournalError('JOURNAL_CORRUPT', 'The journal exceeds its size bound.');
  const lines = text.split('\n');
  const tail = lines.pop();
  const ledger = createLedger();
  const records = [];
  let previous = GENESIS;
  let validBytes = 0;
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new JournalError('JOURNAL_CORRUPT', `Line ${records.length + 1} is not JSON.`);
    }
    const problem = recordProblem(record, records.length + 1, previous);
    if (problem) throw new JournalError('JOURNAL_CORRUPT', `Line ${records.length + 1}: ${problem}.`);
    ledger.apply(record);
    records.push(record);
    previous = sha256(line);
    validBytes += Buffer.byteLength(line) + 1;
  }
  return { records, previous, validBytes, tornTailBytes: Buffer.byteLength(tail), ledger };
}

function openRunLog(io) {
  let state;
  try {
    state = replay(io);
    if (state.tornTailBytes > 0) io.truncate(state.validBytes);
  } catch (error) {
    if (error instanceof JournalError) throw error;
    throw new JournalError('JOURNAL_UNAVAILABLE', 'The journal could not be read.');
  }
  const { ledger, records } = state;
  let previous = state.previous;
  let bytes = state.validBytes;
  let broken = false;
  return {
    records,
    runs: ledger.runs,
    // Every discarded byte is reported: a torn write and a damaged final newline look the same and are never silent.
    discardedTailBytes: state.tornTailBytes,
    get bytes() { return bytes; },
    get broken() { return broken; },
    append(fields) {
      if (broken) throw new JournalError('JOURNAL_UNCERTAIN', 'An earlier write was not confirmed; reopen the journal first.');
      const record = { seq: records.length + 1, prev: previous, ...fields };
      ledger.apply(record);
      const h = selfCheck(record);
      const line = JSON.stringify({ ...record, h });
      try {
        io.append(`${line}\n`);
      } catch {
        broken = true;
        throw new JournalError('JOURNAL_UNCERTAIN', 'The write could not be confirmed.');
      }
      previous = sha256(line);
      bytes += Buffer.byteLength(line) + 1;
      records.push({ ...record, h });
      return record;
    },
  };
}

module.exports = Object.freeze({ SHAPES, JournalError, openRunLog, dataNameProblem, selfCheck });
