'use strict';

// F3 of the independent review of c7ec58a79f0d: two regex-quantifier guard mutants of redact.cjs (the e-mail local-part cap 64 -> 2 and the long-hex 32 or more -> 320 or more) survived
// every in-process suite, because the shape tests only asked that "the whole sample is gone". Here EVERY quantifier bound, character class, alternative, escape, flag and the ORDER of
// the closed list of SHAPES (PATTERNS in redact.cjs) is pinned by an exact answer, at its boundary: the longest and shortest text that matches, one character more and one less, each
// member of a class inside a run that only that member keeps whole, every alternative, both cases, two occurrences. tests\mutants.cjs generates a mutant for each of these (the
// regex-literal mutants) and each is killed by a case of this file. No secret is registered: these are the shapes the service was never told about.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRedactor, MASK, PATTERNS } = require('../redact.cjs');

const redactor = createRedactor({ secrets: [] });
const mask = (text) => redactor.maskText(text);
const rep = (char, count) => char.repeat(count);
const M = MASK;
const same = (text) => [text, text];

function check(shape, cases) {
  for (const [label, input, expected] of cases) assert.equal(mask(input), expected, `${shape}: ${label}`);
}

test('the closed list of shapes and its ORDER: the phone number comes last, so that it can never chew the digits of a hex run, a blob or a token and leave their letters visible', () => {
  assert.deepEqual(PATTERNS.map(([name]) => name), ['management token', 'bearer credential', 'connection string secret', 'e-mail address', 'json web token', 'long blob', 'long hex', 'phone number']);
  const hex = '0123456789abcdefABCDEF0123456789';
  assert.equal(mask(`h ${hex} t`), `h ${M} t`, 'a 32-digit hex run with a run of ten decimal digits at each end is masked whole');
  assert.equal(mask(`h ${rep('7', 32)} t`), `h ${M} t`, 'a hex run of decimal digits only is one mask, not two');
  const blob = `${rep('q', 12)}${rep('4', 12)}${rep('q', 20)}`;
  assert.equal(mask(`b ${blob} t`), `b ${M} t`, 'a blob with twelve digits inside is masked whole');
});

test('shape management token /c009_[A-Za-z0-9_-]{43}/g: the quantifier 43, every class member, the g flag, and the exact number of characters it consumes (a token that the blob shape would also mask whole)', () => {
  const token = `c009_AZaz09_-${rep('q', 35)}`;
  check('management token', [
    ['43 characters with A Z a z 0 9 _ and - consume exactly 48 characters (the blob shape would take the three that follow)', `x ${token}abc y`, `x ${M}abc y`],
    ['two tokens (the g flag)', `${token} ${token}abc`, `${M} ${M}abc`],
    ['42 characters are one short: the shape takes the next character and stops', `x c009_${rep('q', 42)}abc y`, `x ${M}bc y`],
    ['44 characters leave one behind', `x c009_${rep('q', 44)} y`, `x ${M}q y`]
  ]);
});

test('shape bearer credential /\\bBearer\\s+[a-z0-9._~+/-]{1,512}=*/gi: the word boundary, the case flag (which also makes the class hold the capitals), the whitespace run, the quantifier 1 to 512, every class member, the padding, the g flag', () => {
  check('bearer credential', [
    ['one character', 'Bearer a', M],
    ['lower case (the i flag)', 'bearer abc', M],
    ['upper case', 'BEARER abc', M],
    ['no word boundary before it', ...same('xBearer abc')],
    ['two spaces (one or more whitespace characters)', 'Bearer  abc', M],
    ['a tab', 'Bearer\tabc', M],
    ['no whitespace at all', ...same('Bearerabc')],
    ['no credential character after the space', ...same('Bearer !')],
    ['512 characters', `Bearer ${rep('q', 512)}`, M],
    ['513 characters leave one', `Bearer ${rep('q', 513)}`, `${M}q`],
    ['every class member: A Z a z 0 9 . _ ~ + / -', 'Bearer AZaz09._~+/-xy end', `${M} end`],
    ['padding of two', 'Bearer abc==, k', `${M}, k`],
    ['padding of three (any number)', 'Bearer abc===, k', `${M}, k`],
    ['two credentials (the g flag)', 'Bearer abc, Bearer def', `${M}, ${M}`]
  ]);
});

