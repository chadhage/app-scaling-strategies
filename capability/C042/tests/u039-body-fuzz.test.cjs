'use strict';

// U039 fix 4: a seeded fuzz of hostile INCOMPLETE requests around the new check, in this process and in a SEPARATE server process: partial bodies (a short
// Content-Length, chunks that stop, a missing CRLF after chunk data, partial trailers), bad and huge chunk-size lines (negative, signed, hex prefix, overflow,
// thousands of digits), NUL bytes, odd Transfer-Encoding values with and without a Content-Length, prototype-like header names and paths, Expect, every shape
// behind zero to two complete reads, every case ended by the client's FIN (no timer decides anything: the timers of the service are the quiet ones). The answers
// are COUNTED: the earlier reads first, at most ONE typed refusal that says Connection: close, never a throw, a hang, a second answer, a state change or a
// connection that is left open.
const assert = require('node:assert/strict');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { noConnections, peer, statusesOf } = require('./u039-body-rows.cjs');
const { reading } = require('./u039-rows.cjs');

const TIMEOUT = 900000;
const WAVE = 12;

function prng(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}

const SIZE_LINES = ['zz', '-1', '+5', '0x5', 'fffffffffffffffff', 'ffffffff', '5;ext=\0', '\0', '', ' 5', '5 ', 'g', '5\0', `${'a'.repeat(4000)}`, `${'f'.repeat(20000)}`];
const STOPS = ['5\r\nhelloXY', '5\r\nhel', '3\r\nabc\r\n', '0\r\nX-T: 1', '1\r\n', '0'];
const PROTO = ['__proto__: x', 'constructor: y', 'hasOwnProperty: z', 'toString: w', 'X-__proto__: 1'];

