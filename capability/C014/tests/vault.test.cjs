'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfigError, StoreError, createVault, parseConnection } = require('../vault.cjs');
const { seedConfig, canaryList } = require('./canaries.cjs');

const base = () => seedConfig();
const invalid = (mutate, field) => {
  const config = base();
  mutate(config);
  assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.code === 'CONFIG_INVALID' && error.field === field && error.message === 'CONFIG_INVALID'
    && !JSON.stringify([error.message, error.field, error.stack.split('\n')[0]]).includes('CNRY'), field);
};

test('a valid configuration builds a vault; every invalid shape is a typed ConfigError that names the field and never a value', () => {
  assert.ok(createVault(base()));
  invalid((config) => { config.extra = 1; }, 'config');
  invalid((config) => { delete config.signingKey; }, 'config');
  invalid((config) => { config.tokens = []; }, 'tokens');
  invalid((config) => { config.tokens.visitor = 'c009_short'; }, 'tokens');
  invalid((config) => { config.tokens.operator = config.tokens.visitor; }, 'tokens');
  invalid((config) => { config.tokens.visitor = `c009_${'A'.repeat(42)}B`; }, 'tokens');
  invalid((config) => { config.tokens.extra = config.tokens.visitor; }, 'tokens');
  invalid((config) => { config.signingKey = 'short'; }, 'signingKey');
  invalid((config) => { config.signingKey = `${'a'.repeat(32)}!`; }, 'signingKey');
  invalid((config) => { config.connectionString = 42; }, 'connectionString');
  invalid((config) => { config.connectionString = 'Server=abc;User Id=defghi;Password=short'; }, 'connectionString');
  invalid((config) => { config.connectionString = 'Server=abcdefg;Password=abcdefghijk'; }, 'connectionString');
  invalid((config) => { config.serviceCredential = { id: 'abcdef' }; }, 'serviceCredential');
  invalid((config) => { config.serviceCredential.secret = 'has space in it'; }, 'serviceCredential');
  invalid((config) => { config.contacts.operator.phone = 'abc'; }, 'contacts');
  invalid((config) => { config.contacts.operator.email = 'not-an-address'; }, 'contacts');
  invalid((config) => { config.contacts.operator.name = '1'; }, 'contacts');
  invalid((config) => { delete config.contacts.visitor; }, 'contacts');
  for (const hostile of [null, undefined, 7, 'x', [], () => 1]) assert.throws(() => createVault(hostile), ConfigError);
});

test('the vault keeps a private deep copy: changing the caller object afterwards changes nothing it holds', () => {
  const config = base();
  const vault = createVault(config);
  const before = vault.secrets();
  config.signingKey = 'x'.repeat(40);
  config.contacts.operator.name = 'Changed Afterwards';
  assert.deepEqual(vault.secrets(), before);
  const contact = vault.contactFor('operator');
  contact.name = 'tampered';
  assert.notEqual(vault.contactFor('operator').name, 'tampered');
});

test('secrets(): every leaf and the parts a driver message or a log line would reveal, each at least six characters, without duplicates', () => {
  const config = base();
  const secrets = createVault(config).secrets();
  assert.equal(new Set(secrets).size, secrets.length);
  for (const { id, value } of canaryList(config)) assert.ok(secrets.includes(value), `${id} is registered`);
  assert.ok(secrets.includes(config.contacts.operator.phone.replace(/\D/g, '')) && secrets.includes('Fenwick') && secrets.includes('Dunmarrow'));
  assert.ok(secrets.every((secret) => typeof secret === 'string'));
});

test('tokenSource hands out the configured tokens as 32-byte values in identity order, then null', () => {
  const config = base();
  const vault = createVault(config);
  for (const identity of vault.identities) {
    const bytes = vault.tokenSource();
    assert.equal(bytes.length, 32);
    assert.equal(`c009_${bytes.toString('base64url')}`, config.tokens[identity]);
  }
  assert.equal(vault.tokenSource(), null);
  assert.deepEqual(vault.identities, ['visitor', 'conductor-a', 'conductor-b', 'operator']);
});

