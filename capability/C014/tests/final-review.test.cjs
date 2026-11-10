'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');
const { createRedactor, MASK } = require('../redact.cjs');
const { createVault } = require('../vault.cjs');
const { startLocal, routeClass } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');
const { loadPage, settled } = require('./dom-stub.cjs');

test('G2 interval union: suffix-prefix, three-way chain, adjacent, contained and self-overlapping occurrences leave no fragment', () => {
  for (const [secrets, text, expected] of [
    [['abcdefgh', 'efghijkl'], 'abcdefghijkl', MASK],
    [['abcdefgh', 'efghijkl', 'ijklmnop'], 'abcdefghijklmnop', MASK],
    [['ababab'], 'abababab', MASK],
    [['aaaaaa'], 'aaaaaaa', MASK],
    [['abcdefgh', 'efghijkl'], 'abcdefghijkl!abcdefghijkl', `${MASK}!${MASK}`],
    [['abcdefgh', 'ijklmnop'], 'abcdefghijklmnop', `${MASK}${MASK}`],
    [['abcdefghijkl', 'efghij'], 'abcdefghijkl', MASK]
  ]) {
    assert.equal(createRedactor({ secrets }).maskText(text), expected, 'all source occurrence intervals are covered');
    assert.equal(createRedactor({ secrets: [...secrets].reverse() }).maskText(text), expected, 'registry order cannot affect the union');
  }
  const held = 'Qzvkx Wonderland';
  assert.equal(createRedactor({ secrets: ['abcdefgh', 'efghijkl', held] }).maskText(`abcdefghijkl ${encodeURIComponent(held)}`), MASK);
});

test('G2 public seam: overlapping password and service secret leave no anonymous trace fragment', async () => {
  const config = seedConfig();
  config.connectionString = 'Server=rvw-host-1;User Id=rvwuser1;Password=abcdefgh;';
  config.serviceCredential.secret = 'efghijkl';
  const app = await startLocal({ config });
  try {
    app.service.plant('trace', 'abcdefghijkl');
    const body = (await call(app.port, 'GET', '/v1/evidence/trace?limit=200')).json();
    assert.ok(body.items.some((item) => item.steps.some((step) => step.detail === MASK)), 'a union-masked detail was actually served');
    assert.ok(!JSON.stringify(body).includes('ijkl'), 'no suffix of the overlapping service secret is public');
  } finally { await app.close(); }
});

test('G3 a literal plus survives form encoding of spaces: naive and standard forms are both protected in public evidence', async () => {
  const config = seedConfig();
  config.contacts['conductor-a'].phone = '+1 (555) 013-5244';
  const phone = config.contacts['conductor-a'].phone;
  assert.ok(phone.startsWith('+') && phone.includes(' '), 'fixture exercises both distinct plus meanings');
  const forms = [phone.replace(/ /g, '+'), encodeURIComponent(phone).replace(/%20/g, '+')];
  const app = await startLocal({ config });
  try {
    for (const form of forms) app.service.plant('trace', `note ${form} end`);
    const response = await call(app.port, 'GET', '/v1/evidence/trace?limit=200');
    for (const form of forms) assert.ok(!response.bytes.includes(Buffer.from(form)), 'no covered plus-for-space form reaches public bytes');
    assert.equal(response.json().items.filter((item) => item.steps.some((step) => step.detail === MASK)).length, 2);
  } finally { await app.close(); }
});

test('G9 numeric decoder values: one digit, zero and 7, 8, 12 padded digits; both hex letter cases; Unicode maximum and invalid values', () => {
  for (const pad of [1, 7, 8, 12]) {
    const digits = (point, radix) => point.toString(radix).padStart(pad, '0');
    for (const point of [0, 9, 10, 15, 65, 122, 0x10ffff]) {
      const expected = String.fromCodePoint(point);
      for (const suffix of ['', ';']) {
        assert.equal(canon.htmlDecode(`&#${digits(point, 10)}${suffix}`), expected, `decimal padding ${pad}`);
        assert.equal(canon.htmlDecode(`&#x${digits(point, 16)}${suffix}`), expected, `hex padding ${pad}`);
        assert.equal(canon.htmlDecode(`&#X${digits(point, 16).toUpperCase()}${suffix}`), expected, `upper hex padding ${pad}`);
      }
      assert.equal(canon.unicodeUnescape(`\\u{${digits(point, 16)}}`), expected, `braced padding ${pad}`);
      assert.equal(canon.unicodeUnescape(`\\u{${digits(point, 16).toUpperCase()}}`), expected, `upper braced padding ${pad}`);
    }
  }
  for (const text of ['&#1114112;', '&#x110000;', '&#99999999;', '&#x1234567;', '&#;', '&#x;']) assert.equal(canon.htmlDecode(text), text);
  for (const text of ['\\u{110000}', '\\u{1234567}', '\\u{}']) assert.equal(canon.unicodeUnescape(text), text);
});

