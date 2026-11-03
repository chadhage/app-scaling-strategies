'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRehearsal, fixtures: F } = require('../model.js');
const config = (changes = {}) => ({ ...F.defaults, ...changes });
const execute = (settings = config()) => {
  const model = createRehearsal();
  model.write(settings);
  model.addReader();
  model.read();
  return model;
};
const result = (model) => {
  const snapshot = model.snapshot();
  assert.notEqual(snapshot.result, null, 'four planned reads must produce an explicit result');
  return snapshot.result;
};
const counts = (model, expected) => {
  const actual = result(model);
  assert.deepEqual([actual.correct, actual.failed, actual.unknown], expected);
  assert.equal(actual.attempted, 4);
  assert.equal(actual.correct + actual.failed + actual.unknown, 4);
};

test('loadable API and deterministic synthetic fixture exist before implementation', () => {
  const model = createRehearsal();
  for (const name of ['snapshot', 'write', 'addReader', 'read', 'predict', 'newAttempt', 'reset']) {
    assert.equal(typeof model[name], 'function');
  }
  assert.equal(model.snapshot().phase, 'idle');
  assert.equal(F.plan.length, 4);
  assert.equal(F.committedVersion, 11);
});

test('acknowledged write locks assumptions and establishes the session version without adding writers', () => {
  const model = createRehearsal();
  const settings = config();
  model.write(settings);
  assert.equal(model.snapshot().phase, 'written');
  settings.routing = 'verified-or-primary';
  const snapshot = model.snapshot();
  assert.equal(snapshot.config.routing, 'unchecked');
  assert.equal(snapshot.primary.version, 11);
  assert.equal(snapshot.primary.writers, 1);
  assert.equal(snapshot.primary.acknowledgedWrites, 1);
  assert.equal(snapshot.sessionRequiredVersion, 11);
  assert.equal(snapshot.readers.length, 1);
});

test('explicit reader expansion adds a lagging reader without silently synchronizing it', () => {
  const model = createRehearsal();
  model.write(config());
  model.addReader();
  const snapshot = model.snapshot();
  assert.equal(snapshot.phase, 'expanded');
  assert.deepEqual(snapshot.readers, [{ id: 'reader-1', version: 11 }, { id: 'reader-2', version: 10 }]);
  assert.equal(snapshot.primary.writers, 1);
  assert.match(snapshot.trace.join('\n'), /reader-2.*10/);
});

test('unchecked offload violates read-your-writes even when browse allows one-version staleness', () => {
  const model = execute();
  counts(model, [3, 1, 0]);
  assert.equal(result(model).gate, 'FAIL');
  assert.equal(result(model).impact, 'INTERRUPTED');
  assert.equal(result(model).replicaReads, 4);
  assert.equal(result(model).primaryReads, 0);
  const failed = model.snapshot().reads.find((read) => read.status === 'FAIL');
  assert.equal(failed.id, 'own-write-added');
  assert.equal(failed.receivedVersion, 10);
  assert.equal(failed.requiredVersion, 11);
  assert.equal(failed.reason, 'STALE_READ');
});

test('primary-for-session preserves writes while offloading both eligible bounded-staleness reads', () => {
  const model = execute(config({ routing: 'primary-for-session' }));
  counts(model, [4, 0, 0]);
  assert.equal(result(model).gate, 'PASS');
  assert.equal(result(model).offloadedEligible, 2);
  assert.equal(result(model).primaryReads, 2);
  assert.ok(model.snapshot().reads.filter((read) => read.kind === 'own-write')
    .every((read) => read.observedTarget === 'primary' && read.receivedVersion === 11));
});

test('current-only browse freshness is not waived by session-primary routing', () => {
  const model = execute(config({ routing: 'primary-for-session', freshness: 'current-only' }));
  counts(model, [3, 1, 0]);
  assert.equal(result(model).gate, 'FAIL');
  assert.equal(model.snapshot().reads.find((read) => read.id === 'browse-added').status, 'FAIL');
});

test('verified-watermark routing falls back to primary without fabricating catch-up', () => {
  const model = execute(config({ routing: 'verified-or-primary', freshness: 'current-only' }));
  counts(model, [4, 0, 0]);
  assert.equal(result(model).replicaReads, 2);
  assert.equal(result(model).primaryReads, 2);
  assert.equal(result(model).offloadedEligible, 1);
  assert.equal(model.snapshot().readers[1].version, 10);
  assert.ok(model.snapshot().reads.filter((read) => read.candidate === 'reader-2')
    .every((read) => read.selectedTarget === 'primary'));
});

