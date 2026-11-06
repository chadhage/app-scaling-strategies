'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, repo } = require('./provenance.cjs');
const authority = require('./pin-authority.cjs');
const edit = require('./surface-edit.cjs');

// U019 specification (C016-pin-amendment.feature). Fixtures are synthetic pins with the real record shape; the real-data tests rebuild the
// accepted bytes from Git history at the pinned observedHead and never read another namespace's live files.
const { hash, lfHash, crlfCount } = authority;
const SURFACE = edit.FILE;
const REPLACED = 'alpha\nBETA\ngamma\n';
const FILES = {
  [SURFACE]: 'alpha\nbeta\ngamma\n',
  'capability\\C015\\tests\\verify.cjs': 'verify one\nverify two\n',
  'capability\\C015\\tests\\worker.cjs': 'worker\n',
  'capability\\C015\\store.cjs': 'production store\n',
  'capability\\C001\\tests\\surface.test.cjs': 'c001 surface\n',
  'capability\\C002\\validator.js': 'validator\n',
};
const crlf = (text) => Buffer.from(text.replace(/\n/g, '\r\n'));
const record = (text) => {
  const raw = crlf(text);
  return { rawBytes: raw.length, rawSha256: hash(raw), rawCRLF: crlfCount(raw), gitCanonicalBytes: text.length, gitCanonicalSha256: hash(Buffer.from(text)) };
};
const pins = { schemaVersion: 1, cardId: 'C016', kind: 'immutable-accepted-dependency-byte-pins', observedHead: '0'.repeat(40),
  independentlyAcceptedC015Commit: '1'.repeat(40), records: Object.entries(FILES).map(([file, text]) => ({ file, ...record(text) })) };
const pinsBytes = Buffer.from(`${JSON.stringify(pins, null, 2)}\n`);
const sealed = (file) => pins.records.find((entry) => entry.file === file);
const base = { path: 'dependency-pins.json', lfSha256: lfHash(pinsBytes) };
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const clone = (value) => structuredClone(value);
const step = (file, text, status = 'authorized', previous = sealed(file)) => ({ file, status, edit: `synthetic edit of ${file}`,
  previous: { rawBytes: previous.rawBytes, rawSha256: previous.rawSha256, rawCRLF: previous.rawCRLF }, current: record(text) });
const addendumValue = (sequence, previous, replacements) => ({ schema: authority.SCHEMA, cardId: 'C016', sequence, createdAtUtc: '2026-11-05T21:00:00.000Z',
  item: 'U019', reason: 'synthetic', base: clone(base), replacements,
  previous: previous === null ? null : { name: authority.addendumName(sequence - 1), lfSha256: lfHash(previous) } });
const addendum = (sequence, previous, replacements, mutate = (item) => item) =>
  ({ name: authority.addendumName(sequence), bytes: serialize(mutate(addendumValue(sequence, previous, replacements))) });
const resolve = (addenda, trusted = []) => authority.resolveChain({ pins, pinsBytes, addenda, trusted });
const verdict = (chain, entry, raw) => {
  try { return { accepted: true, source: authority.checkRaw(chain, entry, raw).source }; } catch (error) { return { accepted: false, code: error.code }; }
};
const first = () => addendum(1, null, [step(SURFACE, REPLACED)]);
const flip = (raw) => { const copy = Buffer.from(raw); copy[0] ^= 1; return copy; };

test('without an addendum only the sealed raw bytes are accepted and a change names the path and both hashes', () => {
  const chain = resolve([]);
  assert.equal(chain.count, 0);
  assert.deepEqual(authority.acceptedRecords(chain, sealed(SURFACE)).map((state) => state.source), ['sealed']);
  for (const [file, text] of Object.entries(FILES)) assert.deepEqual(verdict(chain, sealed(file), crlf(text)), { accepted: true, source: 'sealed' });
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(REPLACED)), { accepted: false, code: 'PIN_BYTES_CHANGED' });
  assert.throws(() => authority.checkRaw(chain, sealed(SURFACE), crlf(REPLACED)), (error) => error.code === 'PIN_BYTES_CHANGED' &&
    error.message.includes(SURFACE) && error.message.includes(sealed(SURFACE).rawSha256.slice(0, 8)) && error.message.includes(hash(crlf(REPLACED)).slice(0, 8)));
});

