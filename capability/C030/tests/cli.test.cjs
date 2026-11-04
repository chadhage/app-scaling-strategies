'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');
const detector = require('..\\detector.js');
const cli = path.resolve(__dirname, '..', 'cli.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const options = { cwd: repository, windowsHide: true };
const run = (args) => spawnSync(process.execPath, [cli, ...args], { ...options, timeout: 60000, encoding: 'utf8' });
// Commands that pass the source/gate preflight each start PowerShell and Git, so these independent runs start together.
function start(args, input = '', nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, cli, ...args], { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const exitFor = (result) => !result.valid ? 3 : result.decision === 'PASS' ? 0 : result.decision === 'FAIL' ? 1 : 2;
const rejection = (output) => JSON.parse(output.stderr);
const exact = detector.sourceJson('control-duplicate-application');
const fiction = JSON.stringify(JSON.parse(detector.sourceJson('control-one')).payload);
const pending = {
  json: start(['json', 'control-one']),
  compare: start(['compare', 'control-absence-retry']),
  unknown: start(['compare', 'control-not-closed']),
  copy: start(['inspect-copy', 'control-duplicate-application'], exact),
  altered: start(['inspect-copy', 'control-one'], exact),
  oversize: start(['inspect-copy', 'control-one'], 'x'.repeat(detector.MAX_BYTES + 16)),
  encoding: start(['inspect-copy', 'control-one'], Buffer.from([0xff, 0xfe, 0xfd])),
  fault: start(['inspect-copy', 'control-one'], exact, ['--require', path.join(__dirname, 'fault-stdin.cjs')]),
  unbound: start(['inspect-unbound'], fiction),
  supplied: start(['inspect-unbound'], '{"schema":"C030-fictional-observations/1","verdict":"PASS"}')
};

test('help prints the closed usage and nothing else', () => {
  const output = run(['help']);
  assert.equal(output.status, 0);
  assert.match(output.stdout, /inspect <closed-id> \| compare <closed-retry-id>/);
  assert.match(output.stdout, /No paths, URLs or authority overrides\./);
  assert.equal(output.stderr, '');
});
test('only the five closed commands with their exact argument counts run', () => {
  for (const args of [[], ['help', 'extra'], ['inspect'], ['json', 'control-one', 'extra'], ['inspect-unbound', 'control-one'], ['delete', 'control-one']]) {
    const output = run(args);
    assert.equal(output.status, 3, args.join(' '));
    assert.equal(output.stdout, '');
    const failure = rejection(output);
    assert.equal(failure.code, 'CLOSED_COMMAND_REQUIRED');
    assert.equal(failure.valid, false);
    assert.equal(failure.decision, 'HOLD');
    assert.equal(failure.eligibleForLiveRun, false);
    assert.equal(failure.actualExternalEffectsObserved, false);
  }
});
test('an identity outside the closed source list is refused', async () => {
  const output = await pending.unknown;
  assert.equal(output.status, 3);
  assert.equal(rejection(output).code, 'UNKNOWN_SOURCE_ID');
});
test('json prints the exact immutable source copy for a closed identity', async () => {
  const output = await pending.json;
  assert.equal(output.status, 0);
  assert.equal(output.stdout, `${detector.sourceJson('control-one')}\n`);
});
test('compare prints exactly the in-process comparison with its scoped exit code', async () => {
  const output = await pending.compare;
  const expected = detector.compare('control-absence-retry');
  assert.equal(output.status, exitFor(expected));
  assert.deepEqual(JSON.parse(output.stdout), JSON.parse(JSON.stringify(expected)));
});
test('inspect-copy reads a bounded exact copy from stdin and never adopts it', async () => {
  const accepted = await pending.copy;
  const expected = detector.inspectCandidate(exact, 'control-duplicate-application');
  assert.equal(accepted.status, exitFor(expected));
  assert.deepEqual(JSON.parse(accepted.stdout), JSON.parse(JSON.stringify(expected)));
  const altered = await pending.altered;
  assert.equal(altered.status, 3);
  assert.equal(JSON.parse(altered.stdout).valid, false);
});
test('stdin larger than the bounded copy size is rejected before any inspection', async () => {
  const output = await pending.oversize;
  assert.equal(output.status, 3);
  assert.equal(output.stdout, '');
  assert.equal(rejection(output).code, 'JSON_OVERSIZE');
});
test('stdin that is not valid UTF-8 is refused as a closed error, never decoded leniently', async () => {
  const output = await pending.encoding;
  assert.equal(output.status, 3);
  assert.equal(output.stdout, '');
  assert.equal(rejection(output).valid, false);
});
test('an unexpected failure without an error code is a closed UNAVAILABLE rejection, not a crash', async () => {
  const output = await pending.fault;
  assert.equal(output.status, 3);
  assert.equal(output.stdout, '');
  const failure = rejection(output);
  assert.equal(failure.code, 'UNAVAILABLE');
  assert.equal(failure.message, 'stdin unavailable');
  assert.equal(failure.decision, 'HOLD');
  assert.equal(failure.eligibleForLiveRun, false);
});
test('inspect-unbound inspects only an explicit fictional document and grants no source authority', async () => {
  const accepted = await pending.unbound;
  const expected = detector.inspectFictionJson(fiction);
  assert.equal(accepted.status, exitFor(expected));
  assert.deepEqual(JSON.parse(accepted.stdout), JSON.parse(JSON.stringify(expected)));
  assert.equal(JSON.parse(accepted.stdout).sourceBinding, 'unbound-mathematical-observations-only');
  const supplied = await pending.supplied;
  assert.equal(supplied.status, 3);
  assert.equal(JSON.parse(supplied.stdout).valid, false);
});
