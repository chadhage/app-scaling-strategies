'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');
const sourcePath = require.resolve('..\\source.cjs');
const realExec = childProcess.execFileSync;
const realLstat = fs.lstatSync;
const realFstat = fs.fstatSync;
const realReadFile = fs.readFileSync;
const realRealpath = fs.realpathSync;
const changed = (stat, values) => Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, values);
// A private copy of source.cjs, loaded while execFileSync is replaced, never alters the cached accepted module.
function fresh(t, execFileSync) {
  if (execFileSync) t.mock.method(childProcess, 'execFileSync', execFileSync);
  delete require.cache[sourcePath];
  try { return require(sourcePath); } finally { delete require.cache[sourcePath]; }
}
const gitOnly = (response) => (command, args, options) => command === 'git' ? response(command, args, options) : realExec(command, args, options);

test('a symbolic-link or re-pointed path component is refused', (t) => {
  const source = fresh(t);
  const linked = t.mock.method(fs, 'lstatSync', function (target, ...rest) {
    const stat = realLstat.call(this, target, ...rest);
    return String(target).endsWith('\\capability') ? changed(stat, { isSymbolicLink: () => true }) : stat;
  });
  assert.throws(() => source.read('capability\\C030\\README.md'), { code: 'LINKED_SOURCE' });
  linked.mock.restore();
  t.mock.method(fs, 'realpathSync', (target, ...rest) => String(target).endsWith('\\capability') ? `${target}-elsewhere` : realRealpath(target, ...rest));
  assert.throws(() => source.read('capability\\C030\\README.md'), { code: 'LINKED_SOURCE' });
});
test('a directory or an oversized file is not a bounded source file', (t) => {
  const source = fresh(t);
  assert.throws(() => source.read('capability\\C030\\tests'), { code: 'BOUNDED_SOURCE_FILE' });
  t.mock.method(fs, 'lstatSync', function (target, ...rest) {
    const stat = realLstat.call(this, target, ...rest);
    return String(target).endsWith('\\C030\\README.md') ? changed(stat, { size: 1048577 }) : stat;
  });
  assert.throws(() => source.read('capability\\C030\\README.md'), { code: 'BOUNDED_SOURCE_FILE' });
});
test('a source whose identity or modification time changes while it is read is refused', (t) => {
  const source = fresh(t);
  let mode = 'identity';
  let calls = 0;
  t.mock.method(fs, 'fstatSync', function (descriptor, ...rest) {
    const stat = realFstat.call(this, descriptor, ...rest);
    calls += 1;
    if (mode === 'identity') return changed(stat, { ino: -1 });
    return calls % 2 === 0 ? changed(stat, { mtimeMs: stat.mtimeMs + 1 }) : stat;
  });
  assert.throws(() => source.read('capability\\C030\\README.md'), { code: 'SOURCE_CHANGED' });
  mode = 'modified';
  calls = 0;
  assert.throws(() => source.read('capability\\C030\\README.md'), { code: 'SOURCE_CHANGED' });
});
test('a pinned working file whose bytes drift is refused as a pin mismatch', (t) => {
  const source = fresh(t);
  t.mock.method(fs, 'readFileSync', function (target, ...rest) {
    const bytes = realReadFile.call(this, target, ...rest);
    if (typeof target !== 'number') return bytes;
    const drifted = Buffer.from(bytes);
    drifted[0] ^= 1;
    return drifted;
  });
  assert.throws(() => source.checkImports(), { code: 'SOURCE_PIN_MISMATCH' });
});
test('a malformed accepted-Git object stream is refused', (t) => {
  const source = fresh(t, gitOnly(() => Buffer.from('not an object header\n')));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
});
test('an accepted-Git blob that differs from its pin is refused', (t) => {
  const source = fresh(t, gitOnly(() => Buffer.from(`${'0'.repeat(40)} blob 1\nx\n`.repeat(27))));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_PIN' });
});
test('trailing bytes after the last accepted-Git blob are refused', (t) => {
  const source = fresh(t, gitOnly((command, args, options) => Buffer.concat([realExec(command, args, options), Buffer.from('\n')])));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
});
test('current gate reads fail closed unless both independent Done gates are exact', (t) => {
  const template = JSON.parse(JSON.stringify(require('..\\source.cjs').readGates()));
  let current = template;
  const source = fresh(t, (command, args, options) => command === 'pwsh.exe' ? Buffer.from(JSON.stringify(current)) : realExec(command, args, options));
  assert.equal(source.readGates().cards.length, 2);
  for (const [name, mutate, code] of [
    ['literal consent absent', (value) => { value.literalLocalConsent = false; }, 'CURRENT_GATE_READ'],
    ['only one gate', (value) => { value.cards.pop(); }, 'CURRENT_GATE_READ'],
    ['gate not Done', (value) => { value.cards[0].state = 'In Progress'; }, 'INDEPENDENT_DONE_REQUIRED'],
    ['gate not independently accepted', (value) => { value.cards[1].accepted = false; }, 'INDEPENDENT_DONE_REQUIRED'],
    ['publication commit differs from the pin', (value) => { value.cards[0].publication.commit = '0'.repeat(40); }, 'INDEPENDENT_DONE_REQUIRED'],
    ['duplicate gate identity', (value) => { value.cards[1] = JSON.parse(JSON.stringify(value.cards[0])); }, 'INDEPENDENT_DONE_REQUIRED']
  ]) {
    current = JSON.parse(JSON.stringify(template));
    mutate(current);
    assert.throws(() => source.readGates(), { code }, name);
  }
});
