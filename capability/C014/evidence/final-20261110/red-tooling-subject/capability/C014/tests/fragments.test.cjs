'use strict';

// F2 of the independent review of c7ec58a79f0d, and the claim it showed false: "a non-raw form of a registered secret masks the WHOLE value (fail closed)".
// The exact replacement of a registered PART (a name part, the e-mail local part, a connection-string part) used to run before the whole-value check and consumed the
// evidence: 'Qzvkx%20Wonderland' became 'Qzvkx%20[redacted]'. Now the check looks at the ORIGINAL text, so every covered form of a secret other than its own verbatim
// occurrences masks the whole text, and no fragment of it survives; its verbatim occurrences are still replaced in place and the rest of the sentence stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVault } = require('../vault.cjs');
const { createRedactor, MASK } = require('../redact.cjs');
const canon = require('../canon.cjs');
const { ENCODERS } = require('./scanner.cjs');
const { seedConfig } = require('./canaries.cjs');

const NAME = 'Qzvkx Wonderland';
const EMAIL = 'qzvkx.w@rvw-mail.invalid';
const config = seedConfig();
config.contacts['conductor-a'] = { name: NAME, email: EMAIL, phone: '+1 (555) 013-9999' };
const vault = createVault(config);
const SECRETS = vault.secrets();
const redactor = createRedactor({ secrets: SECRETS });
const around = (form) => `note: ${form} end`;
const hex2 = (code) => code.toString(16).padStart(2, '0');
const hex4 = (code) => code.toString(16).padStart(4, '0');

// One character of the secret written in another form while the rest stands verbatim: exactly the shape that hid a whole secret behind a registered part of it.
const ONE_CHARACTER = {
  percent: (char) => `%${hex2(char.charCodeAt(0))}`,
  htmlDecimal: (char) => `&#${char.charCodeAt(0)};`,
  htmlHex: (char) => `&#x${hex2(char.charCodeAt(0))};`,
  jsonUnicode: (char) => `\\u${hex4(char.charCodeAt(0))}`,
  hexEscape: (char) => `\\x${hex2(char.charCodeAt(0))}`
};

test('the vault of this test lists the parts that used to hide a whole secret: a surname of ten characters and an e-mail local part of seven, while the given name has five', () => {
  for (const part of ['Wonderland', 'qzvkx.w', NAME, EMAIL]) assert.ok(SECRETS.includes(part), part);
  assert.equal(SECRETS.includes('Qzvkx'), false, 'a given name of five characters is not a secret by value');
});

test('the cases of the review: the URL-encoded name and e-mail, the double URL-encoded e-mail, an entity and a JSON escape for the at sign, plus for space, a first letter as an entity or a JSON escape', () => {
  const cases = {
    'URL-encoded name': encodeURIComponent(NAME),
    'URL-encoded e-mail': encodeURIComponent(EMAIL),
    'double URL-encoded e-mail': encodeURIComponent(encodeURIComponent(EMAIL)),
    'at sign as an HTML entity': EMAIL.replace('@', '&#64;'),
    'at sign as a JSON escape': EMAIL.replace('@', '\\u0040'),
    'plus for space': NAME.replace(' ', '+'),
    'first letter as an HTML entity': '&#81;zvkx Wonderland',
    'first letter as a JSON escape': '\\u0051zvkx Wonderland'
  };
  for (const [label, form] of Object.entries(cases)) assert.equal(redactor.maskText(around(form)), MASK, label);
});

test('every covered encoding of every secret the vault lists (nine characters or more) masks the WHOLE text; a verbatim occurrence is replaced in place and the rest stays', () => {
  let checked = 0;
  const formEncoded = (value) => encodeURIComponent(value).replace(/%20/g, '+');
  for (const secret of SECRETS.filter((value) => value.length >= 9)) {
    for (const [label, encode] of Object.entries({ ...ENCODERS, plusForSpace: formEncoded })) {
      const form = encode(secret);
      const out = redactor.maskText(around(form));
      if (form === secret) assert.equal(out, around(MASK), `${label} leaves a verbatim secret of ${secret.length} characters: replaced in place`);
      else assert.equal(out, MASK, `${label} of a secret of ${secret.length} characters`);
      checked += 1;
    }
  }
  assert.ok(checked > 800, `${checked} secret and encoder pairs`);
});

