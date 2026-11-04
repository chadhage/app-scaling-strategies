'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const realRouting = require('..\\routing.js');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const cliFile = require.resolve('..\\cli.cjs');
const pinsFile = require.resolve('..\\pins.cjs');
const routingFile = require.resolve('..\\routing.js');
const accepted = { id: 'C036', state: 'Done',
  publication: { commit: 'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e', tag: 'kanban/C036/df7a4e1f4f07' } };
const context = { runId: 'stub-run', stateSha256: 'a'.repeat(64) };
const outcomes = {
  match: { disposition: 'MATCH_CONTROL', outcome: 'matched-control', sampleDisposition: 'MATCH_CONTROL' },
  rejected: { disposition: 'REJECTED', outcome: 'rejected' },
  mismatch: { disposition: 'MISMATCH', outcome: 'mismatched', sampleDisposition: 'MISMATCH' },
  hold: { disposition: 'HOLD', outcome: 'held', sampleDisposition: 'HOLD' }
};
function stubPins(overrides = {}) {
  const calls = { checkImports: 0, readState: 0 };
  return { calls, checkImports: () => { calls.checkImports++; return [{ path: 'stub-1' }, { path: 'stub-2' }, { path: 'stub-3' }]; },
    readState: () => { calls.readState++; return { ledgerRevision: 4242, prerequisites: [{ id: 'C034' }, accepted] }; }, ...overrides };
}
// The stub model answers by sample ID with a canned outcome and records every call the CLI makes.
function stubRouting(outcomeFor = () => outcomes.match, failOpen = null) {
  const calls = [];
  const model = {
    snapshot: () => ({ currentExpectedContext: context, history: [{ index: 1 }] }),
    getFixture: (id) => { calls.push(['getFixture', id]); return { sampleId: id, schemaVersion: 1 }; },
    inspectText: async (text) => { calls.push(['inspectText', JSON.parse(text)]); return { ...outcomeFor(JSON.parse(text).sampleId), operation: 'inspect' }; },
    compareText: async (text) => { calls.push(['compareText', JSON.parse(text)]); return { ...outcomeFor(JSON.parse(text).sampleId), operation: 'compare' }; }
  };
  return { calls, ids: realRouting.ids, open: async () => { if (failOpen) throw failOpen; return model; } };
}
// Runs the unchanged CLI in this process; only its pin/State reader and its routing model are replaced.
async function run(args, { pins = stubPins(), routing = stubRouting() } = {}) {
  const saved = { argv: process.argv, exitCode: process.exitCode, log: console.log, error: console.error,
    cli: require.cache[cliFile], pins: require.cache[pinsFile], routing: require.cache[routingFile] };
  const out = [];
  const err = [];
  let settle;
  const finished = new Promise((resolve) => { settle = resolve; });
  console.log = (...parts) => { out.push(parts.join(' ')); settle(); };
  console.error = (...parts) => { err.push(parts.join(' ')); settle(); };
  process.argv = [process.execPath, cliFile, ...args];
  process.exitCode = undefined;
  delete require.cache[cliFile];
  for (const [file, exports] of [[pinsFile, pins], [routingFile, routing]]) {
    require.cache[file] = { id: file, filename: file, loaded: true, exports, children: [], paths: [] };
  }
  try {
    require(cliFile);
    const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('The CLI produced no output.')), 30000).unref());
    await Promise.race([finished, timer]);
    await new Promise((resolve) => setImmediate(resolve));
    return { exitCode: process.exitCode ?? 0, stdout: out.join('\n'), stderr: err.join('\n'), pins, routing };
  } finally {
    process.argv = saved.argv;
    process.exitCode = saved.exitCode;
    console.log = saved.log;
    console.error = saved.error;
    for (const [file, previous] of [[cliFile, saved.cli], [pinsFile, saved.pins], [routingFile, saved.routing]]) {
      delete require.cache[file];
      if (previous) require.cache[file] = previous;
    }
  }
}
test('list prints the closed sample IDs after the pin and State readers ran', async () => {
  const result = await run(['list']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { cardId: 'C037', ids: realRouting.ids, directSourcesVerified: 3 });
  assert.deepEqual(result.pins.calls, { checkImports: 1, readState: 1 });
  assert.deepEqual(result.routing.calls, []);
});
test('context prints the owner context with the independently accepted C036 and the interpretation limits', async () => {
  const result = await run(['context']);
  assert.equal(result.exitCode, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.cardId, 'C037');
  assert.deepEqual(output.context, context);
  assert.deepEqual(output.independentlyAcceptedC036, accepted);
  assert.equal(output.ledgerRevision, 4242);
  assert.equal(output.directSourcesVerified, 3);
  assert.match(output.interpretation, /fictional lease\/user\/tiers, not current traffic or authenticated association/);
  assert.deepEqual(result.routing.calls, []);
});
test('fixture prints exactly the closed sample the model owns and compares nothing', async () => {
  const result = await run(['fixture', 'fictional-match']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { sampleId: 'fictional-match', schemaVersion: 1 });
  assert.deepEqual(result.routing.calls, [['getFixture', 'fictional-match']]);
});
test('every comparison outcome maps to its documented exit code and prints the retained history', async () => {
  for (const [operation, sample, kind, exitCode] of [
    ['compare', 'fictional-match', 'match', 0], ['inspect', 'fictional-match', 'match', 0],
    ['compare', 'wrong-run', 'rejected', 1], ['compare', 'fictional-unknown', 'hold', 2],
    ['inspect', 'historical-closed', 'hold', 2], ['compare', 'fictional-skew', 'mismatch', 3]]) {
    const result = await run([operation, sample], { routing: stubRouting(() => outcomes[kind]) });
    const output = JSON.parse(result.stdout);
    assert.equal(result.exitCode, exitCode, `${operation} ${sample}`);
    assert.equal(output.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(output.cardId, 'C037');
    assert.equal(output.operation, operation);
    assert.equal(output.result.outcome, outcomes[kind].outcome);
    assert.deepEqual(output.history, [{ index: 1 }]);
    assert.deepEqual(result.routing.calls, [['getFixture', sample], [`${operation}Text`, { sampleId: sample, schemaVersion: 1 }]]);
  }
});
test('arguments outside the closed list reject before any current reader or model runs', async () => {
  for (const args of [[], ['unknown'], ['list', 'extra'], ['context', 'extra'], ['fixture'], ['compare'], ['compare', 'unknown'],
    ['compare', 'fictional-match', 'approved'], ['fixture', '..\\C036'], ['http://127.0.0.1']]) {
    const result = await run(args);
    assert.equal(result.exitCode, 1, args.join(' '));
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, 'CLOSED_CLI_ARGUMENTS', args.join(' '));
    assert.deepEqual(result.pins.calls, { checkImports: 0, readState: 0 }, args.join(' '));
    assert.deepEqual(result.routing.calls, [], args.join(' '));
  }
});
test('reader and model failures reject with their own code, or LOCAL_CONTEXT_UNAVAILABLE when the error has none', async () => {
  const coded = await run(['list'], { pins: stubPins({ checkImports() { throw Object.assign(new Error('changed'), { code: 'PINNED_GIT_OR_DISK_BYTES_CHANGED' }); } }) });
  assert.equal(coded.exitCode, 1);
  assert.deepEqual(JSON.parse(coded.stderr), { cardId: 'C037', outcome: 'rejected', code: 'PINNED_GIT_OR_DISK_BYTES_CHANGED', message: 'changed' });
  const plain = await run(['context'], { pins: stubPins({ readState() { throw new Error('plain failure'); } }) });
  assert.equal(plain.exitCode, 1);
  assert.deepEqual(JSON.parse(plain.stderr), { cardId: 'C037', outcome: 'rejected', code: 'LOCAL_CONTEXT_UNAVAILABLE', message: 'plain failure' });
  assert.equal(plain.stdout, '');
  const unavailable = await run(['compare', 'fictional-match'], { routing: stubRouting(undefined, Object.assign(new Error('no context'), { code: 'CURRENT_CONTEXT_UNAVAILABLE' })) });
  assert.equal(unavailable.exitCode, 1);
  assert.equal(JSON.parse(unavailable.stderr).code, 'CURRENT_CONTEXT_UNAVAILABLE');
  assert.equal(unavailable.stdout, '');
});
test('the actual process reads the real pins, State and model: list, a matching control and a known mismatch', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const spawn = (...args) => spawnSync(process.execPath, [cliFile, ...args], { cwd: repository, env, encoding: 'utf8', windowsHide: true, timeout: 180000 });
  const list = spawn('list');
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout).ids, realRouting.ids);
  assert.equal(JSON.parse(list.stdout).directSourcesVerified, 23);
  const match = spawn('compare', 'fictional-match');
  assert.equal(match.status, 0, match.stderr);
  assert.equal(JSON.parse(match.stdout).result.contextOrigin, 'actual-C015-public-restore-read-only');
  assert.equal(JSON.parse(match.stdout).result.guard.outcome, 'fixture-verified');
  const skew = spawn('compare', 'fictional-skew');
  assert.equal(skew.status, 3, skew.stderr);
  assert.equal(JSON.parse(skew.stdout).result.knownMismatch, true);
});
