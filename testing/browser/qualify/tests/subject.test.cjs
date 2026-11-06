'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSubject, organizationOf } = require('../subject.cjs');

const MICROSOFT = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';

test('the real Microsoft subject parses into its attributes and names the organization', () => {
  const parsed = parseSubject(MICROSOFT);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.attributes.map((a) => `${a.type}=${a.value}`), [
    'CN=Microsoft Corporation', 'O=Microsoft Corporation', 'L=Redmond', 'S=Washington', 'C=US',
  ]);
  assert.deepEqual(organizationOf(MICROSOFT), { ok: true, organization: 'Microsoft Corporation' });
});

test('separators inside quotes or after a backslash never split a component', () => {
  assert.equal(organizationOf('O="Evil, O=Microsoft Corporation", C=US').organization, 'Evil, O=Microsoft Corporation');
  const escaped = parseSubject('CN=Evil\\, O=Microsoft Corporation, O=Evil, C=US');
  assert.deepEqual(escaped.attributes.map((a) => a.value), ['Evil, O=Microsoft Corporation', 'Evil', 'US']);
  assert.equal(organizationOf('CN=Evil\\, O=Microsoft Corporation, O=Evil, C=US').organization, 'Evil');
  assert.equal(organizationOf('O="a\\"b", C=US').organization, 'a"b');
  assert.equal(organizationOf('O="a\\\\", C=US').organization, 'a\\');
  assert.equal(organizationOf('O="", C=US').organization, '');
});

test('semicolons separate like commas, types are case-insensitive and spaces around values are insignificant', () => {
  assert.equal(organizationOf('CN=a; o =  Microsoft Corporation  ; C=US').organization, 'Microsoft Corporation');
  assert.equal(organizationOf('O=Microsoft Corporation\\ , C=US').organization, 'Microsoft Corporation ');
  assert.equal(organizationOf('O=Microsoft Corporation\\  , C=US').organization, 'Microsoft Corporation ');
});

test('hex and character escapes decode to the exact value and invalid UTF-8 is refused', () => {
  assert.equal(organizationOf('O=Microsoft\\20Corporation').organization, 'Microsoft Corporation');
  assert.equal(organizationOf('O=Caf\\C3\\A9').organization, 'Caf\u00e9');
  assert.equal(organizationOf('O=a\\#b\\=c').organization, 'a#b=c');
  assert.equal(organizationOf('O=\u{1f600}x').organization, '\u{1f600}x');
  assert.equal(organizationOf('O=Microsoft Corporation\\00').organization, 'Microsoft Corporation\u0000');
  assert.deepEqual(organizationOf('O=\\FF'), { ok: false, error: 'value is not valid UTF-8' });
  assert.notEqual(organizationOf('O=Microsoft Corporation\\00').organization, 'Microsoft Corporation');
});

test('an organization given as OID 2.5.4.10 counts as O and other OIDs stay distinct', () => {
  assert.equal(organizationOf('2.5.4.10=Microsoft Corporation').organization, 'Microsoft Corporation');
  assert.equal(organizationOf('OID.2.5.4.10=Microsoft Corporation').organization, 'Microsoft Corporation');
  const parsed = parseSubject('OID.1.3.6.1.4.1.311.60.2.1.3=US, O=X');
  assert.deepEqual(parsed.attributes.map((a) => a.type), ['OID.1.3.6.1.4.1.311.60.2.1.3', 'O']);
});

test('a missing or repeated organization is an error, never a guess', () => {
  assert.deepEqual(organizationOf('CN=Microsoft Corporation, C=US'), { ok: false, error: 'no organization (O) attribute' });
  assert.deepEqual(organizationOf('O=Microsoft Corporation, O=Evil Inc'), {
    ok: false, error: 'more than one organization (O) attribute',
  });
});

test('malformed names are errors with a named reason', () => {
  const cases = [
    ['', 'empty subject'], ['   ', 'empty subject'], [null, 'empty subject'], [undefined, 'empty subject'], [42, 'empty subject'],
    ['CN=a,,O=b', 'component without type=value'], ['CN=a, O=b,', 'component without type=value'],
    ['not a distinguished name', 'component without type=value'], ['=x', 'component without type=value'],
    ['1bad=x', 'invalid attribute type'], [' =x', 'invalid attribute type'], ['C N=x', 'invalid attribute type'],
    ['O="abc', 'unterminated quote'], ['O=abc\\', 'dangling backslash'], ['O=a+CN=b', 'multi-valued component is not supported'],
    ['O=a"b"c', 'unescaped quote in value'], ['O="a"x', 'malformed quoted value'], ['O="a" "b"', 'unescaped quote in value'],
    ['O=a"b', 'unterminated quote'],
    ['O=a\\zb', 'invalid escape'], ['O="a"b"', 'unterminated quote'],
  ];
  for (const [subject, error] of cases) {
    assert.deepEqual(parseSubject(subject), { ok: false, error }, JSON.stringify(subject));
    assert.equal(organizationOf(subject).ok, false);
  }
});

test('a quoted multi-valued marker is plain text', () => {
  assert.equal(organizationOf('O="a+b", C=US').organization, 'a+b');
});
