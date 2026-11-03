'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const inspector = require('../inspector.js');
const { getProfileV1, getProfileV2 } = require('../profiles.cjs');
const script = fs.readFileSync(path.join(__dirname, '..', 'page.js'), 'utf8');

const goodScope = {
  cardId: 'C020', businessData: 'synthetic', transport: '127.0.0.1 HTTP only',
  testRuntime: process.version, identityVerified: false, nativeTargetQualified: false,
  productionRuntimeValidated: false, controlApiImplemented: false, durableStoreImplemented: false,
  liveAzureRuns: 0, authorizedCloudSpend: 0
};

async function surface(options = {}) {
  const ids = ['inspect-form', 'candidate-form', 'profile-id', 'inspect', 'validate', 'status', 'runtime',
    'compatibility', 'stamps', 'v1', 'v2', 'candidate', 'candidate-status', 'candidate-implementation'];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    value: '', textContent: '', disabled: ['inspect', 'validate'].includes(id), handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    focus() { this.focused = true; }
  }]));
  elements['profile-id'].value = 'synthetic-001';
  elements['candidate-implementation'].value = 'v2';
  elements.status.textContent = 'Not run — no profile observations.';
  const calls = [];
  const context = vm.createContext({
    document: { getElementById(id) { assert.ok(elements[id], id); return elements[id]; } },
    C020Inspector: options.missingInspector ? undefined : inspector,
    URLSearchParams,
    async fetch(url, request) {
      calls.push({ url, request });
      if (url === '/scope.json') return { ok: true, json: async () => options.scope || goodScope };
      if (options.fetch) return options.fetch(url);
      const parsed = new URL(url, 'http://127.0.0.1');
      const getProfile = parsed.pathname.includes('/v1/') ? getProfileV1 : getProfileV2;
      try {
        const body = getProfile({ profileId: parsed.searchParams.get('profileId') });
        return { ok: true, status: 200, json: async () => body };
      } catch (error) {
        return { ok: false, status: error.status, json: async () => ({ error: { code: error.code } }) };
      }
    }
  });
  vm.runInContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, calls, submit: (id) => elements[id].handlers.submit({ preventDefault() {} }) };
}

test('surface starts without healthy observations and requires a complete explicit local scope', async () => {
  const page = await surface();
  assert.match(page.elements.status.textContent, /Not run/);
  assert.equal(page.elements.inspect.disabled, false);
  assert.match(page.elements.runtime.textContent, /Not Node24\/Express production validation/);
  for (const field of ['businessData', 'transport', 'identityVerified', 'nativeTargetQualified', 'productionRuntimeValidated',
    'controlApiImplemented', 'durableStoreImplemented', 'liveAzureRuns', 'authorizedCloudSpend']) {
    const scope = { ...goodScope };
    delete scope[field];
    const missing = await surface({ scope });
    assert.equal(missing.elements.inspect.disabled, true, field);
    assert.match(missing.elements.status.textContent, /UNVERIFIED/, field);
    await missing.submit('inspect-form');
    assert.equal(missing.calls.length, 1);
  }
});

test('surface inspects BOTH responses, shows old-consumer semantics and stamps, and validates explicit candidates', async () => {
  const page = await surface();
  await page.submit('inspect-form');
  assert.match(page.elements.status.textContent, /VERIFIED LOCAL/);
  assert.equal(page.calls.length, 3);
  assert.match(page.calls[1].url, /^\/fixtures\/v1\/getProfile\?profileId=synthetic-001$/);
  assert.match(page.calls[2].url, /^\/fixtures\/v2\/getProfile\?profileId=synthetic-001$/);
  assert.deepEqual(JSON.parse(page.elements.stamps.textContent).map((stamp) => stamp.implementationVersion), ['1.0.0', '2.0.0']);
  assert.equal(JSON.parse(page.elements.compatibility.textContent).compatible, true);
  assert.equal(JSON.parse(page.elements.compatibility.textContent).oldConsumer.email, 'avery@example.invalid');
  assert.equal(page.elements.inspect.focused, true);
  await page.submit('candidate-form');
  assert.match(page.elements['candidate-status'].textContent, /VALID LOCAL CANDIDATE/);
  page.elements.candidate.value = '{';
  await page.submit('candidate-form');
  assert.match(page.elements['candidate-status'].textContent, /REJECTED — INVALID_JSON/);
  const forged = getProfileV2({ profileId: 'synthetic-001' });
  const copy = JSON.parse(JSON.stringify(forged));
  copy.stamp.deploymentStamp = 'forged';
  page.elements.candidate.value = JSON.stringify(copy);
  await page.submit('candidate-form');
  assert.match(page.elements['candidate-status'].textContent, /REJECTED — STAMP_MISMATCH/);
  assert.equal(page.calls.length, 3, 'candidate validation is not new HTTP evidence');
});

test('invalid lookup clears stale successful results and records failures from BOTH implementations', async () => {
  const page = await surface();
  await page.submit('inspect-form');
  page.elements['profile-id'].value = 'synthetic-999';
  await page.submit('inspect-form');
  assert.match(page.elements.status.textContent, /UNVERIFIED.*v1: UNKNOWN_PROFILE.*v2: UNKNOWN_PROFILE/);
  assert.equal(page.elements.stamps.textContent, 'No observed stamps.');
  assert.equal(page.elements.compatibility.textContent, 'No verified compatibility result.');
  assert.equal(page.elements.v1.textContent, 'No observation.');
  assert.equal(page.elements.v2.textContent, 'No observation.');
  assert.equal(page.elements.candidate.value, '');
});

test('malformed actual JSON or forged actual stamps cannot produce a successful surface', async () => {
  for (const invalidJson of [true, false]) {
    const page = await surface({
      async fetch(url) {
        const body = JSON.parse(JSON.stringify(getProfileV2({ profileId: 'synthetic-001' })));
        if (url.includes('/v1/')) return { ok: true, json: async () => getProfileV1({ profileId: 'synthetic-001' }) };
        body.stamp.implementationVersion = 'forged';
        return { ok: true, json: async () => { if (invalidJson) throw new SyntaxError('invalid'); return body; } };
      }
    });
    await page.submit('inspect-form');
    assert.match(page.elements.status.textContent, /UNVERIFIED/);
    assert.match(page.elements.status.textContent, invalidJson ? /INVALID_JSON/ : /STAMP_MISMATCH/);
    assert.equal(page.elements.stamps.textContent, 'No observed stamps.');
  }
});

test('missing inspector fails closed without using the blocked shared browser helper', async () => {
  const page = await surface({ missingInspector: true });
  assert.match(page.elements.status.textContent, /UNVERIFIED.*dependency unavailable/);
  assert.equal(page.elements.inspect.disabled, true);
  assert.equal(page.calls.length, 0);
});

test('pending observations disable editable context and duplicate submits do not issue extra requests', async () => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const page = await surface({
    async fetch(url) {
      await gate;
      return { ok: true, json: async () => (url.includes('/v1/') ? getProfileV1 : getProfileV2)({ profileId: 'synthetic-001' }) };
    }
  });
  const pending = page.submit('inspect-form');
  assert.equal(page.elements.inspect.disabled, true);
  assert.equal(page.elements['profile-id'].disabled, true);
  assert.equal(page.elements.candidate.disabled, true);
  await page.submit('inspect-form');
  assert.equal(page.calls.length, 3);
  finish();
  await pending;
  assert.equal(page.elements.inspect.disabled, false);
  assert.equal(page.elements['profile-id'].disabled, false);
});
