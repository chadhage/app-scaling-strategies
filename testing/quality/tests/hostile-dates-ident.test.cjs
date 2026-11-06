'use strict';
// V1 dates and V2/V9 identifiers, secrets and wording: hostile packets that the published validator accepted wrongly.
const { reject, accept, assert, test, run, load, reseal } = require('./hostile.cjs');

const set = (path, value) => (p) => { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], p)[last] = value; };
const PRICE = ['PRICE_DATE_INVALID', 'PRICE_DATE_MISSING'];
const PREP = ['PREPARED_DATE_INVALID'];

// ---- V1: one strict ISO form, real calendar dates, bounded on both sides by the injected clock
for (const d of ['2026-13-45', '0000-00-00', '2026-02-30', '2026-04-31', '2027-02-29', '2026-00-10', 'Dec 20 2026', '12/20/2026', '20.12.2026', '2026/11/04', '4 November 2026', 'tomorrow', ' 2026-11-04', '2026-11-04 ', '2026-11-04T00:00:00Z', '', null, 20261104]) {
  reject('V1 price date', JSON.stringify(d), set('pricing.pricingDateUtc', d), PRICE);
}
reject('V1 price date', 'a date in 2099', set('pricing.pricingDateUtc', '2099-01-01'), ['PRICE_DATE_FUTURE', 'PRICE_AFTER_PREPARED']);
reject('V1 price date', 'a date after now', (p) => { p.pricing.pricingDateUtc = '2026-11-08'; p.preparedAtUtc = '2026-11-08T01:00:00Z'; }, ['PRICE_DATE_FUTURE']);
reject('V1 price date', 'a date after the packet date', set('pricing.pricingDateUtc', '2026-11-07'), ['PRICE_AFTER_PREPARED']);
for (const d of ['Dec 20 2026', '12/20/2026', '1', '', '2026-11-06T07:31:49', '2026-11-06', '2026-11-06T25:00:00Z', '2026-13-06T07:31:49Z', '2026-11-06T07:61:49Z', '2026-11-06 07:31:49Z', null]) {
  reject('V1 packet date', JSON.stringify(d), set('preparedAtUtc', d), PREP);
}
reject('V1 packet date', 'the year 2099', (p) => { p.preparedAtUtc = '2099-01-01T00:00:00Z'; }, ['PREPARED_IN_FUTURE']);
reject('V1 packet date', 'now plus 6 minutes (the skew is 5)', set('preparedAtUtc', '2026-11-07T12:06:00Z'), ['PREPARED_IN_FUTURE']);
accept('V1 packet date', 'now plus 4 minutes (inside the skew)', set('preparedAtUtc', '2026-11-07T12:04:00Z'));
accept('V1 packet date', 'a +01:00 offset', set('preparedAtUtc', '2026-11-06T08:31:49+01:00'));
accept('V1 price date', 'a leap day', (p) => { p.pricing.pricingDateUtc = '2024-02-29'; p.preparedAtUtc = '2024-03-02T00:00:00Z'; }, { settings: { nowUtc: '2024-03-03T00:00:00Z' } });
accept('V1 boundary', 'a price exactly 7 days old against now', () => {}, { settings: { nowUtc: '2026-11-11T23:59:59Z' } });
reject('V1 boundary', 'a price 8 days old against now', () => {}, ['PRICE_STALE_NOW'], { settings: { nowUtc: '2026-11-12T00:00:00Z' } });
accept('V1 boundary', 'a price exactly 7 days older than the packet date', set('preparedAtUtc', '2026-11-11T10:00:00Z'), { settings: { nowUtc: '2026-11-11T10:00:00Z' } });
reject('V1 boundary', 'a price 8 days older than the packet date', set('preparedAtUtc', '2026-11-12T10:00:00Z'), ['PRICE_DATE_STALE'], { settings: { nowUtc: '2026-11-12T10:00:00Z' } });
reject('V1 boundary', 'an offset that moves the UTC day to the 8th day', () => {}, ['PRICE_STALE_NOW'], { settings: { nowUtc: '2026-11-11T23:00:00-12:00' } });
for (const now of ['Dec 20 2026', '12/20/2026', '1', '0', '2026', ' 2026-11-06', 'Sun, 20 Dec 2026 00:00:00 GMT', 'garbage', '', '2026-13-01', '2026-11-06T07:00:00']) {
  reject('V1 clock', `the clock ${JSON.stringify(now)}`, () => {}, ['NOW_INVALID'], { settings: { nowUtc: now } });
}