test('shape connection string secret: each of the seven keys, the case flag, the word boundary, the spaces around the equals sign, the terminators, the quantifier 1 to 256, the g flag', () => {
  const cases = [];
  for (const key of ['Password', 'Pwd', 'AccountKey', 'SharedAccessKey', 'SharedAccessSignature', 'ApiKey', 'Secret']) cases.push([`the key ${key}`, `a ${key}=abc;rest`, `a ${M};rest`]);
  check('connection string secret', [
    ...cases,
    ['lower case key (the i flag)', 'a password=abc;rest', `a ${M};rest`],
    ['upper case key', 'a PWD=abc;rest', `a ${M};rest`],
    ['no word boundary before the key', ...same('ClientSecret=abc')],
    ['spaces on both sides of the equals sign', 'Password  =  abc d', `${M} d`],
    ['a space before it only', 'Password =abc', M],
    ['a space after it only', 'Password= abc', M],
    ['none', 'Password=abc', M],
    ['the value stops at a comma', 'Password=abc,rest', `${M},rest`],
    ['the value stops at white space', 'Password=abc rest', `${M} rest`],
    ['the value stops at a semicolon', 'Password=abc;rest', `${M};rest`],
    ['256 characters', `Password=${rep('q', 256)}!`, `${M}!`],
    ['257 characters leave one', `Password=${rep('q', 257)}!`, `${M}q!`],
    ['an empty value', ...same('Password=;x')],
    ['two keys (the g flag)', 'Pwd=a;Pwd=b', `${M};${M}`]
  ]);
});

test('shape e-mail address: the local-part class and its quantifier 1 to 64, the domain label class and its quantifier 1 to 63 (twice), the number of labels 1 to 8, the g flag', () => {
  check('e-mail address', [
    ['every local-part class member: A Z a z 0 9 . _ % + -', 'see AZaz09._%+-q@example.com end', `see ${M} end`],
    ['a local part of one character', 'a@example.com', M],
    ['an empty local part is no address', ...same('@example.com')],
    ['a local part of 63 characters', `${rep('a', 63)}@x.co`, M],
    ['a local part of 64 characters', `${rep('a', 64)}@x.co`, M],
    ['a local part of 65 characters keeps its first character (the shape is bounded at 64)', `${rep('a', 65)}@x.co`, `a${M}`],
    ['every domain label class member: A Z a z 0 9 -', 'a@AZaz09-x.com', M],
    ['a domain label of 63 characters', `a@${rep('b', 63)}.com`, M],
    ['a domain label of 64 characters is no label (the long-run shapes mask it, the address around it stays)', `a@${rep('b', 64)}.com`, `a@${M}.com`],
    ['a top-level label with every class member', 'a@b.AZaz09-x', M],
    ['a top-level label of 63 characters', `a@b.${rep('c', 63)}`, M],
    ['a top-level label of 64 characters leaves one', `a@b.${rep('c', 64)}`, `${M}c`],
    ['one dot', 'a@b.c', M],
    ['no dot is no address', ...same('a@example')],
    ['an empty first domain label is no address', ...same('a@.b.c')],
    ['an empty label after a dot is no address', ...same('a@b..c')],
    ['two dots', 'a@b.c.d', M],
    ['eight labels after the first', `a@x.${rep('y.', 7)}y`, M],
    ['nine labels leave the last', `a@x.${rep('y.', 8)}y`, `${M}.y`],
    ['two addresses (the g flag)', 'a@b.c, d@e.f', `${M}, ${M}`]
  ]);
});

test('shape json web token: the prefix, the two segments of 8 to 512 characters, the third of 0 to 512, every class member in each, the g flag', () => {
  const J = (first, second, third) => `eyJ${first}.${second}.${third}`;
  const s = (count) => rep('q', count);
  check('json web token', [
    ['the shortest: 8, 8 and an empty third segment', J(s(8), s(8), ''), M],
    ['a first segment of 7 characters', ...same(J(s(7), s(8), 'ccc'))],
    ['a second segment of 7 characters', ...same(J(s(8), s(7), 'ccc'))],
    ['a first segment of 512 characters', J(s(512), s(8), ''), M],
    ['a first segment of 513 characters is no token (the blob shape masks the long segment)', J(s(513), s(8), ''), `${M}.qqqqqqqq.`],
    ['a second segment of 512 characters', J(s(8), s(512), ''), M],
    ['a second segment of 513 characters', J(s(8), s(513), ''), `eyJqqqqqqqq.${M}.`],
    ['a third segment of 512 characters', J(s(8), s(8), s(512)), M],
    ['a third segment of 513 characters leaves one', J(s(8), s(8), s(513)), `${M}q`],
    ['every class member in each segment: A Z a z 0 9 _ -', 'eyJAZaz09_-aa.AZaz09_-bb.AZaz09_-cc end', `${M} end`],
    ['two tokens (the g flag)', `${J(s(8), s(8), 'c')} ${J(s(8), s(8), 'd')}`, `${M} ${M}`]
  ]);
});

