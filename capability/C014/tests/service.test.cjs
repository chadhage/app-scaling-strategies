'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateInput, createService, TABLE, MODES, SCOPE } = require('../service.cjs');
const { ConfigError } = require('../vault.cjs');
const { seedConfig, canaryList } = require('./canaries.cjs');
const { scan } = require('./scanner.cjs');

const service = (options = {}) => createService({ config: seedConfig(), ...options });
const ids = (body) => body.value.items.map((item) => item.id);

test('validateInput: run.create keeps the C009 rules; config.check takes exactly one field, mode, with the same closed refusals', () => {
  assert.deepEqual(validateInput('run.create', { name: 'a-run', units: 3 }), { ok: true, value: { name: 'a-run', units: 3 } });
  assert.equal(validateInput('run.create', { name: 'A', units: 3 }).code, 'INPUT_INVALID');
  assert.deepEqual(validateInput('config.check', { mode: 'ok' }), { ok: true, value: { mode: 'ok' } });
  assert.deepEqual(validateInput('config.check', { mode: 'fail' }), { ok: true, value: { mode: 'fail' } });
  assert.deepEqual(validateInput('config.check', { mode: 'x' }), { ok: false, code: 'INPUT_INVALID', field: 'mode' });
  assert.deepEqual(validateInput('config.check', {}), { ok: false, code: 'INPUT_MISSING_FIELD', field: 'mode' });
  assert.deepEqual(validateInput('config.check', { mode: 'ok', extra: 1 }), { ok: false, code: 'INPUT_UNKNOWN_FIELD', field: 'extra' });
  assert.deepEqual(validateInput('config.check', { role: 'operator' }), { ok: false, code: 'IDENTITY_CLAIM_REJECTED', field: 'role' });
  for (const body of [null, [], 'x', 7]) assert.equal(validateInput('config.check', body).code, 'BODY_NOT_OBJECT');
  for (const body of [null, [], 'x', 7]) assert.deepEqual(validateInput('config.check', body), { ok: false, code: 'BODY_NOT_OBJECT' });
  for (const command of ['pool.resize', '', undefined, 'toString']) assert.equal(validateInput(command, {}).code, 'COMMAND_UNKNOWN');
  for (const command of ['pool.resize', '', undefined, 'toString']) assert.deepEqual(validateInput(command, {}), { ok: false, code: 'COMMAND_UNKNOWN' });
  assert.deepEqual(MODES, ['ok', 'fail']);
});

test('the permission table is deny by default and frozen: run.create is for conductors, config.check for the operator', () => {
  assert.deepEqual(Object.keys(TABLE), ['run.create', 'config.check']);
  assert.deepEqual(TABLE['run.create'].roles, ['conductor']);
  assert.deepEqual(TABLE['config.check'].roles, ['operator']);
  assert.ok(Object.isFrozen(TABLE) && Object.isFrozen(TABLE['run.create']) && Object.isFrozen(TABLE['run.create'].roles) && Object.isFrozen(SCOPE));
});

test('createService refuses an invalid configuration with the typed ConfigError and nothing else', () => {
  assert.throws(() => createService({ config: null }), ConfigError);
  assert.throws(() => createService({}), ConfigError);
  const config = seedConfig();
  config.signingKey = 'short';
  assert.throws(() => createService({ config }), (error) => error.field === 'signingKey' && !error.message.includes('CNRY'));
});

test('createService checks that the registry issues exactly the configured tokens (a registry that disagrees is a ConfigError)', () => {
  const servicePath = require.resolve('../service.cjs');
  const authzPath = require.resolve('../../C009/authz.cjs');
  const real = require(authzPath);
  const saved = [require.cache[servicePath], require.cache[authzPath]];
  try {
    require.cache[authzPath] = { ...require.cache[authzPath], exports: { ...real, createTokenRegistry: () => ({ issue: () => 'c009_unexpected', verify: () => null }) } };
    delete require.cache[servicePath];
    const fresh = require(servicePath);
    assert.throws(() => fresh.createService({ config: seedConfig() }), (error) => error instanceof ConfigError && error.field === 'tokens');
  } finally {
    require.cache[authzPath] = saved[1];
    delete require.cache[servicePath];
    if (saved[0]) require.cache[servicePath] = saved[0];
  }
});

test('plant puts a value in every position of the raw record of each place; the public items never show it', () => {
  const instance = service();
  const value = 'CNRYplanted-abcdefghijklmn';
  for (const place of ['run', 'trace', 'log', 'audit', 'error']) instance.plant(place, value);
  assert.throws(() => instance.plant('nowhere', value), { name: 'RangeError' });
  assert.equal(instance.revision(), 1);
  for (const kind of ['trace', 'runs', 'audit', 'logs']) {
    const list = instance.listBody(kind, 50);
    assert.ok(list.value.shown >= 1, kind);
    const free = kind === 'trace' || kind === 'runs';
    assert.equal(JSON.stringify(list).includes(value), free, `${kind}: only free text can show a value the service was never told about (README limit)`);
  }
  const registered = service();
  for (const place of ['run', 'trace', 'log', 'audit', 'error']) registered.plant(place, seedConfig().tokens.operator);
  for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.equal(scan(JSON.stringify(registered.listBody(kind, 50)), canaryList()).length, 0, kind);
  assert.equal(scan(JSON.stringify(registered.bundleBody()), canaryList()).length, 0);
});

