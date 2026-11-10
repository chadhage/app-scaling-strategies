'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');
const { createVault } = require('../vault.cjs');
const { startLocal, routeClass } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');

test('G9 an unknown named entity cannot become a recognized prefix when it ends in lowercase z or uppercase Z', () => {
  for (const word of ['amp', 'lt', 'gt', 'quot', 'apos', 'nbsp']) for (const last of ['z', 'Z']) for (const end of ['', ';']) {
    const text = `&${word}${last}${end}`;
    assert.equal(canon.htmlDecode(text), text, 'unknown named references remain literal');
  }
});

test('G9 four-digit and two-digit escapes accept uppercase A through F, including each F endpoint', () => {
  assert.equal(canon.unicodeUnescape('\\u00AF\\u00FF\\xAF\\x0F'), '\u00af\u00ff\u00af\u000f');
  assert.equal(canon.unicodeUnescape('\\u00af\\u00ff\\xaf\\x0f'), '\u00af\u00ff\u00af\u000f');
});

test('G6 validator class range endpoints are accepted independently: key 9, first/rest name z/Z, phone 9 and service Z', () => {
  for (const name of ["zZz-zZ O'Neil", "Zzz-Zz O'Neil"]) {
    const config = seedConfig();
    config.signingKey = 'AZaz09_-'.repeat(4);
    config.contacts.visitor.name = name;
    config.contacts.visitor.phone = '9'.repeat(8);
    config.serviceCredential.id = 'AZaz09_-';
    config.serviceCredential.secret = 'AZaz09_-'.repeat(2);
    assert.doesNotThrow(() => createVault(config), 'all declared validator alphabet endpoints are accepted');
    const held = createVault(config).secrets();
    for (const value of [config.signingKey, name, config.contacts.visitor.phone, config.serviceCredential.id, config.serviceCredential.secret]) assert.ok(held.includes(value));
  }
});

test('G11 an empty command segment stays an unknown route; query limits beginning with 9 are valid at one, two and three digits', async () => {
  const app = await startLocal({ config: seedConfig() });
  try {
    assert.equal(routeClass('/v1/commands/'), 'unknown');
    assert.equal((await call(app.port, 'GET', '/v1/commands/')).status, 404);
    for (const limit of [9, 90, 99, 199]) {
      const response = await call(app.port, 'GET', `/v1/evidence/trace?limit=${limit}`);
      assert.equal(response.status, 200);
      assert.equal(response.json().limit, limit);
    }
  } finally { await app.close(); }
});
