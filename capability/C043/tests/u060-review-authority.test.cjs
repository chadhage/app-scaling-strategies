'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const authority = require('./u060-review-authority.cjs');
const previous = require('./u060-final-authority.cjs');
const disk = authority.readRepository(path.resolve(__dirname, '..', '..', '..'));
const cache = new Map();
const read = (relative) => { if (!cache.has(relative)) cache.set(relative, disk(relative)); return cache.get(relative); };
const overlay = (changes) => (relative) => changes.has(relative) ? changes.get(relative) : read(relative);
const flip = (bytes) => { const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; return changed; };
const encode = (value) => Buffer.from(JSON.stringify(value));

function resign(edit) {
  const ninth = JSON.parse(read(authority.addendumPath(11))); edit(ninth);
  const ninthBytes = encode(ninth);
  const tenth = JSON.parse(read(authority.addendumPath(12)));
  tenth.previous.rawSha256 = authority.sha(ninthBytes);
  const tenthBytes = encode(tenth);
  const head = JSON.parse(read(authority.HEAD)); head.rawSha256 = authority.sha(tenthBytes);
  return overlay(new Map([[authority.addendumPath(11), ninthBytes], [authority.addendumPath(12), tenthBytes], [authority.HEAD, encode(head)]]));
}

test('U060 review authority preserves every D1-D10 byte and admits only the startup-repair replacement/source sets', () => {
  const result = authority.verifyAuthority(read);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.reviewReplacements.keys()], [...authority.MODIFIED_REVIEW]);
  assert.equal(authority.MODIFIED_REVIEW.length, 11);
  assert.equal(authority.SOURCES_REVIEW.length, 6);
  assert.deepEqual(previous.verifyAuthority(authority.previousView(read)).errors, []);
});
test('U060 review authority anchors every newest amendment byte', () => {
  const relative = authority.addendumPath(12);
  const bytes = read(relative);
  for (let index = 0; index < bytes.length; index += 1) {
    const changed = Buffer.from(bytes); changed[index] ^= 1;
    assert.deepEqual(authority.verifyHead(overlay(new Map([[relative, changed]]))).errors, [`HEAD_BYTES_CHANGED ${relative}`], `byte${index}`);
  }
});
test('U060 review authority fails closed on each current/predecessor/source/production byte', () => {
  const result = authority.verifyAuthority(read);
  for (const relative of authority.MODIFIED_REVIEW) {
    assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.includes(`LIVE_AUTHORITY_BYTES_CHANGED ${relative}`), relative);
    const copy = result.reviewReplacements.get(relative).supersededCopy;
    assert.ok(authority.verifyAuthority(overlay(new Map([[copy, flip(read(copy))]]))).errors.includes(`SUPERSEDED_COPY_MISMATCH ${relative}`), copy);
  }
  for (const relative of authority.SOURCES_REVIEW) assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.some((error) => error.endsWith(relative)), relative);
  for (const relative of [...result.baseline60.productionFiles, 'capability\\C043\\imports.json']) {
    assert.ok(authority.verifyAuthority(overlay(new Map([[relative, flip(read(relative))]]))).errors.includes(`ORIGINAL_BYTES_CHANGED ${relative}`), relative);
  }
});
test('U060 review authority rejects missing heads, unanchored successors and re-signed foreign/reordered/gapped amendments', () => {
  assert.ok(authority.verifyHead(overlay(new Map([[authority.HEAD, null]]))).errors.includes(`MISSING ${authority.HEAD}`));
  assert.ok(authority.verifyHead(overlay(new Map([[authority.addendumPath(13), Buffer.from('{}')]]))).errors.includes(`UNANCHORED_ADDENDUM ${authority.addendumPath(13)}`));
  for (const edit of [(ninth) => ninth.amendments.reverse(), (ninth) => { ninth.amendments[0].path = 'capability\\C043\\server.cjs'; }]) {
    assert.ok(authority.verifyAuthority(resign(edit)).errors.includes(`AMENDMENT_SET_CHANGED ${authority.addendumPath(11)}`));
  }
  assert.ok(authority.verifyAuthority(resign((ninth) => { ninth.amendments[0].previousRawSha256 = '0'.repeat(64); })).errors.includes(`GAP_IN_CHAIN ${authority.MODIFIED_REVIEW[0]}`));
  assert.ok(authority.verifyAuthority(resign((ninth) => { ninth.additions.reverse(); })).errors.includes(`ADDITION_SET_CHANGED ${authority.addendumPath(11)}`));
  assert.ok(authority.verifyAuthority(resign((ninth) => { ninth.previous.rawSha256 = '0'.repeat(64); })).errors.includes(`CHAIN_BROKEN ${authority.addendumPath(11)}`));
});
