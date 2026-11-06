'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createWorld } = require('../fixture.cjs');
const { scope } = require('../server.cjs');
const { createDocument, runPage } = require('./dom-stub.cjs');
const { credentials } = require('./support.cjs');

// The page talks to the real fixture world through a fetch stub, so no socket is needed and no wall clock is used.
function fixtureFetch({ world = createWorld(), scopeRecord = scope, calls = [] } = {}) {
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === '/scope.json') return Response.json(scopeRecord);
    try {
      const observation = world.serve(world.authenticate(init.headers.Authorization));
      return Response.json(observation, { headers: {
        'x-c032-destination': observation.destination.id, 'x-c032-state-counter': String(observation.state.counter), 'x-c032-stamp': observation.stamp
      } });
    } catch (error) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
  };
  return { fetcher, calls };
}

async function open(options = {}) {
  const { fetcher, calls } = fixtureFetch(options);
  const { document } = await runPage({ fetch: options.fetch || fetcher, skip: options.skip });
  const text = (id) => document.element(id).textContent;
  return { document, calls, text, click: (id) => document.element(id).click(), select: (id, value) => { document.element(id).value = value; } };
}

test('the page starts with no observations, buttons off until the explicit local scope verifies', async () => {
  const page = await open();
  assert.match(page.text('status'), /^Not run/);
  assert.equal(page.document.element('observe').disabled, false);
  assert.equal(page.document.element('set-decoy').disabled, false);
  assert.match(page.text('runtime'), new RegExp(process.version.replaceAll('.', '\\.')));
  assert.match(page.text('runtime'), /Not Node24\/Express production validation/);
  assert.equal(page.text('cookie-view'), 'document.cookie: (none)');
  assert.deepEqual(page.calls.map((call) => call.url), ['/scope.json']);
  assert.equal(page.calls[0].init.credentials, 'omit');
  const cold = await runPage({ fetch: () => new Promise(() => {}) });
  assert.equal(cold.document.element('observe').disabled, true, 'disabled while the scope is still pending');
});

test('an incomplete or inconsistent scope keeps every control disabled', async () => {
  for (const field of Object.keys(scope)) {
    const scopeRecord = { ...scope };
    delete scopeRecord[field];
    if (['approvedProductionTarget', 'credentialTransport'].includes(field)) continue;
    const page = await open({ scopeRecord });
    assert.equal(page.document.element('observe').disabled, true, field);
    assert.match(page.text('status'), /^UNVERIFIED — scope unavailable/, field);
  }
  for (const [field, value] of [['identityVerified', true], ['liveAzureRuns', 1], ['transport', 'https'], ['businessData', 'real']]) {
    const page = await open({ scopeRecord: { ...scope, [field]: value } });
    assert.equal(page.document.element('observe').disabled, true, field);
  }
  const unavailable = await open({ fetch: async () => new Response('{}', { status: 500 }) });
  assert.match(unavailable.text('status'), /^UNVERIFIED — scope unavailable: HTTP 500/);
  const refused = await open({ fetch: async () => { throw new TypeError('refused'); } });
  assert.match(refused.text('status'), /^UNVERIFIED — scope unavailable: refused/);
});

test('a missing client or contract fails closed without any request', async () => {
  for (const skip of [['client.js'], ['contract.js', 'client.js']]) {
    const page = await open({ skip });
    assert.match(page.text('status'), /^UNVERIFIED — local client dependency unavailable/);
    assert.equal(page.document.element('observe').disabled, true);
    assert.deepEqual(page.calls, []);
  }
});