// ---- V2 and V9: GUID spellings in values (title), in keys, in placeholders and across array elements
const G = '11111111-2222-3333-4444-555555555555';
const GUIDS = {
  '32 hex': G.replace(/-/g, ''), 'braces': `{${G}}`, 'urn': `urn:uuid:${G}`, 'upper': 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', 'lower letters': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'newline': '11111111-2222-3333-4444-\n555555555555', 'emphasis': '11111111-2222-**3333**-4444-555555555555', 'spaces': '11111111 2222 3333 4444 555555555555',
  'dots': '11111111.2222.3333.4444.555555555555', 'underscores': '11111111_2222_3333_4444_555555555555', 'zero width': '1111\u200b1111-2222-3333-4444-555555555555',
  'non-breaking hyphens': G.replace(/-/g, '\u2011'), 'non-breaking spaces': G.replace(/-/g, '\u00a0'), 'glued letters': `subscription${G}x`, '0x prefix': `0x${G.replace(/-/g, '')}`,
  'full-width digits': G.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d))), 'thirteen last digits': '11111111-2222-3333-4444-5555555555555', 'hex word before': `beef${G.replace(/-/g, '')}`,
  'ellipsis': '11111111 ... 2222 ... 3333 ... 4444 ... 555555555555', 'backticks': '`11111111-2222-3333-4444-555555555555`'
};
for (const [name, value] of Object.entries(GUIDS)) reject('V2 GUID', name, set('title', `owner ${value} here`), ['GUID_FOUND']);
reject('V2 GUID', 'as a JSON key', (p) => { p[G] = 'x'; }, ['GUID_FOUND']);
reject('V2 GUID', 'as a 32 hex JSON key', (p) => { p.ownerDecisions[G.replace(/-/g, '')] = 'x'; }, ['GUID_FOUND']);
reject('V2 GUID', 'inside an owner placeholder', set('ownerDecisions.answerSheetTemplate.subscriptionId', `<OWNER-SUPPLIED: ${G.replace(/-/g, '')}>`), ['GUID_FOUND']);
reject('V2 GUID', 'in a meter ID that is not in the catalog', set('pricing.lines.0.meterId', G), ['METER_ID_UNKNOWN', 'GUID_FOUND']);
reject('V2 GUID', 'in a meter ID of an extra register line', (p) => { const l = { ...p.pricing.lines[0], meterId: G, note: 'subscription' }; p.pricing.lines.push(l); }, ['METER_ID_UNKNOWN', 'GUID_FOUND']);
reject('V2 GUID', 'split across two array elements', set('servesItems', ['11111111-2222-3333-', '4444-555555555555']), ['GUID_FOUND']);
reject('V2 GUID', 'behind a hash path', set('integrity.packetSha256', `${'a'.repeat(32)}${G.replace(/-/g, '')}`), ['GUID_FOUND', 'SECRET_SHAPED', 'INTEGRITY_MISMATCH', 'INTEGRITY_MISSING'], { seal: false });
accept('V2 meter', 'the fixture placeholder meter IDs and null', () => {});

