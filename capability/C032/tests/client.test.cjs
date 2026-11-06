'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const vm = require('node:vm');
const { ClientError, createClient, validateObservation } = require('../client.js');
const { credentials, withServer } = require('./support.cjs');

const goodBody = () => ({
  apiContract: 'cookieless-observation/1', businessData: 'synthetic', client: { id: 'synthetic-client-alpha' },
  destination: { id: 'synthetic-destination-blue', version: '1.0.0' }, state: { counter: 1 }, stamp: 'C032-loopback-r1'
});
const goodHeaders = () => ({ 'x-c032-destination': 'synthetic-destination-blue', 'x-c032-state-counter': '1', 'x-c032-stamp': 'C032-loopback-r1' });
const reply = (body, { status = 200, headers = goodHeaders(), raw } = {}) => async () =>
  new Response(raw === undefined ? JSON.stringify(body) : raw, { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function failureOf(promise) {
  try { await promise; } catch (error) { return error; }
  return assert.fail('expected a ClientError');
}

test('the client refuses an absent fetch and a non-string credential', () => {
  assert.throws(() => createClient({ fetch: null }), { name: 'ClientError', code: 'FETCH_UNAVAILABLE' });
  assert.throws(() => createClient({ credential: 5 }), { name: 'ClientError', code: 'CREDENTIAL_TYPE' });
  assert.throws(() => createClient({ credential: null }), { code: 'CREDENTIAL_TYPE' });
  assert.equal(typeof createClient({ credential: credentials.alpha }).observe, 'function');
  assert.equal(typeof createClient().observe, 'function', 'the global fetch is the default transport');
});

test('every request is credentials-omit with exactly Accept and one Bearer header, and never a cookie', async () => {
  const inits = [];
  const urls = [];
  const fetcher = async (url, init) => { urls.push(url); inits.push(init); return reply(goodBody())(); };
  await createClient({ fetch: fetcher, baseUrl: 'http://127.0.0.1:1', credential: credentials.alpha }).observe();
  await createClient({ fetch: fetcher, credential: credentials.beta }).observe();
  assert.deepEqual(urls, ['http://127.0.0.1:1/api/v1/observation', '/api/v1/observation']);
  assert.deepEqual(inits[0], {
    method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credentials.alpha}` },
    credentials: 'omit', cache: 'no-store', redirect: 'error'
  });
  assert.equal(inits[1].headers.Authorization, `Bearer ${credentials.beta}`);
  for (const init of inits) assert.equal(Object.keys(init.headers).some((name) => /^cookie$/i.test(name)), false);
});

test('without a credential the client sends none and invents no default identity', async () => {
  const inits = [];
  const fetcher = async (url, init) => { inits.push(init); return reply({ error: { code: 'CREDENTIAL_MISSING' } }, { status: 401, headers: {} })(); };
  const error = await failureOf(createClient({ fetch: fetcher }).observe());
  assert.deepEqual(Object.keys(inits[0].headers), ['Accept']);
  assert.ok(error instanceof ClientError);
  assert.deepEqual([error.code, error.status], ['CREDENTIAL_MISSING', 401]);
});

test('against the real loopback server the client returns a frozen, validated, server-owned observation', async () => {
  await withServer({}, async (fixture) => {
    const observer = createClient({ baseUrl: fixture.origin, credential: credentials.alpha });
    const first = await observer.observe();
    const second = await observer.observe();
    const third = await observer.observe();
    assert.deepEqual([first, second, third].map((item) => item.state.counter), [1, 2, 3]);
    assert.deepEqual([first, second, third].map((item) => item.destination.id), [
      'synthetic-destination-blue', 'synthetic-destination-blue', 'synthetic-destination-green']);
    assert.equal(first.client.id, 'synthetic-client-alpha');
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.destination) && Object.isFrozen(first.state));
    assert.deepEqual(fixture.seen.map((item) => item.headers.cookie), [undefined, undefined, undefined]);
  });
});

for (const [name, credential, status, code] of [
  ['no credential', undefined, 401, 'CREDENTIAL_MISSING'],
  ['an empty credential', '', 401, 'CREDENTIAL_MALFORMED'],
  ['a forged credential', credentials.forged, 401, 'CREDENTIAL_FORGED'],
  ['an expired credential', credentials.expired, 401, 'CREDENTIAL_EXPIRED']
]) {
  test(`the real server turns ${name} into the typed client failure ${code}`, async () => {
    await withServer({}, async (fixture) => {
      const error = await failureOf(createClient({ baseUrl: fixture.origin, credential }).observe());
      assert.deepEqual([error.name, error.code, error.status], ['ClientError', code, status]);
    });
  });
}

test('a transport failure is typed and never an observation', async () => {
  const error = await failureOf(createClient({ fetch: async () => { throw new TypeError('connection refused'); } }).observe());
  assert.equal(error.code, 'TRANSPORT_FAILED');
  assert.match(error.message, /connection refused/);
});

test('a server that tries to set a cookie is refused even when the body is perfect', async () => {
  const error = await failureOf(createClient({ fetch: reply(goodBody(), { headers: { ...goodHeaders(), 'Set-Cookie': 'c032_destination=synthetic-destination-green' } }) }).observe());
  assert.deepEqual([error.code, error.status], ['COOKIE_SET_FORBIDDEN', 200]);
});

test('malformed JSON and non-conforming error bodies are explicit', async () => {
  assert.equal((await failureOf(createClient({ fetch: reply(null, { raw: '{' }) }).observe())).code, 'INVALID_JSON');
  for (const [body, code] of [
    [{ error: { code: 'INVALID_QUERY' } }, 'INVALID_QUERY'], [{ error: { code: 'lowercase' } }, 'HTTP_ERROR'], [{ error: 'text' }, 'HTTP_ERROR'],
    [{}, 'HTTP_ERROR'], [null, 'HTTP_ERROR'], [[], 'HTTP_ERROR'], [{ error: null }, 'HTTP_ERROR']
  ]) {
    const error = await failureOf(createClient({ fetch: reply(body, { status: 400, headers: {} }) }).observe());
    assert.deepEqual([error.code, error.status], [code, 400], JSON.stringify(body));
  }
});

const invalidBodies = [
  ['a missing field', (body) => { delete body.stamp; }],
  ['an unknown field', (body) => { body.destinationOverride = 'synthetic-destination-green'; }],
  ['a wrong API contract', (body) => { body.apiContract = 'cookieless-observation/2'; }],
  ['a real-data label', (body) => { body.businessData = 'production'; }],
  ['a forged stamp', (body) => { body.stamp = 'production'; }],
  ['an unknown client', (body) => { body.client.id = 'real-person'; }],
  ['a client with extra fields', (body) => { body.client.role = 'admin'; }],
  ['an unknown destination', (body) => { body.destination.id = 'production-eastus'; }],
  ['a destination with the wrong version', (body) => { body.destination.version = '9.9.9'; }],
  ['a destination with extra fields', (body) => { body.destination.region = 'eastus'; }],
  ['a null destination', (body) => { body.destination = null; }],
  ['a zero counter', (body) => { body.state.counter = 0; }],
  ['a fractional counter', (body) => { body.state.counter = 1.5; }],
  ['a string counter', (body) => { body.state.counter = '1'; }],
  ['state with extra fields', (body) => { body.state.version = 7; }],
  ['an array instead of the state', (body) => { body.state = [1]; }]
];
for (const [name, mutate] of invalidBodies) {
  test(`the client rejects ${name} with INVALID_OBSERVATION`, async () => {
    const body = goodBody();
    mutate(body);
    const error = await failureOf(createClient({ fetch: reply(body) }).observe());
    assert.equal(error.code, 'INVALID_OBSERVATION');
  });
}

test('headers that disagree with the body or are missing make the observation incoherent', async () => {
  for (const override of [{ 'x-c032-destination': 'synthetic-destination-green' }, { 'x-c032-state-counter': '2' }, { 'x-c032-stamp': 'other' }]) {
    const error = await failureOf(createClient({ fetch: reply(goodBody(), { headers: { ...goodHeaders(), ...override } }) }).observe());
    assert.equal(error.code, 'OBSERVATION_INCOHERENT', JSON.stringify(override));
  }
  assert.equal((await failureOf(createClient({ fetch: reply(goodBody(), { headers: {} }) }).observe())).code, 'OBSERVATION_INCOHERENT');
});

test('validation copies the observation and rejects non-plain objects', () => {
  const body = goodBody();
  const headers = new Headers(goodHeaders());
  const checked = validateObservation(body, headers);
  body.destination.id = 'synthetic-destination-green';
  assert.equal(checked.destination.id, 'synthetic-destination-blue');
  assert.throws(() => validateObservation(Object.assign(Object.create({ inherited: true }), goodBody()), headers), { code: 'INVALID_OBSERVATION' });
  assert.throws(() => validateObservation(null, headers), { code: 'INVALID_OBSERVATION' });
});

test('outside a module system the scripts define browser globals, and a missing contract disables the client', () => {
  const read = (file) => ({ source: fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), filename: pathToFileURL(path.join(__dirname, '..', file)).href });
  const load = (context, file) => { const { source, filename } = read(file); new vm.Script(source, { filename }).runInContext(context); };
  const browser = vm.createContext({});
  load(browser, 'contract.js');
  load(browser, 'client.js');
  assert.equal(vm.runInContext('typeof C032Client.createClient', browser), 'function');
  assert.equal(vm.runInContext('C032Contract.apiContract', browser), 'cookieless-observation/1');
  assert.equal(vm.runInContext('Object.getOwnPropertyDescriptor(globalThis, "C032Client").writable', browser), false);
  const missing = vm.createContext({});
  load(missing, 'client.js');
  assert.equal(vm.runInContext('C032Client', missing), null);
});
