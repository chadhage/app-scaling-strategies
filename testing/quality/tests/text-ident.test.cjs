'use strict';
// Text normalisation, strict dates, the meter catalog and the identifier, secret and wording scanners (V1, V2, V7, V9): units, with the
// limits stated in the README next to the forms that are covered.
const { assert, test } = require('./support.cjs');
const { fold, latin, squash, words } = require('../text.cjs');
const { parseDate, parseInstant, parseClock, ageDays, utcDay } = require('../dates.cjs');
const { isCatalogMeter, isPlaceholderMeter, METER_COUNT } = require('../meters.cjs');
const { hasGuid, hasEmail, secretIn, enforcementClaim, unresolved } = require('../ident.cjs');

test('fold removes format characters and folds dashes, spaces and full-width forms; latin maps look-alike letters; squash drops layout', () => {
  assert.equal(fold('a\u200bb\u00adc'), 'abc');
  assert.equal(fold('1\u20112\u20133\u2212'), '1-2-3-');
  assert.equal(fold('a\u00a0b\tc\u3000d'), 'a b c d');
  assert.equal(fold('\uff21\uff10\uff20'), 'A0@');
  assert.equal(latin('h\u0430rd \u0391'), 'hard A');
  assert.equal(squash('1 *2*\n`3`_4~5\\6'), '123456');
  assert.equal(words('  To-Be_Confirmed\u00a0 now '), 'to be confirmed now');
});

