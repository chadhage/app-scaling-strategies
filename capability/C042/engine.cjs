'use strict';

// The step conductor. One synchronous state machine over a hash-chained journal: a step is admitted (begin), then
// ends in exactly one of committed (the single effect), cancelled, or interrupted/uncertain (no terminal record).
// Success is reported only after the commit line is journaled; a failed write is unknown, never success.
const contract = require('./contract.js');
const { digestInput } = require('./input.cjs');
const { JournalError, openJournal } = require('./journal.cjs');
const result = require('./result.cjs');

const { LEASES, LIMITS } = contract;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const immediate = async () => {};
const REPORT_CODES = { committed: null, cancelled: 'STEP_CANCELLED', interrupted: 'STEP_INTERRUPTED', 'in-flight': 'STEP_IN_FLIGHT', uncertain: 'JOURNAL_UNCERTAIN' };

// The fictional work of the step: wait for the given milliseconds, or until the step is cancelled.
function delayExecutor(milliseconds) {
  return ({ signal }) => new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

class Engine {
  #io;
  #executor;
  #journal = null;
  #steps = new Map();
  #halted = false;
  #degraded = false;

  constructor(io, executor) {
    this.#io = io;
    this.#executor = executor;
  }

  // Replays the journal into memory. Work that began without a terminal record is interrupted, never resumed.
  load() {
    const journal = openJournal(this.#io);
    const steps = new Map();
    const committed = {};
    const corrupt = (why) => { throw new JournalError('JOURNAL_CORRUPT', why); };
    for (const record of journal.records) {
      const step = steps.get(record.key);
      if (record.type === 'begin') {
        if (step) corrupt('A key began twice.');
        steps.set(record.key, {
          key: record.key, input: Object.freeze({ ...record.input }), inputSha256: record.inputSha256, state: 'interrupted',
          trail: [{ seq: record.seq, type: 'begin' }], commit: null, attempts: 1, controller: null, done: null,
        });
        continue;
      }
      if (!step || step.state !== 'interrupted') corrupt('A record follows a finished or missing step.');
      step.trail.push({ seq: record.seq, type: record.type });
      if (record.type === 'resume') step.attempts += 1;
      if (record.type === 'cancel') step.state = 'cancelled';
      if (record.type === 'commit') {
        const { leaseId, units } = step.input;
        committed[leaseId] = (committed[leaseId] ?? 0) + units;
        if (record.leaseId !== leaseId || record.units !== units || record.reservedAfter !== committed[leaseId]) corrupt('A commit does not match its step or the ledger.');
        step.state = 'committed';
        step.commit = { leaseId, units, reservedAfter: record.reservedAfter };
      }
    }
    this.#journal = journal;
    this.#steps = steps;
    this.#degraded = false;
  }

  get tornTailBytes() { return this.#journal.tornTailBytes; }

  // Stops all work without writing anything, as a crash would: unfinished steps stay unfinished in the journal.
  halt() {
    this.#halted = true;
    for (const step of this.#steps.values()) step.controller?.abort();
  }

  leases() {
    const total = (leaseId, state) => [...this.#steps.values()]
      .filter((step) => step.state === state && step.input.leaseId === leaseId)
      .reduce((sum, step) => sum + step.input.units, 0);
    return Object.fromEntries(Object.entries(LEASES).map(([leaseId, capacity]) => {
      const committed = total(leaseId, 'committed');
      const held = total(leaseId, 'in-flight');
      return [leaseId, { capacity, committed, held, available: capacity - committed - held }];
    }));
  }

  snapshot() {
    return { schemaVersion: 1, kind: 'C042-lease-snapshot', leases: this.leases(), journalRecords: this.#journal.records.length, scope: contract.SCOPE };
  }

  #blocked() {
    if (this.#halted) return 'JOURNAL_UNAVAILABLE';
    if (!this.#degraded) return null;
    try {
      this.load();
      return null;
    } catch {
      return 'JOURNAL_UNAVAILABLE';
    }
  }

  // After a write that could not be confirmed nothing in memory is trusted: the next request re-reads the journal.
  #degrade() {
    this.#degraded = true;
    for (const step of this.#steps.values()) if (step.state === 'in-flight') this.#finish(step, 'uncertain');
  }

  #finish(step, state) {
    const { controller, done } = step;
    step.state = state;
    step.controller = null;
    step.done = null;
    controller?.abort();
    done?.resolve();
  }

  #commit(step) {
    const { leaseId, units } = step.input;
    const reservedAfter = [...this.#steps.values()]
      .filter((other) => other.state === 'committed' && other.input.leaseId === leaseId)
      .reduce((sum, other) => sum + other.input.units, units);
    try {
      const record = this.#journal.append({ type: 'commit', key: step.key, leaseId, units, reservedAfter });
      step.trail.push({ seq: record.seq, type: 'commit' });
    } catch {
      this.#degrade();
      return;
    }
    step.commit = { leaseId, units, reservedAfter };
    this.#finish(step, 'committed');
  }

  async #drive(step) {
    const controller = new AbortController();
    step.controller = controller;
    step.done = deferred();
    const stopped = new Promise((resolve) => controller.signal.addEventListener('abort', () => resolve('aborted'), { once: true }));
    const finished = Promise.resolve()
      .then(() => this.#executor({ key: step.key, input: step.input, signal: controller.signal }))
      .then(() => 'done', () => 'failed');
    const ended = await Promise.race([finished, stopped]);
    if (this.#halted || step.state !== 'in-flight') return;
    if (ended === 'failed') this.#finish(step, 'interrupted');
    else this.#commit(step);
  }

  #report(step, action, { replayed = false, started = false, input = null } = {}) {
    return result.build({
      action, accepted: step.state === 'committed' || action === 'inspect', replayed,
      byThis: started && step.state === 'committed', step, input, errorCode: REPORT_CODES[step.state],
    });
  }

  async submit(input) {
    const key = input.idempotencyKey;
    const blocked = this.#blocked();
    if (blocked) return result.build({ action: 'submit', errorCode: blocked, input });
    const sha = digestInput(input);
    const known = this.#steps.get(key);
    if (known) {
      if (known.inputSha256 !== sha) return result.build({ action: 'submit', errorCode: 'IDEMPOTENCY_KEY_CONFLICT', step: known, input });
      if (known.state === 'in-flight') await known.done.promise;
      return this.#report(known, 'submit', { replayed: true, input });
    }
    if (this.#steps.size >= LIMITS.steps) return result.build({ action: 'submit', errorCode: 'STEP_LIMIT_REACHED', input });
    const lease = this.leases()[input.leaseId];
    if (input.units > lease.available) return result.build({ action: 'submit', errorCode: 'CAPACITY_EXHAUSTED', input });
    let step;
    try {
      const record = this.#journal.append({ type: 'begin', key, inputSha256: sha, input });
      step = { key, input, inputSha256: sha, state: 'in-flight', trail: [{ seq: record.seq, type: 'begin' }], commit: null, attempts: 1, controller: null, done: null };
    } catch {
      this.#degrade();
      return result.build({ action: 'submit', errorCode: 'JOURNAL_UNCERTAIN', input });
    }
    this.#steps.set(key, step);
    await this.#drive(step);
    return this.#report(step, 'submit', { started: true, input });
  }

  #lookup(action, key) {
    const blocked = this.#blocked();
    if (blocked) return { response: result.build({ action, errorCode: blocked, key }) };
    const step = this.#steps.get(key);
    if (!step) return { response: result.build({ action, errorCode: 'STEP_NOT_FOUND', key }) };
    return { step };
  }

  inspect(key) {
    const { step, response } = this.#lookup('inspect', key);
    return response ?? this.#report(step, 'inspect');
  }

  cancel(key) {
    const { step, response } = this.#lookup('cancel', key);
    if (response) return response;
    if (!['in-flight', 'interrupted'].includes(step.state)) return result.build({ action: 'cancel', errorCode: 'ACTION_NOT_ALLOWED', step });
    try {
      step.trail.push({ seq: this.#journal.append({ type: 'cancel', key }).seq, type: 'cancel' });
    } catch {
      this.#degrade();
      return result.build({ action: 'cancel', errorCode: 'JOURNAL_UNCERTAIN', step });
    }
    this.#finish(step, 'cancelled');
    return result.build({ action: 'cancel', accepted: true, step, errorCode: 'STEP_CANCELLED' });
  }

  async resume(key) {
    const { step, response } = this.#lookup('resume', key);
    if (response) return response;
    if (step.state !== 'interrupted') return result.build({ action: 'resume', errorCode: 'ACTION_NOT_ALLOWED', step });
    const lease = this.leases()[step.input.leaseId];
    if (step.input.units > lease.available) return result.build({ action: 'resume', errorCode: 'CAPACITY_EXHAUSTED', step });
    try {
      step.trail.push({ seq: this.#journal.append({ type: 'resume', key }).seq, type: 'resume' });
    } catch {
      this.#degrade();
      return result.build({ action: 'resume', errorCode: 'JOURNAL_UNCERTAIN', step });
    }
    step.attempts += 1;
    step.state = 'in-flight';
    await this.#drive(step);
    return this.#report(step, 'resume', { started: true });
  }

  // Any other action name is a typed refusal; nothing is executed, journaled or invented.
  unsupportedAction(key) {
    const blocked = this.#blocked();
    return result.build({ action: 'none', errorCode: blocked ?? 'UNSUPPORTED_ACTION', step: blocked ? null : this.#steps.get(key) ?? null, key });
  }
}

async function openEngine({ io, executor = immediate } = {}) {
  if (!io || typeof io.read !== 'function' || typeof io.append !== 'function' || typeof io.truncate !== 'function') {
    throw new TypeError('An io object with read, append and truncate is required.');
  }
  const engine = new Engine(io, executor);
  engine.load();
  return engine;
}

module.exports = Object.freeze({ openEngine, delayExecutor });
