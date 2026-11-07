'use strict';

// RED snapshot of the third fix, finding F2 of the independent review of c7ec58a79f0d (immutable once archived; it replays unchanged against the fixed files).
// maskText replaced the registered PARTS of a secret (a name part, the e-mail local part) before it asked whether any covered form of the WHOLE secret was in the text,
// so a part that stood verbatim inside an encoded form consumed the evidence: 'Qzvkx%20Wonderland' became 'Qzvkx%20[redacted]' and the README claim that a non-raw form
// masks the WHOLE value was false. Fixed: the whole-value check looks at the ORIGINAL text, and every form of a secret other than its own verbatim occurrences masks the whole text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { createVault } = require(path.join(ROOT, 'vault.cjs'));
const { createRedactor, MASK } = require(path.join(ROOT, 'redact.cjs'));

const digest = (label) => createHash('sha256').update(`C014-fix3|${label}`).digest();
const hex = (label, size) => digest(label).toString('hex').slice(0, size);
const WHO = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const PEOPLE = { visitor: 'Ottoline Brackenridge', 'conductor-a': 'Qzvkx Wonderland', 'conductor-b': 'Marnie Thistlewick', operator: 'Fenwick Dunmarrow' };
const config = () => ({
  tokens: Object.fromEntries(WHO.map((who) => [who, `c009_${digest(`token-${who}`).toString('base64url')}`])),
  signingKey: `FIX3-SIGNING-${digest('signing').toString('base64url')}`,
  connectionString: `Server=tcp:fix3-db-${hex('host', 8)}.synthetic.invalid,1433;Database=fix3_evidence;User Id=svc_fix3_${hex('user', 8)};Password=FIX3pw${hex('pw', 20)};Encrypt=true;`,
  serviceCredential: { id: `svc-fix3-${hex('sid', 8)}`, secret: `FIX3svc${digest('ssecret').toString('base64url')}` },
  contacts: Object.fromEntries(WHO.map((who) => [who, {
    name: PEOPLE[who],
    email: who === 'conductor-a' ? 'qzvkx.w@rvw-mail.invalid' : `${who.replace(/-/g, '.')}.${hex(`mail-${who}`, 6)}@fix3-mail.invalid`,
    phone: who === 'conductor-a' ? '+1 (555) 013-9999' : `+1-555-0100-${hex(`phone-${who}`, 4).replace(/[a-f]/g, '7')}`
  }]))
});

const redactor = createRedactor({ secrets: createVault(config()).secrets() });
const name = 'Qzvkx Wonderland';
const email = 'qzvkx.w@rvw-mail.invalid';
const CASES = {
  'URL-encoded name (the surname stands verbatim)': encodeURIComponent(name),
  'URL-encoded e-mail (the local part stands verbatim)': encodeURIComponent(email),
  'double URL-encoded e-mail': encodeURIComponent(encodeURIComponent(email)),
  'e-mail with an HTML entity for the at sign': email.replace('@', '&#64;'),
  'e-mail with a JSON escape for the at sign': email.replace('@', '\\u0040'),
  'plus-for-space name': name.replace(' ', '+'),
  'first letter of the name as an HTML entity': '&#81;zvkx Wonderland',
  'first letter of the name as a JSON escape': '\\u0051zvkx Wonderland'
};

for (const [label, text] of Object.entries(CASES)) {
  test(`F2: ${label}: the WHOLE value is masked and no fragment of the secret survives`, () => {
    const out = redactor.maskText(`note: ${text} end`);
    assert.equal(out, MASK, out);
  });
}
