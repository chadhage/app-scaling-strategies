'use strict';

// Self-review line 9: "a test injects a failing assertion and proves the cleanup ran". The REAL harness file tests\browser.cjs runs in a child node whose two
// collaborators (qualifyEdge and openIsolatedLesson) are replaced through Module._load by fakes, so no browser starts, nothing is written and nothing outside this
// namespace is needed (a fresh checkout has no testing\browser). The fake session
// counts its close() calls and the fake page fails on demand: a rejected page call and a failing assertion after the session opened must each close it exactly
// once and still fail the run; a failing qualification happens before any session exists and closes nothing. The negative control is a copy of the harness with its
// cleanup line removed: the same observation must show zero closes there, so the check does discriminate. The one real Edge run is tests\browser.cjs itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runNode } = require('.\\nested-runner.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');

function harness() {
  const fs = require('node:fs');
  const Module = require('node:module');
  const nodePath = require('node:path');
  const [root, mode, mutant] = process.argv.slice(1);
  // Module._load answers the two collaborators by the exact request string, so they need not exist on disk (a fresh checkout has no testing\browser).
  const fakes = new Map();
  const fake = (parts, exports) => fakes.set(nodePath.join(root, ...parts), exports);
  const realLoad = Module._load;
  Module._load = function load(request, parent, isMain) { return fakes.has(request) ? fakes.get(request) : realLoad.call(this, request, parent, isMain); };
  let closes = 0;
  const report = { ok: mode !== 'unqualified', reasons: ['injected: not qualified'], version: '156.0.0.1', major: 156, sha256: '0'.repeat(64), path: 'fake', qualifiedMajors: [156], signature: { status: 'Valid', publisher: 'Microsoft Corporation' } };
  const page = {
    setDefaultTimeout() {}, on() {}, url: () => 'file:///fake/index.html', reload: async () => {},
    addInitScript: async () => { if (mode === 'page-failure') throw new Error('injected page failure'); },
    evaluate: async () => ({ slider: { 'aria-disabled': 'false' }, items: [], texts: { status: 'x' } }),
  };
  fake(['testing', 'browser', 'qualify', 'qualify.cjs'], { qualifyEdge: async () => report });
  fake(['testing', 'browser', 'isolated.cjs'], { openIsolatedLesson: async () => ({ page, browserVersion: '156.0.0.1', close: async () => { closes += 1; } }) });
  process.on('exit', () => console.log(`CLOSES ${closes}`));
  const file = nodePath.join(root, 'capability', 'X001', 'tests', 'browser.cjs');
  if (mutant !== 'cleanup-removed') return require(file);
  const source = fs.readFileSync(file, 'utf8');
  const mutated = source.replace('if (session) await session.close();', ';');
  if (mutated === source) throw new Error('the cleanup line was not found');
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(nodePath.dirname(file));
  return loaded._compile(mutated, file);
}

const run = (mode, mutant = 'none') => runNode(['-e', `(${harness})()`, repository, mode, mutant], { cwd: __dirname, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '' } });
const closes = (result) => Number(/^CLOSES (\d+)$/m.exec(result.stdout)?.[1]);

test('a rejected page call after the session opened: the session is closed exactly once and the run fails', () => {
  const result = run('page-failure');
  assert.equal(result.status, 1, result.stderr.slice(0, 400));
  assert.equal(closes(result), 1);
  assert.match(result.stderr, /injected page failure/);
  assert.doesNotMatch(result.stdout, /PASS all/);
});

test('a failing assertion after the session opened: the session is closed exactly once and the run fails', () => {
  const result = run('assertion-failure');
  assert.equal(result.status, 1, result.stderr.slice(0, 400));
  assert.equal(closes(result), 1);
  assert.match(result.stderr, /AssertionError/);
  assert.match(result.stderr, /'false' !== 'true'/);
});

test('a failing qualification happens before any session exists: nothing is closed and the run still fails', () => {
  const result = run('unqualified');
  assert.equal(result.status, 1, result.stderr.slice(0, 400));
  assert.equal(closes(result), 0);
  assert.match(result.stderr, /injected: not qualified/);
});

test('negative control: the harness without its cleanup line leaves the session open, so the observation above discriminates', () => {
  const result = run('assertion-failure', 'cleanup-removed');
  assert.equal(result.status, 1, result.stderr.slice(0, 400));
  assert.equal(closes(result), 0);
  assert.match(result.stderr, /AssertionError/);
});