test('an authorized addendum accepts the sealed bytes and exactly the replaced bytes, nothing else', () => {
  const chain = resolve([first()]);
  assert.equal(chain.count, 1);
  assert.deepEqual(authority.acceptedRecords(chain, sealed(SURFACE)).map((state) => state.source), ['sealed', 'addendum-1']);
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(FILES[SURFACE])), { accepted: true, source: 'sealed' });
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(REPLACED)), { accepted: true, source: 'addendum-1' });
  const others = [Buffer.from(REPLACED), Buffer.concat([crlf(REPLACED), Buffer.from('\r\n')]), crlf('alpha\nBETA\ngamma2\n'), flip(crlf(REPLACED)), Buffer.alloc(0)];
  for (const raw of others) assert.deepEqual(verdict(chain, sealed(SURFACE), raw), { accepted: false, code: 'PIN_BYTES_CHANGED' });
  assert.throws(() => authority.checkRaw(chain, sealed(SURFACE), others[0]), (error) => error.message.includes(SURFACE) &&
    error.message.includes(sealed(SURFACE).rawSha256.slice(0, 8)) && error.message.includes(hash(crlf(REPLACED)).slice(0, 8)) &&
    error.message.includes(hash(others[0]).slice(0, 8)));
});

test('an applied step accepts the replaced bytes only', () => {
  const chain = resolve([addendum(1, null, [step(SURFACE, REPLACED, 'applied')])]);
  assert.deepEqual(authority.acceptedRecords(chain, sealed(SURFACE)).map((state) => state.source), ['addendum-1']);
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(REPLACED)), { accepted: true, source: 'addendum-1' });
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(FILES[SURFACE])), { accepted: false, code: 'PIN_BYTES_CHANGED' });
});

test('every other pinned file keeps its sealed bytes even with a valid addendum', () => {
  const chain = resolve([first()]);
  for (const [file, text] of Object.entries(FILES).filter(([file]) => file !== SURFACE)) {
    assert.deepEqual(verdict(chain, sealed(file), crlf(text)), { accepted: true, source: 'sealed' }, file);
    for (const raw of [flip(crlf(text)), Buffer.concat([crlf(text), Buffer.from('x')]), crlf(REPLACED), Buffer.from(text)]) {
      assert.deepEqual(verdict(chain, sealed(file), raw), { accepted: false, code: 'PIN_BYTES_CHANGED' }, file);
    }
  }
});

test('only pinned C015 test files can be superseded, with or without an addendum', () => {
  const forbidden = ['capability\\C015\\store.cjs', 'capability\\C001\\tests\\surface.test.cjs', 'capability\\C002\\validator.js',
    'capability\\C015\\tests\\unpinned.test.cjs', 'capability\\C015\\tests\\fixtures\\nested.cjs', 'capability\\C015\\tests\\..\\store.cjs',
    'capability\\C016\\tests\\integrity.test.cjs', 'C015\\tests\\surface.test.cjs', ''];
  for (const file of forbidden) {
    const previous = sealed(file) || sealed(SURFACE);
    assert.throws(() => resolve([addendum(1, null, [step(file, REPLACED, 'authorized', previous)])]), { code: 'AMENDMENT_PATH_NOT_ALLOWED' }, file);
  }
  const chain = resolve([]);
  for (const file of forbidden) assert.deepEqual(verdict(chain, sealed(file) || sealed(SURFACE), crlf(REPLACED)), { accepted: false, code: 'PIN_BYTES_CHANGED' }, file);
});

