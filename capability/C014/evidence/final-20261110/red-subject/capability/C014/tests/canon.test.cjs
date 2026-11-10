'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');

test('fold: case, compatibility forms, format characters, combining marks, dash and space look-alikes', () => {
  assert.equal(canon.fold('\uff21\uff22\uff23-\uff44\uff45\uff46'), 'abc-def');
  assert.equal(canon.fold('a\u200bb\u00adc\ufeffd\u202ee'), 'abcde');
  assert.equal(canon.fold('e\u0301E\u0302'), 'ee');
  assert.equal(canon.fold('a\u2011b\u2212c\u2010d'), 'a-b-c-d');
  assert.equal(canon.fold('A\u00a0B\u3000C'), 'a b c');
});

test('percentDecode: every run of %XX is decoded as bytes, so one invalid byte cannot protect the rest', () => {
  assert.equal(canon.percentDecode('%63%61%6e%FFx%61%62'), 'can\ufffdxab');
  assert.equal(canon.percentDecode('%e2%82%ac and %41'), '\u20ac and A');
  assert.equal(canon.percentDecode('100% sure %zz'), '100% sure %zz');
});

test('htmlDecode: decimal, hex and named entities, with or without the semicolon; out-of-range and unknown ones stay', () => {
  assert.equal(canon.htmlDecode('&#99;&#x61;&#X6E;&#97'), 'cana');
  assert.equal(canon.htmlDecode('&amp;&LT;&gt;&quot;&apos;&nbsp;'), '&<>"\' ');
  assert.equal(canon.htmlDecode('&bogus;&#1114112;&#x110000;'), '&bogus;&#1114112;&#x110000;');
});

test('unicodeUnescape: \\uXXXX, \\u{...} and \\xHH; out-of-range stays', () => {
  assert.equal(canon.unicodeUnescape('\\u0063\\u{61}\\x6e\\uD83D\\uDE00'), 'can\ud83d\ude00');
  assert.equal(canon.unicodeUnescape('\\u{110000}\\u12'), '\\u{110000}\\u12');
});

test('views: the text and its URL (twice), HTML, escape and form-encoded (plus for space) decodings', () => {
  const [plain, once, twice, html, escaped, form] = canon.views('%2563&#99;\\u0063+x');
  assert.equal(plain, '%2563&#99;\\u0063+x');
  assert.equal(once, '%63&#99;\\u0063+x');
  assert.equal(twice, 'c&#99;\\u0063+x');
  assert.equal(html, '%2563c\\u0063+x');
  assert.equal(escaped, '%2563&#99;c+x');
  assert.equal(form, '%63&#99;\\u0063 x', 'plus becomes a space before the URL decoding, so %2B stays a plus');
  assert.equal(canon.views('a+b%2Bc+%41').length, 6);
  assert.equal(canon.views('a+b%2Bc+%41')[5], 'a b+c A');
});

test('needlesFor: base64 and base64url are found at all three alignments inside a longer base64 text', () => {
  const secret = 'CNRY-needle-9f8e7d6c5b4a';
  const { exact, folded } = canon.needlesFor(secret);
  for (const prefix of ['', 'x', 'xy']) {
    for (const suffix of ['', 'z', 'zw']) {
      const bytes = Buffer.from(`${prefix}${secret}${suffix}`);
      assert.ok(exact.some((needle) => bytes.toString('base64').includes(needle)), `base64 ${prefix.length}/${suffix.length}`);
      assert.ok(exact.some((needle) => bytes.toString('base64url').includes(needle)), `base64url ${prefix.length}/${suffix.length}`);
    }
  }
  assert.ok(folded.includes(canon.fold(secret)) && folded.includes(Buffer.from(secret).toString('hex')));
  assert.ok(exact.every((needle) => needle.length >= 8), 'a needle too short to be specific is never used');
});

test('encodedIn: any view of a text, folded or not, that holds any needle of any registered secret in a form other than as written; the secret itself, as written, is not a form', () => {
  const secret = 'CNRY leak+0123456789=abcdef';
  const registry = new Map([[secret, canon.needlesFor(secret)]]);
  const forms = [secret.toUpperCase(), encodeURIComponent(secret), `%25${[...Buffer.from(secret)].map((byte) => byte.toString(16)).join('%25')}`, Buffer.from(secret).toString('base64'),
    Buffer.from(`x${secret}`).toString('base64url'), Buffer.from(secret).toString('hex').toUpperCase(), [...secret].join('\u200b'), [...secret].map((char) => `&#${char.charCodeAt(0)};`).join(''),
    encodeURIComponent(secret).replace(/%20/g, '+')];
  for (const form of forms) assert.equal(canon.encodedIn(`before ${form} after`, registry), true, form.slice(0, 24));
  assert.equal(canon.encodedIn(`before ${secret} after`, registry), false, 'as written');
  assert.equal(canon.encodedIn(`${secret}${secret}`, registry), false, 'as written twice');
  assert.equal(canon.encodedIn(`${secret} ${encodeURIComponent(secret)}`, registry), true, 'as written beside an encoded form');
  assert.equal(canon.encodedIn('nothing to see here, a plain sentence of some length', registry), false);
  assert.equal(canon.encodedIn('short', registry), false);
});

