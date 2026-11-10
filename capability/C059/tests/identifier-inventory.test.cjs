'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { inspect, inventory, sha } = require('./subject.cjs').load('tests/identifier-inventory.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const ACCEPTED = 'ea81f6ec59c3a9356827724a6b35ca45b1353d46';
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
function accepted() {
  const names = git('ls-tree', '-r', '--name-only', ACCEPTED, '--', 'capability/C059').toString('utf8').trim().split('\n');
  const bytes = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    input: names.map((name) => `${ACCEPTED}:${name}\n`).join(''),
  });
  let at = 0;
  const result = new Map();
  for (const name of names) {
    const end = bytes.indexOf(10, at);
    const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(bytes.subarray(at, end).toString('ascii'));
    assert.ok(header, `accepted blob exists: ${name}`);
    const size = Number(header[2]);
    result.set(name.slice('capability/C059/'.length), sha(bytes.subarray(end + 1, end + 1 + size)));
    at = end + size + 2;
  }
  assert.equal(at, bytes.length, 'every batch byte belongs to an enumerated accepted blob');
  return result;
}

test('D5 EVERY-file inventory includes unchanged production, unchanged sealed evidence, modified sources and decoded gzip transcripts', { timeout: 900000 }, (t) => {
  const baseline = accepted();
  const all = inventory(root);
  const entries = inventory(root, baseline);
  assert.equal(entries.length, all.length, 'a sealed-blob match never removes a file from the scan');
  const names = new Set(entries.map(([name]) => name));
  for (const name of ['server.cjs', 'a11y-check.js', 'styles.css', 'evidence/red/run-1/raw/red.stdout.raw.gz']) assert.ok(names.has(name), name);
  const result = inspect(entries, baseline);
  assert.ok(result.gzip > 50);
  assert.deepEqual(result.unexpected, [], 'only byte-identical explicitly reported historical findings may remain');
  assert.deepEqual(result.findings.sort(), result.historical.map((item) => item.file).sort());
  t.diagnostic(JSON.stringify({ scanned: result.scanned, decodedGzip: result.gzip, historical: result.historical, newFindings: result.unexpected }));
});

test('D5 an identifier planted in an unchanged-looking text or gzip file is found by name, never omitted by the historical filter', () => {
  const scratch = path.join(__dirname, 'scratch', crypto.randomUUID());
  const user = os.userInfo().username;
  const profile = ['C:', 'Users', user, 'repos'].join('\\');
  fs.mkdirSync(scratch, { recursive: true });
  try {
    const text = Buffer.from(`retained ${profile}`);
    const gz = zlib.gzipSync(Buffer.from(`retained ${profile}`));
    fs.writeFileSync(path.join(scratch, 'unchanged.txt'), text);
    fs.writeFileSync(path.join(scratch, 'unchanged.gz'), gz);
    const oldFilter = new Map([['unchanged.txt', sha(text)], ['unchanged.gz', sha(gz)]]);
    const entries = inventory(scratch, oldFilter);
    assert.deepEqual(entries.map(([name]) => name).sort(), ['unchanged.gz', 'unchanged.txt']);
    assert.deepEqual(inspect(entries).unexpected.sort(), ['unchanged.gz', 'unchanged.txt']);
    const historical = inspect(entries, oldFilter);
    assert.equal(historical.historical.length, 2, 'old findings are reported, not silently unscanned');
    const changed = entries.map(([name, bytes]) => [name, name.endsWith('.gz') ? zlib.gzipSync(Buffer.from(`${profile} new`)) : Buffer.concat([bytes, Buffer.from(' new')])]);
    assert.deepEqual(inspect(changed, oldFilter).unexpected.sort(), ['unchanged.gz', 'unchanged.txt'], 'a changed historical file has no grandfathered exemption');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    try { fs.rmdirSync(path.dirname(scratch)); } catch {}
  }
});