test('a malformed addendum is rejected with a specific code', () => {
  const second = (mutate) => () => resolve([addendum(1, null, [step(SURFACE, REPLACED)], mutate)]);
  const cases = [
    ['unknown top-level key', (item) => ({ ...item, extra: 1 }), 'ADDENDUM_SHAPE'],
    ['missing reason', (item) => { delete item.reason; return item; }, 'ADDENDUM_SHAPE'],
    ['unknown schema', (item) => ({ ...item, schema: 'C016-dependency-pins-addendum/2' }), 'ADDENDUM_SCHEMA'],
    ['another card', (item) => ({ ...item, cardId: 'C015' }), 'ADDENDUM_SCHEMA'],
    ['untimed', (item) => ({ ...item, createdAtUtc: 'yesterday' }), 'ADDENDUM_SHAPE'],
    ['empty item', (item) => ({ ...item, item: ' ' }), 'ADDENDUM_SHAPE'],
    ['no replacements', (item) => ({ ...item, replacements: [] }), 'ADDENDUM_SHAPE'],
    ['replacements not a list', (item) => ({ ...item, replacements: {} }), 'ADDENDUM_SHAPE'],
    ['base with an unknown key', (item) => ({ ...item, base: { ...item.base, extra: 1 } }), 'ADDENDUM_SHAPE'],
    ['replacement with an unknown key', (item) => { item.replacements[0].extra = 1; return item; }, 'ADDENDUM_SHAPE'],
    ['replacement without an edit text', (item) => { item.replacements[0].edit = ''; return item; }, 'ADDENDUM_SHAPE'],
    ['file that is not text', (item) => { item.replacements[0].file = 7; return item; }, 'ADDENDUM_SHAPE'],
    ['current without a field', (item) => { delete item.replacements[0].current.rawCRLF; return item; }, 'ADDENDUM_SHAPE'],
    ['unknown status', (item) => { item.replacements[0].status = 'pending'; return item; }, 'AMENDMENT_STATUS'],
    ['upper-case digest', (item) => { item.replacements[0].current.rawSha256 = 'A'.repeat(64); return item; }, 'AMENDMENT_HASH'],
    ['short digest', (item) => { item.replacements[0].previous.rawSha256 = 'abc'; return item; }, 'AMENDMENT_HASH'],
    ['size as text', (item) => { item.replacements[0].current.rawBytes = '17'; return item; }, 'AMENDMENT_HASH'],
    ['fractional size', (item) => { item.replacements[0].current.gitCanonicalBytes = 1.5; return item; }, 'AMENDMENT_HASH'],
    ['empty replacement', (item) => { item.replacements[0].current.rawBytes = 0; return item; }, 'AMENDMENT_HASH'],
    ['negative CRLF count', (item) => { item.replacements[0].current.rawCRLF = -1; return item; }, 'AMENDMENT_HASH'],
    ['superseded digest not the head', (item) => { item.replacements[0].previous.rawSha256 = hash(Buffer.from('x')); return item; }, 'AMENDMENT_PREVIOUS_MISMATCH'],
    ['superseded size not the head', (item) => { item.replacements[0].previous.rawBytes += 1; return item; }, 'AMENDMENT_PREVIOUS_MISMATCH'],
    ['superseded CRLF count not the head', (item) => { item.replacements[0].previous.rawCRLF += 1; return item; }, 'AMENDMENT_PREVIOUS_MISMATCH'],
    ['replacement equal to the superseded bytes', (item) => { item.replacements[0].current = record(FILES[SURFACE]); return item; }, 'AMENDMENT_NOOP'],
    ['the same file twice', (item) => { item.replacements.push(clone(item.replacements[0])); return item; }, 'AMENDMENT_DUPLICATE_PATH'],
  ];
  for (const [label, mutate, code] of cases) assert.throws(second(mutate), { code }, label);
  assert.throws(() => resolve([{ name: authority.addendumName(1), bytes: Buffer.from('not json') }]), { code: 'ADDENDUM_JSON' });
  assert.throws(() => resolve([{ name: authority.addendumName(1), bytes: Buffer.from('[]') }]), { code: 'ADDENDUM_SHAPE' });
  assert.throws(() => resolve([{ name: authority.addendumName(1), bytes: Buffer.from('null') }]), { code: 'ADDENDUM_SHAPE' });
});

