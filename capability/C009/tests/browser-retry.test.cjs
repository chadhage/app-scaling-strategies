'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TIMEOUT_CODES, describeLoad, qualifyWithRetry } = require('./browser-retry.cjs');

// Review finding F13: tests\browser.cjs retries the shared qualifyEdge() ONCE, and only after a typed timeout.
const answers = (...reports) => {
  const calls = [];
  const qualify = async () => { calls.push('call'); return reports[calls.length - 1]; };
  return { qualify, calls };
};
const timeout = { ok: false, reasons: ['SIGNATURE_TIMEOUT: the shell did not answer within 60000 ms', 'VERSION_TIMEOUT: the shell did not answer within 60000 ms'] };
const good = { ok: true, reasons: [], major: 156 };

test('a qualified Edge is accepted at the first attempt, without a retry or a message', async () => {
  const { qualify, calls } = answers(good);
  const messages = [];
  assert.deepEqual(await qualifyWithRetry(qualify, (line) => messages.push(line)), { edge: good, attempts: 1 });
  assert.equal(calls.length, 1);
  assert.deepEqual(messages, []);
});

test('a typed timeout is retried once, the load is reported, and the second answer decides', async () => {
  const { qualify, calls } = answers(timeout, good);
  const messages = [];
  const result = await qualifyWithRetry(qualify, (line) => messages.push(line));
  assert.deepEqual(result, { edge: good, attempts: 2 });
  assert.equal(calls.length, 2);
  assert.match(messages.join('\n'), /loaded machine \(\d+ of \d+ MB free, \d+ logical processors\): SIGNATURE_TIMEOUT.*retrying once/s);
});

test('a second timeout is the failure: there is no third attempt', async () => {
  const { qualify, calls } = answers(timeout, timeout, good);
  const result = await qualifyWithRetry(qualify, () => {});
  assert.equal(result.attempts, 2);
  assert.equal(result.edge.ok, false);
  assert.equal(calls.length, 2);
});

test('a failure that is not a timeout is final: a bad signature or an unqualified major is never retried', async () => {
  for (const reasons of [['SIGNATURE_INVALID: not signed'], ['VERSION_TIMEOUT: slow', 'MAJOR_UNQUALIFIED: 99'], []]) {
    const { qualify, calls } = answers({ ok: false, reasons }, good);
    const result = await qualifyWithRetry(qualify, () => { throw new Error('no retry message expected'); });
    assert.equal(result.attempts, 1, reasons.join());
    assert.equal(calls.length, 1);
  }
});

test('the retried codes are exactly the typed timeouts of the shared tool, and the load description names memory and processors', () => {
  assert.deepEqual([...TIMEOUT_CODES], ['SIGNATURE_TIMEOUT', 'VERSION_TIMEOUT', 'SHA256_TIMEOUT']);
  assert.match(describeLoad(), /^\d+ of \d+ MB free, \d+ logical processors$/);
});