test('plant converts a non-string value to text first', () => {
  const instance = service();
  instance.plant('run', 12345);
  assert.equal(instance.listBody('runs', 5).value.shown, 1);
});

test('recordRequest: a raw trace and a raw log, the level from the status, the console line is the redacted log item, a failing sink never fails a request', () => {
  const lines = [];
  const instance = service({ logSink: (line) => lines.push(line) });
  const base = { method: 'GET', route: 'evidence', code: 'ok', role: null, url: '/v1/evidence/trace', headers: { 'user-agent': `agent ${seedConfig().tokens.operator}` } };
  instance.recordRequest({ ...base, status: 200 });
  instance.recordRequest({ ...base, status: 404, code: 'NOT_FOUND', method: 'DELETE' });
  instance.recordRequest({ ...base, status: 500, code: 'INTERNAL_ERROR', method: 'POST', headers: {} });
  assert.deepEqual(lines.map((line) => JSON.parse(line).level), ['info', 'warn', 'error']);
  assert.deepEqual(JSON.parse(lines[1]), { seq: 2, level: 'warn', event: 'request', route: 'evidence', status: 404, code: 'NOT_FOUND', role: null });
  assert.equal(instance.listBody('trace', 10).value.items.map((item) => item.method).join(), 'GET,OTHER,POST');
  assert.equal(scan(lines.join('\n'), canaryList()).length, 0);
  const failing = service({ logSink: () => { throw new Error('sink down'); } });
  assert.doesNotThrow(() => failing.recordRequest({ ...base, status: 200 }));
  assert.equal(failing.listBody('logs', 5).value.shown, 1);
});

test('issueToken registers the new token by value before anyone holds it, and its identity and lifetime are checked by the C009 registry', () => {
  const instance = service();
  const token = instance.issueToken('operator', { ttlMs: 1000 });
  assert.match(token, /^c009_[A-Za-z0-9_-]{43}$/);
  for (const encoded of [token, Buffer.from(token).toString('base64'), Buffer.from(token).toString('hex'), [...token].join('\u200b')]) instance.plant('trace', `leak ${encoded} here`);
  assert.deepEqual(scan(JSON.stringify(instance.listBody('trace', 10)), [{ id: 'issued', value: token }]), [], 'a shape pattern cannot catch an encoding of the token: only its registration can');
  assert.throws(() => instance.issueToken('root'), { code: 'IDENTITY_UNKNOWN' });
  assert.throws(() => instance.issueToken('operator', { ttlMs: -1 }), { code: 'TTL_INVALID' });
  assert.equal(instance.registry.verify(token).role, 'operator');
});

test('plant: the planted log, trace, error and run records of a fresh service carry their literal fields (status 200 or 500, the code, the role, run-9001 of one unit at revision 1)', () => {
  const instance = service();
  instance.plant('log', 'a plain line');
  assert.deepEqual(instance.listBody('logs', 10).value.items, [{ seq: 1, level: 'info', event: 'request', route: 'command', status: 200, code: 'ok', role: 'operator' }]);
  instance.plant('trace', 'a plain note');
  instance.plant('error', 'a plain failure');
  assert.deepEqual(instance.listBody('trace', 10).value.items.map((item) => [item.seq, item.kind, item.method, item.route, item.status, item.role, item.code]),
    [[1, 'upstream', 'POST', 'command', 200, 'operator', 'ok'], [2, 'error', 'POST', 'command', 500, 'operator', 'COMMAND_FAILED']]);
  instance.plant('run', 'a plain run');
  const [planted] = instance.listBody('runs', 10).value.items;
  assert.deepEqual([planted.id, planted.units, planted.owner, planted.revision, planted.status, planted.artifacts], ['run-9001', 1, 'operator', 1, 'ok', 1]);
  assert.equal(instance.revision(), 1, 'planting a run is one commit');
  instance.plant('run', 'another plain run');
  assert.deepEqual(instance.listBody('runs', 10).value.items.map((item) => [item.id, item.revision]), [['run-9001', 1], ['run-9002', 2]]);
});

test('the scope and config bodies are published through the redactor and hold facts only', () => {
  const instance = service();
  assert.deepEqual(instance.scopeBody().value, SCOPE);
  assert.deepEqual(instance.scopeBody().value, {
    outcome: 'ok',
    scope: { cardId: 'C014', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', persistence: 'none', secretsServerSide: true, publicEvidenceRedacted: true, liveAzureRuns: 0, authorizedCloudSpend: 0 }
  });
  assert.deepEqual(instance.configBody().value, { outcome: 'ok', configured: { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4 } });
  assert.equal(instance.publish('error', { outcome: 'NOT_FOUND', error: { code: 'NOT_FOUND', message: 'No fixture route has that path.' } }).value.error.code, 'NOT_FOUND');
  assert.deepEqual(instance.auditLog(), []);
  assert.equal(path.basename(require.resolve('../service.cjs')), 'service.cjs');
  assert.ok(ids(instance.listBody('runs', 5)).length === 0);
});
