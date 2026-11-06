'use strict';

// Static checks of the namespace: no foreign dependencies, loopback-only listeners, pinned imports, an enumerated production
// set, byte hygiene, and the integrity of the retained RED archives. Everything here reads only this namespace and two
// accepted C001 files.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const gate = require('./coverage-gate.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const PRODUCTION = ['call.cjs', 'driver-call.cjs', 'driver-cli.cjs', 'driver.cjs', 'front.cjs', 'grpc-server.cjs', 'grpc.cjs', 'page.js',
  'protobuf.cjs', 'report.cjs', 'server.cjs', 'service.cjs', 'timers.cjs', 'transcript.cjs'];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('the enumerated production set is exactly the files that carry production code', () => {
  assert.deepEqual(gate.enumerate(), PRODUCTION);
  assert.deepEqual(gate.unmeasured(), ['index.html', 'styles.css']);
  assert.equal(gate.FLOORS.lines + gate.FLOORS.branches + gate.FLOORS.functions, 255);
});

test('production code uses Node built-ins, its own modules and the accepted C001 guard, never a gRPC or protobuf package', () => {
  for (const file of PRODUCTION.filter((name) => name !== 'page.js')) {
    for (const match of read(file).matchAll(/require\(([^)]*)\)/g)) {
      const target = match[1];
      const allowed = /^'node:[a-z0-9/]+'$/.test(target) || /^'\.\/[a-z-]+\.cjs'$/.test(target) || target === "path.join(__dirname, '..', 'C001', 'contract-guard.js'";
      assert.ok(allowed, `${file} requires ${target}`);
    }
  }
  const self = path.join(root, 'tests', 'surface.test.cjs');
  const everything = walk(root).filter((file) => file !== self && /\.c?js$|\.json$/.test(file) && !file.includes(`${path.sep}evidence${path.sep}raw`)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const forbidden of ['@grpc/', 'protobufjs', 'google-protobuf', "require('express')", "require('ws')", 'child_process.exec(']) {
    assert.equal(everything.includes(forbidden), false, forbidden);
  }
});

test('production listeners are loopback with automatic ports and the driver never leaves 127.0.0.1', () => {
  const production = PRODUCTION.filter((name) => name !== 'page.js').map((name) => [name, read(name)]);
  for (const [name, source] of production) {
    for (const match of source.matchAll(/\.listen\(([^)]*)\)/g)) assert.match(match[1], /^0, '127\.0\.0\.1'/, `${name}: ${match[0]}`);
    assert.doesNotMatch(source, /0\.0\.0\.0|localhost|'::'|\[::\]/, name);
    assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1)[a-z]/i, name);
  }
  assert.match(read('driver.cjs'), /url\.hostname !== '127\.0\.0\.1'/);
});

test('imports.json pins the accepted C001 files by their Git-canonical bytes', () => {
  const pins = JSON.parse(read('imports.json'));
  assert.equal(pins.acceptedC001.tag, 'kanban/C001/cfff04364ade');
  for (const [file, pin] of Object.entries(pins.imports)) {
    const text = fs.readFileSync(path.join(repository, file), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(sha(Buffer.from(text)), pin.canonicalLfSha256, file);
    const blob = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
    assert.equal(blob, pin.gitBlob, `${file} git blob`);
  }
});

test('the specification, README and index.html state the limits and the commands', () => {
  const feature = read('C028.feature');
  assert.match(feature, /^Feature: Native gRPC stream fixture and driver port/);
  assert.ok((feature.match(/^\s+Scenario/gm) ?? []).length >= 12);
  const readme = read('README.md');
  for (const needle of ['tests\\coverage.cjs', 'tests\\browser.cjs', 'tests\\syntax.cjs', 'C028_RED_SUBJECT', 'evidence\\red\\*.snapshot.cjs', 'Browser limit', 'a transcript page, not native gRPC',
    'not the approved Node.js 24 LTS / Express / App Service Linux control API', '--test-skip-pattern', 'INVALID_ARGUMENT', 'Trailers-Only']) {
    assert.ok(readme.includes(needle), needle);
  }
  const html = read('index.html');
  assert.match(html, /Synthetic business data · Loopback only/);
  assert.match(html, /Browsers cannot speak native gRPC/);
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]), ['<script defer src="page.js">']);
});