test('base and chain links bind every addendum to the sealed pins and to its predecessor', () => {
  const baseCases = [
    ['another sealed pins file', (item) => ({ ...item, base: { ...item.base, lfSha256: hash(Buffer.from('other pins')) } })],
    ['another base path', (item) => ({ ...item, base: { ...item.base, path: 'evidence-index.json' } })],
  ];
  for (const [label, mutate] of baseCases) assert.throws(() => resolve([addendum(1, null, [step(SURFACE, REPLACED)], mutate)]), { code: 'ADDENDUM_BASE' }, label);
  assert.throws(() => resolve([addendum(1, null, [step(SURFACE, REPLACED)], (item) => ({ ...item, previous: { name: 'x', lfSha256: 'y' } }))]), { code: 'ADDENDUM_CHAIN' });
  const one = first();
  const two = (mutate) => addendum(2, one.bytes, [step(SURFACE, 'alpha\nBETA\nGAMMA\n', 'authorized', record(REPLACED))], mutate);
  assert.equal(resolve([one, two((item) => item)]).count, 2);
  const links = [
    ['no link', (item) => ({ ...item, previous: null })],
    ['wrong hash', (item) => ({ ...item, previous: { ...item.previous, lfSha256: hash(Buffer.from('x')) } })],
    ['wrong name', (item) => ({ ...item, previous: { ...item.previous, name: 'dependency-pins-addendum-9.json' } })],
    ['unknown key', (item) => ({ ...item, previous: { ...item.previous, extra: 1 } })],
  ];
  for (const [label, mutate] of links) assert.throws(() => resolve([one, two(mutate)]), { code: 'ADDENDUM_CHAIN' }, label);
  const changed = { name: one.name, bytes: Buffer.from(one.bytes.toString('utf8').replace('"synthetic"', '"widened"')) };
  assert.notDeepEqual(changed.bytes, one.bytes);
  assert.throws(() => resolve([changed, two((item) => item)]), { code: 'ADDENDUM_CHAIN' });
});

test('missing, misnumbered and near-miss addenda are rejected', () => {
  const one = first();
  const two = addendum(2, one.bytes, [step(SURFACE, 'alpha\nBETA\nGAMMA\n', 'authorized', record(REPLACED))]);
  assert.throws(() => resolve([{ ...one, name: authority.addendumName(2) }]), { code: 'ADDENDUM_SEQUENCE' });
  assert.throws(() => resolve([one, { ...two, name: authority.addendumName(3) }]), { code: 'ADDENDUM_SEQUENCE' });
  assert.throws(() => resolve([addendum(1, null, [step(SURFACE, REPLACED)], (item) => ({ ...item, sequence: 2 }))]), { code: 'ADDENDUM_SEQUENCE' });
  const entries = { 'dependency-pins.json': pinsBytes, 'dependency-pins-addendum-10.json': two.bytes, 'dependency-pins-addendum-2.json': two.bytes,
    'dependency-pins-addendum-1.json': one.bytes, 'README.md': Buffer.from('x') };
  const api = (files, directories = []) => ({ readdirSync: () => [...Object.keys(files), ...directories],
    lstatSync: (file) => ({ isFile: () => !directories.includes(path.basename(file)) }), readFileSync: (file) => files[path.basename(file)] });
  const listed = authority.listAddenda('synthetic', api(entries));
  assert.deepEqual(listed.map((item) => item.name), ['dependency-pins-addendum-1.json', 'dependency-pins-addendum-2.json', 'dependency-pins-addendum-10.json']);
  assert.deepEqual(listed[0].bytes, one.bytes);
  assert.deepEqual(authority.listAddenda('synthetic', api({ 'dependency-pins.json': pinsBytes })), []);
  for (const name of ['dependency-pins-addendum-01.json', 'dependency-pins-addendum-1.json.bak', 'dependency-pins-addendum-.json', 'dependency-pins-addendum-1.JSON']) {
    assert.throws(() => authority.listAddenda('synthetic', api({ [name]: one.bytes })), { code: 'ADDENDUM_SEQUENCE' }, name);
  }
  assert.throws(() => authority.listAddenda('synthetic', api({}, ['dependency-pins-addendum-1.json'])), { code: 'ADDENDUM_FILE' });
  assert.throws(() => resolve([], [{ name: one.name, lfSha256: lfHash(one.bytes) }]), { code: 'ADDENDUM_TRUSTED_MISSING' });
});

