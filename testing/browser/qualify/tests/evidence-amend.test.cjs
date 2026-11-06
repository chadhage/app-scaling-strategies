'use strict';

// N1 of the second review, evidence side: adding a qualified Edge major must not break the tool's own evidence test, and nothing
// that matters may change silently. The REAL evidence.test.cjs is run on a scratch copy of the namespace: a valid chain of
// addendum lines keeps it green, and every tampering (an edited, deleted, reordered or junk line, a CRLF file, the sealed list,
// the verifier addendum.cjs) turns it red with a message that names the file. Run it last, when the whole evidence exists.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, sha } = require('./chain.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NAMESPACE = path.join(REPO, 'testing', 'browser', 'qualify');
const OUTSIDE = ['isolated.cjs', 'isolated.test.cjs', 'loopback.test.cjs'];

let copy = null;
const at = (...parts) => path.join(copy, 'testing', 'browser', 'qualify', ...parts);

// fs.cpSync refuses to copy a folder into its own subfolder, and the scratch folder lives inside the tests folder.
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (/^scratch-/.test(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

test.before(() => {
  copy = scratchDir();
  copyTree(NAMESPACE, at());
  for (const name of OUTSIDE) fs.copyFileSync(path.join(REPO, 'testing', 'browser', name), path.join(copy, 'testing', 'browser', name));
});
test.after(() => { if (copy) removeDir(copy); });

function evidenceTest() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i.test(key)));
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', path.join('testing', 'browser', 'qualify', 'tests', 'evidence.test.cjs')],
    { cwd: copy, env, encoding: 'utf8', timeout: 240000, windowsHide: true });
  assert.equal(result.error, undefined, 'the evidence test did not end in time');
  return { code: result.status, text: `${result.stdout}\n${result.stderr}` };
}

// Runs one scenario on the scratch copy and restores the touched files afterwards.
function scenario(files, change) {
  const saved = files.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]);
  try {
    change();
    return evidenceTest();
  } finally {
    for (const [file, bytes] of saved) {
      if (bytes === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, bytes);
    }
  }
}

const sealedFile = () => at('qualified.json');
const addendumFile = () => at('qualified.addendum.jsonl');
const verifierFile = () => at('addendum.cjs');
const lines = (count) => chain(fs.readFileSync(sealedFile()), Array.from({ length: count }, (_, i) => 157 + i));
const write = (text) => fs.writeFileSync(addendumFile(), text);

test('baseline: the evidence test passes on a pristine copy of the namespace', () => {
  const result = evidenceTest();
  assert.equal(result.code, 0, result.text.slice(-3000));
});

test('a valid chain of addendum lines (the documented way to add majors) keeps the evidence test green', () => {
  for (const count of [1, 2]) {
    const result = scenario([addendumFile()], () => write(lines(count).text));
    assert.equal(result.code, 0, `${count} valid line(s): ${result.text.slice(-3000)}`);
  }
});

const TAMPERS = [
  ['an edited earlier line', (built) => write(built.text.replace('2026-11-07T09:00:00.000Z', '2026-11-08T09:00:00.000Z'))],
  ['a deleted first line', (built) => write(`${built.lines[1]}\n`)],
  ['swapped lines', (built) => write(`${built.lines[1]}\n${built.lines[0]}\n`)],
  ['a first line anchored to nothing', (built) => write(built.text.replace(/"previous":"[0-9a-f]{64}"/, `"previous":"${'0'.repeat(64)}"`))],
  ['a junk line', (built) => write(`${built.text}not json\n`)],
  ['CRLF line endings', (built) => write(built.text.replace(/\n/g, '\r\n'))],
  ['an empty file', () => write('')],
  ['an earlier line with another digest of its report', (built) => write(built.text.replace(sha('report-157'), sha('another report')))],
];

for (const [what, tamper] of TAMPERS) {
  test(`the evidence test fails and names qualified.addendum.jsonl for ${what}`, () => {
    const result = scenario([addendumFile()], () => tamper(lines(2)));
    assert.notEqual(result.code, 0, 'the evidence test still passes');
    assert.match(result.text, /qualified\.addendum\.jsonl/);
  });
}

test('the evidence test fails and names qualified.json when the sealed list is edited (the way the README used to say)', () => {
  const result = scenario([sealedFile()], () => fs.writeFileSync(sealedFile(), fs.readFileSync(sealedFile(), 'utf8').replace('[156]', '[156, 157]')));
  assert.notEqual(result.code, 0, 'the evidence test still passes');
  assert.match(result.text, /qualified\.json/);
});

test('the evidence test fails and names addendum.cjs when the verifier is edited', () => {
  const result = scenario([verifierFile()], () => fs.appendFileSync(verifierFile(), '\n// a weakened rule\n'));
  assert.notEqual(result.code, 0, 'the evidence test still passes');
  assert.match(result.text, /addendum\.cjs/);
});
