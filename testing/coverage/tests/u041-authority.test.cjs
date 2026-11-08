'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fs, path, namespace, makeScratch, dispose } = require('./u041-support.cjs');
const authority = require('./u041-authority.cjs');
const { seal } = require('./u041-seal.cjs');

function fixture() {
  const chain = authority.resolveAuthority(namespace);
  const names = fs.readdirSync(namespace).filter((name) => /^evidence-index-addendum/.test(name));
  const files = new Map([[authority.SURFACE, fs.readFileSync(path.join(namespace, authority.SURFACE))]]);
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(namespace, name));
    files.set(name, bytes);
    for (const step of JSON.parse(bytes).amendments) files.set(step.previousSnapshot, fs.readFileSync(path.join(namespace, step.previousSnapshot)));
  }
  for (const relative of chain.head.keys()) files.set(relative, fs.readFileSync(path.join(namespace, relative)));
  const read = (relative) => {
    if (!files.has(relative)) throw Object.assign(new Error(`missing ${relative}`), { code: 'ENOENT' });
    return Buffer.from(files.get(relative));
  };
  return { files, names, read };
}

function editAddendum(copy, change) {
  const name = copy.names.at(-1);
  const value = JSON.parse(copy.files.get(name));
  change(value);
  copy.files.set(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
}

test('U041 authority: the accepted surface and every applied replacement verify without git or another namespace', () => {
  const copy = fixture();
  const actual = authority.verifyAuthority(namespace, copy);
  assert.equal(actual.count >= 1, true);
  assert.equal(actual.checked >= 37, true);
  assert.equal(actual.acceptedCommit, '5ca751aec0df0aa48d892c1b2b9be066eb2661f3');
  assert.equal(actual.surfaceFiles().length, 37);
  const first = JSON.parse(copy.files.get(copy.names[0])).amendments[0];
  const retained = actual.historical(first.path);
  assert.equal(authority.sha(retained), first.previousRawSha256);
  retained[0] ^= 1;
  assert.equal(authority.sha(actual.historical(first.path)), first.previousRawSha256, 'retained bytes are returned as copies');
});

const tampers = [
  ['missing amendment', (copy) => { copy.names.shift(); }, /AUTHORITY_(MISSING|SHAPE)/],
  ['changed base', (copy) => { copy.files.set(authority.SURFACE, Buffer.from('{}')); }, /AUTHORITY_BASE/],
  ['broken previous link', (copy) => editAddendum(copy, (value) => { value.previous = { name: 'wrong.json', crlfToLfSha256: '0'.repeat(64) }; }), /AUTHORITY_CHAIN/],
  ['nonconsecutive sequence', (copy) => editAddendum(copy, (value) => { value.sequence += 1; }), /AUTHORITY_SHAPE/],
  ['widened amendment path', (copy) => editAddendum(copy, (value) => {
    value.amendments.push({ ...JSON.parse(copy.files.get(copy.names[0])).amendments[0], path: 'output.cjs' });
  }), /AUTHORITY_AMENDMENT/],
  ['unknown previous digest', (copy) => editAddendum(copy, (value) => {
    value.amendments.push({ ...JSON.parse(copy.files.get(copy.names[0])).amendments[0], previousCrlfToLfSha256: '0'.repeat(64) });
  }), /AUTHORITY_(PREVIOUS|DUPLICATE)/],
  ['unamended production byte', (copy) => { copy.files.set('output.cjs', Buffer.concat([copy.files.get('output.cjs'), Buffer.from('\n// unauthorized\n')])); }, /AUTHORITY_CURRENT: output\.cjs/],
  ['different gate replacement', (copy) => { copy.files.set('gate.cjs', Buffer.concat([copy.files.get('gate.cjs'), Buffer.from('\n// unauthorized\n')])); }, /AUTHORITY_CURRENT: gate\.cjs/],
  ['retained original byte', (copy) => {
    const first = JSON.parse(copy.files.get(copy.names[0])).amendments[0];
    copy.files.set(first.previousSnapshot, Buffer.concat([copy.files.get(first.previousSnapshot), Buffer.from('x')]));
  }, /AUTHORITY_ORIGINAL/],
  ['missing indexed helper', (copy) => { copy.files.delete('tests\\u041-authority.cjs'); }, /missing tests\\u041-authority\.cjs/],
  ['package shadowing addition', (copy) => editAddendum(copy, (value) => {
    value.additions.push({ path: 'package.json', rawSha256: '0'.repeat(64), crlfToLfSha256: '0'.repeat(64) });
  }), /AUTHORITY_ADDITION/],
  ['path traversal snapshot', (copy) => editAddendum(copy, (value) => {
    value.amendments.push({ ...JSON.parse(copy.files.get(copy.names[0])).amendments[0], previousSnapshot: 'evidence\\u041\\original\\..\\x.txt' });
  }), /AUTHORITY_AMENDMENT/]
];

for (const [label, tamper, pattern] of tampers) {
  test(`U041 authority rejects by name: ${label}`, () => {
    const copy = fixture();
    tamper(copy);
    assert.throws(() => authority.verifyAuthority(namespace, copy), pattern);
  });
}

test('U041 sealer: a next amendment is derived from exact retained bytes, preserves every old link, and refuses a no-op', (t) => {
  const base = makeScratch('u041-sealer');
  t.after(() => dispose(base));
  const copy = fixture();
  const root = path.join(base, 'current');
  const prior = path.join(base, 'previous');
  for (const destination of [root, prior]) {
    for (const [relative, bytes] of copy.files) {
      const file = path.join(destination, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
  }
  fs.appendFileSync(path.join(root, 'README.md'), '\nExact U041 sealer fixture addition.\n');
  const result = seal(root, prior);
  assert.equal(result.sequence, copy.names.length + 1);
  assert.deepEqual(result.amendments, ['README.md']);
  assert.equal(authority.verifyAuthority(root).count, result.sequence);
  for (const name of copy.names) assert.deepEqual(fs.readFileSync(path.join(root, name)), copy.files.get(name));
  assert.throws(() => seal(root, root), /no-op amendment/);
});

test('U041 additions are a closed path vocabulary and hashes are not accepted by coercion', () => {
  for (const name of ['package.json', 'node_modules\\x.cjs', '.gitattributes', 'evidence\\u041\\..\\x.json', 'tests\\unknown.cjs', 'tests/u041-support.cjs']) {
    assert.equal(authority.additionAllowed(name), false, name);
  }
  assert.equal(authority.additionAllowed('tests\\u041-support.cjs'), true);
  assert.equal(authority.plainRelative(null), false);
  const copy = fixture();
  editAddendum(copy, (value) => { value.additions.push({ path: 'evidence\\u041\\new.json', rawSha256: ['0'.repeat(64)], crlfToLfSha256: '0'.repeat(64) }); });
  assert.throws(() => authority.verifyAuthority(namespace, copy), /AUTHORITY_ADDITION/);
});