test('encodedIn sets aside a verbatim secret that CONTAINS the one it looks for (an address that holds a name in lower case) and a verbatim part never hides a form of the longer secret', () => {
  const name = 'Zorvald Quillfeather';
  const address = 'zorvald.quillfeather.1a2b3c@mail.invalid';
  const registry = new Map([[name, canon.needlesFor(name)], ['Quillfeather', canon.needlesFor('Quillfeather')], [address, canon.needlesFor(address)]]);
  assert.equal(canon.encodedIn(`mail ${address} sent`, registry), false, 'the lower-case name parts inside a verbatim address are explained by it');
  assert.equal(canon.encodedIn(`mail ${address} to zorvald quillfeather`, registry), true, 'the same name in lower case outside the address is a form of the name');
  assert.equal(canon.encodedIn(`Zorvald%20Quillfeather`, registry), true, 'the surname stands verbatim inside the encoded name');
  assert.equal(canon.encodedIn('Zorvald Quillfeather and Quillfeather', registry), false);
});

test('the minimum lengths are 6 for a secret and 8 for a base64 needle: a text of exactly six characters is examined, and a shorter text never is', () => {
  assert.equal(canon.MIN_SECRET, 6);
  const six = 'abcdef';
  const registry = new Map([[six, canon.needlesFor(six)]]);
  assert.equal(canon.encodedIn('ABCDEF', registry), true, 'a text of exactly the minimum length that is a form of the secret');
  assert.equal(canon.encodedIn('ABCDE', registry), false, 'five characters are shorter than any secret');
  // a secret whose folded form is shorter than the minimum (zero-width characters): the text that equals the folded form is too short to be examined
  const degenerate = 'ab\u200b\u200b\u200b\u200b';
  assert.deepEqual(canon.needlesFor(degenerate).folded.slice(0, 1), ['ab']);
  assert.equal(canon.encodedIn('ab', new Map([[degenerate, canon.needlesFor(degenerate)]])), false, 'two characters are never examined');
  assert.equal(canon.encodedIn('ab\u200b\u200b\u200b\u200d', new Map([[degenerate, canon.needlesFor(degenerate)]])), true, 'six characters are');
});

test('htmlDecode and unicodeUnescape decode the last code point U+10FFFF and leave the first one beyond it', () => {
  const last = String.fromCodePoint(0x10ffff);
  assert.equal(canon.htmlDecode('&#1114111;'), last);
  assert.equal(canon.htmlDecode('&#x10FFFF;'), last);
  assert.equal(canon.unicodeUnescape('\\u{10FFFF}'), last);
  assert.equal(canon.htmlDecode('&#1114112;'), '&#1114112;');
  assert.equal(canon.unicodeUnescape('\\u{110000}'), '\\u{110000}');
});

// The oracle for the base64 needles does not use the production rule (cut the first 0, 2 or 3 characters and the last one unless the group is complete): it embeds the secret between many different
// neighbours, encodes every variant, and keeps the characters that are identical in ALL of them, which are the characters the secret alone determines.
function determined(secret, prefix) {
  const heads = [[0x00, 0x00], [0xff, 0xff], [0x55, 0xaa], [0xaa, 0x55], [0x37, 0xc9], [0xc9, 0x37], [0x01, 0x80], [0x80, 0x01]];
  const tails = [[], [0x00], [0xff], [0x55, 0xaa], [0xaa, 0x55], [0x13], [0xfe, 0x01], [0x77, 0x88]];
  const variants = [];
  for (const head of heads) for (const tail of tails) variants.push(Buffer.concat([Buffer.from(head.slice(0, prefix)), Buffer.from(secret), Buffer.from(tail)]).toString('base64'));
  const shortest = Math.min(...variants.map((variant) => variant.length));
  const same = [];
  for (let at = 0; at < shortest; at += 1) same.push(variants.every((variant) => variant[at] === variants[0][at]) && variants[0][at] !== '=');
  const first = same.indexOf(true);
  let last = first;
  while (same[last + 1]) last += 1;
  return first < 0 ? '' : variants[0].slice(first, last + 1);
}

test('needlesFor: the base64 needles are exactly the characters the secret alone determines at each of the three alignments (derived by embedding it between neighbours), at least 8 of them, and each also in its base64url form', () => {
  const secrets = ['abcdef', 'abcdefg', 'abcdefgh', 'CNRY-needle-9f8e7d6c5b4a', 'p\u00e4ssw\u00f6rd-\u20ac-9', '???>>>~~~+++///', 'x'.repeat(6), 'c009_' + 'A'.repeat(43)];
  for (const secret of secrets) {
    const expected = new Set();
    for (let prefix = 0; prefix < 3; prefix += 1) {
      const needle = determined(secret, prefix);
      if (needle.length >= 8) { expected.add(needle); expected.add(needle.replace(/\+/g, '-').replace(/\//g, '_')); }
    }
    assert.deepEqual(new Set(canon.needlesFor(secret).exact), expected, `the base64 needles of ${secret.length} characters`);
  }
  assert.deepEqual(canon.needlesFor('abcdef').exact, ['YWJjZGVm'], 'six characters give one needle of exactly eight characters (the others have seven)');
  assert.equal(canon.needlesFor('ab\u00e9def').folded.length, 2);
});
