'use strict';

// The automatic runner. It drives a validated preset through THE SAME step functions as manual operation: the C042
// step service passed in as `engine` (submit, and for recovery inspect, resume and cancel). It owns no step logic,
// validates every preset itself before the first call, and keeps its own journal of what each run started, was told
// and finished. The clock is injected; the wall clock is never read.
const contract = require('./contract.js');
const presets = require('./preset.cjs');
const result = require('./result.cjs');
const { JournalError, openRunLog } = require('./runlog.cjs');

const { LIMITS, SUCCESS_STATUSES } = contract;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const ENGINE_METHODS = ['submit', 'inspect', 'cancel', 'resume'];

// What the preset journal records about one step, from the step service's answer (never from prose).
function factsOf({ body }, cancelRequested) {
  const code = body.error ? body.error.code : null;
  if (body.outcome === 'succeeded') {
    return { status: body.effect.appliedByThisRequest ? 'succeeded' : 'replayed', code: null, applied: true, byThis: body.effect.appliedByThisRequest, reservedAfter: body.effect.reservedAfter };
  }
  const none = { code, applied: false, byThis: false, reservedAfter: null };
  if (body.outcome === 'interrupted') return { ...none, status: 'interrupted' };
  if (body.outcome === 'cancelled') return { ...none, status: cancelRequested ? 'cancelled' : 'failed' };
  if (body.outcome === 'unknown') return { ...none, status: 'unknown', applied: null };
  return { ...none, status: 'failed' };
}

class Runner {
  #engine;
  #io;
  #clock;
  #log = null;
  #live = new Map();
  #halted = false;
  #degraded = false;

  constructor(engine, io, clock) {
    this.#engine = engine;
    this.#io = io;
    this.#clock = clock;
  }

  load() {
    this.#log = openRunLog(this.#io);
    this.#degraded = false;
  }