test('the trusted prefix pins published addenda by LF hash while later addenda stay appendable', () => {
  const one = first();
  const trusted = [{ name: one.name, lfSha256: lfHash(one.bytes) }];
  assert.equal(resolve([one], trusted).count, 1);
  const two = addendum(2, one.bytes, [step(SURFACE, 'alpha\nBETA\nGAMMA\n', 'authorized', record(REPLACED))]);
  assert.equal(resolve([one, two], trusted).count, 2);
  const widened = addendum(1, null, [step(SURFACE, REPLACED, 'applied')]);
  assert.throws(() => resolve([widened], trusted), { code: 'ADDENDUM_TRUSTED_MISMATCH' });
  assert.throws(() => resolve([one], [{ name: 'dependency-pins-addendum-2.json', lfSha256: lfHash(one.bytes) }]), { code: 'ADDENDUM_TRUSTED_MISMATCH' });
});

test('the chain is append-only: a later addendum names the bytes the earlier one produced', () => {
  const one = first();
  const THIRD = 'alpha\nBETA\nGAMMA\n';
  const second = addendum(2, one.bytes, [step(SURFACE, THIRD, 'authorized', record(REPLACED)), step('capability\\C015\\tests\\verify.cjs', 'verify one\nVERIFY\n')]);
  const chain = resolve([one, second]);
  assert.deepEqual(authority.acceptedRecords(chain, sealed(SURFACE)).map((state) => state.source), ['addendum-1', 'addendum-2']);
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(REPLACED)), { accepted: true, source: 'addendum-1' });
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(THIRD)), { accepted: true, source: 'addendum-2' });
  assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(FILES[SURFACE])), { accepted: false, code: 'PIN_BYTES_CHANGED' });
  const verify = sealed('capability\\C015\\tests\\verify.cjs');
  assert.deepEqual(verdict(chain, verify, crlf('verify one\nVERIFY\n')), { accepted: true, source: 'addendum-2' });
  assert.deepEqual(verdict(chain, verify, crlf(FILES[verify.file])), { accepted: true, source: 'sealed' });
  const again = addendum(2, one.bytes, [step(SURFACE, THIRD)]);
  assert.throws(() => resolve([one, again]), { code: 'AMENDMENT_PREVIOUS_MISMATCH' });
});

test('addenda checked out with CRLF endings resolve to the same chain because links use the LF hash', () => {
  const one = first();
  const two = addendum(2, one.bytes, [step(SURFACE, 'alpha\nBETA\nGAMMA\n', 'authorized', record(REPLACED))]);
  const toCrlf = (item) => ({ name: item.name, bytes: crlf(item.bytes.toString('utf8')) });
  assert.notEqual(hash(toCrlf(one).bytes), hash(one.bytes));
  const lf = resolve([one, two]);
  const cr = resolve([toCrlf(one), toCrlf(two)]);
  assert.deepEqual(cr.tip, lf.tip);
  assert.equal(lf.tip?.lfSha256, lfHash(two.bytes));
  assert.deepEqual(verdict(cr, sealed(SURFACE), crlf(REPLACED)), { accepted: true, source: 'addendum-1' });
});

