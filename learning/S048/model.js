(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BatchRetirementLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    retirement: 'checkpoint', checkpoint: 'durable-current', effects: 'idempotent',
    observation: 'complete', resumeDelayMs: 20, budgetMs: 100,
  });
  const choices = Object.freeze({
    retirement: ['checkpoint', 'finish', 'force', 'false-complete'],
    checkpoint: ['durable-current', 'durable-stale', 'local-only', 'unobserved'],
    effects: ['idempotent', 'repeat'],
    observation: ['complete', 'unobserved'],
  });
  const keys = Object.keys(DEFAULTS);
  function validateConfig(config) {
    const invalid = () => { throw new Error('Invalid configuration: use exact plain fields and bounded values.'); };
    if (!config || typeof config !== 'object' || Object.getPrototypeOf(config) !== Object.prototype) invalid();
    const supplied = Reflect.ownKeys(config);
    if (supplied.length !== keys.length || supplied.some((key) => !keys.includes(key))) invalid();
    const values = {};
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(config, key);
      if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
      values[key] = field.value;
    }
    for (const [key, allowed] of Object.entries(choices)) {
      if (!allowed.includes(values[key])) invalid();
    }
    for (const [key, min, max] of [['resumeDelayMs', 0, 1000], ['budgetMs', 1, 2000]]) {
      if (!Number.isInteger(values[key]) || values[key] < min || values[key] > max) invalid();
    }
    return values;
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function createLesson() {
    let history = [];
    let phase, jobStatus, config, progress, result, trace, prediction, counts, elapsed;
    function clearAttempt() {
      phase = 'idle';
      jobStatus = 'not-started';
      config = null;
      progress = null;
      result = null;
      prediction = null;
      trace = [];
      counts = [0, 0, 0, 0, 0, 0];
      elapsed = 0;
    }
    clearAttempt();
    const snapshot = () => freeze(copy({
      phase, jobStatus, config, progress, result, history, trace, prediction,
    }));
    function requirePhase(required, action) {
      if (phase !== required) throw new Error(`${action} requires ${required}; current phase is ${phase}.`);
    }
    function start(input) {
      requirePhase('idle', 'Start');
      if (history.length >= 8) throw new Error('History limit: 8 results retained. Reset explicitly to erase them.');
      const validated = validateConfig(input);
      config = validated;
      phase = 'active';
      jobStatus = 'running-on-old';
      counts = [1, 1, 1, 0, 0, 0];
      elapsed = 30;
      progress = {
        committedItems: [1, 2, 3], effectTotal: 30, remainingItems: 3,
        checkpointCursor: null, elapsedMs: elapsed,
      };
      trace = [
        `Job admitted at t=0 with original budget ${config.budgetMs} ms.`,
        'Old worker committed items 1-3: 3 unique effects, total 30, t=30 ms.',
      ];
      return snapshot();
    }
    function retire() {
      requirePhase('active', 'Retire');
      phase = 'retired';
      if (config.retirement === 'finish') {
        counts = [1, 1, 1, 1, 1, 1];
        elapsed = 60;
        progress.committedItems = [1, 2, 3, 4, 5, 6];
        progress.effectTotal = 60;
        progress.remainingItems = 0;
        jobStatus = 'finished-awaiting-verification';
        trace.push('Finished items 4-6 before retiring the old worker at t=60 ms; no checkpoint required.');
      } else if (config.retirement === 'checkpoint') {
        if (config.checkpoint.startsWith('durable-')) {
          progress.checkpointCursor = config.checkpoint === 'durable-current' ? 3 : 1;
          jobStatus = 'resumable-not-complete';
          trace.push(`Durable cursor ${progress.checkpointCursor} retained; old worker retired with 3 items remaining. Resumable is NOT complete.`);
        } else if (config.checkpoint === 'local-only') {
          jobStatus = 'checkpoint-lost';
          trace.push('Local-only cursor 3 disappeared with the retired host. Items 4-6 are stranded.');
        } else {
          jobStatus = 'checkpoint-unknown';
          trace.push('Old worker retired, but checkpoint evidence is unavailable; no resume cursor may be invented.');
        }
      } else if (config.retirement === 'force') {
        jobStatus = 'work-stranded';
        trace.push('Forced retirement without a checkpoint; committed items 1-3 remain, items 4-6 are stranded.');
      } else {
        jobStatus = 'claimed-complete-unverified';
        trace.push('BUG rehearsal: job declared complete after only items 1-3. Three required items remain.');
      }
      progress.elapsedMs = elapsed;
      return snapshot();
    }
    function verify() {
      requirePhase('retired', 'Continue / verify');
      const replayed = [];
      const cursor = progress.checkpointCursor;
      const checkpointUnknown = config.retirement === 'checkpoint' && config.checkpoint === 'unobserved';
      let continuation;
      let continuationDetail;
      if (config.retirement === 'finish') {
        continuation = 'pass';
        continuationDetail = 'All work finished on the old worker before retirement; no checkpoint needed.';
      } else if (config.retirement === 'checkpoint' && cursor !== null) {
        continuation = 'pass';
        continuationDetail = `Replacement used durable cursor ${cursor}; a checkpoint alone did not complete the job.`;
        elapsed += config.resumeDelayMs;
        trace.push(`Replacement starts after ${config.resumeDelayMs} ms delay; original budget is NOT restarted.`);
        for (let item = cursor + 1; item <= 6; item++) {
          elapsed += 10;
          if (counts[item - 1] > 0) replayed.push(item);
          if (config.effects === 'repeat' || counts[item - 1] === 0) counts[item - 1]++;
          trace.push(`Replacement attempted item ${item} at t=${elapsed} ms, with ${config.effects} effect policy.`);
        }
      } else if (checkpointUnknown) {
        continuation = 'unknown';
        continuationDetail = 'Checkpoint durability/cursor is unobserved; correct continuation is not established.';
        elapsed += config.resumeDelayMs;
        trace.push(`Continuation observation stopped at t=${elapsed} ms: checkpoint remains unknown.`);
      } else {
        continuation = 'fail';
        continuationDetail = 'Three unfinished items have no usable continuation; retirement did not complete them.';
        trace.push('No replacement can continue the remaining items in this selected failure case.');
      }

      const observed = config.observation === 'complete' && !checkpointUnknown;
      const missing = counts.flatMap((count, index) => count === 0 ? [index + 1] : []);
      const duplicateEffects = counts.reduce((total, count) => total + Math.max(0, count - 1), 0);
      const effectTotal = counts.reduce((total, count) => total + count * 10, 0);
      const falseClaim = config.retirement === 'false-complete';
      const checks = [
        { id: 'checkpoint', name: 'Finish or durable continuation', status: continuation, detail: continuationDetail },
        { id: 'coverage', name: 'All six required items', status: !observed ? 'unknown' : missing.length ? 'fail' : 'pass',
          detail: !observed ? 'Final per-item observation unavailable; missing work is not zero.' :
            missing.length ? `Missing required items: ${missing.join(', ')}.` : 'Items 1-6 are all observed.' },
        { id: 'effects', name: 'One effect per item', status: !observed ? 'unknown' :
          counts.every((count) => count === 1) ? 'pass' : 'fail',
          detail: !observed ? 'Effect totals and duplicates are unknown, not successful.' :
            `${duplicateEffects} duplicate effects; observed total ${effectTotal}, expected 60.` },
        { id: 'terminal-state', name: 'No false completion', status: falseClaim ? 'fail' :
          !observed ? 'unknown' : missing.length ? 'fail' : 'pass',
          detail: falseClaim ? 'Job was declared complete while 3 required items remained.' :
            !observed ? 'Completion cannot be verified without final observation.' :
              missing.length ? 'Unfinished work is explicitly incomplete.' : 'No required item remains unfinished.' },
        { id: 'budget', name: 'Original job budget', status: elapsed > config.budgetMs ? 'fail' :
          !observed ? 'unknown' : 'pass',
          detail: `${elapsed} ms known synthetic elapsed / ${config.budgetMs} ms original budget; no clock restart.` },
      ];
      const verdict = checks.some((entry) => entry.status === 'fail') ? 'failed' :
        checks.some((entry) => entry.status === 'unknown') ? 'unknown' : 'passed';
      result = {
        verdict,
        userOutcome: verdict === 'passed' ? 'completed-correctly' : verdict === 'failed' ? 'interrupted' : 'unverified',
        metrics: {
          expectedItems: 6, expectedEffectTotal: 60,
          uniqueItems: observed ? 6 - missing.length : null,
          missingItems: observed ? missing : null,
          duplicateEffects: observed ? duplicateEffects : null,
          effectCounts: observed ? [...counts] : null,
          effectTotal: observed ? effectTotal : null,
          checkpointCursor: cursor, replayedItems: observed ? replayed : null,
          remainingAtRetirement: progress.remainingItems,
          falselyCompleted: falseClaim, elapsedMs: elapsed, budgetMs: config.budgetMs,
          elapsedKind: observed ? 'observed-at-verification' : 'known-lower-bound-not-completion-proof',
        },
        checks,
      };
      if (!observed) trace.push('Final effect proof unavailable; coverage, effect totals and duplicates remain UNKNOWN.');
      trace.push(`Synthetic verdict ${verdict.toUpperCase()}; user impact ${result.userOutcome}.`);
      jobStatus = verdict === 'passed' ? 'completed' : verdict === 'failed' ? 'incomplete' : 'unknown';
      phase = 'complete';
      history.push({ attempt: history.length + 1, config: copy(config), result: copy(result), trace: [...trace], prediction: null });
      return snapshot();
    }
    function predict(expected) {
      requirePhase('complete', 'Prediction');
      if (!['passed', 'failed', 'unknown'].includes(expected)) throw new Error('Invalid prediction: choose passed, failed or unknown.');
      if (prediction) throw new Error('Prediction already checked for this attempt.');
      prediction = { expected, actual: result.verdict, verifier: expected === result.verdict ? 'PASS' : 'FAIL' };
      history[history.length - 1].prediction = copy(prediction);
      return snapshot();
    }
    function next() {
      requirePhase('complete', 'New attempt');
      clearAttempt();
      return snapshot();
    }
    function reset() {
      history = [];
      clearAttempt();
      return snapshot();
    }
    return Object.freeze({
      snapshot, start, retire, verify, predict, next, reset,
    });
  }
  return Object.freeze({ DEFAULTS, validateConfig, createLesson });
}));
