'use strict';

// Third review, M2: an import pin of ANOTHER namespace's working bytes must accept either form of the accepted file, as tests\build-imports.cjs states: the raw bytes of
// the machine that recorded the pin (CRLF) OR their LF-normalized form (what an LF checkout holds). The old check demanded the raw hash AND the LF hash, so every import
// failed on an LF checkout (the integrity suite failed 3 of 9 there). One tamper test per branch, each failing BY NAME. The blob and the tag are still recomputed
// against git (git cat-file blob <accepted commit>:<path>). C059_RED_SUBJECT (the RED replay only) names a folder with the evidence-verify.cjs to load instead of this one.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const subject = process.env.C059_RED_SUBJECT ? path.resolve(process.env.C059_RED_SUBJECT) : __dirname;
const { normalize, sha, verifyPins } = require(path.join(subject, 'evidence-verify.cjs'));

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pins = JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'));
const OPTIONS = { timeout: 120000 };
const blobs = new Map();
const readBlob = (commit, relative) => {
  const name = `${commit}:${relative}`;
  if (!blobs.has(name)) blobs.set(name, execFileSync('git', ['--no-pager', 'cat-file', 'blob', name], { cwd: repository, maxBuffer: 4 * 1024 * 1024, windowsHide: true }));
  return blobs.get(name);
};
const working = (relative) => fs.readFileSync(path.join(repository, ...relative.split('/')));
const lf = (relative) => normalize(working(relative));
const crlf = (relative) => Buffer.from(lf(relative).toString('utf8').replace(/\n/g, '\r\n'));
const copy = () => JSON.parse(JSON.stringify(pins));
const wrong = '0'.repeat(63) + '1';
const differs = (list) => list.filter((problem) => problem.startsWith('WORKING_COPY_DIFFERS')).map((problem) => problem.slice('WORKING_COPY_DIFFERS '.length));
const paths = pins.imports.map((entry) => entry.path);

test('the pins were recorded from CRLF bytes (so the LF form differs from the raw form: the two branches below are not the same case)', OPTIONS, () => {
  assert.equal(paths.length, 9);
  assert.ok(pins.imports.every((entry) => entry.rawSha256 !== entry.crlfToLfSha256), 'every pinned file has CRLF line ends in its raw form');
});

test('the RAW branch: the bytes of the machine that recorded the pins (CRLF) are accepted, whatever the LF hash says (a CRLF checkout)', OPTIONS, () => {
  assert.deepEqual(verifyPins(pins, { readBlob, readFile: crlf }), [], 'the CRLF form rebuilt from the LF form is the raw form');
  for (const [index, entry] of pins.imports.entries()) {
    const tampered = copy();
    tampered.imports[index].crlfToLfSha256 = wrong;
    assert.deepEqual(differs(verifyPins(tampered, { readBlob, readFile: crlf })), [], `${entry.path}: raw bytes with a wrong LF pin are accepted by the raw branch`);
  }
});

test('the LF branch: the LF-normalized bytes (an LF checkout, as Linux gives for blobs stored as LF) are accepted, whatever the raw hash says', OPTIONS, () => {
  assert.deepEqual(verifyPins(pins, { readBlob, readFile: lf }), [], 'every import passes on an LF checkout (review M2: it failed on all nine)');
  for (const [index, entry] of pins.imports.entries()) {
    assert.notEqual(sha(lf(entry.path)), entry.rawSha256, `${entry.path}: the LF bytes are not the raw bytes`);
    const tampered = copy();
    tampered.imports[index].rawSha256 = wrong;
    assert.deepEqual(differs(verifyPins(tampered, { readBlob, readFile: lf })), [], `${entry.path}: LF bytes with a wrong raw pin are accepted by the LF branch`);
  }
});

test('an edited working copy is refused by name in BOTH forms (a space appended to the raw bytes, to the LF bytes, a changed byte, an empty file)', OPTIONS, () => {
  for (const [form, read] of [['raw', crlf], ['LF', lf]]) {
    assert.deepEqual(differs(verifyPins(pins, { readBlob, readFile: (relative) => Buffer.concat([read(relative), Buffer.from(' ')]) })), paths, `${form} + a space`);
    assert.deepEqual(differs(verifyPins(pins, { readBlob, readFile: (relative) => { const bytes = Buffer.from(read(relative)); bytes[bytes.length >> 1] ^= 1; return bytes; } })), paths, `${form} with a changed byte`);
    assert.deepEqual(differs(verifyPins(pins, { readBlob, readFile: () => Buffer.alloc(0) })), paths, `${form}: an empty file`);
  }
});

test('with BOTH pins wrong the file is refused by name, and one file at a time (the rest stay accepted)', OPTIONS, () => {
  const tampered = copy();
  tampered.imports[3].rawSha256 = wrong;
  tampered.imports[3].crlfToLfSha256 = wrong;
  for (const read of [crlf, lf]) assert.deepEqual(differs(verifyPins(tampered, { readBlob, readFile: read })), [paths[3]]);
});

test('the blob, the tag and the accepted bytes are still checked (BLOB_MISMATCH, TAG_MISMATCH, PIN_NOT_ACCEPTED_BYTES), in both forms', OPTIONS, () => {
  for (const read of [crlf, lf]) {
    const flipped = copy();
    flipped.imports[0].acceptedGitSha256 = wrong;
    assert.ok(verifyPins(flipped, { readBlob, readFile: read }).some((problem) => problem === `BLOB_MISMATCH ${paths[0]}`));
    const tag = copy();
    tag.accepted.C042.tag = 'kanban/C042/000000000000';
    assert.deepEqual(verifyPins(tag, { readBlob, readFile: read }), ['TAG_MISMATCH C042']);
    const unaccepted = copy();
    unaccepted.imports[1].rawSha256 = sha(Buffer.from('x'));
    unaccepted.imports[1].crlfToLfSha256 = sha(Buffer.from('x'));
    assert.ok(verifyPins(unaccepted, { readBlob, readFile: (relative) => (relative === paths[1] ? Buffer.from('x') : read(relative)) }).includes(`PIN_NOT_ACCEPTED_BYTES ${paths[1]}`));
  }
});
