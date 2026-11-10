'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const cost = require('./u056-cost.cjs');

const root = path.resolve(__dirname, '..');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function load() {
  const file = path.join(__dirname, 'u039-evidence.test.cjs');
  const retained = path.join(root, 'evidence', 'u056-cache-invalidation', 'retained', 'u039-evidence.test.cjs.txt');
  const text = fs.readFileSync(process.env.U056_CACHE_REPLAY === 'before' ? retained : file, 'utf8');
  const prefix = text.slice(0, text.indexOf("test('the addendum chain"));
  const actualRequire = Module.createRequire(file);
  const operations = { hashes: 0, inflations: 0 };
  const required = (name) => {
    if (name === 'node:crypto') return { ...crypto, createHash(...args) { operations.hashes += 1; return crypto.createHash(...args); } };
    if (name === 'node:zlib') return { ...zlib, gunzipSync(...args) { operations.inflations += 1; return zlib.gunzipSync(...args); } };
    return actualRequire(name);
  };
  return { ...vm.compileFunction(`${prefix}\nreturn { verify, sha, lfOf, inflatedSha };`, ['require', '__dirname'], { filename: file })(required, __dirname), operations };
}
const injected = (files) => ({ files: [...files.keys()], read: (name) => files.get(name) ?? null });
function changedFixture(name, convert = (bytes) => Buffer.from(bytes)) {
  const files = cost.acceptedFixture();
  const bytes = convert(files.get(name));
  files.set(name, bytes);
  return { files, bytes };
}

test('cache regression: SHA-256 changes when an alias mutates the same source Buffer', () => {
  const subject = load();
  const bytes = Buffer.from('mutable source');
  assert.equal(subject.sha(bytes), digest(bytes));
  bytes.subarray(0, 1)[0] ^= 1;
  assert.equal(subject.sha(bytes), digest(bytes), 'cached raw hash must describe current bytes');
});

test('cache regression: CRLF canonicalization changes when the same source Buffer changes', () => {
  const subject = load();
  const bytes = Buffer.from('alpha\r\nbravo\r\n');
  assert.equal(subject.lfOf(bytes).toString(), 'alpha\nbravo\n');
  bytes[0] = 65;
  assert.equal(subject.lfOf(bytes).toString(), 'Alpha\nbravo\n', 'cached canonical bytes must describe current input');
});

test('cache regression: inflated digest changes for a different valid gzip in the same Buffer', () => {
  const subject = load();
  const bytes = zlib.gzipSync(Buffer.from('alpha'), { level: 0 });
  const replacement = zlib.gzipSync(Buffer.from('bravo'), { level: 0 });
  assert.equal(bytes.length, replacement.length);
  assert.equal(subject.inflatedSha(bytes), digest(Buffer.from('alpha')));
  replacement.copy(bytes);
  assert.equal(subject.inflatedSha(bytes), digest(Buffer.from('bravo')), 'cached inflation must describe the current valid gzip');
});

for (const mode of ['raw', 'canonical-LF']) {
  test(`cache regression: parent mutable-input proof (${mode}) agrees with a freshly compiled verifier`, () => {
    const subject = load();
    const name = 'capability/C042/input.cjs';
    const { files, bytes } = changedFixture(name, (bytes) => mode === 'raw' ? Buffer.from(bytes) : Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
    assert.deepEqual(subject.verify(injected(files)), []);
    bytes[bytes.length >> 1] ^= 1;
    const expected = load().verify(injected(files));
    assert.equal(expected.length, 18, 'the independent fresh oracle sees the sealed file and all 17 capture input pins');
    assert.deepEqual(subject.verify(injected(files)), expected, 'a warmed verifier must not miss the in-place mutation');
  });
}

test('cache regression: a warmed verifier detects an in-place gzip mutation rather than reusing its old raw/inflated digests', () => {
  const subject = load();
  const name = 'capability/C042/evidence/u039-pipelining/raw/red-01-head-bytes.stdout.raw.gz';
  const { files, bytes } = changedFixture(name);
  assert.deepEqual(subject.verify(injected(files)), []);
  bytes[bytes.length - 1] ^= 1;
  const expected = load().verify(injected(files));
  assert.equal(expected.some((problem) => /transcript changed/.test(problem)), true);
  assert.deepEqual(subject.verify(injected(files)), expected);
});

test('cache control: unchanged baseline reuses the expensive hashes/inflations and the one verified 362-file snapshot', () => {
  const subject = load();
  const files = cost.acceptedFixture();
  assert.deepEqual(subject.verify(injected(files)), []);
  const once = { ...subject.operations };
  assert.equal(once.hashes > 0 && once.inflations > 0, true);
  assert.deepEqual(subject.verify(injected(files)), []);
  assert.deepEqual(subject.operations, once, 'unchanged content must not repeat cryptographic hashes or gzip inflation');
  const structural = cost.measure();
  assert.deepEqual([structural.fixtureFiles, structural.counts.fileReads, structural.maximumReadsOfOneFile], [362, 362, 1]);
});
