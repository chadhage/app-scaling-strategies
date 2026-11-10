'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const authority = require('./u060-completion-authority.cjs');
const finalAuthority = require('./u060-review-authority.cjs');
const previous = require('./u060-authority.cjs');
const currentDisk = authority.readRepository(path.resolve(__dirname, '..', '..', '..'));
assert.deepEqual(finalAuthority.verifyAuthority(currentDisk).errors, []);
const disk = finalAuthority.completionView(currentDisk);
const cached = new Map();
const read = (relative) => {
  if (!cached.has(relative)) cached.set(relative, disk(relative));
  return cached.get(relative);
};
const overlay = (changes) => (relative) => changes.has(relative) ? changes.get(relative) : read(relative);
const flip = (bytes) => { const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; return changed; };
const encode = (value) => Buffer.from(JSON.stringify(value));

function resign(edit) {
  const seventh = JSON.parse(read(authority.addendumPath(7)));
  edit(seventh);
  const seventhBytes = encode(seventh);
  const eighth = JSON.parse(read(authority.addendumPath(8)));
  eighth.previous.rawSha256 = authority.sha(seventhBytes);
  const eighthBytes = encode(eighth);
  const head = JSON.parse(read(authority.HEAD));
  head.rawSha256 = authority.sha(eighthBytes);
  return overlay(new Map([[authority.addendumPath(7), seventhBytes], [authority.addendumPath(8), eighthBytes], [authority.HEAD, encode(head)]]));
}

test('U060 completion authority preserves D1-D6 while authorizing exactly seven tooling/document replacements and nine sources', () => {
  const result = authority.verifyAuthority(read);
  assert.deepEqual(result.errors, []);
  assert.equal(result.baseline60.files.length, 223);
  assert.equal(result.baseline60.productionFiles.length, 13);
  assert.deepEqual([...result.completionReplacements.keys()], [...authority.MODIFIED_COMPLETE]);
  assert.equal(authority.MODIFIED_COMPLETE.length, 7);
  assert.equal(authority.SOURCES_COMPLETE.length, 9);
  assert.deepEqual(previous.verifyAuthority(authority.historicalRead(read)).errors, []);
});

test('U060 completion authority anchors every byte of the newest amendment independently', () => {
  const relative = authority.addendumPath(8);
  const original = read(relative);
  for (let index = 0; index < original.length; index += 1) {
    const changed = Buffer.from(original); changed[index] ^= 1;
    assert.deepEqual(authority.verifyHead(overlay(new Map([[relative, changed]]))).errors, [`HEAD_BYTES_CHANGED ${relative}`], `byte${index}`);
  }
});

test('U060 completion authority rejects every changed current source, exact predecessor and production file', () => {
  const result = authority.verifyAuthority(read);
  for (const relative of authority.MODIFIED_COMPLETE) {
    assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.includes(`LIVE_AUTHORITY_BYTES_CHANGED ${relative}`), relative);
    const retained = result.completionReplacements.get(relative).supersededCopy;
    assert.ok(authority.verifyAuthority(overlay(new Map([[retained, flip(read(retained))]]))).errors.includes(`SUPERSEDED_COPY_MISMATCH ${relative}`), retained);
  }
  for (const relative of authority.SOURCES_COMPLETE) {
    assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.some((error) => error.endsWith(relative)), relative);
  }
  for (const relative of result.baseline60.productionFiles) {
    assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.includes(`ORIGINAL_BYTES_CHANGED ${relative}`), relative);
  }
});

test('U060 completion authority rejects missing heads, stale links, foreign or reordered paths and unanchored successors', () => {
  assert.ok(authority.verifyHead(overlay(new Map([[authority.HEAD, null]]))).errors.includes(`MISSING ${authority.HEAD}`));
  assert.ok(authority.verifyHead(overlay(new Map([[authority.addendumPath(9), Buffer.from('{}')]]))).errors.includes(`UNANCHORED_ADDENDUM ${authority.addendumPath(9)}`));
  for (const edit of [
    (seventh) => seventh.amendments.reverse(),
    (seventh) => { seventh.amendments[0].path = 'capability\\C043\\server.cjs'; },
    (seventh) => { seventh.amendments[1] = seventh.amendments[0]; },
  ]) assert.ok(authority.verifyAuthority(resign(edit)).errors.includes(`AMENDMENT_SET_CHANGED ${authority.addendumPath(7)}`));
  assert.ok(authority.verifyAuthority(resign((seventh) => { seventh.amendments[0].previousRawSha256 = '0'.repeat(64); })).errors.includes(`GAP_IN_CHAIN ${authority.MODIFIED_COMPLETE[0]}`));
  assert.ok(authority.verifyAuthority(resign((seventh) => { seventh.additions.reverse(); })).errors.includes(`ADDITION_SET_CHANGED ${authority.addendumPath(7)}`));
  assert.ok(authority.verifyAuthority(resign((seventh) => { seventh.previous.rawSha256 = '0'.repeat(64); })).errors.includes(`CHAIN_BROKEN ${authority.addendumPath(7)}`));
});
