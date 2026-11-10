'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const redact = require('../redact.cjs');
const { ENCODERS } = require('./scanner.cjs');

const { MASK, LIMITS, createRedactor, isPublicBody, SCHEMAS } = redact;
const SECRET = 'CNRYsecret-0123456789abcdefXYZ';
const run = (over = {}) => ({ id: 'run-0001', units: 3, owner: 'conductor-a', revision: 1, status: 'ok', artifacts: 1, steps: [{ event: 'note', detail: 'fine' }], ...over });
const redactor = () => createRedactor({ secrets: [SECRET] });
const publish = (kind, value, instance = redactor()) => instance.publish(kind, value).value;
const detailOf = (text, instance) => publish('runs', run({ steps: [{ event: 'note', detail: text }] }), instance).steps[0].detail;

test('publish refuses an unknown kind and never reads a kind from the prototype chain', () => {
  assert.throws(() => redactor().publish('nope', {}), { name: 'RangeError' });
  assert.throws(() => redactor().publish('constructor', {}), { name: 'RangeError' });
  assert.throws(() => redactor().publish('toString', {}), { name: 'RangeError' });
});

test('a PublicBody is minted by publish alone, is frozen, and serialises through toJSON', () => {
  const body = redactor().publish('runs', run());
  assert.equal(isPublicBody(body), true);
  assert.equal(isPublicBody({ value: {}, redactions: 0 }), false);
  assert.equal(isPublicBody(Object.create(Object.getPrototypeOf(body))), true, 'instanceof is the brand check; construction needs the private brand');
  assert.throws(() => new (Object.getPrototypeOf(body).constructor)({}, 0, Symbol('forged')), { name: 'TypeError' });
  assert.ok(Object.isFrozen(body) && Object.isFrozen(body.value) && Object.isFrozen(body.value.steps));
  assert.equal(JSON.stringify(body), JSON.stringify(body.value));
  assert.equal(body.redactions, 0);
});

test('allow-list: a field no rule names is never copied (unknown fields, nested unknown subtrees, canary keys)', () => {
  const hostile = run({ note: SECRET, authorization: `Bearer ${SECRET}`, requester: { name: SECRET, email: SECRET }, nested: [[SECRET], { deep: [SECRET] }], [SECRET]: SECRET, files: [{ file: SECRET }] });
  const out = publish('runs', hostile);
  assert.deepEqual(Object.keys(out), ['id', 'units', 'owner', 'revision', 'status', 'artifacts', 'steps']);
  assert.ok(!JSON.stringify(out).includes(SECRET));
  assert.deepEqual(out, publish('runs', run()), 'unknown fields change nothing');
});