test('one character of a secret written in another form while the rest stands verbatim (percent, decimal and hex entity, JSON and hex escape) masks the whole text, at the first, second, middle and last positions', () => {
  let checked = 0;
  for (const secret of SECRETS.filter((value) => value.length >= 9)) {
    for (const at of [0, 1, Math.floor(secret.length / 2), secret.length - 1]) {
      for (const [label, encode] of Object.entries(ONE_CHARACTER)) {
        const form = `${secret.slice(0, at)}${encode(secret[at])}${secret.slice(at + 1)}`;
        // a form that holds the secret verbatim by coincidence (the hex digits of an escaped digit next to the digits that follow) is replaced in place like any verbatim secret
        if (form.includes(secret)) continue;
        assert.equal(redactor.maskText(around(form)), MASK, `${label} at ${at} of a secret of ${secret.length} characters`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 600, `${checked} partly encoded forms`);
});

test('an e-mail address that holds a name in lower case is replaced in place like any verbatim secret (the lower-case name parts inside it are explained by the address); the same parts alone are a form of the name', () => {
  const email = config.contacts.visitor.email;
  const [local] = email.split('@');
  assert.match(local, /^ottoline\.brackenridge\./);
  assert.equal(redactor.maskText(around(email)), around(MASK));
  assert.equal(redactor.maskText(around(local)), around(MASK));
  assert.equal(redactor.maskText('hello ottoline brackenridge'), MASK, 'the whole name in lower case');
  assert.equal(redactor.maskText('hello ottoline'), MASK, 'the given name alone, in lower case');
  assert.equal(redactor.maskText(`${email} then ottoline`), MASK, 'a verbatim address does not explain a lower-case given name that stands outside it');
});

test('a secret that stands verbatim next to an encoded form of itself still masks the whole text; a verbatim part next to an encoded part of ANOTHER secret does too', () => {
  assert.equal(redactor.maskText(`${NAME} and ${encodeURIComponent(NAME)}`), MASK);
  assert.equal(redactor.maskText(`Wonderland, ${encodeURIComponent(EMAIL)}`), MASK);
  assert.equal(redactor.maskText(`${EMAIL} then ${NAME.toUpperCase()}`), MASK, 'a case-folded form beside a verbatim one');
  assert.equal(redactor.maskText(`${NAME} then %57onderland`), MASK, 'the surname written with one percent escape beside the verbatim name');
});

test('verbatim occurrences are replaced in place, longest secret first, and nothing else of the sentence changes', () => {
  assert.equal(redactor.maskText(around(NAME)), around(MASK));
  assert.equal(redactor.maskText(around(EMAIL)), around(MASK));
  assert.equal(redactor.maskText('Wonderland and qzvkx.w'), `${MASK} and ${MASK}`);
  assert.equal(redactor.maskText(`${NAME}, ${NAME}`), `${MASK}, ${MASK}`);
  assert.equal(redactor.maskText('a plain sentence without any secret in it'), 'a plain sentence without any secret in it');
});

test('canon.encodedIn: a secret set aside where it stands verbatim; every other covered form counts, in any view of the text', () => {
  const secret = 'CNRY-encoded-0123456789abcdef';
  const registry = new Map([[secret, canon.needlesFor(secret)]]);
  assert.equal(canon.encodedIn(`before ${secret} after`, registry), false, 'verbatim only');
  assert.equal(canon.encodedIn(`${secret} ${secret}`, registry), false, 'verbatim twice');
  for (const [label, encode] of Object.entries(ENCODERS)) {
    const form = encode(secret);
    assert.equal(canon.encodedIn(`before ${form} after`, registry), form !== secret, label);
    assert.equal(canon.encodedIn(`${secret} before ${form} after`, registry), form !== secret, `${label} beside a verbatim one`);
  }
  assert.equal(canon.encodedIn('nothing to see here, a plain sentence of some length', registry), false);
  assert.equal(canon.encodedIn('short', registry), false);
});

test('the plus-for-space view: a form-encoded text is decoded like a URL, with the plus signs turned into spaces first', () => {
  const views = canon.views('a+b%2Bc+%41');
  assert.equal(views.length, 6);
  assert.equal(views[5], 'a b+c A');
  assert.equal(views[1], 'a+b+c+A', 'the plain URL view keeps the plus signs');
});
