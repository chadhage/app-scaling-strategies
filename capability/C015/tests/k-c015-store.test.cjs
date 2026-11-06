'use strict';

// Specified in K-C015.feature: persistence and restoration fail closed on every unsafe or inconsistent history.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { persist, restore } = require('..\\store.cjs');
const { makeState } = require('..\\contract.cjs');
const { resolveNamespace, within } = require('..\\paths.cjs');

const root = path.resolve(__dirname, '..');
const demoRoot = path.join(root, 'fixtures', 'synthetic-restart-v1');
const worker = path.join(__dirname, 'worker.cjs');

function newNamespace() {
  const location = resolveNamespace(`test-${randomUUID()}`);
  fs.mkdirSync(location.base, { recursive: true });
  const at = (...parts) => path.join(location.root, ...parts);
  return {
    namespace: location.namespace,
    at,
    seed(runId, epochs, from = runId) {
      fs.mkdirSync(at(runId), { recursive: true });
      for (const epoch of epochs) fs.copyFileSync(path.join(demoRoot, from, `epoch-00${epoch}.json`), at(runId, `epoch-00${epoch}.json`));
    },
    cleanup() {
      assert.ok(location.root !== location.base && within(location.base, location.root) && path.basename(location.root) === location.namespace);
      fs.rmSync(location.root, { recursive: true, force: true });
    }
  };
}

// Simulates a concurrent actor or a failing disk by wrapping fs functions for exactly one awaited action.
async function withFs(patches, action) {
  const originals = Object.fromEntries(Object.keys(patches).map((name) => [name, fs[name]]));
  for (const [name, wrap] of Object.entries(patches)) fs[name] = wrap(originals[name]);
  try {
    return await action();
  } finally {
    for (const [name, original] of Object.entries(originals)) fs[name] = original;
  }
}
const shadow = (stat, values) => Object.create(stat, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));

test('an absent fixture, an unwritten run, an unknown run and an unknown namespace are closed read failures', async () => {
  const space = newNamespace();
  try {
    await assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'STATE_MISSING', message: /no persisted state; no initialization occurs on read/ });
    space.seed('synthetic-run-001', [1, 2, 3]);
    await assert.rejects(restore(space.namespace, 'synthetic-run-002'), { code: 'STATE_MISSING', message: /selected run has no persisted state/ });
    await assert.rejects(restore(space.namespace, 'real-user'), { code: 'UNKNOWN_RUN_ID' });
    await assert.rejects(restore('real-user', 'synthetic-run-001'), { code: 'UNKNOWN_FIXTURE_ID' });
  } finally {
    space.cleanup();
  }
});

test('seeded committed epochs restore their exact history, and an unknown directory in the fixture root blocks every read', async () => {
  const space = newNamespace();
  try {
    space.seed('synthetic-run-001', [1, 2, 3]);
    const restored = await restore(space.namespace, 'synthetic-run-001');
    assert.equal(restored.restored, true);
    assert.deepEqual(restored.history.map((entry) => entry.epoch), [1, 2, 3]);
    assert.deepEqual(restored.state, makeState('synthetic-run-001', 3));
    assert.equal(restored.writesPerformed, 0);
    assert.equal(restored.pid, process.pid);
    fs.mkdirSync(space.at('stray'));
    await assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'UNEXPECTED_FILE' });
  } finally {
    space.cleanup();
  }
});

test('a valid persisted record that belongs to another run fails its immutable file identity', async () => {
  const space = newNamespace();
  try {
    space.seed('synthetic-run-001', [1], 'synthetic-run-002');
    await assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'EPOCH_IDENTITY' });
  } finally {
    space.cleanup();
  }
});

test('a state file that disappears, changes identity or changes while it is read never yields a partial result', async () => {
  const space = newNamespace();
  try {
    space.seed('synthetic-run-001', [1]);
    const run = space.at('synthetic-run-001');
    await withFs({ readdirSync: (original) => (target, ...rest) => {
      const names = Reflect.apply(original, fs, [target, ...rest]);
      return path.resolve(String(target)) === run ? [...names, 'epoch-002.json'] : names;
    } }, () => assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'STATE_MISSING', message: /required immutable state file is missing/ }));
    await withFs({ fstatSync: (original) => (fd, ...rest) => {
      const stat = Reflect.apply(original, fs, [fd, ...rest]);
      return shadow(stat, { size: stat.size + 1 });
    } }, () => assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'UNSAFE_FILE', message: /opened file differs from the checked regular file/ }));
    let calls = 0;
    await withFs({ fstatSync: (original) => (fd, ...rest) => {
      const stat = Reflect.apply(original, fs, [fd, ...rest]);
      calls += 1;
      return calls === 2 ? shadow(stat, { mtimeMs: stat.mtimeMs + 1 }) : stat;
    } }, () => assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'STATE_CHANGED_DURING_READ' }));
    assert.deepEqual((await restore(space.namespace, 'synthetic-run-001')).history.map((entry) => entry.epoch), [1]);
  } finally {
    space.cleanup();
  }
});