test('status is booleans and counts only; sign is an HMAC-SHA256 hex digest of the signing key', () => {
  const vault = createVault(base());
  assert.deepEqual(vault.status(), { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4 });
  const digest = vault.sign('{"a":1}');
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest, require('node:crypto').createHmac('sha256', base().signingKey).update('{"a":1}').digest('hex'));
  assert.notEqual(vault.sign('{"a":2}'), digest);
});

test('the fictional upstream carries the credential and the contact in its request and its steps (the raw material the redaction must clean)', () => {
  const config = base();
  const vault = createVault(config);
  const call = vault.dispatch('run-0001', 3, 'conductor-a');
  assert.equal(call.request.headers.authorization, `Bearer ${config.serviceCredential.secret}`);
  assert.equal(call.request.headers['x-service-id'], config.serviceCredential.id);
  assert.equal(call.request.body.requester.email, config.contacts['conductor-a'].email);
  assert.ok(call.steps[0].detail.includes(config.serviceCredential.secret) && call.steps[0].detail.includes(config.contacts['conductor-a'].phone));
});

test('the fictional store: ok names the server and the user; fail throws a StoreError whose message holds the connection string and whose cause holds the password', () => {
  const config = base();
  const vault = createVault(config);
  const parts = parseConnection(config.connectionString);
  assert.ok(vault.checkStore('ok').steps[0].detail.includes(parts.server));
  assert.throws(() => vault.checkStore('fail'), (error) => error instanceof StoreError && error.name === 'StoreError' && error.message.includes(config.connectionString)
    && error.cause.message.includes(parts.password) && error.stack.includes(parts.user));
});

test('parseConnection: server, host without protocol and port, database, user and password; an absent part is undefined', () => {
  assert.deepEqual(parseConnection('Server=tcp:db.example.invalid,1433;Database=d1;User Id=u1;Password=p1;Encrypt=true;bad;=x'),
    { server: 'tcp:db.example.invalid,1433', host: 'db.example.invalid', database: 'd1', user: 'u1', password: 'p1' });
  assert.deepEqual(parseConnection(''), { server: undefined, host: undefined, database: undefined, user: undefined, password: undefined });
  assert.equal(parseConnection('Server=plain-host').host, 'plain-host');
});

test('the connection string: the server, the user and the password each need at least six characters (six is valid, five is not), and a string outside printable ASCII is refused even when its parts parse', () => {
  const withParts = (server, user, secret) => {
    const config = base();
    config.connectionString = ['Server=' + server, 'Database=fictional_db', 'User Id=' + user, ['Pass', 'word'].join('') + '=' + secret].join(';');
    return config;
  };
  const refused = (config) => assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.field === 'connectionString');
  assert.ok(createVault(withParts('abcdef', 'uvwxyz', 'pqrstu')), 'exactly six characters each');
  refused(withParts('abcde', 'uvwxyz', 'pqrstu'));
  refused(withParts('abcdef', 'uvwxy', 'pqrstu'));
  refused(withParts('abcdef', 'uvwxyz', 'pqrst'));
  refused(withParts('abcdef', 'uvwxyz', 'pqrst\u00e9u'));
  const config = withParts('abcdef', 'uvwxyz', 'pqrstu');
  config.connectionString = config.connectionString.replace('fictional_db', 'fictional_d\u00e9');
  refused(config);
});

test('secrets() holds the local part of every e-mail address, its name parts and its phone digits', () => {
  const config = base();
  const secrets = createVault(config).secrets();
  for (const contact of Object.values(config.contacts)) {
    assert.ok(secrets.includes(contact.email.split('@')[0]), 'the local part of the address');
    assert.ok(secrets.includes(contact.email) && secrets.includes(contact.name) && secrets.includes(contact.phone.replace(/\D/g, '')));
    for (const part of contact.name.split(/[ '-]+/)) assert.ok(secrets.includes(part), `the name part ${part.length} characters long`);
  }
});

test('parseConnection ignores a pair whose key is a single character: the four keys it reads are longer', () => {
  assert.deepEqual(parseConnection('S=abcdefg;Server=tcp:h.invalid;D=x;Database=d1;U=y;User Id=u1;P=z;' + ['Pass', 'word'].join('') + '=p1'),
    { server: 'tcp:h.invalid', host: 'h.invalid', database: 'd1', user: 'u1', password: 'p1' });
});