test('strict dates: real calendar dates only, one form each, a zone for every instant', () => {
  for (const ok of ['2026-11-06', '2024-02-29', '2000-02-29']) assert.ok(!Number.isNaN(parseDate(ok)), ok);
  for (const bad of ['2026-02-30', '2027-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '0000-00-00', '2026-11-4', '11/06/2026', 'Nov 6 2026', '', null, undefined, 20261106, '2026-11-06T00:00:00Z', ' 2026-11-06']) {
    assert.ok(Number.isNaN(parseDate(bad)), String(bad));
  }
  assert.equal(parseInstant('2026-11-06T07:31:49Z'), Date.UTC(2026, 10, 6, 7, 31, 49));
  assert.equal(parseInstant('2026-11-06T08:31:49+01:00'), Date.UTC(2026, 10, 6, 7, 31, 49));
  assert.equal(parseInstant('2026-11-06T02:31:49.250-05:00'), Date.UTC(2026, 10, 6, 7, 31, 49));
  for (const bad of ['2026-11-06T07:31:49', '2026-11-06', '2026-11-06T24:00:00Z', '2026-11-06T07:60:00Z', '2026-11-06T07:00:60Z', '2026-13-06T07:00:00Z', '2026-11-06 07:00:00Z', '2026-11-06T07:00:00+24:00', '2026-11-06T07:00:00+01:60', 'Dec 20 2026', '', 7]) {
    assert.ok(Number.isNaN(parseInstant(bad)), String(bad));
  }
  assert.equal(parseClock('2026-11-06'), Date.UTC(2026, 10, 6));
  assert.equal(parseClock('2026-11-06T00:00:00Z'), Date.UTC(2026, 10, 6));
  assert.ok(Number.isNaN(parseClock('1')) && Number.isNaN(parseClock('Sun, 20 Dec 2026 00:00:00 GMT')) && Number.isNaN(parseClock(undefined)));
});

test('ageDays counts whole UTC days from the day start to the UTC day of an instant', () => {
  const day = parseDate('2026-11-04');
  assert.equal(ageDays(day, parseInstant('2026-11-11T23:59:59Z')), 7);
  assert.equal(ageDays(day, parseInstant('2026-11-12T00:00:00Z')), 8);
  assert.equal(ageDays(day, parseInstant('2026-11-04T10:00:00Z')), 0);
  assert.equal(ageDays(day, parseInstant('2026-11-03T23:00:00Z')), -1);
  assert.equal(ageDays(day, parseInstant('2026-11-11T23:00:00-12:00')), 8);
  assert.equal(utcDay(parseInstant('2026-11-06T07:31:49Z')), parseDate('2026-11-06'));
});

test('the meter catalog holds hashes: a public meter ID is known, another GUID, a placeholder and junk are not', () => {
  assert.ok(METER_COUNT >= 70);
  assert.ok(isCatalogMeter('c6d2246e-85cb-4106-bdcf-3d5f2577c916'.toUpperCase()), 'a public Azure Retail Prices meter ID of the register (plan.S1@eastus2), any case');
  assert.ok(!isCatalogMeter('11111111-2222-3333-4444-555555555555') && !isCatalogMeter('') && !isCatalogMeter(null) && !isCatalogMeter(5));
  assert.ok(isPlaceholderMeter('fixture-meter-12') && !isPlaceholderMeter('fixture-meter-x') && !isPlaceholderMeter(undefined) && !isPlaceholderMeter('my-subscription'));
});

test('hasGuid finds the spellings of the README list and nothing in ordinary numbers', () => {
  const g = '11111111-2222-3333-4444-555555555555';
  const hex = 'abcdef12-3456-7890-abcd-ef1234567890';
  for (const t of [g, g.replace(/-/g, ''), `{${g}}`, `urn:uuid:${hex.toUpperCase()}`, hex.toUpperCase(), 'AbCdEf12-3456-7890-aBcD-eF1234567890', hex.toUpperCase().replace(/-/g, ''), g.replace(/-/g, '\n'), g.replace(/-/g, '_'), `x${g}y`, `0x${g.replace(/-/g, '')}`, g.replace(/-/g, ' ... '), g.replace(/-/g, '\u2011')]) assert.ok(hasGuid(t), t);
  for (const t of ['0.0775 | 56.575 | 3.85', '2026-11-06T07:31:49Z', 'f1a84bd04570', 'U001 revision 3', '1234567890', 'a-b-c']) assert.ok(!hasGuid(t), t);
});

test('hasEmail finds addresses, obfuscations and encodings, and ignores splats and plain at signs', () => {
  for (const t of ['owner@example.com', 'owner [at] example [dot] com', 'owner(AT)example.com', 'owner at example dot com', 'owner\uff20example.com', 'owner@localhost', 'owner%40example.com', 'owner&#64;example.com',
    'owner&#x40;example.com', 'owner @ example.com', 'owner@ example.com', '"owner"@example.com', 'owner@[192.0.2.1]', 'o_example.com#EXT#@tenant.onmicrosoft.com', 'owner@exämple.com']) assert.ok(hasEmail(t), t);
  for (const t of ['--parameters @params.json', '@(1, 2) and @{}', 'look at example dot', 'at the end @', 'plain text', '']) assert.ok(!hasEmail(t), t);
});

test('secretIn names the kind of secret and ignores ordinary text, placeholders and URLs without secrets', () => {
  const found = {
    'AKIA0123456789ABCDEF': 'a known key prefix', [`ghp_${'a1B2c3D4e5'.repeat(4)}`]: 'a known key prefix', [`sk-proj-${'abcDEF123_-xyz'.repeat(3)}`]: 'a known key prefix', 'xoxb-1234567890-abcdef': 'a known key prefix',
    [`eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`]: 'a JWT', 'o8Q8Q~aB3dE6gH9jK2lM5nP8qR1sT4uV7wX0yZ': 'an Entra client secret shape', 'AZURE_CLIENT_SECRET=abc123def456': 'a value assigned to AZURE_CLIENT_SECRET',
    'AccountKey=short': 'a value assigned to AccountKey', 'api_key: Zm9vYmFy': 'a value after api_key', 'the password is hunter2hunter2': 'a value after password is', '-----BEGIN PGP PRIVATE KEY BLOCK-----': 'a private key block',
    'https://x.test/p?sig=0123456789abcdefghij': 'a secret URL parameter', [`https://x.test/hook/${'aB3dE6gH9jK2'.repeat(4)}`]: 'a long mixed run', 'key 0123456789abcdef01234567': 'a long hex run', [`${'Ab1/'.repeat(12)}`]: 'a long base64-like token'
  };
  for (const [text, reason] of Object.entries(found)) assert.equal(secretIn(text), reason, text);
  for (const t of ['lease-id=u001-A-20261106-01', 'password=<OWNER-SUPPLIED>', 'token=$Token', 'secret=%SECRET%', 'no secret or token is stored', 'https://learn.microsoft.com/azure/app-service/deploy-staging-slots', 'InternalSubscriptionIsOverQuotaForSku',
    '2026-11-06T07:31:49Z', '', 'the key is read from the vault']) assert.equal(secretIn(t), null, t);
});

test('enforcementClaim and unresolved see through spelling tricks but allow the planning-bound phrase', () => {
  for (const t of ['a hard limit', 'hardcap', 'h-a-r-d', 'ha\u200brd', 'h\u0430rd', 'an enforced limit', 'a guaranteed maximum', 'a planning bound, enforced by Azure']) assert.ok(enforcementClaim(t), t);
  for (const t of ['planning bound, not enforced by Azure', 'a hardware list', 'the cap is a safeguard, not a guarantee']) assert.ok(!enforcementClaim(t), t);
  for (const t of ['to  be  confirmed', 'to-be-confirmed', 'TBC', 'FIXME', 'to be decided', 'to be agreed', 'XXX', '???', 'confirm before use', 'to\u00a0be\u00a0determined', '<fill in>', 'TODO', 'command name to be x']) assert.ok(unresolved(t), t);
  for (const t of ['all confirmed', 'the plan is final', '']) assert.ok(!unresolved(t), t);
});
