'use strict';

// rev-C043 F3 with REAL processes and FILE journals (the reviewer's two repros): run a three-step preset to completion,
// hard-kill the service, damage the step journal on disk (flip its final newline: inherited C042 F2; cut it at a record
// boundary), restart, and ask: the answer must never be COMPLETED, must list what the step service confirms, and the
// ledger must agree with the listed effects. Hard external timeouts everywhere; every child is killed in `finally`.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assert, call, cleanup, doc, scratch,
} = require('./support.cjs');

const CODE = 'PRESET_STEP_SERVICE_DISAGREES';
const KEY = 'preset-run-0001';
const cleanEnvironment = () => {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete env[name];
  return env;
};

async function startChild(directory) {
  const child = spawn(process.execPath, [path.join(__dirname, 'f3-child.cjs'), directory], { env: cleanEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 90000);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const line = await new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; if (text.includes('\n')) resolve(text.split('\n')[0]); });
    child.once('exit', () => reject(new Error(`the child exited before listening: ${text}`)));
  });
  const { port, error } = JSON.parse(line);
  assert.equal(error, undefined, 'the service started');
  return { port, kill: async () => { child.kill('SIGKILL'); await exited; clearTimeout(watchdog); } };
}

const stepFile = (directory) => path.join(directory, 'steps', 'journal.jsonl');
const lines = (text) => text.split('\n').filter(Boolean).map((line) => `${line}\n`);
const DAMAGES = [
  ['the final newline of the step journal is flipped', (file) => { const bytes = fs.readFileSync(file); bytes[bytes.length - 1] = 0x58; fs.writeFileSync(file, bytes); }, (tail) => tail > 0],
  ['the step journal is cut at a record boundary (the last commit is gone)', (file) => fs.writeFileSync(file, lines(fs.readFileSync(file, 'utf8')).slice(0, 5).join('')), (tail) => tail === 0],
];

for (const [name, damage, tailOk] of DAMAGES) {
  test(`REAL PROCESSES: after a hard kill, ${name}; the restart never says COMPLETED`, { timeout: 120000 }, async () => {
    const directory = scratch();
    const children = [];
    try {
      const first = await startChild(directory);
      children.push(first);
      assert.equal((await call(first.port, 'POST', '/v1/presets', doc())).status, 201);
      assert.equal((await call(first.port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 15);
      await first.kill();
      damage(stepFile(directory));
      const second = await startChild(directory);
      children.push(second);
      const { port } = second;
      const inspected = await call(port, 'GET', `/v1/presets/${KEY}`);
      assert.equal(inspected.status, 200);
      assert.notEqual(inspected.json.run.state, 'completed');
      assert.equal(inspected.json.error.code, CODE);
      assert.deepEqual(inspected.json.steps.map((step) => step.status), ['succeeded', 'succeeded', 'unknown']);
      assert.deepEqual(inspected.json.effects.map((effect) => effect.index), [1, 2]);
      const ledger = (await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed;
      assert.equal(ledger, 10, 'the step service holds only the confirmed units');
      assert.equal(inspected.json.usage.units, ledger, 'the listed effects are what the ledger holds');
      assert.equal(tailOk(inspected.json.stepJournalDiscardedTailBytes), true, `the discarded tail is reported: ${inspected.json.stepJournalDiscardedTailBytes}`);
      const health = (await call(port, 'GET', '/v1/journal')).json;
      assert.deepEqual([health.stepJournalDiscardedTailBytes, health.unconfirmedRuns], [inspected.json.stepJournalDiscardedTailBytes, 1]);
      for (const [method, target, payload] of [['POST', '/v1/presets', doc()], ['POST', `/v1/presets/${KEY}/resume`, ''], ['POST', `/v1/presets/${KEY}/cancel`, '']]) {
        const answer = await call(port, method, target, payload);
        assert.deepEqual([answer.status, answer.json.error.code, answer.json.run.state === 'completed'], [503, CODE, false], target);
      }
      assert.equal((await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 10, 'nothing was applied while the step service disagreed');
      let retry = await call(port, 'POST', '/v1/presets', doc({ idempotencyKey: 'preset-run-0002' }));
      if (retry.json.run.state === 'interrupted') retry = await call(port, 'POST', '/v1/presets/preset-run-0002/resume', '');
      assert.deepEqual([retry.json.run.state, retry.json.effects.length], ['completed', 3], 'a new key with the same steps finishes the work');
      assert.equal((await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 15);
      assert.equal((await call(port, 'GET', `/v1/presets/${KEY}`)).json.run.state, 'completed', 'the step service confirms the old acknowledgements again');
    } finally {
      for (const child of children) await child.kill();
      cleanup(directory);
    }
  });
}

test('REAL PROCESSES control: a hard kill after completion and an undamaged restart is still COMPLETED with three effects', { timeout: 120000 }, async () => {
  const directory = scratch();
  const children = [];
  try {
    const first = await startChild(directory);
    children.push(first);
    assert.equal((await call(first.port, 'POST', '/v1/presets', doc())).status, 201);
    await first.kill();
    const second = await startChild(directory);
    children.push(second);
    const inspected = await call(second.port, 'GET', `/v1/presets/${KEY}`);
    assert.deepEqual([inspected.status, inspected.json.run.state, inspected.json.error, inspected.json.effects.length, inspected.json.stepJournalDiscardedTailBytes], [200, 'completed', null, 3, 0]);
  } finally {
    for (const child of children) await child.kill();
    cleanup(directory);
  }
});