test('typed fields: a value outside its closed vocabulary or range becomes null and is counted; an item with an invalid REQUIRED field is dropped whole', () => {
  const body = redactor().publish('runs', run({ owner: SECRET }));
  assert.equal(body.value.owner, null);
  assert.equal(body.redactions, 1);
  for (const bad of [{ id: 'run-1' }, { id: 'run-0001\n' }, { units: -1 }, { units: 1000001 }, { revision: 1.5 }, { status: 'ok\n' }, { artifacts: '3' }, { artifacts: 1001 }, { steps: 'x' }]) {
    const dropped = redactor().publish('runs', run(bad));
    assert.equal(dropped.value, null, JSON.stringify(bad));
    assert.ok(dropped.redactions >= 1);
  }
  const good = redactor().publish('runs', run({ id: 'run-123456789', units: 1000000, owner: null, artifacts: 1000 }));
  assert.equal(good.value.id, 'run-123456789');
  assert.equal(good.value.owner, null);
  assert.equal(good.redactions, 0);
  assert.equal(publish('audit', { seq: 1, outcome: 'applied', code: 'ok', command: SECRET, subject: 'operator', role: 'operator' }).command, null);
  assert.equal(publish('audit', { seq: 1, outcome: SECRET, code: 'ok', command: null, subject: null, role: null }), null);
  assert.equal(publish('trace', { seq: 1, kind: 'request', method: 'DELETE', route: 'asset', status: 200, role: null, code: null, steps: [] }), null);
  assert.equal(publish('trace', { seq: 1, kind: 'request', method: 'GET', route: 'asset', status: 99, role: 'root', code: 'nope', steps: [] }), null);
  assert.deepEqual(publish('trace', { seq: 1, kind: 'request', method: 'GET', route: 'asset', status: 200, role: 'root', code: 'nope', steps: [] }), { seq: 1, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: null, steps: [] });
  const signed = (signature) => publish('signedBundle', { signature });
  assert.equal(signed({ alg: 'HMAC-SHA256', value: 'AB'.repeat(32) }).signature, null, 'hex is lower case, 64 characters');
  assert.equal(signed({ alg: 'HMAC-SHA256', value: 'ab'.repeat(31) }).signature, null);
  assert.equal(signed({ alg: 'MD5', value: 'ab'.repeat(32) }).signature, null);
  assert.deepEqual(signed({ alg: 'HMAC-SHA256', value: 'ab'.repeat(32) }).signature, { alg: 'HMAC-SHA256', value: 'ab'.repeat(32) });
  const answer = (result) => publish('answer', { outcome: 'ok', command: 'run.create', revision: 1, actor: { subject: 'operator', role: 'operator' }, result, auditSeq: 1, ignoredClaims: [] });
  assert.equal(answer({ id: 'run-0001', checked: 'yes' }).result.checked, null);
  assert.equal(answer({ checked: true }).result.checked, true);
  assert.equal(answer({ id: 'run-0001' }).result.id, 'run-0001');
  assert.equal(publish('answer', { outcome: 'ok', command: 'run.create', revision: 1, actor: { subject: SECRET, role: 'operator' }, result: {}, auditSeq: 1, ignoredClaims: [] }).actor, null, 'an actor needs both fields');
  assert.equal(publish('error', { outcome: 'COMMAND_FAILED', error: { code: 'COMMAND_FAILED', message: 'x' }, auditSeq: null, ignoredClaims: [] }).auditSeq, null);
  assert.equal(publish('error', { outcome: 'COMMAND_FAILED', error: { code: 'COMMAND_FAILED', message: 'x' }, auditSeq: 7, ignoredClaims: [] }).auditSeq, 7);
});

test('text masking by value: a registered secret is replaced in place and the rest of the sentence stays', () => {
  const instance = redactor();
  assert.equal(detailOf(`login failed for ${SECRET}, retry later`, instance), `login failed for ${MASK}, retry later`);
  assert.equal(detailOf(`${SECRET}${SECRET}`, instance), `${MASK}${MASK}`);
  assert.equal(instance.publish('runs', run({ steps: [{ event: 'note', detail: `x ${SECRET}` }] })).redactions, 1);
  assert.equal(detailOf('nothing secret here', instance), 'nothing secret here');
});

test('text masking by value: every covered encoding of a registered secret masks the whole value', () => {
  const instance = redactor();
  for (const [name, encode] of Object.entries(ENCODERS)) {
    const text = `before ${encode(SECRET)} after`;
    const masked = detailOf(text, instance);
    assert.ok(masked === MASK || masked === text.replace(encode(SECRET), MASK), `${name}: masked`);
    assert.ok(!masked.includes(encode(SECRET)) || name === 'raw' && false, name);
    assert.notEqual(masked, text, `${name}: changed`);
  }
});

test('longer secrets are replaced before the shorter secrets they contain (overlap)', () => {
  const whole = `Server=tcp:${SECRET},1433;Password=${SECRET}x`;
  const instance = createRedactor({ secrets: [SECRET, whole] });
  assert.equal(detailOf(`failed: ${whole}`, instance), `failed: ${MASK}`);
});

