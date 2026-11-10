'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verify, defaultReaders, sha, parse } = require('./evidence-verify.cjs');
const { decide } = require('./evidence-decisions.cjs');
const { scan } = require('./identifier-scan.cjs');
const bytes = new Map();
const dependencies = new Map();
const cached = (table, read, file) => {
  if (!table.has(file)) table.set(file, read(file));
  return table.get(file);
};
const readers = {
  read: (file) => cached(bytes, defaultReaders.read, file),
  dependency: (file) => cached(dependencies, defaultReaders.dependency, file),
  files: defaultReaders.files
};
let baseline;
const current = () => baseline ||= verify(readers);

test('every inherited and current manifest, source pin, exact public addition and decoded transcript verifies', () => {
  const checked = current();
  assert.deepEqual(checked.problems, []);
  assert.ok(checked.records.size >= 13);
  assert.ok(checked.data.size >= 8);
});

test('every required source, consumer, RED, GREEN, whole-file coverage, mutation, load, fresh and actual browser decision is complete', () => {
  const checked = current();
  assert.deepEqual(checked.problems, []);
  assert.deepEqual(decide(checked), []);
});

function tamper(file, transform, reseal = false) {
  const changed = transform(readers.read(file));
  const pins = parse(readers.read('evidence/final/pins.json'));
  if (reseal) {
    const pin = pins.files.find((entry) => entry.path === file);
    assert.ok(pin, 'tamper target is in the actual final seal');
    pin.sha256 = sha(changed);
    pin.acceptedSha256 = [sha(changed)];
  }
  return verify({ ...readers, read: (relative) => relative === file ? changed
    : reseal && relative === 'evidence/final/pins.json' ? Buffer.from(JSON.stringify(pins))
      : readers.read(relative) }).problems;
}

for (const [file, kind] of [
  ['README.md', 'FROZEN_SOURCE_SHA256_DIFFERS'],
  ['server.cjs', 'CAPTURE_INPUT_SHA256_DIFFERS'],
  ['tests/cancellation-final.test.cjs', 'CAPTURE_INPUT_SHA256_DIFFERS']
]) {
  test(`tamper remains named after rebuilding only the superficial seal: ${file}`, () => {
    const problems = tamper(file, (bytes) => Buffer.concat([bytes, Buffer.from('\n')]), true);
    assert.ok(problems.some((entry) => entry.kind === kind), JSON.stringify(problems.slice(0, 5)));
  });
}

test('a changed capture summary fails against the actual immutable transcript even with the superficial seal rebuilt', () => {
  const problems = tamper('evidence/final/records/final-core.json', (bytes) => {
    const record = parse(bytes);
    record.summary.pass += 1;
    return Buffer.from(JSON.stringify(record));
  }, true);
  assert.ok(problems.some((entry) => entry.kind === 'CAPTURE_SUMMARY_DIFFERS'));
});

test('a changed inherited original stream and a changed public projection are each rejected by name', () => {
  for (const [file, expected] of [
    ['evidence/red/raw/red-01-behavior.stdout.raw.gz', 'INHERITED_'],
    ['evidence/final/streams/final-core.stdout.projection.txt.gz', 'CAPTURE_UNREADABLE']
  ]) {
    const problems = tamper(file, (bytes) => { const changed = Buffer.from(bytes); changed[0] ^= 1; return changed; }, true);
    assert.ok(problems.some((entry) => entry.kind.startsWith(expected)), JSON.stringify(problems));
  }
});

test('a fabricated mutation kill and a failed load repetition never become a completion pass', () => {
  const checked = current();
  assert.deepEqual(checked.problems, []);
  const data = new Map(checked.data);
  const mutation = structuredClone(data.get('mutation'));
  mutation.entries[0].killed = false;
  data.set('mutation', mutation);
  assert.ok(decide({ ...checked, data }).some((entry) => entry.startsWith('NO_GENUINE_NAMED_KILL:')));
  const loaded = structuredClone(checked.data.get('loop'));
  loaded.runs[0].summary.fail = 1;
  data.set('loop', loaded);
  assert.ok(decide({ ...checked, data }).some((entry) => entry.startsWith('LOAD_REPETITION_FAILED:')));
});

test('every proposed public file and every decoded gzip stream passes the identifier scan', () => {
  const result = scan();
  assert.equal(result.passed, true, JSON.stringify(result.findings));
  assert.ok(result.files > 59);
  assert.ok(result.decodedStreams > 2);
});