test('a replaced record must describe the bytes it accepts: sizes, CRLF count and Git canonical form', () => {
  const lying = [
    ['raw size', (current) => ({ ...current, rawBytes: current.rawBytes + 1 }), 'PIN_RECORD_INCONSISTENT'],
    ['CRLF count', (current) => ({ ...current, rawCRLF: current.rawCRLF + 1 }), 'PIN_RECORD_INCONSISTENT'],
    ['canonical digest', (current) => ({ ...current, gitCanonicalSha256: hash(Buffer.from('x')) }), 'PIN_CANONICAL_MISMATCH'],
    ['canonical size', (current) => ({ ...current, gitCanonicalBytes: current.gitCanonicalBytes + 1 }), 'PIN_CANONICAL_MISMATCH'],
  ];
  for (const [label, mutate, code] of lying) {
    const chain = resolve([addendum(1, null, [step(SURFACE, REPLACED)], (item) => { item.replacements[0].current = mutate(item.replacements[0].current); return item; })]);
    assert.deepEqual(verdict(chain, sealed(SURFACE), crlf(REPLACED)), { accepted: false, code }, label);
  }
  const wrongSealed = { ...sealed(SURFACE), rawCRLF: 99 };
  assert.deepEqual(verdict(resolve([]), wrongSealed, crlf(FILES[SURFACE])), { accepted: false, code: 'PIN_RECORD_INCONSISTENT' });
});

test('the one-line K-C015 edit applies only to the exact accepted CRLF line', () => {
  const accepted = crlf(`first\n${edit.BEFORE}\nlast\n`);
  const edited = edit.applySurfaceEdit(accepted);
  assert.equal(edited.toString('utf8'), `first\r\n${edit.AFTER}\r\nlast\r\n`);
  assert.equal(edited.length - accepted.length, edit.AFTER.length - edit.BEFORE.length);
  for (const bad of [crlf('first\nlast\n'), Buffer.from(`${edit.BEFORE}\n`), crlf(`${edit.BEFORE}\n${edit.BEFORE}\n`)]) {
    assert.throws(() => edit.applySurfaceEdit(bad), { code: 'SURFACE_EDIT_ANCHOR' });
  }
  assert.equal(edit.applySurfaceEdit(crlf(`${edit.BEFORE}\n`)).toString('utf8'), `${edit.AFTER}\r\n`);
  assert.equal(authority.buildAddendum({ a: 1 }).toString('utf8'), '{\n  "a": 1\n}\n');
});

