'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const subject = require('./trace.stub.cjs');
const sourcePath = path.resolve(__dirname, '..', '..', '..', 'C033', 'evidence', 'raw',
  'browser-0a54fabc-0ef0-4632-9241-95a196bc4461', 'reset-history.html');
const bytes = fs.readFileSync(sourcePath);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  'bf7087745c0769a400620257513eb26fd1c80debf8277f1e6469a78f2a5671de');
const saved = [...bytes.toString('utf8').matchAll(/<pre id="state"(?: [^>]*)?>([\s\S]*?)<\/pre>/g)];
assert.equal(saved.length, 1);
const snapshot = JSON.parse(saved[0][1].replace(/&amp;/g, '&'));

test('an actually saved acknowledgment moved before its request is rejected', () => {
  const wrong = structuredClone(snapshot);
  const request = wrong.events.findIndex((entry) => entry.code === 'ACTUAL_READ_STARTED');
  assert.ok(request > 0);
  assert.equal(wrong.events[request + 1].code, 'ACTUAL_READ_ACKNOWLEDGED');
  [wrong.events[request], wrong.events[request + 1]] = [wrong.events[request + 1], wrong.events[request]];
  const result = subject.validateSnapshot(wrong);
  assert.equal(result.valid, false, 'An acknowledgment before the actual request must never be source-verified.');
  assert.equal(result.code, 'REQUEST_RESPONSE_ORDER');
});
