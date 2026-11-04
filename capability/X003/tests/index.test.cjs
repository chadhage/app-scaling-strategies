'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const index = require('../publication/index.cjs');
const ordinary = {
  path: 'capability/C048/evidence/red/replay.cjs.txt', mode: '100644',
  oid: 'e90763242b8368cb4d21483fa365db7d88f10101', stage: '0',
  debugFlags: '0', assumeUnchangedTag: 'H', fsmonitorTag: 'H'
};
const own = {
  ...ordinary, path: 'capability/X003/index.html', oid: '1'.repeat(40)
};

test('ordinary foreign staged entries are allowed and never require cleanup or authority over their path', () => {
  const rows = [ordinary, own];
  const before = JSON.stringify(rows);
  const result = index.inspectRows(rows);
  assert.deepEqual(result.foreignEntries, [ordinary]);
  assert.equal(JSON.stringify(rows), before);
});

test('owned additions, replacements and removals do not weaken exact foreign entry preservation', () => {
  const before = index.inspectRows([ordinary]);
  const after = index.inspectRows([ordinary, own]);
  assert.equal(index.verifyPreserved(before, after).preserved, true);
  assert.equal(index.verifyPreserved(after, before).preserved, true);
  assert.equal(index.verifyPreserved(before, index.inspectRows([ordinary, { ...own, oid: '2'.repeat(40) }])).preserved, true);
});

test('every foreign mode, blob and flag must remain unchanged before and after owned publication', () => {
  const before = index.inspectRows([ordinary, own]);
  for (const [key, value] of Object.entries({
    mode: '100755', oid: '2'.repeat(40), debugFlags: '8000', assumeUnchangedTag: 'h', fsmonitorTag: 'h',
    path: 'capability/C048/evidence/red/another-entry.cjs.txt'
  })) {
    assert.throws(() => index.verifyPreserved(before, index.inspectRows([{ ...ordinary, [key]: value }, own])),
      { code: 'ERR_INDEX_PRESERVATION' });
  }
});

test('foreign additions and removals are detected instead of repaired or globally cleaned', () => {
  const before = index.inspectRows([ordinary, own]);
  assert.throws(() => index.verifyPreserved(before, index.inspectRows([own])), { code: 'ERR_INDEX_PRESERVATION' });
  assert.throws(() => index.verifyPreserved(before, index.inspectRows([ordinary, own, {
    ...ordinary, path: 'capability/C029/index.html'
  }])), { code: 'ERR_INDEX_PRESERVATION' });
});

test('actual unmerged stages fail for owned and unowned paths before staging', () => {
  for (const row of [own, ordinary]) {
    for (const stage of ['1', '2', '3']) {
      assert.throws(() => index.inspectRows([{ ...row, stage }]), { code: 'ERR_UNMERGED_INDEX' });
    }
  }
});

test('missing flags, incomplete metadata and forged fingerprints never become positive preservation proof', () => {
  for (const key of ['mode', 'oid', 'stage', 'debugFlags', 'assumeUnchangedTag', 'fsmonitorTag']) {
    const row = { ...ordinary };
    delete row[key];
    assert.throws(() => index.inspectRows([row]), { code: 'ERR_INDEX_DATA' });
  }
  const before = index.inspectRows([ordinary]);
  assert.throws(() => index.verifyPreserved(before, { ...before, foreignMetadataSha256: '0'.repeat(64) }),
    { code: 'ERR_INDEX_DATA' });
  assert.throws(() => index.verifyPreserved(before, undefined), { code: 'ERR_INDEX_DATA' });
});

test('NUL-delimited stage and full debug/v/f flags are parsed without treating ordinary M as conflict', () => {
  const stage = Buffer.from(`100644 ${ordinary.oid} 0\t${ordinary.path}\0`);
  const debug = Buffer.from(`${ordinary.path}\0  ctime: 1:2\n  mtime: 3:4\n  dev: 0\tino: 0\n  uid: 0\tgid: 0\n  size: 1672\tflags: 0\n`);
  const tags = Buffer.from(`H ${ordinary.path}\0`);
  assert.deepEqual(index.parseIndex(stage, debug, tags, tags), [ordinary]);
  assert.throws(() => index.parseIndex(stage, Buffer.alloc(0), tags, tags), { code: 'ERR_INDEX_DATA' });
  assert.throws(() => index.parseIndex(Buffer.from(`100644 ${ordinary.oid} 2\t${ordinary.path}\0`), debug, tags, tags),
    { code: 'ERR_UNMERGED_INDEX' });
});

test('all flag bits are retained independently of allowed cached stat changes', () => {
  const stage = Buffer.from(`100644 ${ordinary.oid} 0\t${ordinary.path}\0`);
  const debug = Buffer.from(`${ordinary.path}\0  ctime: 900:2\n  mtime: 999:4\n  dev: 0\tino: 0\n  uid: 0\tgid: 0\n  size: 1600\tflags: 4000c000\n`);
  const tags = Buffer.from(`s ${ordinary.path}\0`);
  const parsed = index.parseIndex(stage, debug, tags, tags);
  assert.equal(parsed[0].debugFlags, '4000c000');
  assert.equal(parsed[0].assumeUnchangedTag, 's');
  assert.equal(parsed[0].fsmonitorTag, 's');
});