test('every text file is clean: one line-ending style, no trailing whitespace, a final newline, no BOM', () => {
  const checkedFiles = walk(root).filter((file) => !/[\\/]evidence[\\/]raw[\\/]/.test(file) && !/\.gz$|\.png$/.test(file) && !/[\\/]red-[0-9a-f-]+[\\/]|[\\/]supplement-red-[0-9a-f-]+[\\/]/.test(file));
  assert.ok(checkedFiles.length > 40);
  for (const file of checkedFiles) {
    const bytes = fs.readFileSync(file);
    const text = bytes.toString('utf8');
    const name = path.relative(root, file);
    assert.notEqual(bytes[0], 0xef, `${name}: BOM`);
    assert.ok(text.endsWith('\n'), `${name}: final newline`);
    assert.doesNotMatch(text, /(?:\r?\n){2}$/, `${name}: blank line at the end of the file`);
    const crlf = text.includes('\r\n');
    assert.equal(crlf ? /(?<!\r)\n/.test(text) : text.includes('\r'), false, `${name}: mixed or lone line endings`);
    const lines = text.split(crlf ? '\r\n' : '\n');
    lines.forEach((line, index) => assert.doesNotMatch(line, /[ \t]$/, `${name}:${index + 1} trailing whitespace`));
  }
});

test('evidence.json starts with the specification and its RED steps name the retained RED archives', () => {
  const index = JSON.parse(read('evidence.json'));
  assert.equal(index.cardId, 'C028');
  assert.equal(sha(fs.readFileSync(path.join(root, 'C028.feature'))), index.order[0].sha256);
  for (const step of index.order.filter((item) => /evidence\/red\/(?:supplement-)?red-/.test(item.archive ?? ''))) {
    const run = JSON.parse(fs.readFileSync(path.join(repository, step.archive, 'run.json'), 'utf8'));
    assert.deepEqual([run.exitCode, run.stdoutSha256, run.parsed.counts.tests, run.parsed.counts.fail], [step.exit, step.stdoutSha256, step.tests, step.fail], step.archive);
  }
  assert.equal(index.order.filter((item) => /evidence\/red\/(?:supplement-)?red-/.test(item.archive ?? '')).length, 2);
});

test('the retained RED archives are intact: raw output hashes match and the pinned inputs never changed', () => {
  const archives = fs.readdirSync(path.join(root, 'evidence', 'red'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^(?:supplement-)?red-/.test(entry.name));
  assert.deepEqual(archives.map((entry) => entry.name.replace(/-[0-9a-f-]{36}$/, '')).sort(), ['red', 'supplement-red']);
  for (const entry of archives) {
    const folder = path.join(root, 'evidence', 'red', entry.name);
    const run = JSON.parse(fs.readFileSync(path.join(folder, 'run.json'), 'utf8'));
    assert.equal(run.cardId, 'C028');
    assert.equal(run.exitCode, 1, 'a RED run fails');
    assert.equal(run.environment.C028_RED_SUBJECT, 'capability\\C028\\evidence\\red\\stubs');
    assert.equal(run.parsed.counts.pass, 0);
    assert.equal(run.parsed.counts.fail, run.parsed.counts.tests);
    assert.deepEqual(Object.keys(run.parsed.errorNames), ['AssertionError'], 'every failure is behavioral');
    assert.equal(sha(zlib.gunzipSync(fs.readFileSync(path.join(folder, 'stdout.txt.gz')))), run.stdoutSha256);
    assert.equal(sha(zlib.gunzipSync(fs.readFileSync(path.join(folder, 'stderr.txt.gz')))), run.stderrSha256);
    const pinned = run.sourceHashes.filter((item) => /evidence\\red\\(?:stubs\\|[a-z]+\.(?:initial|supplement)\.snapshot\.cjs)|C028\.feature$/.test(item.path));
    assert.ok(pinned.length >= 7, `${entry.name} pins the stubs, snapshots and feature`);
    for (const item of pinned) assert.equal(sha(fs.readFileSync(path.join(repository, item.path))), item.sha256, `${item.path} changed after the RED was archived`);
  }
  const counts = archives.map((entry) => JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', entry.name, 'run.json'), 'utf8')).parsed.counts.tests).sort((a, b) => a - b);
  assert.deepEqual(counts, [4, 36]);
});