test('a current added reader needs no primary fallback and still proves only read offload', () => {
  const model = execute(config({ addedReader: 'current', routing: 'verified-or-primary' }));
  counts(model, [4, 0, 0]);
  assert.equal(result(model).replicaReads, 4);
  assert.equal(result(model).primaryReads, 0);
  assert.equal(model.snapshot().primary.writers, 1);
  assert.equal(model.snapshot().primary.acknowledgedWrites, 1);
});

test('unknown reader version is UNKNOWN rather than silently successful or definitely stale', () => {
  const model = execute(config({ addedReader: 'unknown' }));
  counts(model, [2, 0, 2]);
  assert.equal(result(model).gate, 'UNKNOWN');
  assert.equal(result(model).impact, 'UNVERIFIED');
  const reads = model.snapshot().reads.filter((read) => read.candidate === 'reader-2');
  assert.ok(reads.every((read) => read.receivedVersion === null && read.reason === 'VERSION_UNKNOWN'));
});

test('verified routing does not trust an unknown watermark', () => {
  const model = execute(config({ addedReader: 'unknown', routing: 'verified-or-primary' }));
  counts(model, [4, 0, 0]);
  assert.equal(result(model).primaryReads, 2);
  assert.equal(model.snapshot().readers[1].version, null);
});

test('partial and absent coverage retain unknowns and known failures dominate uncertainty', () => {
  const partial = execute(config({ coverage: 'partial' }));
  counts(partial, [3, 0, 1]);
  assert.equal(result(partial).gate, 'UNKNOWN');
  const failed = execute(config({ coverage: 'partial', freshness: 'current-only' }));
  counts(failed, [2, 1, 1]);
  assert.equal(result(failed).gate, 'FAIL');
  const absent = execute(config({ coverage: 'none' }));
  counts(absent, [0, 0, 4]);
  assert.equal(result(absent).gate, 'UNKNOWN');
  assert.equal(result(absent).observed, 0);
  assert.equal(result(absent).replicaReads, 0);
  assert.ok(absent.snapshot().reads.every((read) =>
    read.observedTarget === null && read.receivedVersion === null && read.reason === 'NO_OBSERVATION'));
});