// One hostile case from one seed.
function hostile(random, host) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const earlier = Math.floor(random() * 3);
  const method = pick(['POST', 'POST', 'POST', 'GET', 'PUT']);
  const target = method === 'GET' ? pick(['/v1/leases', '/scope.json', '/v1/steps/key-0001-aaaa', '/__proto__', '/constructor']) : pick(['/v1/steps', '/v1/steps', '/v1/steps/key-0001-aaaa/cancel', '/v1/steps/__proto__/resume', '/v1/steps\0']);
  const framing = pick(['short', 'short', 'chunked', 'chunked', 'chunked', 'both', 'odd']);
  const lines = [`${method} ${target} HTTP/1.1`, `Host: ${host}`, 'Content-Type: application/json'];
  if (random() < 0.3) lines.push('Expect: 100-continue');
  if (random() < 0.3) lines.push(pick(PROTO));
  if (random() < 0.1) lines.push(`X-Nul: a\0b`);
  let body = '';
  if (framing === 'short') {
    const declared = 20 + Math.floor(random() * 80);
    lines.push(`Content-Length: ${declared}`);
    body = 'x'.repeat(Math.floor(random() * (declared - 1)));
  } else {
    lines.push(framing === 'odd' ? `Transfer-Encoding: ${pick(['chunked, chunked', 'identity', 'gzip, chunked', 'chunked;q=1', 'CHUNKED', 'x', 'chunked\0'])}` : 'Transfer-Encoding: chunked');
    if (framing === 'both') lines.push(`Content-Length: ${Math.floor(random() * 50)}`);
    const valid = Array.from({ length: Math.floor(random() * 3) }, () => { const data = pick(['hello', '{"a":1', '\0\0', 'y'.repeat(300)]); return `${data.length.toString(16)}\r\n${data}\r\n`; }).join('');
    // No fragment contains the terminating `0 CRLF CRLF`, so a chunked message never completes: it errors or waits for the client's FIN.
    body = valid + (random() < 0.5 ? `${pick(SIZE_LINES)}\r\n` : pick(STOPS));
  }
  const bytes = Buffer.concat([...Array.from({ length: earlier }, () => reading(host)), Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`, 'latin1')]);
  return { bytes, earlier, fin: true };
}

async function fuzz(instance, cases, label) {
  const failures = [];
  const onFailure = (error) => failures.push(String(error?.stack ?? error));
  process.on('uncaughtException', onFailure);
  process.on('unhandledRejection', onFailure);
  const host = `127.0.0.1:${instance.port}`;
  const bound = Math.max(lib.CLOSE_MS * 3, 9000);
  const outcomes = [];
  try {
    const before = JSON.stringify(await instance.state());
    for (let at = 1; at <= cases; at += WAVE) {
      const wave = Array.from({ length: Math.min(WAVE, cases - at + 1) }, (_, index) => {
        const seed = at + index;
        const made = hostile(prng(seed), host);
        return { seed, ...made, client: peer(instance.port, made.bytes, { fin: made.fin, closeMs: bound }) };
      });
      await Promise.all(wave.map((item) => item.client.done));
      for (const item of wave) {
        outcomes.push({ seed: item.seed, earlier: item.earlier, closed: item.client.closed, answers: item.client.answers() });
        item.client.destroy();
      }
    }
    const free = await noConnections(instance, `${label}: no connection is left`, bound);
    const healthy = await lib.exchange(instance.port, [{ data: reading(host) }], { answers: 1 });
    const after = JSON.stringify(await instance.state());
    let refusals = 0;
    const tally = {};
    for (const { seed, earlier, closed, answers } of outcomes) {
      const where = `${label} seed ${seed}`;
      for (const item of answers) assert.equal(item.garbage === undefined && item.partial === undefined, true, `${where}: an answer that is not whole HTTP`);
      assert.equal(closed, true, `${where}: the server ended the connection`);
      assert.deepEqual(statusesOf(answers).slice(0, earlier), Array(earlier).fill(200), `${where}: the earlier reads are answered first, in order`);
      const rest = answers.slice(earlier);
      assert.equal(rest.length <= 1, true, `${where}: at most ONE answer after the earlier reads (got ${JSON.stringify(statusesOf(rest))})`);
      for (const item of rest) {
        assert.equal(item.status >= 400 && item.code !== null && item.connection === 'close', true, `${where}: the answer is a typed refusal that closes (${item.status} ${item.code} ${item.connection})`);
        refusals += 1;
        tally[item.status] = (tally[item.status] ?? 0) + 1;
      }
    }
    console.log(`# U039 body fuzz (${label}): ${cases} cases, ${refusals} typed refusals ${JSON.stringify(tally)}, ${outcomes.length - refusals} closed without an answer after the earlier reads`);
    assert.equal(free, true, `${label}: the server holds no connection afterwards`);
    assert.equal(healthy.responses[0]?.status, 200, `${label}: the service still answers`);
    assert.equal(after, before, `${label}: nothing was applied`);
    assert.deepEqual(failures, [], `${label}: no uncaught exception or unhandled rejection`);
    return refusals;
  } finally {
    process.off('uncaughtException', onFailure);
    process.off('unhandledRejection', onFailure);
  }
}

test('a seeded fuzz of hostile incomplete requests (this process): the earlier reads, at most one typed refusal, a closed connection, nothing applied', { timeout: TIMEOUT }, async () => {
  const instance = await lib.startInProcess({ bounds: lib.QUIET });
  try {
    const refusals = await fuzz(instance, 144, 'in-process');
    assert.equal(refusals > 100, true, `the fuzz must reach the refusal paths (${refusals} of 144 cases were refused)`);
  } finally {
    await instance.close();
  }
});

test('the same fuzz against a SEPARATE server process: the process survives, answers afterwards and holds no connection', { timeout: TIMEOUT }, async () => {
  const child = await lib.startChild();
  try {
    const instance = await child.start({ bounds: lib.QUIET });
    const refusals = await fuzz(instance, 72, 'separate-process');
    assert.equal(refusals > 50, true, `the fuzz must reach the refusal paths (${refusals} of 72 cases were refused)`);
    assert.equal(child.errors(), '', 'the server process wrote nothing to stderr (no crash, no stack trace)');
    await instance.close();
  } finally {
    await child.stop();
  }
});