// ---- V9: e-mail spellings
const EMAILS = {
  plain: 'owner@example.com', 'bracket at': 'owner [at] example [dot] com', 'paren at': 'owner(at)example.com', words: 'owner at example dot com', 'full-width at': 'owner\uff20example.com',
  'no tld': 'owner@corp', localhost: 'owner@localhost', 'zero width': 'owner\u200b@example.com', 'spaces around': 'owner @ example.com', percent: 'owner%40example.com', entity: 'owner&#64;example.com',
  'hex entity': 'owner&#x40;example.com', idn: 'owner@exämple.com', 'domain literal': 'owner@[192.0.2.1]', quoted: '"owner"@example.com', 'space after': 'owner@ example.com',
  upn: 'owner_example.com#EXT#@tenant.onmicrosoft.com', 'curly at': 'owner{at}example.com', 'upper AT': 'owner [AT] example [DOT] com'
};
for (const [name, value] of Object.entries(EMAILS)) reject('V9 e-mail', name, set('title', `contact ${value} now`), ['EMAIL_FOUND']);
reject('V9 e-mail', 'as a JSON key', (p) => { p['owner@example.com'] = 'x'; }, ['EMAIL_FOUND']);
accept('V9 e-mail', 'PowerShell splatting and a parameter file', set('title', 'U001 native-run approval packet: --parameters @params.json and @(1, 2) and @{}'));

// ---- V9: secrets, as values, keys and across elements
const SECRETS = {
  'env style': 'export AZURE_CLIENT_SECRET=abc123def456', 'client secret': 'client_secret=value1234', 'account key short': 'AccountKey=short', 'entra shape': 'o8Q8Q~aB3dE6gH9jK2lM5nP8qR1sT4uV7wX0yZ',
  'sk-proj': `sk-proj-${'abcDEF123_-xyz'.repeat(3)}`, 'url path': `https://example.com/hook/${'aB3dE6gH9jK2'.repeat(6)}`, 'url query': `https://example.com/p?x=${'aB3dE6gH9jK2'.repeat(4)}`,
  'password is': 'the password is hunter2hunter2', pgp: '-----BEGIN PGP PRIVATE KEY BLOCK-----', 'hex 24': 'key 0123456789abcdef01234567', 'api key colon': 'api_key: Zm9vYmFyYmF6cXV4',
  'ghp': `ghp_${'a1B2c3D4e5'.repeat(4)}`, 'jwt': `eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`
};
for (const [name, value] of Object.entries(SECRETS)) reject('V9 secret', name, set('title', `use ${value} now`), ['SECRET_SHAPED']);
reject('V9 secret', 'as a JSON key', (p) => { p['AZURE_CLIENT_SECRET=abc123def456'] = 'x'; }, ['SECRET_SHAPED']);
reject('V9 secret', 'split across two array elements', set('servesItems', ['AZURE_CLIENT_', 'SECRET=abc123def456']), ['SECRET_SHAPED']);

// ---- V9: wording
for (const [name, value] of Object.entries({ 'two spaces': 'to  be  confirmed', hyphens: 'to-be-confirmed', tbc: 'TBC', fixme: 'FIXME', decided: 'to be decided', agreed: 'to be agreed', xxx: 'XXX', questions: '???', 'confirm before use': 'confirm before use', nbsp: 'to\u00a0be\u00a0confirmed', fill: '<fill in>' })) {
  reject('V9 wording', name, set('recommendation', `Option A, ${value}.`), ['UNRESOLVED_WORDING']);
}
for (const [name, value] of Object.entries({ hardcap: 'a hardcap of 5', spelled: 'a h-a-r-d limit', 'zero width': 'a ha\u200brd limit', cyrillic: 'a h\u0430rd limit', enforced: 'an enforced limit', guaranteed: 'a guaranteed maximum' })) {
  reject('V9 wording', name, set('recommendation', `Option A with ${value}.`), ['HARD_WITHOUT_PHRASE']);
}
test('V9 the accepted fixture still passes the hygiene rules on the real clock of the tests', () => {
  const p = load(); reseal(p);
  assert.equal(run(p).ok, true);
});