test('all 54 declared configurations match an independent version/coverage oracle', () => {
  let configurations = 0;
  for (const addedReader of F.choices.addedReader) for (const routing of F.choices.routing) {
    for (const freshness of F.choices.freshness) for (const coverage of F.choices.coverage) {
      const settings = { addedReader, routing, freshness, coverage };
      const model = execute(settings);
      const actual = result(model);
      const versions = [11, addedReader === 'behind' ? 10 : addedReader === 'current' ? 11 : null];
      const statuses = [];
      let replicaReads = 0;
      let primaryReads = 0;
      let offloadedEligible = 0;
      for (let index = 0; index < 4; index++) {
        const sensitive = index % 2 === 1;
        const required = sensitive || freshness === 'current-only' ? 11 : 10;
        const version = versions[Math.floor(index / 2)];
        const toPrimary = (routing === 'primary-for-session' && sensitive)
          || (routing === 'verified-or-primary' && (version === null || version < required));
        if (coverage === 'none' || (coverage === 'partial' && index === 3)) {
          statuses.push('UNKNOWN');
          continue;
        }
        if (toPrimary) primaryReads++;
        else {
          replicaReads++;
          if (!sensitive) offloadedEligible++;
        }
        const returned = toPrimary ? 11 : version;
        statuses.push(returned === null ? 'UNKNOWN' : returned >= required ? 'PASS' : 'FAIL');
      }
      assert.equal(actual.gate, statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS');
      assert.deepEqual(model.snapshot().reads.map((read) => read.status), statuses);
      assert.equal(actual.correct, statuses.filter((status) => status === 'PASS').length);
      assert.equal(actual.replicaReads, replicaReads);
      assert.equal(actual.primaryReads, primaryReads);
      assert.equal(actual.offloadedEligible, offloadedEligible);
      configurations++;
    }
  }
  assert.equal(configurations, 54);
});

test('exact own data-property enum inputs reject malformed values without side effects or getter execution', () => {
  let accessed = 0;
  const accessor = config();
  Object.defineProperty(accessor, 'routing', { enumerable: true, get() { accessed++; return 'unchecked'; } });
  const inherited = Object.create(F.defaults);
  const symbol = { ...config(), [Symbol('extra')]: 'unchecked' };
  const nonEnumerable = config();
  Object.defineProperty(nonEnumerable, 'extra', { value: 'extra', enumerable: false });
  const invalid = [
    null, undefined, [], 'unchecked', 1, inherited, accessor, symbol, nonEnumerable,
    { ...config(), extra: true }, { addedReader: 'behind' },
    ...Object.keys(F.defaults).flatMap((key) => [
      { ...config(), [key]: true }, { ...config(), [key]: new String(F.defaults[key]) },
      { ...config(), [key]: '' }, { ...config(), [key]: F.defaults[key].toUpperCase() },
    ]),
  ];
  for (const settings of invalid) {
    const model = createRehearsal();
    const before = model.snapshot();
    assert.throws(() => model.write(settings), /Configuration|Added reader|Routing|Freshness|Coverage/);
    assert.deepEqual(model.snapshot(), before);
  }
  assert.equal(accessed, 0);
});

test('phase, duplicate-action and argument guards leave state and history intact', () => {
  const model = createRehearsal();
  const rejects = (action, pattern) => {
    const before = model.snapshot();
    assert.throws(action, pattern);
    assert.deepEqual(model.snapshot(), before);
  };
  rejects(() => model.addReader(), /requires written/);
  rejects(() => model.read(), /requires expanded/);
  rejects(() => model.predict('PASS'), /requires complete/);
  rejects(() => model.newAttempt(), /requires complete/);
  model.write(config());
  rejects(() => model.write(config()), /requires idle/);
  rejects(() => model.read(), /requires expanded/);
  rejects(() => model.addReader('extra'), /arguments/);
  model.addReader();
  rejects(() => model.addReader(), /requires written/);
  model.read();
  rejects(() => model.read(), /requires expanded/);
  rejects(() => model.predict(new String('FAIL')), /Prediction/);
  rejects(() => model.predict('fail'), /Prediction/);
  model.predict('FAIL');
  rejects(() => model.predict('FAIL'), /already checked/);
  rejects(() => model.reset('extra'), /arguments/);
});

test('prediction verifier remains separate from the failed synthetic read impact', () => {
  const model = execute();
  model.predict('FAIL');
  assert.notEqual(model.snapshot().prediction, null);
  assert.equal(model.snapshot().prediction.verifier, 'PASS');
  assert.equal(model.snapshot().prediction.selected, 'FAIL');
  assert.equal(result(model).impact, 'INTERRUPTED');
  assert.deepEqual(model.snapshot().history[0].prediction, model.snapshot().prediction);
  const wrong = execute();
  wrong.predict('PASS');
  assert.equal(wrong.snapshot().prediction.verifier, 'FAIL');
  assert.equal(result(wrong).gate, 'FAIL');
});

test('new attempts clear current proof, retain detached failure history and do not evict at the six-attempt cap', () => {
  const model = execute();
  model.predict('FAIL');
  assert.equal(model.snapshot().history.length, 1);
  const first = model.snapshot().history[0];
  model.newAttempt();
  assert.equal(model.snapshot().phase, 'idle');
  assert.equal(model.snapshot().result, null);
  assert.equal(model.snapshot().config, null);
  assert.deepEqual(model.snapshot().reads, []);
  assert.deepEqual(model.snapshot().trace, []);
  assert.equal(model.snapshot().prediction, null);
  assert.deepEqual(model.snapshot().history[0], first);
  for (let attempt = 2; attempt <= 6; attempt++) {
    model.write(config({ routing: 'verified-or-primary' }));
    model.addReader();
    model.read();
    if (attempt < 6) model.newAttempt();
  }
  assert.equal(model.snapshot().history.length, 6);
  const full = model.snapshot();
  assert.throws(() => model.newAttempt(), /History full/);
  assert.deepEqual(model.snapshot(), full);
  assert.deepEqual(model.snapshot().history[0], first);
});

test('private snapshots and nested retained history cannot be mutated', () => {
  const model = execute();
  const snapshot = model.snapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  for (const value of [snapshot.config, snapshot.readers, snapshot.readers[0], snapshot.reads[0],
    snapshot.result, snapshot.history, snapshot.history[0], snapshot.history[0].reads[0], snapshot.trace]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { snapshot.readers[1].version = 11; }, TypeError);
  assert.throws(() => { snapshot.history[0].result.gate = 'PASS'; }, TypeError);
  assert.notEqual(model.snapshot(), snapshot);
  assert.equal(result(model).gate, 'FAIL');
  assert.deepEqual(Object.keys(model).sort(),
    ['addReader', 'newAttempt', 'predict', 'read', 'reset', 'snapshot', 'write'].sort());
});

test('explicit reset clears completed and prepared state and history to exact initial defaults', () => {
  const model = execute();
  model.predict('FAIL');
  model.newAttempt();
  model.write(config({ addedReader: 'unknown' }));
  assert.equal(model.snapshot().phase, 'written');
  model.reset();
  assert.deepEqual(model.snapshot(), createRehearsal().snapshot());
  model.write(config());
  model.addReader();
  model.reset();
  assert.deepEqual(model.snapshot(), createRehearsal().snapshot());
});
