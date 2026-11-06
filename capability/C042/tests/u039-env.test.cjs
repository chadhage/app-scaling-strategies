'use strict';

// U039: the tooling never lets a child process write V8 coverage into the caller's directory (L-0140). Node re-injects NODE_V8_COVERAGE into any child whose
// env object has no OWN key of that name, so deleting the key does not sanitize it: a child that runs other bytes under the real file name (the accepted
// server as the control of the flood test, a mutant) then corrupts the merged coverage report of server.cjs, and a child that is killed leaves a truncated
// file. These tests run REAL processes under an outer NODE_V8_COVERAGE (a directory of this test) and count the files that appear in it; none of them
// asserts the env object alone. The V8 hook of THIS process was fixed when it started, so setting the variable here only changes what children inherit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const lib = require('./u039-lib.cjs');

const SCRATCH = path.join(__dirname, 'scratch');

async function underOuterCoverage(body) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const dir = fs.mkdtempSync(path.join(SCRATCH, 'v8-'));
  const before = process.env.NODE_V8_COVERAGE;
  process.env.NODE_V8_COVERAGE = dir;
  try {
    return await body(dir);
  } finally {
    if (before === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = before;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const run = (env) => spawnSync(process.execPath, ['-e', '0'], { env, windowsHide: true, timeout: 600000 });

test('control: a child whose environment merely lacks the key still writes V8 coverage into the caller directory', { timeout: 900000 }, () => underOuterCoverage((dir) => {
  const env = { ...process.env };
  delete env.NODE_V8_COVERAGE;
  assert.equal(run(env).status, 0);
  assert.equal(fs.readdirSync(dir).length > 0, true, 'Node re-injected the key into the child (L-0140): deleting it is not enough');
}));

test('the environment of the tooling has an own empty key: a child writes no coverage file, and NODE_TEST_CONTEXT is gone', { timeout: 900000 }, () => underOuterCoverage((dir) => {
  const env = lib.childEnv({ U039_MARK: '1' });
  assert.equal(Object.hasOwn(env, 'NODE_V8_COVERAGE'), true);
  assert.equal(env.NODE_V8_COVERAGE, '');
  assert.equal(env.U039_MARK, '1');
  assert.equal('NODE_TEST_CONTEXT' in env, false);
  assert.equal(run(env).status, 0);
  assert.deepEqual(fs.readdirSync(dir), []);
}));

test('a separate server process started by startChild writes no coverage file, whether it runs the real bytes or other bytes, stopped or killed', { timeout: 900000 }, () => underOuterCoverage(async (dir) => {
  for (const subject of ['real', 'v1']) {
    const child = await lib.startChild({ subject });
    const instance = await child.start();
    await instance.close();
    await child.stop();
  }
  const killed = await lib.startChild({ subject: 'v1' });
  await killed.start();
  process.kill(killed.pid);
  assert.deepEqual(fs.readdirSync(dir), []);
}));

test('bytes that are not the real server.cjs are compiled under a name of their own, so no two scripts share a coverage URL', { timeout: 900000 }, async () => {
  for (const which of ['v1', 'file:capability/C042/evidence/u039-pipelining/server.v1.cjs.txt']) {
    const subject = lib.loadSubject(which);
    const failure = await subject.startLocal({ readLedger: () => '{' }).then(() => null, (error) => error);
    assert.match(String(failure?.message), /C001 current consent is unavailable/, which);
    assert.match(failure.stack, /scratch[\\/]subject[\\/]/, `${which}: the stack names the compiled script`);
    assert.doesNotMatch(failure.stack, /C042[\\/]server\.cjs/, `${which}: the real file name is not used`);
  }
});

test('every tool and test of U039 that starts a child process builds its environment with lib.childEnv', () => {
  const sources = fs.readdirSync(__dirname).filter((name) => /^u039-.*\.cjs$/.test(name)).map((name) => [name, fs.readFileSync(path.join(__dirname, name), 'utf8')]);
  const spawners = sources.filter(([, text]) => /\b(?:fork|spawn|spawnSync)\(/.test(text));
  assert.equal(spawners.length >= 7, true, `found ${spawners.map(([name]) => name).join(', ')}`);
  for (const [name, text] of spawners) assert.match(text, /\bchildEnv\(/, `${name} starts a child process without lib.childEnv`);
});
