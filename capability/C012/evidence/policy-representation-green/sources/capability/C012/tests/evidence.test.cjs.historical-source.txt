'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { sha } = require('./integrity.cjs');
const { whole, compressed, tallies } = require('./evidence-core.cjs');
test('whole-seal byte addition omission and source hash tampering fail by distinct names', () => {
  const actual = { 'model.js': Buffer.from('real-model'), 'index.html': Buffer.from('real-page') };
  const files = Object.entries(actual).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) }));
  const seal = { files, fileSetSha256: sha(JSON.stringify(files)) };
  assert.deepEqual(whole(seal, actual), []);
  assert.ok(whole(seal, { ...actual, 'extra.js': Buffer.from('extra') }).includes('WHOLE_EXACT_SET'));
  assert.ok(whole(seal, { 'index.html': actual['index.html'] }).includes('WHOLE_BYTE:model.js'));
  assert.ok(whole(seal, { ...actual, 'model.js': Buffer.from('tampered') }).includes('WHOLE_BYTE:model.js'));
  assert.ok(whole({ ...seal, fileSetSha256: '0'.repeat(64) }, actual).includes('WHOLE_FILESET_HASH'));
});
test('private original gzip raw bytes and derivative counts cannot be silently normalized or promoted', () => {
  const raw = Buffer.from('original\r\nfailure\r\n'), gzip = zlib.gzipSync(raw);
  const meta = { rawBytes: raw.length, rawSha256: sha(raw), gzipSha256: sha(gzip) };
  assert.deepEqual(compressed(meta, gzip).issues, []);
  const normalized = zlib.gzipSync(Buffer.from('original\nfailure\n'));
  assert.ok(compressed(meta, normalized).issues.includes('ORIGINAL_RAW'));
  assert.ok(compressed(meta, normalized).issues.includes('ORIGINAL_GZIP'));
  const corrupt = Buffer.from(gzip); corrupt[corrupt.length - 1] ^= 1;
  assert.ok(compressed(meta, corrupt).issues.includes('ORIGINAL_DECODE'));
  const decisions = [{ decision: 'named-assertion-kill' }, { decision: 'nonkill-identity' }, { decision: 'specific-runnable-scoped-pair' }];
  assert.deepEqual(tallies(decisions), { 'named-assertion-kill': 1, 'nonkill-identity': 1, 'specific-runnable-scoped-pair': 1 });
  assert.notDeepEqual(tallies(decisions), { 'named-assertion-kill': 3 }, 'COUNTS_DO_NOT_PROMOTE_NONKILLS');
});
