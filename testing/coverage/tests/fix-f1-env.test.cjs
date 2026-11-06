'use strict';

// F1 of the independent review of U009: the node --test child of the gate must not inherit the caller's NODE_V8_COVERAGE.
// child_process.spawn copies process.env.NODE_V8_COVERAGE into any child whose env object has no OWN NODE_V8_COVERAGE property,
// so deleting the key from the object is not enough: the node --test runner then moves its raw V8 coverage into the caller's directory.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixtureRoot, makeScratch, dispose } = require('./support.cjs');
const { runGateCli, relativeToRepository } = require('./clisupport.cjs');

const commandModule = path.join(__dirname, '..', 'command.cjs');
const coverageFiles = (directory) => fs.readdirSync(directory).filter((name) => /^coverage-\d+-\d+-\d+\.json$/.test(name));

// Runs inside a process that has NODE_V8_COVERAGE set: it starts a child with the environment the gate would give it and reports what that child sees.
const helper = `
const { spawnSync } = require('node:child_process');
const { buildEnvironment } = require(process.argv[1]);
const probe = 'process.stdout.write(JSON.stringify(Object.keys(process.env).filter((name) => /^node_v8_coverage$/i.test(name)).map((name) => [name, process.env[name]])))';
const child = spawnSync(process.execPath, ['-e', probe], { env: buildEnvironment(process.env), encoding: 'utf8' });
process.stdout.write(child.stdout);
`;

test('a child started with the sanitized environment sees no NODE_V8_COVERAGE although its parent has one', (t) => {
  const scratch = makeScratch('f1-mechanism');
  t.after(() => dispose(scratch));
  const parent = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'].includes(name.toUpperCase())) parent[name] = value;
  }
  parent.NODE_V8_COVERAGE = path.join(scratch, 'caller-coverage');
  const run = spawnSync(process.execPath, ['-e', helper, commandModule], { env: parent, encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [], 'the child must not see NODE_V8_COVERAGE: Node copies it from the parent into any env object without an own property');
});

test('the real gate under an outer NODE_V8_COVERAGE leaves coverage of its children out of the caller directory', async (t) => {
  const scratch = makeScratch('f1-real');
  t.after(() => dispose(scratch));
  const callerDirectory = path.join(scratch, 'caller-coverage');
  fs.mkdirSync(callerDirectory, { recursive: true });
  const result = await runGateCli(['--root', relativeToRepository(fixtureRoot('pass')), '--scratch', path.join(scratch, 'gate-scratch')], {
    env: { NODE_V8_COVERAGE: callerDirectory, NODE_TEST_CONTEXT: undefined }, timeout: 120000
  });
  assert.equal(result.timedOut, false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.pass, true);
  assert.equal(result.report.files[0].loaded, true, 'the nested run really measured the file');
  const owners = [...new Set(coverageFiles(callerDirectory).map((name) => Number(name.split('-')[1])))];
  assert.deepEqual(owners.filter((pid) => pid !== result.pid), [], 'only the gate process may write V8 coverage into the caller directory, never the node --test runner or its test files');
  assert.equal(coverageFiles(callerDirectory).length <= 1, true, 'at most the one file of the gate process itself');
});
