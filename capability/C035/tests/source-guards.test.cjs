'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const source = require('..\\source.cjs');

const code = (expected) => ({ code: expected });
const same = (text, from, to) => {
  assert.equal(from.length, to.length);
  assert.ok(text.includes(from), from);
  return text.replace(from, to);
};
function mutatePins(t, mutate) {
  const original = fs.readFileSync;
  let first = true;
  t.mock.method(fs, 'readFileSync', function (...args) {
    const bytes = original.apply(this, args);
    if (!first) return bytes;
    first = false;
    return Buffer.from(mutate(bytes.toString('utf8')), 'utf8');
  });
}

test('source guard: closed repository-relative regular source paths only', () => {
  for (const bad of [42, null, 'C:\\Windows\\win.ini', '\\capability\\C035\\README.md', 'capability\\C035\\README.md:stream', 'capability\\C035\\README\0.md']) {
    assert.throws(() => source.readRegular(bad), code('CLOSED_SOURCE_PATH_REQUIRED'));
  }
  for (const escaping of ['..\\outside.txt', 'capability\\..\\..\\outside.txt', '..\\app-scaling-strategies-sibling\\x.txt']) {
    assert.throws(() => source.readRegular(escaping), code('SOURCE_PATH_SCOPE'));
  }
  assert.throws(() => source.readRegular('capability\\C035'), code('BOUNDED_REGULAR_SOURCE_REQUIRED'));
  assert.throws(() => source.readRegular('capability\\C035\\README.md', 10), code('BOUNDED_REGULAR_SOURCE_REQUIRED'));
  assert.throws(() => source.readRegular('capability\\C035\\missing-source.txt'), { code: 'ENOENT' });
  assert.equal(source.readRegular('capability\\C035\\.gitattributes').toString('utf8'), '* -text\r\n');
});
test('source guard: linked or re-pathed components are forbidden', (t) => {
  t.mock.method(fs, 'lstatSync', () => ({ isSymbolicLink: () => true }));
  assert.throws(() => source.readRegular('capability\\C035\\README.md'), code('SOURCE_LINK_FORBIDDEN'));
  t.mock.restoreAll();
  t.mock.method(fs, 'realpathSync', (value) => `${value}.other`);
  assert.throws(() => source.readRegular('capability\\C035\\README.md'), code('SOURCE_LINK_FORBIDDEN'));
});
test('source guard: a source swapped or resized while being read is rejected as changed', (t) => {
  const fstat = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', () => ({ isFile: () => true, nlink: 1, ino: 987654321, dev: 123456789, size: 0, mtimeMs: 0 }));
  assert.throws(() => source.readRegular('capability\\C035\\README.md'), code('SOURCE_CHANGED'));
  t.mock.restoreAll();
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function (...args) { read.apply(this, args); return Buffer.from('short'); });
  assert.throws(() => source.readRegular('capability\\C035\\README.md'), code('SOURCE_CHANGED'));
  t.mock.restoreAll();
  let calls = 0;
  t.mock.method(fs, 'fstatSync', function (...args) {
    const value = fstat.apply(this, args);
    calls += 1;
    return calls === 1 ? value : { size: value.size + 1, mtimeMs: value.mtimeMs };
  });
  assert.throws(() => source.readRegular('capability\\C035\\README.md'), code('SOURCE_CHANGED'));
});
test('source guard: pins reject a dependency outside the four accepted cards', (t) => {
  mutatePins(t, (text) => same(text, '"card": "C001"', '"card": "C009"'));
  assert.throws(() => source.checkImports(), code('CLOSED_DEPENDENCY_SCOPE'));
});
test('source guard: pins reject a working raw hash that no longer matches', (t) => {
  mutatePins(t, (text) => text.replace(/("rawSha256": ")f/, '$10'));
  assert.throws(() => source.checkImports(), code('DEPENDENCY_RAW_OR_LF_MISMATCH'));
});
test('source guard: pins reject an accepted commit that does not contain the dependency blob', (t) => {
  mutatePins(t, (text) => same(text, '"commit": "cfff04364ade947aa398004b21548a15272021e7"', '"commit": "0fff04364ade947aa398004b21548a15272021e7"'));
  assert.throws(() => source.checkImports(), code('ACCEPTED_GIT_BLOB_REQUIRED'));
});
test('source guard: pins reject an accepted Git blob hash that no longer matches', (t) => {
  mutatePins(t, (text) => text.replace(/("acceptedGitSha256": ")3/, '$10'));
  assert.throws(() => source.checkImports(), code('ACCEPTED_GIT_PIN_MISMATCH'));
});
test('source guard: pins reject a browser helper hash that no longer matches', (t) => {
  mutatePins(t, (text) => text.replace(/("browserHelperRawSha256": ")8/, '$10'));
  assert.throws(() => source.checkImports(), code('APPROVED_HELPER_MISMATCH'));
});
test('source guard: gate and dependency readers accept no caller supplied arguments', () => {
  assert.throws(() => source.readGates('x'), code('NO_GATE_OR_AUTHORITY_OVERRIDES'));
  assert.throws(() => source.checkImports({}), code('NO_DEPENDENCY_OVERRIDES'));
  const gates = source.readGates();
  for (const mutate of [(value) => { value.controllerId = 'other'; }, (value) => { value.stateMutex = 'Local\\Other'; },
    (value) => { value.cards.pop(); }, (value) => { value.exactOriginalKanbanRowPresent = false; },
    (value) => { value.cards[2].accepted = false; }, (value) => { value.cards[0].reviewTag = 'kanban/C015/other'; }]) {
    const candidate = structuredClone(gates);
    mutate(candidate);
    assert.throws(() => source.checkGates(candidate), /CURRENT_LITERAL_CONSENT_AND_DONE_GATES_REQUIRED|INDEPENDENT_ACCEPTED_SOURCE_REQUIRED/);
  }
});