test('G9 padded encodings of a held fictional value mask the whole original text, not just a fragment', () => {
  const held = 'Qzvkx-Wonder-land-42';
  const redactor = createRedactor({ secrets: [held] });
  for (const pad of [7, 8, 12]) {
    const forms = [
      [...held].map((c) => `&#x${c.codePointAt(0).toString(16).padStart(pad, '0')};`).join(''),
      [...held].map((c) => `&#${c.codePointAt(0).toString(10).padStart(pad, '0')}`).join(''),
      [...held].map((c) => `\\u{${c.codePointAt(0).toString(16).padStart(pad, '0')}}`).join('')
    ];
    for (const form of forms) assert.equal(redactor.maskText(`note ${form} end`), MASK, `padding ${pad}`);
  }
});

test('G6 set-aside marker cannot join neighbours into a secret with either no separator or a space', () => {
  for (const secret of ['abcdef', 'abc def']) {
    const registry = new Map([[secret, canon.needlesFor(secret)]]);
    assert.equal(canon.encodedIn(`abc${secret}def`, registry), false, 'setting aside a verbatim occurrence cannot manufacture another form');
  }
});

test('G6 validator accepts lowercase initial, apostrophe, hyphen, underscore and canonical token/key alphabets', () => {
  const config = seedConfig();
  config.contacts.visitor.name = "mary-Jane O'Neil";
  config.signingKey = 'CNRY_key-with-both_-'.padEnd(32, 'x');
  const bytes = Buffer.alloc(32, 255);
  bytes[0] = 251;
  config.tokens.visitor = `c009_${bytes.toString('base64url')}`;
  assert.ok(config.tokens.visitor.includes('_') && config.tokens.visitor.includes('-'));
  const vault = createVault(config);
  assert.ok(vault.secrets().includes(config.contacts.visitor.name));
  assert.equal(vault.status().signingKey, true);
});

test('G10 asset media types are literal independent expectations', async () => {
  const app = await startLocal({ config: seedConfig() });
  try {
    for (const [route, type] of [['/', 'text/html; charset=utf-8'], ['/page.js', 'text/javascript; charset=utf-8'], ['/style.css', 'text/css; charset=utf-8']]) {
      const response = await call(app.port, 'GET', route);
      assert.equal(response.answer.headers['content-type'], type, route);
    }
  } finally { await app.close(); }
});

test('G11 route prefix and suffix anchors reject extra path segments and malformed numeric limits', async () => {
  const app = await startLocal({ config: seedConfig() });
  try {
    for (const route of ['/x/v1/commands/run.create', '/v1/commands/run.create/y', '/x/v1/evidence/trace', '/v1/evidence/trace/y']) {
      assert.equal(routeClass(route), 'unknown', route);
      assert.equal((await call(app.port, 'GET', route)).status, 404, route);
    }
    for (const limit of ['1000', '200x', '1\n', '200.0', '2000']) assert.equal((await call(app.port, 'GET', `/v1/evidence/trace?limit=${encodeURIComponent(limit)}`)).status, 400, limit);
  } finally { await app.close(); }
});

test('G11 page run id bounds and anchors accept four and nine digits and reject three, ten, prefix and suffix', async () => {
  for (const [id, accepted] of [['run-0000', true], ['run-999999999', true], ['run-000', false], ['run-0000000000', false], ['xrun-0000', false], ['run-0000x', false]]) {
    const loaded = loadPage({ fetch: async (url) => {
      const kind = /evidence\/(\w+)/.exec(url)[1];
      return { status: 200, json: async () => ({ outcome: 'ok', kind, revision: 1, total: kind === 'runs' ? 1 : 0, shown: kind === 'runs' ? 1 : 0, limit: 50,
        items: kind === 'runs' ? [{ id, units: 1, owner: null, revision: 1, status: 'ok', artifacts: 0, steps: [] }] : [] }) };
    } });
    await settled(loaded.document);
    assert.equal(loaded.document.elements.get('rows-runs').children.length, accepted ? 1 : 0, id);
  }
});
