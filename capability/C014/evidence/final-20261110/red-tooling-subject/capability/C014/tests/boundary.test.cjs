'use strict';

// F1 of the independent review of c7ec58a79f0d: the vault validator accepted a contact name of 5 characters that no redactor can hold by value (the minimum is 6), so the raw
// name reached the anonymous public trace, runs and bundle. THE INVARIANT proved here for EVERY protected configuration field: whatever the validator accepts is held BY VALUE
// (vault.secrets() lists it and a redactor registers it) and shows in no public byte after a normal flow; whatever it refuses is a typed ConfigError that names the field.
// The boundaries come from the table of the README ("Protected configuration fields": minimum and maximum length of every field), so a README that disagrees with the
// validator fails here, and the sweep tests each field at min-1, min, min+1, max and max+1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createVault, ConfigError } = require('../vault.cjs');
const { createRedactor, MASK } = require('../redact.cjs');
const { MIN_SECRET } = require('../canon.cjs');
const { startLocal } = require('../server.cjs');
const { seedConfig, token } = require('./canaries.cjs');
const { call } = require('./harness.cjs');

const connection = ({ host = 'qzvkx-host', user = 'qzvkx-user', password = 'qzvkx-pass', database } = {}) => `Server=tcp:${host},1433;${database === undefined ? '' : `Database=${database};`}User Id=${user};Password=${password};`;
const letters = (seed, length) => (length <= 0 ? '' : (seed + 'x'.repeat(length)).slice(0, length));
const FIELDS = {
  tokens: { error: 'tokens', make: (n) => (n === 48 ? token('sweep') : letters('c009_qzvkx', n)), apply: (config, value) => { config.tokens.visitor = value; } },
  signingKey: { error: 'signingKey', make: (n) => letters('SigQzvkx', n), apply: (config, value) => { config.signingKey = value; } },
  connectionString: { error: 'connectionString', make: (n) => `Server=qzvkxs;User Id=qzvkxu;Password=${letters('qzvkxp', n - 38)}`, apply: (config, value) => { config.connectionString = value; } },
  connectionHost: { error: 'connectionString', make: (n) => letters('qzhost', n), apply: (config, value) => { config.connectionString = connection({ host: value }); } },
  connectionUser: { error: 'connectionString', make: (n) => letters('qzuser', n), apply: (config, value) => { config.connectionString = connection({ user: value }); } },
  connectionPassword: { error: 'connectionString', make: (n) => letters('qzpass', n), apply: (config, value) => { config.connectionString = connection({ password: value }); } },
  connectionDatabase: { error: 'connectionString', make: (n) => letters('qzbase', n), apply: (config, value) => { config.connectionString = connection({ database: value }); } },
  serviceId: { error: 'serviceCredential', make: (n) => letters('svqzvk', n), apply: (config, value) => { config.serviceCredential.id = value; } },
  serviceSecret: { error: 'serviceCredential', make: (n) => letters('sqzvkx', n), apply: (config, value) => { config.serviceCredential.secret = value; } },
  contactName: { error: 'contacts', make: (n) => letters('Qzvkxw', n), apply: (config, value) => { config.contacts['conductor-a'].name = value; } },
  contactEmail: { error: 'contacts', make: (n) => { const local = Math.min(64, n - 4); return `${letters('qzvk', local)}@${letters('zv-mail.invalid', n - 1 - local)}`; }, apply: (config, value) => { config.contacts['conductor-a'].email = value; } },
  contactPhone: { error: 'contacts', make: (n) => `1${'5'.repeat(n - 2)}2`, apply: (config, value) => { config.contacts['conductor-a'].phone = value; } }
};

// The README table: | field | minimum | maximum | with a dash where the field has no length of its own to bound (the parts of the connection string are bounded by its total).
function table() {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const block = /<!-- fields:begin -->([^]*?)<!-- fields:end -->/.exec(readme);
  assert.ok(block, 'the README has the table of the protected configuration fields');
  const rows = block[1].split(/\r?\n/).filter((line) => /^\| [A-Za-z]+ \|/.test(line) && !/^\| Field \|/.test(line)).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  return Object.fromEntries(rows.map(([key, min, max]) => [key, { min: Number(min), max: max === '-' ? Infinity : Number(max) }]));
}