test('a concurrent file at the pending target is never overwritten and nothing is acknowledged', async () => {
  const space = newNamespace();
  try {
    const run = space.at('synthetic-run-001');
    await withFs({ mkdirSync: (original) => (target, ...rest) => {
      const result = Reflect.apply(original, fs, [target, ...rest]);
      if (path.resolve(String(target)) === run) fs.writeFileSync(path.join(run, 'pending-001.json'), 'concurrent writer');
      return result;
    } }, () => assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1)), { code: 'PUBLISH_EXISTS', message: /Immutable files are never overwritten/ }));
    assert.equal(fs.readFileSync(path.join(run, 'pending-001.json'), 'utf8'), 'concurrent writer');
    assert.equal(fs.existsSync(path.join(run, 'epoch-001.json')), false);
    await assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'HOLD_UNOBSERVED' });
  } finally {
    space.cleanup();
  }
});

test('a concurrent publication at the immutable target is never replaced and nothing is acknowledged', async () => {
  const space = newNamespace();
  try {
    const run = space.at('synthetic-run-001');
    let flushes = 0;
    await withFs({ fsyncSync: (original) => (fd, ...rest) => {
      const result = Reflect.apply(original, fs, [fd, ...rest]);
      flushes += 1;
      if (flushes === 2) fs.copyFileSync(path.join(demoRoot, 'synthetic-run-001', 'epoch-001.json'), path.join(run, 'epoch-001.json'));
      return result;
    } }, () => assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1)), { code: 'PUBLISH_EXISTS', message: /publication target already exists/ }));
    assert.equal(fs.existsSync(path.join(run, 'pending-001.json')), true);
  } finally {
    space.cleanup();
  }
});

test('a hard link that appears at the published file is rejected before the flush and nothing is acknowledged', async () => {
  const space = newNamespace();
  try {
    const published = space.at('synthetic-run-001', 'epoch-001.json');
    await withFs({ openSync: (original) => (target, flags, ...rest) => {
      if (flags === fs.constants.O_RDWR && path.resolve(String(target)) === published) fs.linkSync(published, `${published}.link`);
      return Reflect.apply(original, fs, [target, flags, ...rest]);
    } }, () => assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1)), { code: 'UNSAFE_FILE', message: /Published target is not a private regular file/ }));
    assert.equal(fs.statSync(published).nlink, 2);
  } finally {
    space.cleanup();
  }
});

test('a lock file that is not a regular file or does not retain the exact bytes is a closed write failure', async () => {
  for (const [wrap, expected] of [
    [(stat) => shadow(stat, { isFile: () => false }), { code: 'UNSAFE_FILE', message: /Only regular files can be written/ }],
    [(stat) => shadow(stat, { size: stat.size - 1 }), { code: 'WRITE_INCOMPLETE' }]
  ]) {
    const space = newNamespace();
    try {
      let calls = 0;
      const target = expected.code === 'UNSAFE_FILE' ? 1 : 2;
      await withFs({ fstatSync: (original) => (fd, ...rest) => {
        const stat = Reflect.apply(original, fs, [fd, ...rest]);
        calls += 1;
        return calls === target ? wrap(stat) : stat;
      } }, () => assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1)), expected));
      assert.equal(fs.existsSync(space.at('synthetic-run-001', 'epoch-001.json')), false);
    } finally {
      space.cleanup();
    }
  }
});

test('an unexpected filesystem or accessor error is reported as one closed STORAGE_ERROR without acknowledgment', async () => {
  const space = newNamespace();
  try {
    const plain = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('plain failure'); } });
    await assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1), plain), (error) =>
      error.code === 'STORAGE_ERROR' && error.details.length === 1 && error.details[0].code === 'UNKNOWN' && /\(UNKNOWN\); no acknowledgment or reset/.test(error.message));
    const coded = new Proxy({}, { getOwnPropertyDescriptor() { throw Object.assign(new Error('disk failure'), { code: 'EIO' }); } });
    await assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1), coded), (error) =>
      error.code === 'STORAGE_ERROR' && error.details[0].code === 'EIO' && /\(EIO\)/.test(error.message));
    await assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1), { testFault: 'unknown-stage' }), { code: 'TEST_FAULT_SCOPE' });
    await assert.rejects(persist('synthetic-restart-v1', makeState('synthetic-run-001', 1), { testFault: 'after-flush' }), { code: 'TEST_FAULT_SCOPE' });
    assert.equal(fs.existsSync(space.at('synthetic-run-001')), false);
  } finally {
    space.cleanup();
  }
});

test('real writers that exit before acknowledging leave a hold that a fresh reader refuses to reclaim or overwrite', async () => {
  const space = newNamespace();
  try {
    for (const [stage, left] of [['after-partial-write', 'pending-001.json'], ['after-flush', 'pending-001.json']]) {
      const run = spawnSync(process.execPath, [worker, 'fail', space.namespace, 'synthetic-run-001', '1', stage], { encoding: 'utf8', timeout: 120000, windowsHide: true });
      assert.equal(run.status, 86, run.stderr);
      assert.equal(run.stdout, '');
      const report = JSON.parse(run.stderr.trim());
      assert.deepEqual({ code: report.code, stage: report.stage, acknowledged: report.acknowledged }, { code: 'FAIL_BEFORE_ACK', stage, acknowledged: false });
      assert.equal(fs.existsSync(space.at('synthetic-run-001', left)), true, stage);
      await assert.rejects(restore(space.namespace, 'synthetic-run-001'), { code: 'HOLD_UNOBSERVED' });
      await assert.rejects(persist(space.namespace, makeState('synthetic-run-001', 1)), { code: 'HOLD_UNOBSERVED' });
      fs.rmSync(space.at(), { recursive: true, force: true });
    }
  } finally {
    space.cleanup();
  }
});