test('secret shapes are masked although the service never held them: token, bearer, connection secret, e-mail, phone, jwt, long blob, long hex', () => {
  const instance = createRedactor({});
  const samples = {
    token: `c009_${'A'.repeat(43)}`, bearer: 'Bearer abc.def-ghi_jkl', connection: 'Password=hunter2hunter2;', connectionLower: 'pwd = s3cr3t-value', mail: 'alice.example+tag@canary-mail.invalid',
    phone: '+1 (555) 010-0123', jwt: `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(10)}`, blob: 'Zm9v'.repeat(12), hex: 'deadbeef'.repeat(5), apiKey: 'ApiKey=abcdef123456'
  };
  for (const [name, sample] of Object.entries(samples)) assert.equal(detailOf(`see ${sample} end`, instance).includes(sample), false, name);
  for (const harmless of ['run-0001 accepted', 'connected to the store', 'POST /v1/commands 202', 'user 42 of 100', 'a@b']) assert.equal(detailOf(harmless, instance), harmless, harmless);
});

test('the work is bounded: a text past the cap is masked unread, a long text is cut AFTER masking, and a secret across the cut is not left half', () => {
  const small = createRedactor({ secrets: [SECRET], limits: { ...LIMITS, textCap: 200, text: 60 } });
  assert.equal(detailOf('x'.repeat(201), small), MASK);
  assert.equal(detailOf('ab '.repeat(66), small), `${'ab '.repeat(20)}\u2026`);
  const straddle = `${'zz '.repeat(18)}${SECRET} tail`;
  const cut = detailOf(straddle, small);
  assert.ok(!cut.includes('CNRY') && cut.length <= 61 && cut.includes(MASK.slice(0, 5)), cut);
  assert.equal(small.maskText(42), MASK, 'a non-string is masked');
});

test('register: short and non-string values are refused, a duplicate changes nothing, a new secret changes the epoch', () => {
  const instance = createRedactor({ secrets: [SECRET, 'short', 42, null] });
  assert.equal(instance.size(), 1);
  const epoch = instance.epoch();
  assert.equal(instance.register(SECRET), true);
  assert.equal(instance.epoch(), epoch);
  assert.equal(instance.register('five!'), false);
  assert.equal(instance.register({}), false);
  assert.equal(instance.register('a-brand-new-secret'), true);
  assert.equal(instance.epoch(), epoch + 1);
  assert.equal(detailOf('x a-brand-new-secret y', instance), `x ${MASK} y`);
});

test('arrays: every entry is walked, invalid entries are dropped, and a long array is cut and counted', () => {
  const steps = Array.from({ length: 12 }, (_, index) => ({ event: index === 3 ? 'bogus' : 'note', detail: index === 5 ? SECRET : `step ${index}`, extra: SECRET }));
  const body = redactor().publish('runs', run({ steps }));
  assert.equal(body.value.steps.length, 7, 'eight kept, one invalid dropped');
  assert.ok(!JSON.stringify(body.value).includes(SECRET));
  assert.ok(body.value.steps.every((step) => Object.keys(step).join() === 'event,detail'));
  assert.ok(body.redactions >= 3);
  assert.equal(publish('runs', run({ steps: 'not an array' })), null);
  assert.deepEqual(publish('runs', run({ steps: [null, 7, 'x', [], { event: 'note', detail: 'ok' }] })).steps, [{ event: 'note', detail: 'ok' }]);
});

test('the list envelope accepts only PublicBody items: a plain object, however well formed, is dropped', () => {
  const instance = redactor();
  const real = instance.publish('runs', run());
  const doc = instance.publish('list', { outcome: 'ok', kind: 'runs', revision: 1, total: 2, shown: 2, limit: 50, items: [real, run(), { value: run() }, null] }).value;
  assert.equal(doc.items.length, 1);
  assert.equal(doc.items[0], real.value);
  assert.equal(publish('list', { outcome: 'ok', kind: 'secrets', revision: 1, total: 0, shown: 0, limit: 500, items: [] }, instance).kind, null);
  assert.equal(publish('list', { outcome: 'ok', kind: 'runs', revision: 1, total: 0, shown: 0, limit: 500, items: [] }, instance).limit, null);
});

