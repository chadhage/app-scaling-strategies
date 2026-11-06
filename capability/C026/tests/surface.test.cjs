'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts));
const text = (...parts) => read(...parts).toString('utf8');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const PRODUCTION = ['framing.cjs', 'stream.cjs', 'server.cjs', 'conversation.cjs', 'page.js'];
const ALLOWED = new Set(['node:crypto', 'node:net', 'node:fs', 'node:http', 'node:path', './framing.cjs', './stream.cjs', './conversation.cjs']);

function nodeTest(file, env = {}) {
  const clean = { ...process.env, ...env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete clean[name];
  return spawnSync(process.execPath, ['--test', file], { cwd: repository, env: clean, encoding: 'utf8', windowsHide: true, timeout: 120000 });
}

test('the specified files exist and the namespace keeps its bytes exact', () => {
  for (const name of ['C026.feature', 'README.md', 'imports.json', 'index.html', 'styles.css', ...PRODUCTION]) {
    assert.equal(fs.existsSync(path.join(root, name)), true, name);
  }
  assert.deepEqual(text('.gitattributes').split(/\r?\n/).filter(Boolean), ['* -text', 'evidence/red/*.txt -whitespace', 'evidence/raw/** -whitespace']);
});

test('the feature file specifies the behavior, including every typed failure', () => {
  const feature = text('C026.feature');
  assert.match(feature, /^Feature: Sequenced WebSocket fixture with acknowledgements and resume cursors/);
  assert.equal((feature.match(/^\s+Scenario(?: Outline)?:/gm) ?? []).length >= 13, true);
  for (const code of ['ACK_UNSENT', 'ACK_OUT_OF_ORDER', 'ACK_DUPLICATE', 'ACK_MALFORMED', 'CLIENT_SEQUENCE_FORBIDDEN', 'SESSION_UNKNOWN',
    'CURSOR_MALFORMED', 'CURSOR_FOREIGN_SESSION', 'CURSOR_FROM_FUTURE', 'CURSOR_AHEAD_OF_ACK']) {
    assert.equal(feature.includes(code), true, code);
  }
  assert.match(feature, /SYNTHETIC, LOCAL, OFFLINE/);
  assert.match(feature, /isolated browser helper blocks WebSockets/);
});

test('production code uses Node built-ins and the pinned C001 guard only, and nothing that leaves the machine', () => {
  const forbidden = ['child_process', 'node:https', 'node:tls', 'node:dns', 'node:http2', 'node:worker_threads', 'node:vm', 'eval(', 'new Function',
    '0.0.0.0', 'localhost', 'innerHTML', 'document.write', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'new WebSocket', 'process.env',
    'Date.now', 'new Date', 'Math.random'];
  for (const file of PRODUCTION) {
    const source = text(file);
    for (const token of forbidden) assert.equal(source.includes(token), false, `${file} must not contain ${token}`);
    for (const [, , name] of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) assert.equal(ALLOWED.has(name), true, `${file} requires ${name}`);
  }
  const server = text('server.cjs');
  assert.equal((server.match(/require\(path\.join\(__dirname, '\.\.', 'C001', 'contract-guard\.js'\)\)/g) ?? []).length, 1);
  assert.equal((server.match(/require\(path\.join/g) ?? []).length, 1);
  assert.equal(text('page.js').includes('new WebSocket'), false, 'the browser page never opens a WebSocket');
  assert.equal(/\bWebSocket\s*\(/.test(text('page.js')), false);
});

test('every listener binds 127.0.0.1 with an automatic port', () => {
  for (const file of ['server.cjs', 'conversation.cjs']) {
    const source = text(file);
    assert.equal((source.match(/\.listen\(/g) ?? []).length, (source.match(/\.listen\(0, '127\.0\.0\.1'/g) ?? []).length, file);
  }
  assert.equal(text('conversation.cjs').includes("host: '127.0.0.1'"), true);
  assert.equal((text('server.cjs').match(/\.listen\(0, '127\.0\.0\.1'/g) ?? []).length >= 2, true);
});

test('the page is clean under a strict CSP and states its limit plainly', () => {
  const html = text('index.html');
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  assert.deepEqual(scripts, ['<script defer src="page.js">']);
  assert.equal(/<script\b[^>]*>\s*\S/.test(html.replace(/<script\b[^>]*><\/script>/g, '')), false, 'no inline script');
  assert.equal(/\sstyle\s*=|\son[a-z]+\s*=/i.test(html), false, 'no inline style or event handler attributes');
  const references = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(references, ['data:,', 'page.js', 'styles.css']);
  assert.match(html, /This page does not open a WebSocket/);
  assert.match(html, /isolated browser blocks WebSockets, writes and foreign origins/);
  assert.match(html, /Synthetic business data · Loopback only/);
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
});

test('the retained RED is behavioral, was archived before any production file existed, and is unchanged', () => {
  const run = JSON.parse(text('evidence', 'red', 'initial-red.run.json'));
  assert.deepEqual([run.cardId, run.stage, run.exitCode], ['C026', 'red', 1]);
  assert.deepEqual(run.environment, { C026_RED_SUBJECT: 'capability\\C026\\evidence\\red\\stubs' });
  const stdout = read('evidence', 'red', 'initial-red.stdout.txt');
  const stderr = read('evidence', 'red', 'initial-red.stderr.txt');
  assert.equal(sha(stdout), run.stdoutSha256);
  assert.equal(sha(stderr), run.stderrSha256);
  const output = stdout.toString('utf8');
  assert.match(output, /^# tests 14$/m);
  assert.match(output, /^# pass 0$/m);
  assert.match(output, /^# fail 14$/m);
  assert.equal((output.match(/^not ok \d+ - /gm) ?? []).length, 14);
  assert.equal((output.match(/failureType: 'testCodeFailure'/g) ?? []).length, 14);
  // Nine fail on an assertion about the specified behavior; five read a frame the stub never sent (TypeError in the test body).
  assert.equal((output.match(/name: 'AssertionError'/g) ?? []).length >= 9, true);
  for (const trap of ['MODULE_NOT_FOUND', 'Cannot find module', 'SyntaxError', 'ReferenceError']) assert.equal(output.includes(trap), false, trap);
  const archived = new Map(run.sourceHashes.map((entry) => [entry.path.replaceAll('\\', '/'), entry.rawSha256]));
  const rootFiles = [...archived.keys()].filter((name) => /^capability\/C026\/[^/]+$/.test(name)).sort();
  assert.deepEqual(rootFiles, ['capability/C026/.gitattributes', 'capability/C026/C026.feature'], 'no production file existed at RED time');
  for (const name of ['evidence/red/behavior.initial.snapshot.cjs', 'evidence/red/stubs/framing.cjs', 'evidence/red/stubs/stream.cjs',
    'evidence/red/stubs/server.cjs', 'C026.feature']) {
    assert.equal(archived.get(`capability/C026/${name}`), sha(read(...name.split('/'))), `${name} changed after the RED was archived`);
  }
});

test('the retained initial tests fail on the stubs and pass against the implementation', () => {
  const file = path.join('capability', 'C026', 'evidence', 'red', 'behavior.initial.snapshot.cjs');
  const red = nodeTest(file, { C026_RED_SUBJECT: path.join('capability', 'C026', 'evidence', 'red', 'stubs') });
  assert.equal(red.status, 1);
  assert.match(red.stdout, /^# fail 14$/m);
  assert.equal(/MODULE_NOT_FOUND|SyntaxError/.test(red.stdout + red.stderr), false);
  const green = nodeTest(file);
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /^# pass 14$/m);
  assert.match(green.stdout, /^# fail 0$/m);
});

test('the RED supplement fails on assertions only against the same stubs, was archived as a supplement, and passes against the implementation', () => {
  const run = JSON.parse(text('evidence', 'red', 'supplement-red.run.json'));
  assert.deepEqual([run.cardId, run.stage, run.exitCode], ['C026', 'supplement', 1]);
  assert.deepEqual(run.environment, { C026_RED_SUBJECT: 'capability\\C026\\evidence\\red\\stubs' });
  const stdout = read('evidence', 'red', 'supplement-red.stdout.txt');
  assert.equal(sha(stdout), run.stdoutSha256);
  assert.equal(sha(read('evidence', 'red', 'supplement-red.stderr.txt')), run.stderrSha256);
  const output = stdout.toString('utf8');
  assert.match(output, /^# fail 5$/m);
  assert.equal((output.match(/name: 'AssertionError'/g) ?? []).length, 5);
  for (const trap of ['TypeError', 'MODULE_NOT_FOUND', 'Cannot find module', 'SyntaxError', 'ReferenceError']) assert.equal(output.includes(trap), false, trap);
  const archived = new Map(run.sourceHashes.map((entry) => [entry.path.replaceAll('\\', '/'), entry.rawSha256]));
  for (const name of ['evidence/red/behavior.assertions.snapshot.cjs', 'evidence/red/stubs/framing.cjs', 'evidence/red/stubs/stream.cjs', 'evidence/red/stubs/server.cjs']) {
    assert.equal(archived.get(`capability/C026/${name}`), sha(read(...name.split('/'))), `${name} changed after the supplement was archived`);
  }
  assert.equal(archived.has('capability/C026/framing.cjs'), true, 'the supplement is labelled: it was replayed after the implementation existed');
  const green = nodeTest(path.join('capability', 'C026', 'evidence', 'red', 'behavior.assertions.snapshot.cjs'));
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /^# pass 5$/m);
});

test('the README gives the exact commands and states the browser limit plainly', () => {
  const readme = text('README.md');
  for (const command of [
    'node capability\\C026\\server.cjs',
    "$env:C026_RED_SUBJECT = 'capability\\C026\\evidence\\red\\stubs'",
    'node --test capability\\C026\\evidence\\red\\behavior.initial.snapshot.cjs',
    'node --test capability\\C026\\tests\\framing.test.cjs capability\\C026\\tests\\stream.test.cjs capability\\C026\\tests\\server.test.cjs capability\\C026\\tests\\conversation.test.cjs capability\\C026\\tests\\page.test.cjs capability\\C026\\tests\\surface.test.cjs',
    'node capability\\C026\\tests\\coverage.cjs',
    'node capability\\C026\\tests\\browser.cjs',
    'node capability\\C026\\tests\\syntax.cjs'
  ]) {
    assert.equal(readme.includes(command), true, command);
  }
  assert.match(readme, /isolated browser helper blocks WebSockets, writes and foreign origins/);
  assert.match(readme, /not a browser WebSocket/);
  assert.match(readme, /not the approved Node\.js 24 LTS \/ Express \/ App Service Linux control API/);
  assert.match(readme, /no Azure call/i);
});