function history(entry) {
  const blob = execFileSync('git', ['--no-pager', 'show', `${pinsReal.observedHead}:${entry.file.split(path.sep).join('/')}`], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
  return { canonical: blob, raw: Buffer.from(blob.toString('utf8').replace(/\n/g, '\r\n')) };
}
const pinsRealBytes = fs.readFileSync(path.join(root, 'dependency-pins.json'));
const pinsReal = JSON.parse(pinsRealBytes);
const realChain = () => authority.resolveChain({ pins: pinsReal, pinsBytes: pinsRealBytes, addenda: authority.listAddenda(root) });

test('real addendum 1 supersedes exactly the accepted surface.test.cjs bytes with the one-line K-C015 edit rebuilt from Git history', () => {
  const addenda = authority.listAddenda(root);
  assert.equal(addenda.length, 1, 'U019 ships addendum 1.');
  const chain = realChain();
  const entry = pinsReal.records.find((item) => item.file === SURFACE);
  const { canonical, raw } = history(entry);
  assert.equal(hash(raw), entry.rawSha256, 'The accepted bytes are the Git history bytes in CRLF form.');
  const edited = edit.applySurfaceEdit(raw);
  const value = JSON.parse(addenda[0].bytes);
  assert.equal(value.item, 'U019');
  assert.equal(value.replacements.length, 1);
  const [replacement] = value.replacements;
  assert.equal(replacement.file, SURFACE);
  assert.equal(replacement.status, 'authorized');
  assert.deepEqual(replacement.previous, { rawBytes: entry.rawBytes, rawSha256: entry.rawSha256, rawCRLF: entry.rawCRLF });
  const lf = Buffer.from(edited.toString('utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(replacement.current, { rawBytes: edited.length, rawSha256: hash(edited), rawCRLF: crlfCount(edited), gitCanonicalBytes: lf.length, gitCanonicalSha256: hash(lf) });
  assert.equal(edited.length, 6036);
  assert.equal(replacement.current.rawSha256, 'a8deb9cc0e252974c4c46b2bbe09edf3491523521b2ff931427cc174c79cab9e');
  const before = raw.toString('utf8').split('\r\n');
  const after = edited.toString('utf8').split('\r\n');
  assert.equal(before.length, after.length);
  const differing = before.map((line, index) => (line === after[index] ? -1 : index)).filter((index) => index >= 0);
  assert.deepEqual(differing, [69], 'Exactly line 70 changes.');
  assert.equal(before[69], edit.BEFORE);
  assert.equal(after[69], edit.AFTER);
  assert.equal(canonical.length, entry.gitCanonicalBytes);
  assert.deepEqual(authority.acceptedRecords(chain, entry).map((state) => state.source), ['sealed', 'addendum-1']);
  assert.deepEqual(verdict(chain, entry, raw), { accepted: true, source: 'sealed' });
  assert.deepEqual(verdict(chain, entry, edited), { accepted: true, source: 'addendum-1' });
});

test('the real chain rejects a one-byte change in each of the 13 pinned C015 test files and accepts the K-C015 bytes for surface.test.cjs only', () => {
  const chain = realChain();
  const tests = pinsReal.records.filter((entry) => /^capability\\C015\\tests\\[^\\]+$/.test(entry.file));
  assert.equal(tests.length, 13);
  const surface = tests.find((entry) => entry.file === SURFACE);
  const edited = edit.applySurfaceEdit(history(surface).raw);
  for (const entry of tests) {
    const { canonical, raw } = history(entry);
    assert.equal(hash(raw), entry.rawSha256, entry.file);
    assert.deepEqual(verdict(chain, entry, raw), { accepted: true, source: 'sealed' }, entry.file);
    const changes = [flip(raw), raw.subarray(0, raw.length - 1), Buffer.concat([raw, Buffer.from('\r\n')]), canonical];
    for (const changed of changes) assert.deepEqual(verdict(chain, entry, changed), { accepted: false, code: 'PIN_BYTES_CHANGED' }, entry.file);
    assert.deepEqual(verdict(chain, entry, edited), entry === surface ? { accepted: true, source: 'addendum-1' } : { accepted: false, code: 'PIN_BYTES_CHANGED' }, entry.file);
  }
});

test('the integrity test resolves the chain, keeps the 160 sealed records and the sealed Git canonical proof', () => {
  const source = fs.readFileSync(path.join(__dirname, 'integrity.test.cjs'), 'utf8');
  const patterns = {
    requiresHelper: /require\('\.\/pin-authority\.cjs'\)/, resolvesChain: /authority\.resolveChain\(/, listsAddenda: /authority\.listAddenda\(root\)/,
    checksRaw: /authority\.checkRaw\(/, pinsTrustedPrefix: /TRUSTED_ADDENDA/, keepsRecordCount: /assert\.equal\(pins\.records\.length, 160\)/,
    keepsHistoryProof: /\['--no-pager', 'show', `\$\{pins\.observedHead\}:/, keepsCanonicalCheck: /assert\.equal\(sha\(canonical\), entry\.gitCanonicalSha256, entry\.file\)/,
  };
  const found = Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name, pattern.test(source)]));
  assert.deepEqual(found, Object.fromEntries(Object.keys(patterns).map((name) => [name, true])));
  assert.equal(pinsReal.records.length, 160);
});
