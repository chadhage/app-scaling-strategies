'use strict';

// RED snapshot of the third fix, finding F1 of the independent review of c7ec58a79f0d (immutable once archived; it replays unchanged against the fixed files).
// The vault validator accepted a contact name of 5 characters, which no redactor can register by value (the secret minimum is 6) and which is not a shape,
// so after run.create the raw name reached the ANONYMOUS trace, runs and bundle. The fix refuses such a name at the door with a typed ConfigError on the field.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { createVault, ConfigError } = require(path.join(ROOT, 'vault.cjs'));
const { startLocal } = require(path.join(ROOT, 'server.cjs'));

const digest = (label) => createHash('sha256').update(`C014-fix3|${label}`).digest();
const hex = (label, size) => digest(label).toString('hex').slice(0, size);
const WHO = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const PEOPLE = { visitor: 'Ottoline Brackenridge', 'conductor-a': 'Zorvald Quillfeather', 'conductor-b': 'Marnie Thistlewick', operator: 'Fenwick Dunmarrow' };
const config = (name) => ({
  tokens: Object.fromEntries(WHO.map((who) => [who, `c009_${digest(`token-${who}`).toString('base64url')}`])),
  signingKey: `FIX3-SIGNING-${digest('signing').toString('base64url')}`,
  connectionString: `Server=tcp:fix3-db-${hex('host', 8)}.synthetic.invalid,1433;Database=fix3_evidence;User Id=svc_fix3_${hex('user', 8)};Password=FIX3pw${hex('pw', 20)};Encrypt=true;`,
  serviceCredential: { id: `svc-fix3-${hex('sid', 8)}`, secret: `FIX3svc${digest('ssecret').toString('base64url')}` },
  contacts: Object.fromEntries(WHO.map((who) => [who, { name: who === 'conductor-a' ? name : PEOPLE[who], email: `${who.replace(/-/g, '.')}.${hex(`mail-${who}`, 6)}@fix3-mail.invalid`, phone: `+1-555-0100-${hex(`phone-${who}`, 4).replace(/[a-f]/g, '7')}` }]))
});

test('F1: a contact name shorter than the secret minimum (5 characters) is refused by the vault with a typed ConfigError that names the field', () => {
  assert.throws(() => createVault(config('Qzvkx')), (error) => error instanceof ConfigError && error.code === 'CONFIG_INVALID' && error.field === 'contacts');
});

test('F1: whatever the validator accepts never shows in a public byte after a normal flow: the 5-character name Qzvkx, run.create by its owner, then anonymous GETs', async () => {
  const name = 'Qzvkx';
  let app;
  try {
    app = await startLocal({ config: config(name) });
  } catch (error) {
    assert.ok(error instanceof ConfigError, 'the only acceptable failure is the typed refusal of the configuration');
    return;
  }
  try {
    const token = config(name).tokens['conductor-a'];
    const run = await fetch(`${app.origin}/v1/commands/run.create`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'f1-run', units: 1 }) });
    assert.equal(run.status, 200);
    for (const route of ['trace', 'runs', 'bundle']) {
      const text = await (await fetch(`${app.origin}/v1/evidence/${route}`)).text();
      assert.equal(text.includes(name), false, `the anonymous ${route} route shows the name`);
    }
  } finally {
    await app.close();
  }
});