async function flow(config) {
  const app = await startLocal({ config });
  try {
    const seen = [];
    const take = async (method, route, options) => { const result = await call(app.port, method, route, options); seen.push(result.bytes.toString('utf8')); };
    for (const who of ['conductor-a', 'conductor-b']) await take('POST', '/v1/commands/run.create', { token: config.tokens[who], body: { name: `sweep-${who.slice(-1)}`, units: 1 } });
    for (const mode of ['ok', 'fail']) await take('POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode } });
    for (const route of ['/scope.json', '/v1/evidence/trace', '/v1/evidence/runs', '/v1/evidence/audit', '/v1/evidence/logs', '/v1/evidence/bundle']) await take('GET', route);
    await take('GET', '/v1/manage/config', { token: config.tokens.operator });
    await take('GET', '/v1/evidence/trace', { token: `c009_${'A'.repeat(43)}` });
    return seen.join('\n');
  } finally {
    await app.close();
  }
}

test('the README table lists exactly the protected configuration fields of this sweep, with the minimum of each at or above the secret minimum', () => {
  const rows = table();
  assert.deepEqual(Object.keys(rows), Object.keys(FIELDS));
  for (const [key, { min, max }] of Object.entries(rows)) {
    assert.ok(Number.isInteger(min) && min >= (key === 'contactEmail' ? 7 : MIN_SECRET) && max >= min, `${key}: ${min} to ${max}`);
  }
});

test('the boundary sweep: at min-1, min, min+1, max and max+1 of every protected field a refusal is a typed ConfigError on the field, and whatever is accepted is held by value and shows in no public byte after a normal flow', { timeout: 170000 }, async () => {
  const rows = table();
  let accepted = 0;
  let refused = 0;
  for (const [key, spec] of Object.entries(FIELDS)) {
    const { min, max } = rows[key];
    const lengths = [...new Set([min - 1, min, min + 1, ...(max === Infinity ? [] : [max, max + 1])])];
    for (const length of lengths) {
      const config = seedConfig();
      const value = spec.make(length);
      assert.equal(value.length, length, `${key}: the sample has the length it claims`);
      spec.apply(config, value);
      const where = `${key} at ${length} (min ${min}, max ${max})`;
      if (length < min || length > max) {
        assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.code === 'CONFIG_INVALID' && error.field === spec.error, where);
        refused += 1;
        continue;
      }
      const secrets = createVault(config).secrets();
      assert.ok(secrets.includes(value), `${where}: the value is held by value`);
      assert.equal(createRedactor({ secrets }).maskText(`before ${value} after`), `before ${MASK} after`, `${where}: a redactor replaces it in place`);
      assert.ok(secrets.every((secret) => secret.length >= MIN_SECRET), `${where}: everything the vault lists can be held by value`);
      const text = await flow(config);
      for (const secret of secrets) assert.equal(text.includes(secret), false, `${where}: a registered value shows in a public byte`);
      accepted += 1;
    }
  }
  assert.ok(accepted >= 25 && refused >= 20, `${accepted} accepted and ${refused} refused samples`);
});

test('the review reproduction: a name of 5 characters is refused at the door, and the same configuration with a 6-character name is accepted and shows nowhere', async () => {
  const short = seedConfig();
  short.contacts['conductor-a'].name = 'Qzvkx';
  await assert.rejects(() => startLocal({ config: short }), (error) => error instanceof ConfigError && error.field === 'contacts');
  const six = seedConfig();
  six.contacts['conductor-a'].name = 'Qzvkxw';
  assert.equal((await flow(six)).includes('Qzvkxw'), false);
});

test('a leading plus extends a phone to 27 characters and no more, and the connection string keeps its parts: a short host, user, password or database in an otherwise valid string is refused', () => {
  const phone = seedConfig();
  phone.contacts['conductor-a'].phone = `+1${'5'.repeat(24)}2`;
  assert.equal(phone.contacts['conductor-a'].phone.length, 27);
  assert.ok(createVault(phone), 'plus, a digit, 24 more characters and a digit: 27');
  phone.contacts['conductor-a'].phone = `+1${'5'.repeat(25)}2`;
  assert.throws(() => createVault(phone), (error) => error.field === 'contacts', '28');
  for (const [part, value] of [['host', 'qzh'], ['user', 'qzu'], ['password', 'qzp'], ['database', 'qzb']]) {
    const config = seedConfig();
    config.connectionString = connection({ [part]: value });
    assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.field === 'connectionString', part);
  }
  const without = seedConfig();
  without.connectionString = connection();
  assert.ok(createVault(without), 'a connection string without a database is valid');
});

test('the anchors: a line break before or after an otherwise valid value is refused for every protected field that has a pattern of its own', () => {
  const rows = table();
  let refused = 0;
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (key.startsWith('connection') && key !== 'connectionString') continue; // a part of the connection string has no pattern of its own: the string does
    for (const [where, wrap] of [['before', (value) => `\n${value}`], ['after', (value) => `${value}\n`]]) {
      const config = seedConfig();
      spec.apply(config, wrap(spec.make(rows[key].min)));
      assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.code === 'CONFIG_INVALID' && error.field === spec.error, `${key}: a line break ${where} the value`);
      refused += 1;
    }
  }
  assert.equal(refused, 16, 'eight fields with a pattern of their own, two places each');
});

test('an e-mail address needs a local part of 3 to 64 characters and a domain of 3 to 128: each end of each part, on its own', () => {
  const cases = [[2, 3, false], [3, 3, true], [64, 3, true], [65, 3, false], [3, 2, false], [3, 128, true], [3, 129, false], [64, 128, true]];
  for (const [local, domain, accepted] of cases) {
    const config = seedConfig();
    config.contacts['conductor-a'].email = `${'q'.repeat(local)}@${'z'.repeat(domain)}`;
    const where = `local ${local}, domain ${domain}`;
    if (accepted) assert.ok(createVault(config).secrets().includes(config.contacts['conductor-a'].email), where);
    else assert.throws(() => createVault(config), (error) => error instanceof ConfigError && error.field === 'contacts', where);
  }
  const spaced = seedConfig();
  spaced.contacts['conductor-a'].email = 'qzvkx@exa mple.invalid';
  assert.throws(() => createVault(spaced), (error) => error.field === 'contacts', 'white space in the domain');
  const twice = seedConfig();
  twice.contacts['conductor-a'].email = 'qzv@kx@example.invalid';
  assert.throws(() => createVault(twice), (error) => error.field === 'contacts', 'a second at sign');
});