test('shape long blob /[A-Za-z0-9+/_-]{40,}={0,2}/g: the quantifier 40 or more, every class member, the padding 0 to 2, the g flag', () => {
  const run = (middle) => `${rep('q', 19)}${middle}${rep('q', 20)}`;
  const members = [];
  for (const member of ['A', 'Z', 'z', '0', '9', '_', '-', '+', '/']) members.push([`the class member ${member} keeps a run of 40 whole`, `x ${run(member)} y`, `x ${M} y`]);
  check('long blob', [
    ['40 characters', `x ${rep('q', 40)} y`, `x ${M} y`],
    ['39 characters', ...same(`x ${rep('q', 39)} y`)],
    ['an enormous run', `x ${rep('q', 5000)} y`, `x ${M} y`],
    ...members,
    ['padding of one', `x ${rep('q', 40)}= y`, `x ${M} y`],
    ['padding of two', `x ${rep('q', 40)}== y`, `x ${M} y`],
    ['padding of three leaves one', `x ${rep('q', 40)}=== y`, `x ${M}= y`],
    ['a dot splits a run', ...same(`${rep('q', 30)}.${rep('q', 30)}`)],
    ['two blobs (the g flag)', `${rep('q', 40)} ${rep('q', 41)}`, `${M} ${M}`]
  ]);
});

test('shape long hex /\\b[0-9a-fA-F]{32,}\\b/g: the quantifier 32 or more (an MD5-sized secret), both word boundaries, every class member, the g flag', () => {
  const hex = (count) => '0a1b2c3d4e5f6A7B8C9D0E1F'.repeat(3).slice(0, count);
  check('long hex', [
    ['32 digits (the size of an MD5 hash)', `h ${hex(32)} t`, `h ${M} t`],
    ['31 digits', ...same(`h ${hex(31)} t`)],
    ['33 digits', `h ${hex(33)} t`, `h ${M} t`],
    ['39 digits (one short of the blob shape)', `h ${hex(39)} t`, `h ${M} t`],
    ['40 digits (the blob shape takes it)', `h ${hex(40)} t`, `h ${M} t`],
    ['a letter beyond f before it', ...same(`h g${hex(32)} t`)],
    ['a letter beyond f after it', ...same(`h ${hex(32)}g t`)],
    ['upper case only', `h ${rep('F', 16)}${rep('A', 16)} t`, `h ${M} t`],
    ['every class member: 0 9 a f A F in a run of 32', `h ${hex(32)} t`, `h ${M} t`],
    ['two runs (the g flag)', `${hex(32)} ${hex(33)}`, `${M} ${M}`]
  ]);
});

test('shape phone number /\\+?\\d[\\d ().-]{7,18}\\d/g: the optional plus, the first and last digit, the quantifier 7 to 18, every class member, the g flag', () => {
  check('phone number', [
    ['a plus, a digit, parentheses, spaces and a dash', 'call +1 (555) 013-9999 now', `call ${M} now`],
    ['no plus (the plus is optional)', 'call 1 (555) 013-9999 now', `call ${M} now`],
    ['a trailing dot and digits are part of the run', 'call +1 (555) 013-9999.12 now', `call ${M} now`],
    ['9 characters', 'n 123-45-678 x', `n ${M} x`],
    ['8 characters', ...same('n 123-4567 x')],
    ['9 digits', 'n 123456789 x', `n ${M} x`],
    ['8 digits', ...same('n 12345678 x')],
    ['20 characters', `n ${rep('1', 20)} x`, `n ${M} x`],
    ['21 characters leave one', `n ${rep('1', 21)} x`, `n ${M}1 x`],
    ['every separator: space ( ) . -', 'n 1 ( ) . - 2 3 4 5 6 7 8 9 x', `n ${M} 7 8 9 x`],
    ['two numbers (the g flag)', '12345678901, 98765432109', `${M}, ${M}`]
  ]);
});
