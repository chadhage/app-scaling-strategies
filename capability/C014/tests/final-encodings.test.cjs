'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StringDecoder } = require('node:string_decoder');
const { startLocal } = require('../server.cjs');
const { createVault } = require('../vault.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call, parseAnswers } = require('./harness.cjs');
const { scan } = require('./scanner.cjs');
const { ADDED: FORMS } = require('./final-encoders.cjs');
const configOf = () => {
  const config = seedConfig();
  Object.values(config.contacts).forEach((contact, index) => { contact.phone = `+1 (555) 013-${1000 + index}`; });
  return config;
};
function strings(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...strings(child)]);
}
function assertPublic(result, secrets, forms) {
  const decoder = new StringDecoder('utf8');
  const pieces = [];
  for (let at = 0; at < result.bytes.length; at += 1) pieces.push(decoder.write(result.bytes.subarray(at, at + 1)));
  pieces.push(decoder.end());
  const [answer] = parseAnswers(Buffer.from(pieces.join(''), 'utf8'));
  assert.ok(answer && answer.status === 200, 'a complete final answer survived one-byte decoding');
  const body = JSON.parse(answer.body.toString('utf8'));
  const leaves = strings(body);
  const canaries = secrets.map((value, index) => ({ id: `held-${index}`, value }));
  assert.deepEqual(scan(result.bytes, canaries), [], 'independent existing raw/URL/base64/hex/escaped/fold scanner');
  for (let index = 0; index < secrets.length; index += 1) for (const [label, encode] of Object.entries(forms)) {
    const form = encode(secrets[index]);
    assert.ok(!leaves.some((text) => text.includes(form)), `held-${index}/${label}: decoded JSON values and keys contain no covered form`);
  }
  return body;
}

test('G3/G9 each added encoding alone, every held value, all five management planting places, every role and public collection/export, including one-byte wire boundaries', { timeout: 170000 }, async () => {
  for (const [label, encode] of Object.entries(FORMS)) {
    const config = configOf();
    const secrets = createVault(config).secrets();
    const lines = [];
    const app = await startLocal({ config, logSink: (line) => lines.push(line) });
    try {
      app.service.plant('trace', 'a public sentence without any held value');
      for (const place of ['run', 'trace', 'log', 'audit', 'error']) for (const secret of secrets) app.service.plant(place, encode(secret));
      const expired = app.service.issueToken('operator', { ttlMs: 0 });
      for (const token of [null, ...Object.values(config.tokens), 'malformed', `c009_${'A'.repeat(43)}`, expired]) {
        for (const kind of ['trace', 'runs', 'audit', 'logs', 'bundle']) {
          const result = await call(app.port, 'GET', `/v1/evidence/${kind}${kind === 'bundle' ? '' : '?limit=200'}`, { token });
          if (result.status === 200) {
            const body = assertPublic(result, secrets, { [label]: encode });
            if (kind === 'bundle') {
              assert.ok(body.runs.length > 0 && body.trace.length > 0 && body.audit.length > 0 && body.logs.length > 0, 'all four real collections were actually exported');
              assert.ok(strings(body).includes('a public sentence without any held value'), 'public free text is not vacuously all dropped');
            }
          } else {
            assert.equal(result.status, 401, 'malformed, forged and expired identities are typed refusals');
            assert.deepEqual(scan(result.bytes, secrets.map((value, index) => ({ id: `held-${index}`, value }))), []);
          }
        }
      }
      for (const secret of secrets) assert.ok(!lines.some((line) => line.includes(encode(secret))), `${label}: no added form in server log output`);
    } finally { await app.close(); }
  }
});

test('a seeded sequence of added-form plants, public exports and restarts checks the global confidentiality invariant after every operation', { timeout: 170000 }, async () => {
  const config = configOf();
  const secrets = createVault(config).secrets();
  const encoders = Object.values(FORMS);
  let state = 0x0142026;
  const random = () => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state; };
  let app = await startLocal({ config });
  let observed = 0;
  try {
    for (let operation = 0; operation < 88; operation += 1) {
      if (operation > 0 && operation % 22 === 0) { await app.close(); app = await startLocal({ config }); }
      else app.service.plant(['run', 'trace', 'log', 'audit', 'error'][operation % 5], encoders[operation % encoders.length](secrets[random() % secrets.length]));
      assertPublic(await call(app.port, 'GET', '/v1/evidence/bundle'), secrets, FORMS);
      observed += 1;
    }
    assert.equal(observed, 88, 'the invariant ran after all operations, including each restart');
  } finally { await app.close(); }
});