test('observing shows the server-owned client, destination and counter and sends a credentials-omit Bearer request', async () => {
  const page = await open();
  await page.click('observe');
  assert.match(page.text('status'), /^VERIFIED LOCAL/);
  assert.equal(page.text('client-view'), 'synthetic-client-alpha');
  assert.equal(page.text('destination-view'), 'synthetic-destination-blue (version 1.0.0)');
  assert.equal(page.text('counter-view'), '1');
  assert.equal(JSON.parse(page.text('result')).destination.id, 'synthetic-destination-blue');
  assert.match(page.text('log'), /#1 synthetic-client-alpha -> synthetic-destination-blue, counter 1/);
  const request = page.calls[1];
  assert.equal(request.url, '/api/v1/observation');
  assert.equal(request.init.credentials, 'omit');
  assert.deepEqual(Object.keys(request.init.headers).sort(), ['Accept', 'Authorization']);
  assert.equal(request.init.headers.Authorization, `Bearer ${credentials.alpha}`);
  assert.equal(page.document.element('observe').focusCount, 1);
  assert.deepEqual(page.document.writes, [], 'the page never writes a cookie by itself');
});

test('repeated observations follow the server plan through the destination transition', async () => {
  const page = await open();
  const seen = [];
  for (let index = 0; index < 3; index += 1) {
    await page.click('observe');
    seen.push([page.text('destination-view'), page.text('counter-view')]);
  }
  assert.deepEqual(seen, [['synthetic-destination-blue (version 1.0.0)', '1'], ['synthetic-destination-blue (version 1.0.0)', '2'],
    ['synthetic-destination-green (version 2.0.0)', '3']]);
  page.select('credential', credentials.beta);
  await page.click('observe');
  assert.equal(page.text('client-view'), 'synthetic-client-beta');
  assert.equal(page.text('counter-view'), '1');
});

test('a conflicting decoy cookie stays visible next to an observation it cannot change', async () => {
  const page = await open();
  await page.click('observe');
  const before = page.text('result');
  await page.click('set-decoy');
  assert.equal(page.document.cookie, 'c032_destination=synthetic-destination-green; c032_client=synthetic-client-beta; ARRAffinity=synthetic-affinity-green');
  assert.equal(page.text('cookie-view'), `document.cookie: ${page.document.cookie}`);
  await page.click('observe');
  assert.equal(page.text('destination-view'), 'synthetic-destination-blue (version 1.0.0)', 'the decoy naming green did not move the client');
  assert.equal(page.text('client-view'), 'synthetic-client-alpha', 'the decoy naming beta did not change the identity');
  assert.equal(JSON.parse(page.text('result')).state.counter, JSON.parse(before).state.counter + 1);
  assert.equal(page.text('cookie-view'), `document.cookie: ${page.document.cookie}`);
  assert.equal(page.document.writes.length, 3, 'only the three explicit decoy writes happened');
  await page.click('observe');
  page.select('decoy-destination', 'synthetic-destination-blue');
  await page.click('set-decoy');
  assert.match(page.document.cookie, /c032_destination=synthetic-destination-blue; .*ARRAffinity=synthetic-affinity-blue/);
  await page.click('observe');
  assert.equal(page.text('destination-view'), 'synthetic-destination-green (version 2.0.0)', 'a sticky blue cookie cannot hold the client after the transition');
  assert.ok(page.calls.slice(1).every((call) => !Object.keys(call.init.headers).some((name) => /cookie/i.test(name)) && call.init.credentials === 'omit'));
  assert.match(page.text('log'), /decoy cookies set/);
});

test('clearing removes only the decoy cookies', async () => {
  const page = await open();
  await page.click('set-decoy');
  page.document.cookie = 'unrelated=keep; path=/';
  await page.click('clear-decoy');
  assert.equal(page.document.cookie, 'unrelated=keep');
  assert.equal(page.text('cookie-view'), 'document.cookie: unrelated=keep');
  assert.match(page.text('log'), /decoy cookies cleared/);
});

for (const [name, value, code] of [
  ['an expired credential', credentials.expired, 'CREDENTIAL_EXPIRED'],
  ['a forged credential', credentials.forged, 'CREDENTIAL_FORGED'],
  ['an empty Bearer value', '', 'CREDENTIAL_MALFORMED'],
  ['no credential at all', '__none__', 'CREDENTIAL_MISSING']
]) {
  test(`${name} shows ${code} and clears the previous observation even with a decoy identity cookie`, async () => {
    const page = await open();
    await page.click('observe');
    await page.click('set-decoy');
    page.select('credential', value);
    await page.click('observe');
    assert.match(page.text('status'), new RegExp(`^UNVERIFIED — ${code}`));
    for (const id of ['client-view', 'destination-view', 'counter-view', 'result']) assert.equal(page.text(id), 'No observation.', id);
    assert.match(page.text('log'), new RegExp(`#2 failure ${code}`));
    assert.equal(Object.hasOwn(page.calls.at(-1).init.headers, 'Authorization'), value !== '__none__');
  });
}

test('a transport failure and an unexpected client error are explicit', async () => {
  const transport = await open({ fetch: async (url) => { if (url === '/scope.json') return Response.json(scope); throw new TypeError('refused'); } });
  await transport.click('observe');
  assert.match(transport.text('status'), /^UNVERIFIED — TRANSPORT_FAILED: The local request failed: refused/);
  const odd = await open({ fetch: async (url) => (url === '/scope.json' ? Response.json(scope) : { ok: true, status: 200 }) });
  await odd.click('observe');
  assert.match(odd.text('status'), /^UNVERIFIED — OBSERVATION_FAILED/);
  assert.match(odd.text('log'), /failure OBSERVATION_FAILED/);
});

test('a pending observation disables the controls and a second click issues no extra request', async () => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const { fetcher, calls } = fixtureFetch();
  const page = await open({ fetch: async (url, init) => { if (url === '/scope.json') return fetcher(url, init); await gate; return fetcher(url, init); } });
  const pending = page.click('observe');
  assert.equal(page.document.element('observe').disabled, true);
  assert.equal(page.document.element('credential').disabled, true);
  assert.equal(page.document.element('decoy-destination').disabled, true);
  assert.match(page.text('status'), /^Pending/);
  await page.document.element('observe').forceClick();
  finish();
  await pending;
  assert.equal(calls.length, 2, 'one scope request and exactly one observation request');
  assert.equal(page.document.element('observe').disabled, false);
  assert.equal(page.document.element('credential').disabled, false);
});

test('a disabled page ignores a forced click before the scope is verified', async () => {
  const { document } = await runPage({ fetch: () => new Promise(() => {}) });
  await document.element('observe').forceClick();
  assert.match(document.element('status').textContent, /^Not run/);
});

test('the request log keeps only the most recent lines', async () => {
  const page = await open();
  for (let index = 0; index < 14; index += 1) await page.click('observe');
  const lines = page.text('log').split('\n');
  assert.equal(lines.length, 12);
  assert.match(lines[0], /^#3 /);
  assert.match(lines.at(-1), /^#14 /);
});

test('every element the page uses exists in the real index.html', async () => {
  const document = createDocument();
  const { context } = await runPage({ fetch: fixtureFetch().fetcher, document });
  assert.ok(context);
  await document.element('observe').click();
  await document.element('set-decoy').click();
  await document.element('clear-decoy').click();
  document.element('credential').value = credentials.forged;
  await document.element('observe').click();
  for (const id of document.requested) assert.ok(document.elements.has(id), id);
  assert.deepEqual([...document.requested].sort(), ['clear-decoy', 'client-view', 'cookie-view', 'counter-view', 'credential',
    'decoy-destination', 'destination-view', 'log', 'observe', 'result', 'runtime', 'set-decoy', 'status']);
});