test('hostile values never throw: throwing getters, proxies, sparse and huge arrays, cycles, prototype keys, wrong types', () => {
  const instance = redactor();
  const trap = new Proxy({}, { has() { throw new Error(SECRET); }, get() { throw new Error(SECRET); }, getOwnPropertyDescriptor() { throw new Error(SECRET); }, ownKeys() { throw new Error(SECRET); } });
  const cycle = run();
  cycle.self = cycle;
  cycle.steps.push({ event: 'note', detail: 'x', self: cycle });
  const getter = run();
  Object.defineProperty(getter, 'units', { get() { throw new Error(SECRET); }, enumerable: true });
  const sparse = run({ steps: new Array(1e9) });
  const proto = JSON.parse(`{"__proto__":{"polluted":"${SECRET}"},"id":"run-0001","units":1,"owner":null,"revision":0,"status":"ok","artifacts":0,"steps":[]}`);
  for (const hostile of [trap, cycle, getter, sparse, proto, undefined, null, 7, 'text', [], () => 1, Symbol('s'), 10n, new Map(), run({ steps: trap }), run({ steps: [trap] })]) {
    const text = JSON.stringify(instance.publish('runs', hostile));
    assert.ok(!text.includes(SECRET) && !text.includes('polluted'));
  }
  assert.equal(instance.publish('runs', getter).value, null, 'a getter that throws reads as absent, and a required field that is absent drops the item');
  assert.equal(publish('runs', sparse, instance).steps.length, 0);
  assert.equal(Object.prototype.polluted, undefined);
  for (const kind of Object.keys(SCHEMAS)) assert.doesNotThrow(() => instance.publish(kind, trap));
  assert.equal(JSON.stringify(instance.publish('runs', trap)), 'null');
});

test('publish is deterministic and its result does not alias its input', () => {
  const instance = redactor();
  const input = run({ steps: [{ event: 'note', detail: `a ${SECRET}` }] });
  const first = instance.publish('runs', input);
  assert.equal(JSON.stringify(first), JSON.stringify(instance.publish('runs', input)));
  input.steps[0].detail = 'changed afterwards';
  assert.notEqual(first.value.steps[0].detail, 'changed afterwards');
  assert.throws(() => { 'use strict'; first.value.steps[0].detail = 'x'; }, TypeError);
});

