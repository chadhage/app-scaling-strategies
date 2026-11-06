'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const contract = require('../contract.js');
const gate = require('./coverage-gate.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts));
const text = (...parts) => read(...parts).toString('utf8');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const PRODUCTION = gate.enumerate(gate.listNamespaceFiles(root));

test('the specified files exist, the production set is enumerated and the bytes stay exact', () => {
  assert.deepEqual(PRODUCTION, ['contract.js', 'engine.cjs', 'input.cjs', 'journal.cjs', 'page.js', 'result.cjs', 'server.cjs', 'transcript.cjs']);
  for (const name of ['C042.feature', 'README.md', 'imports.json', 'index.html', 'styles.css', '.gitignore', ...PRODUCTION]) assert.equal(fs.existsSync(path.join(root, name)), true, name);
  assert.deepEqual(text('.gitattributes').split(/\r?\n/).filter(Boolean), ['* -text', 'evidence/red/** -whitespace', 'evidence/raw/** -whitespace']);
  assert.deepEqual(text('.gitignore').split(/\r?\n/).filter(Boolean), ['tests/scratch/', 'data/']);
});

test('the feature file specifies every behavior and states the limits', () => {
  const feature = text('C042.feature');
  assert.match(feature, /^Feature: Conduct one validated workflow step with an explicit result and supported recovery controls/);
  assert.equal((feature.match(/^\s+Scenario(?: Outline)?:/gm) ?? []).length >= 14, true);
  for (const word of ['SYNTHETIC, LOCAL, OFFLINE', 'C017 reconciliation is NOT implemented', 'REQUIRED_FIELD', 'UNKNOWN_FIELD', 'DUPLICATE_FIELD', 'FORBIDDEN_FIELD',
    'BODY_TOO_LARGE', 'IDEMPOTENCY_KEY_CONFLICT', 'CAPACITY_EXHAUSTED', 'torn final line', 'isolated browser helper allows only GET', 'unsupported']) {
    assert.equal(feature.includes(word), true, word);
  }
});

test('production code uses Node built-ins, local modules and the pinned C001 guard only, with no clock, randomness or outbound call', () => {
  const forbidden = ['child_process', 'node:https', 'node:tls', 'node:dns', 'node:http2', 'node:worker_threads', 'node:vm', 'eval(', 'new Function',
    '0.0.0.0', 'localhost', 'innerHTML', 'document.write', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'new WebSocket', 'process.env',
    'Date.now', 'new Date', 'Math.random', 'performance.now'];
  for (const file of PRODUCTION) {
    const source = text(file);
    for (const token of forbidden) assert.equal(source.includes(token), false, `${file} must not contain ${token}`);
    assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1|\$\{)/, `${file} names no outside address`);
    for (const match of source.matchAll(/require\('([^']+)'\)/g)) assert.match(match[1], /^(node:[a-z:]+|\.\/[\w.-]+)$/, `${file}: ${match[1]}`);
  }
  assert.equal(text('server.cjs').includes("'C001', 'contract-guard.js'"), true);
  assert.equal(PRODUCTION.filter((file) => text(file).includes('C001')).join(), 'server.cjs');
  assert.equal(/\bfetch\(/.test(text('page.js')), true);
  assert.equal(PRODUCTION.filter((file) => /\bfetch\(/.test(text(file))).join(), 'page.js');
  assert.equal(PRODUCTION.filter((file) => text(file).includes('node:http')).join(), 'server.cjs,transcript.cjs');
});

test('imports of accepted producer files are pinned by their Git-canonical bytes', () => {
  const pins = JSON.parse(text('imports.json'));
  assert.match(pins.acceptedC001.commit, /^[0-9a-f]{40}$/);
  assert.equal(pins.acceptedC001.tag, `kanban/C001/${pins.acceptedC001.commit.slice(0, 12)}`);
  assert.deepEqual(Object.keys(pins.imports).sort(), ['capability/C001/approved-contract.js', 'capability/C001/contract-guard.js']);
  for (const [file, pin] of Object.entries(pins.imports)) {
    assert.match(pin.canonicalLfSha256, /^[0-9a-f]{64}$/);
    assert.equal(sha(canonical(fs.readFileSync(path.join(repository, file)))), pin.canonicalLfSha256, file);
  }
  assert.deepEqual(Object.keys(pins.notImported).sort(), ['capability/C015', 'capability/C016', 'capability/C019', 'capability/C035']);
});

function redRuns() {
  return fs.readdirSync(path.join(root, 'evidence', 'red'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('red-')).map((entry) => entry.name);
}

test('the retained RED is behavioral, was archived before any production file existed, and its inputs are unchanged', () => {
  const runs = redRuns();
  assert.equal(runs.length >= 1, true);
  const dir = path.join('evidence', 'red', runs[0]);
  const run = JSON.parse(text(dir, 'run.json'));
  assert.deepEqual([run.cardId, run.stage, run.exitCode], ['C042', 'red', 1]);
  assert.deepEqual(run.environment, { C042_RED_SUBJECT: 'capability\\C042\\evidence\\red\\stubs' });
  const stdout = read(dir, 'stdout.txt');
  assert.equal(sha(stdout), run.stdoutSha256);
  assert.equal(sha(read(dir, 'stderr.txt')), run.stderrSha256);
  const output = stdout.toString('utf8');
  assert.match(output, /^# tests 12$/m);
  assert.match(output, /^# pass 0$/m);
  assert.match(output, /^# fail 12$/m);
  assert.equal((output.match(/^not ok \d+ - /gm) ?? []).length, 12);
  assert.equal((output.match(/code: 'ERR_ASSERTION'/g) ?? []).length >= 12, true, 'every failure is an assertion about the specified behavior');
  assert.doesNotMatch(output, /TypeError|ReferenceError|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/);
  assert.match(output, /expected: 201\s+actual: 501/);
  const hashed = new Map(run.sourceHashes.map((item) => [item.path.replaceAll('\\', '/'), item.rawSha256]));
  for (const name of PRODUCTION) assert.equal(hashed.has(`capability/C042/${name}`), false, `${name} did not exist when the RED was archived`);
  for (const name of ['C042.feature', 'evidence/red/stubs/engine.cjs', 'evidence/red/stubs/journal.cjs', 'evidence/red/stubs/server.cjs',
    'evidence/red/initial-a.snapshot.cjs', 'evidence/red/initial-b.snapshot.cjs', 'evidence/red/initial-support.snapshot.cjs']) {
    assert.equal(hashed.get(`capability/C042/${name}`), sha(read(...name.split('/'))), `${name} is unchanged since the RED`);
  }
  for (const stub of ['engine.cjs', 'journal.cjs', 'server.cjs']) assert.equal(text('evidence', 'red', 'stubs', stub).length < 700, true, 'the stubs implement nothing');
});

function nested(subject) {
  const env = { ...process.env, ...(subject ? { C042_RED_SUBJECT: subject } : {}) };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
  const files = ['initial-a', 'initial-b'].map((name) => path.join('capability', 'C042', 'evidence', 'red', `${name}.snapshot.cjs`));
  return spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: repository, env, encoding: 'utf8', timeout: 120000, windowsHide: true });
}

test('the RED replays against the stubs and the same initial tests pass against the implementation', () => {
  const red = nested(path.join('capability', 'C042', 'evidence', 'red', 'stubs'));
  assert.equal(red.status, 1);
  assert.match(red.stdout, /^# fail 12$/m);
  const green = nested(null);
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /^# pass 12$/m);
});

test('the README gives the exact commands, states the browser limit and documents every typed code', () => {
  const readme = text('README.md');
  for (const phrase of ['# C042: conduct one validated workflow step', '## Verify', '## Browser limit (read this)', 'The isolated browser helper allows only GET',
    "$env:C042_RED_SUBJECT = 'capability\\C042\\evidence\\red\\stubs'", 'node capability\\C042\\tests\\coverage.cjs', 'node capability\\C042\\tests\\browser.cjs',
    'node capability\\C042\\tests\\syntax.cjs', 'node --test --test-concurrency=1', 'heavy-run slot', 'C017', 'not implemented', 'imports.json']) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
  for (const code of Object.keys(contract.ERRORS)) assert.equal(readme.includes(`\`${code}\``), true, `README documents ${code}`);
  for (const name of contract.ACTION_NAMES) assert.equal(readme.includes(`\`${name}\``), true, name);
  const { bounds } = require('../server.cjs');
  for (const phrase of [`at most ${bounds.pipelineDepth} requests may be pipelined`, `at most ${bounds.connections} open sockets`, `at most ${bounds.headerBytes} bytes and ${bounds.headerCount} fields`,
    `after ${bounds.firstRequestMs / 1000} s`, `after ${bounds.idleMs / 1000} s`, '## Resource bounds', 'tests\\resources.test.cjs', '## Recovery invariants', 'tests\\property.test.cjs',
    'Connection: close', 'renderedInvariants']) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
});

test('an archived browser observation holds no repeated ids and a gap-free event table', () => {
  const raw = path.join(root, 'evidence', 'raw');
  const observed = (fs.existsSync(raw) ? fs.readdirSync(raw) : []).filter((name) => fs.existsSync(path.join(raw, name, 'browser-observation.json')));
  for (const name of observed) {
    const { domSnapshot } = JSON.parse(fs.readFileSync(path.join(raw, name, 'browser-observation.json'), 'utf8'));
    assert.equal(Boolean(domSnapshot), true, `${name} archives the DOM snapshot it checked`);
    for (const list of [domSnapshot.elementIds, domSnapshot.eventNumbers]) assert.equal(new Set(list).size, list.length, `${name} repeats ids`);
    assert.deepEqual(domSnapshot.eventNumbers, domSnapshot.eventNumbers.map((_, index) => index + 1));
    const [applied, replayed, other] = [domSnapshot.submitStatuses.filter((s) => s === '201').length, domSnapshot.submitStatuses.filter((s) => s === '200').length, domSnapshot.submitStatuses.filter((s) => !['200', '201'].includes(s)).length];
    assert.equal(applied + replayed + other, domSnapshot.submitStatuses.length);
  }
  const ids = [...text('index.html').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'index.html repeats an id');
});

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (entry.isDirectory()) return ['evidence/raw', 'tests/scratch', 'data'].includes(relative) || relative.startsWith('evidence/red/red-') ? [] : files(file);
    return [file];
  });
}

test('every text file keeps one line-ending style, ends with a newline and has no trailing whitespace', () => {
  const checked = [];
  for (const file of files(root)) {
    if (!/\.(?:c?js|html|css|md|json|feature)$|\.git(?:attributes|ignore)$/.test(file)) continue;
    const bytes = fs.readFileSync(file);
    const content = bytes.toString('utf8');
    const crlf = (content.match(/\r\n/g) ?? []).length;
    const lf = (content.match(/(?<!\r)\n/g) ?? []).length;
    const name = path.relative(root, file);
    assert.equal(crlf === 0 || lf === 0, true, `${name} mixes line endings`);
    assert.equal(content.endsWith('\n'), true, `${name} lacks a final newline`);
    assert.doesNotMatch(content, /[ \t]+\r?$/m, `${name} has trailing whitespace`);
    checked.push(name);
  }
  assert.equal(checked.length >= 30, true, `only ${checked.length} files checked`);
});