  halt() { this.#halted = true; }

  health() {
    return { schemaVersion: 1, kind: 'C043-journal-health', runs: this.#log.runs.size, live: this.#live.size, discardedTailBytes: this.#log.discardedTailBytes, scope: contract.SCOPE };
  }

  #tick() {
    const now = Number(this.#clock());
    return Number.isFinite(now) ? Math.floor(now) : 0;
  }

  #elapsed(live) { return Math.max(0, this.#tick() - live.startedAt); }

  // After a write that could not be confirmed nothing in memory is trusted: the next request re-reads the journal.
  #blocked() {
    if (this.#halted) return 'RUN_JOURNAL_UNAVAILABLE';
    if (!this.#degraded) return null;
    try {
      this.load();
      return null;
    } catch {
      return 'RUN_JOURNAL_UNAVAILABLE';
    }
  }

  #answer(action, run, { replayed = false, errorCode = null, applied = [] } = {}) {
    const live = this.#live.get(run.key);
    const view = result.viewOf(run, { live: Boolean(live), elapsedMs: live ? this.#elapsed(live) : 0, applied });
    const accepted = errorCode === null && (action === 'inspect' || (action === 'cancel' ? view.state === 'cancelled' : view.state === 'completed'));
    return result.build({ action, accepted, replayed, errorCode, view, preset: run.preset, sha256: run.sha256 });
  }

  // A step is submitted exactly as by hand. After a restart the step service is first asked what it already knows,
  // so an acknowledged or recorded step is never run twice. Returns the step service's answer (or the facts, when no call was needed).
  async #perform(run, index, mode) {
    const spec = run.preset.steps[index - 1];
    const stepKey = spec.idempotencyKey;
    if (mode === 'plain') return { answer: await this.#engine.submit(spec) };
    const seen = this.#engine.inspect(stepKey);
    const state = seen.body.step.state;
    if (state === 'none') return mode === 'resume' ? { answer: await this.#engine.submit(spec) } : { facts: { status: 'cancelled', code: null, applied: false, byThis: false, reservedAfter: null } };
    if (state === 'interrupted') return { answer: mode === 'resume' ? await this.#engine.resume(stepKey) : this.#engine.cancel(stepKey) };
    if (state === 'in-flight') return { answer: mode === 'resume' ? await this.#engine.submit(spec) : this.#engine.cancel(stepKey) };
    return { answer: seen };
  }

  async #advance(key, live, index, mode) {
    // After a crash the start record of the unacknowledged step is already in the journal.
    if (this.#log.runs.get(key).pending !== index) this.#log.append({ type: 'start', key, index });
    const performed = await this.#perform(this.#log.runs.get(key), index, mode);
    if (this.#halted) return null;
    const facts = performed.facts ?? factsOf(performed.answer, live.cancelRequested);
    this.#log.append({ type: 'step', key, index, ...facts });
    if (facts.byThis) live.applied.push(index);
    return facts;
  }

  #close(key, state, elapsed) {
    const { maxDurationMs } = this.#log.runs.get(key).preset.bounds;
    const bound = state === 'bounded' ? { name: 'maxDurationMs', limit: maxDurationMs, observed: elapsed } : null;
    this.#log.append({ type: 'end', key, state, elapsedMs: elapsed, bound });
  }

  // Every step succeeded: the run is completed, unless it took longer than its declared bound.
  #complete(key, live) {
    const elapsed = this.#elapsed(live);
    this.#close(key, elapsed > this.#log.runs.get(key).preset.bounds.maxDurationMs ? 'bounded' : 'completed', elapsed);
  }

  async #loop(key, live, firstMode) {
    let mode = firstMode;
    for (;;) {
      const run = this.#log.runs.get(key);
      const elapsed = this.#elapsed(live);
      if (run.done === run.preset.steps.length) return this.#complete(key, live);
      if (live.cancelRequested) return this.#log.append({ type: 'cancel', key, elapsedMs: elapsed });
      if (elapsed > run.preset.bounds.maxDurationMs) return this.#close(key, 'bounded', elapsed);
      const index = run.done + 1;
      live.current = run.preset.steps[index - 1].idempotencyKey;
      const facts = await this.#advance(key, live, index, mode);
      live.current = null;
      mode = 'plain';
      if (facts === null) return undefined;
      if (facts.status === 'failed') return this.#close(key, 'stopped', this.#elapsed(live));
      if (facts.status === 'cancelled') return this.#log.append({ type: 'cancel', key, elapsedMs: this.#elapsed(live) });
      if (!SUCCESS_STATUSES.includes(facts.status)) return undefined;
    }
  }

  async #drive(key, action, firstMode) {
    const live = { done: deferred(), cancelRequested: false, current: null, startedAt: this.#tick(), applied: [] };
    this.#live.set(key, live);
    let uncertain = false;
    try {
      await this.#loop(key, live, firstMode);
    } catch (error) {
      if (!(error instanceof JournalError) || error.code !== 'JOURNAL_UNCERTAIN') throw error;
      uncertain = true;
    } finally {
      this.#live.delete(key);
      live.done.resolve();
    }
    if (this.#halted) return result.refusal('RUN_JOURNAL_UNAVAILABLE', { action, key });
    if (uncertain) return this.#uncertain(action, key);
    return this.#answer(action, this.#log.runs.get(key), { applied: live.applied });
  }

  #uncertain(action, key) {
    this.#degraded = true;
    return result.refusal('RUN_JOURNAL_UNCERTAIN', { action, key });
  }

  #append(action, key, fields) {
    try {
      this.#log.append({ ...fields, key });
      return null;
    } catch (error) {
      if (!(error instanceof JournalError) || error.code !== 'JOURNAL_UNCERTAIN') throw error;
      return this.#uncertain(action, key);
    }
  }

  // The only way in: any source is validated here, whoever called, before the first step function is invoked.
  async run(source) {
    const blocked = this.#blocked();
    if (blocked) return result.refusal(blocked, { action: 'run' });
    const parsed = presets.parsePreset(source);
    if (!parsed.ok) {
      const bounded = parsed.code === 'PRESET_BOUND_EXCEEDED';
      return result.refusal(parsed.code, bounded ? { action: 'run', preset: parsed.preset, sha256: parsed.sha256, bound: parsed.bound } : { action: 'run', details: parsed.problems });
    }
    const { preset, sha256 } = parsed;
    const key = preset.idempotencyKey;
    const known = this.#log.runs.get(key);
    if (known) {
      if (known.sha256 !== sha256) return this.#answer('run', known, { errorCode: 'IDEMPOTENCY_KEY_CONFLICT' });
      await this.#live.get(key)?.done.promise;
      return this.#answer('run', this.#log.runs.get(key) ?? known, { replayed: true });
    }
    // Runs that ended without an effect-bearing success (stopped, bounded, cancelled) do not use admission for ever (C042 F3),
    // and the journal stays below the size its replay accepts, so the service can always restart.
    const admitted = [...this.#log.runs.values()].filter((entry) => !entry.terminal || entry.terminal.state === 'completed').length;
    if (admitted >= LIMITS.runs || this.#log.bytes > LIMITS.journalBytes) return result.refusal('RUN_LIMIT_REACHED', { action: 'run', key });
    const failed = this.#append('run', key, { type: 'begin', presetSha256: sha256, preset });
    return failed ?? this.#drive(key, 'run', 'plain');
  }

  inspect(key) {
    const blocked = this.#blocked();
    if (blocked) return result.refusal(blocked, { action: 'inspect', key });
    const run = this.#log.runs.get(key);
    return run ? this.#answer('inspect', run) : result.refusal('RUN_NOT_FOUND', { action: 'inspect', key });
  }

  async cancel(key) {
    const blocked = this.#blocked();
    if (blocked) return result.refusal(blocked, { action: 'cancel', key });
    const run = this.#log.runs.get(key);
    if (!run) return result.refusal('RUN_NOT_FOUND', { action: 'cancel', key });
    const live = this.#live.get(key);
    if (live) {
      // The step in flight is cancelled through the step service itself; the loop then records the cancellation.
      live.cancelRequested = true;
      if (live.current !== null) this.#engine.cancel(live.current);
      await live.done.promise;
      return this.#answer('cancel', this.#log.runs.get(key), { errorCode: this.#log.runs.get(key)?.terminal?.state === 'cancelled' ? null : 'ACTION_NOT_ALLOWED' });
    }
    if (run.terminal || (run.done === run.preset.steps.length && run.pending === null)) return this.#answer('cancel', run, { errorCode: 'ACTION_NOT_ALLOWED' });
    return this.#cancelOpen(key, run);
  }

  // An open run with no live loop (after a restart or an interrupted step): reconcile the step that was not
  // acknowledged with the step service, then record the cancellation, or finish the run if nothing was left to cancel.
  async #cancelOpen(key, run) {
    const target = run.pending ?? (run.acks[run.done] && ['interrupted', 'unknown'].includes(run.acks[run.done].status) ? run.done + 1 : null);
    const live = { done: deferred(), cancelRequested: true, current: null, startedAt: this.#tick(), applied: [] };
    this.#live.set(key, live);
    try {
      if (target !== null && (await this.#advance(key, live, target, 'cancel')) === null) return result.refusal('RUN_JOURNAL_UNAVAILABLE', { action: 'cancel', key });
      const after = this.#log.runs.get(key);
      const last = after.acks[after.done];
      if (after.done === after.preset.steps.length) this.#complete(key, live);
      else if (last && last.status === 'failed') this.#close(key, 'stopped', this.#elapsed(live));
      else if (!last || last.status === 'cancelled') this.#log.append({ type: 'cancel', key, elapsedMs: this.#elapsed(live) });
    } catch (error) {
      if (!(error instanceof JournalError) || error.code !== 'JOURNAL_UNCERTAIN') throw error;
      return this.#uncertain('cancel', key);
    } finally {
      this.#live.delete(key);
      live.done.resolve();
    }
    const final = this.#log.runs.get(key);
    return this.#answer('cancel', final, { errorCode: final.terminal && final.terminal.state !== 'cancelled' ? 'ACTION_NOT_ALLOWED' : null });
  }

  async resume(key) {
    const blocked = this.#blocked();
    if (blocked) return result.refusal(blocked, { action: 'resume', key });
    const run = this.#log.runs.get(key);
    if (!run) return result.refusal('RUN_NOT_FOUND', { action: 'resume', key });
    if (run.terminal || this.#live.has(key)) return this.#answer('resume', run, { errorCode: 'ACTION_NOT_ALLOWED' });
    const failed = this.#append('resume', key, { type: 'resume' });
    return failed ?? this.#drive(key, 'resume', 'resume');
  }

  // Any other action name is a typed refusal; nothing is executed, journaled or invented.
  unsupportedAction(key) {
    const blocked = this.#blocked();
    if (blocked) return result.refusal(blocked, { action: 'none', key });
    const run = this.#log.runs.get(key);
    return run ? this.#answer('none', run, { errorCode: 'UNSUPPORTED_ACTION' }) : result.refusal('UNSUPPORTED_ACTION', { action: 'none', key });
  }
}

async function openRunner({ engine, io, clock = () => 0 } = {}) {
  if (!engine || !ENGINE_METHODS.every((name) => typeof engine[name] === 'function')) throw new TypeError('A step service with submit, inspect, cancel and resume is required.');
  if (!io || typeof io.read !== 'function' || typeof io.append !== 'function' || typeof io.truncate !== 'function') throw new TypeError('An io object with read, append and truncate is required.');
  if (typeof clock !== 'function') throw new TypeError('An injected clock function is required.');
  const runner = new Runner(engine, io, clock);
  runner.load();
  return runner;
}

module.exports = Object.freeze({ openRunner });