// The literal tables below do not read the limits out of the schema: a changed constant in redact.cjs must fail here.
const traceOf = (over = {}) => ({ seq: 1, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: null, steps: [], ...over });
const logOf = (over = {}) => ({ seq: 1, level: 'info', event: 'request', route: 'asset', status: 200, code: null, role: null, ...over });
const listOf = (over = {}) => ({ outcome: 'ok', kind: 'runs', revision: 1, total: 0, shown: 0, limit: 50, items: [], ...over });
const failureOf = (over = {}) => ({ outcome: 'COMMAND_FAILED', error: { code: 'COMMAND_FAILED', message: 'x' }, auditSeq: null, ignoredClaims: [], ...over });
const scopeOf = (over = {}) => ({ outcome: 'ok', scope: { cardId: 'C014', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', persistence: 'none', secretsServerSide: true, publicEvidenceRedacted: true, liveAzureRuns: 0, authorizedCloudSpend: 0, ...over } });
const configOf = (over = {}) => ({ outcome: 'ok', configured: { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4, ...over } });
const answerOf = (over = {}) => ({ outcome: 'ok', command: 'run.create', revision: 1, actor: { subject: 'operator', role: 'operator' }, result: {}, auditSeq: 1, ignoredClaims: [], ...over });

test('the literal limits: 65,536 characters are examined and 65,537 masked unread, 4,096 are kept and the 4,097th starts a cut, 200 entries, 8 steps and 32 claims are kept and one more is dropped and counted', () => {
  assert.deepEqual({ ...LIMITS }, { textCap: 65536, text: 4096, entries: 200, steps: 8, claims: 32 });
  const instance = redactor();
  const text = (length) => 'b '.repeat(Math.ceil(length / 2)).slice(0, length);
  assert.equal(instance.maskText(text(4096)), text(4096), '4,096 characters are kept whole');
  assert.equal(instance.maskText(text(4097)), `${text(4096)}\u2026`, 'the 4,097th character starts the cut');
  assert.equal(instance.maskText(text(65536)), `${text(4096)}\u2026`, '65,536 characters are examined, then cut');
  assert.equal(instance.maskText(text(65537)), MASK, 'one more is masked unread');
  assert.equal(instance.maskText(5), MASK, 'a value that is not text is masked');
  const steps = (count) => Array.from({ length: count }, () => ({ event: 'note', detail: 'fine' }));
  const eight = instance.publish('runs', run({ steps: steps(8) }));
  assert.deepEqual([eight.value.steps.length, eight.redactions], [8, 0]);
  const nine = instance.publish('runs', run({ steps: steps(9) }));
  assert.deepEqual([nine.value.steps.length, nine.redactions], [8, 1]);
  const item = instance.publish('runs', run());
  const items = (count) => Array.from({ length: count }, () => item);
  const full = instance.publish('list', listOf({ items: items(200), limit: 200 }));
  assert.deepEqual([full.value.items.length, full.redactions], [200, 0]);
  const over = instance.publish('list', listOf({ items: items(201), limit: 200 }));
  assert.deepEqual([over.value.items.length, over.redactions], [200, 1]);
  const claims = (count) => Array.from({ length: count }, () => 'role');
  const thirtyTwo = instance.publish('answer', answerOf({ ignoredClaims: claims(32) }));
  assert.deepEqual([thirtyTwo.value.ignoredClaims.length, thirtyTwo.redactions], [32, 0]);
  const thirtyThree = instance.publish('answer', answerOf({ ignoredClaims: claims(33) }));
  assert.deepEqual([thirtyThree.value.ignoredClaims.length, thirtyThree.redactions], [32, 1]);
});

test('every integer field accepts exactly its literal range and nothing else: status 100 to 599, units 0 to 1,000,000, artifacts 0 to 1,000, counts 0 to 1,000,000,000, list limit 1 to 200, audit sequence 0 to 1,000,000,000, the scope numbers exactly 0', () => {
  const instance = redactor();
  const table = [
    ['trace.status', (value) => instance.publish('trace', traceOf({ status: value })).value, (out) => (out ? out.status : null), 100, 599],
    ['logs.status', (value) => instance.publish('logs', logOf({ status: value })).value, (out) => (out ? out.status : null), 100, 599],
    ['trace.seq', (value) => instance.publish('trace', traceOf({ seq: value })).value, (out) => (out ? out.seq : null), 0, 1000000000],
    ['runs.units', (value) => instance.publish('runs', run({ units: value })).value, (out) => (out ? out.units : null), 0, 1000000],
    ['runs.artifacts', (value) => instance.publish('runs', run({ artifacts: value })).value, (out) => (out ? out.artifacts : null), 0, 1000],
    ['list.limit', (value) => instance.publish('list', listOf({ limit: value })).value, (out) => out.limit, 1, 200],
    ['list.total', (value) => instance.publish('list', listOf({ total: value })).value, (out) => out.total, 0, 1000000000],
    ['error.auditSeq', (value) => instance.publish('error', failureOf({ auditSeq: value })).value, (out) => out.auditSeq, 0, 1000000000],
    ['scope.liveAzureRuns', (value) => instance.publish('scope', scopeOf({ liveAzureRuns: value })).value, (out) => out.scope.liveAzureRuns, 0, 0],
    ['scope.authorizedCloudSpend', (value) => instance.publish('scope', scopeOf({ authorizedCloudSpend: value })).value, (out) => out.scope.authorizedCloudSpend, 0, 0],
    ['config.tokens', (value) => instance.publish('config', configOf({ tokens: value })).value, (out) => out.configured.tokens, 0, 1000000000]
  ];
  for (const [name, publishWith, pick, low, high] of table) {
    for (const accepted of [...new Set([low, high])]) assert.equal(pick(publishWith(accepted)), accepted, `${name}: ${accepted} is accepted`);
    for (const refused of [low - 1, high + 1, 1.5, NaN, Infinity, '1', null, 2 ** 53]) {
      assert.equal(pick(publishWith(refused)), null, `${name}: ${String(refused)} is refused`);
    }
  }
});

test('the audit sequence is nullable and the run id is an id: a present invalid value costs one redaction, null costs none, and an invalid id is never kept', () => {
  const instance = redactor();
  const bad = instance.publish('error', failureOf({ auditSeq: 'x' }));
  assert.deepEqual([bad.value.auditSeq, bad.redactions], [null, 1]);
  const none = instance.publish('error', failureOf({ auditSeq: null }));
  assert.deepEqual([none.value.auditSeq, none.redactions], [null, 0]);
  for (const id of ['bad', 'run-123', 'run-1234567890', 'run-0001\n', SECRET, 5, {}]) {
    const body = instance.publish('answer', answerOf({ result: { id } }));
    assert.deepEqual([body.value.result.id, body.redactions], [null, 1], `an invalid result id ${typeof id}`);
  }
  for (const id of ['run-0001', 'run-123456789']) assert.equal(publish('answer', answerOf({ result: { id } }), instance).result.id, id);
  assert.equal(publish('runs', run({ id: 'run-1234567890' }), instance), null);
  assert.equal(publish('runs', run({ id: 'run-123' }), instance), null);
});

test('redaction counts: an absent or null field costs nothing, a present invalid value one, a dropped item one more; a document that is not an object is one, or none when it is null', () => {
  const instance = redactor();
  const count = (kind, value) => instance.publish(kind, value).redactions;
  const without = (value, field) => { const copy = { ...value }; delete copy[field]; return copy; };
  assert.equal(count('runs', without(run(), 'owner')), 0, 'an absent optional field');
  assert.equal(count('runs', run({ owner: null })), 0, 'a null optional field');
  assert.equal(count('runs', run({ owner: 'nobody' })), 1, 'a present invalid value');
  assert.equal(count('trace', without(traceOf(), 'status')), 1, 'an absent required field drops the item: one');
  assert.equal(count('trace', traceOf({ status: null })), 1, 'a null required field drops the item: one');
  assert.equal(count('trace', traceOf({ status: 99 })), 2, 'an invalid required value: one for the value, one for the dropped item');
  assert.equal(count('trace', {}), 1, 'an empty document drops the item');
  for (const kind of ['trace', 'config', 'scope', 'list']) {
    assert.deepEqual([instance.publish(kind, null).value, count(kind, null)], [null, 0], `${kind}: null`);
    assert.deepEqual([instance.publish(kind, undefined).value, count(kind, undefined)], [null, 0], `${kind}: undefined`);
    for (const hostile of ['text', 5, true, [], [1, 2]]) {
      const body = instance.publish(kind, hostile);
      assert.deepEqual([body.value, body.redactions], [null, 1], `${kind}: ${JSON.stringify(hostile)}`);
    }
  }
  const textless = instance.publish('runs', run({ steps: [{ event: 'note', detail: 42 }] }));
  assert.deepEqual([textless.value.steps, textless.redactions], [[], 2], 'a step whose text is not a string is dropped, never masked into a string');
  const boom = new Proxy([], { get() { throw new Error('boom'); } });
  const thrown = instance.publish('runs', run({ steps: boom }));
  assert.deepEqual([thrown.value, thrown.redactions], [null, 1], 'a document that cannot be walked is nothing and counts once');
});

test('register: a secret needs six characters, the epoch counts the secrets the redactor learned (a repeat changes nothing), a short value is refused', () => {
  const instance = createRedactor();
  assert.equal(instance.epoch(), 0);
  assert.equal(instance.size(), 0);
  assert.equal(instance.register('abcde'), false);
  assert.equal(instance.register(12345678), false);
  assert.equal(instance.epoch(), 0);
  assert.equal(instance.register('abcdef'), true, 'exactly six characters');
  assert.deepEqual([instance.epoch(), instance.size()], [1, 1]);
  assert.equal(instance.register('abcdef'), true);
  assert.deepEqual([instance.epoch(), instance.size()], [1, 1]);
  assert.equal(instance.register('ghijkl'), true);
  assert.deepEqual([instance.epoch(), instance.size()], [2, 2]);
});
