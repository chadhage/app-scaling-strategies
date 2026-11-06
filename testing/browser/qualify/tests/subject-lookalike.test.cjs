'use strict';

// F1 of the independent review: a leading U+FEFF in the organization was silently dropped (TextDecoder ignoreBOM),
// so "\uFEFFMicrosoft Corporation" parsed as exactly "Microsoft Corporation". The parse path must keep every code point.
const assert = require('node:assert/strict');
const test = require('node:test');
const { organizationOf, parseSubject } = require('../subject.cjs');
const { qualifyEdge } = require('../qualify.cjs');
const { fixtureAdapters } = require('./support.cjs');

const MS = 'Microsoft Corporation';
const BOM = '\uFEFF';
const subjectWith = (organization) => `CN=${MS}, O=${organization}, L=Redmond, S=Washington, C=US`;
const hexEscape = (text) => [...Buffer.from(text, 'utf8')].map((byte) => `\\${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
const forms = (character, value) => [
  ['plain', subjectWith(value)],
  ['hex-escaped', subjectWith(value.replace(character, hexEscape(character)))],
  ['quoted', subjectWith(`"${value}"`)],
];
const qualifyWith = (subject) => qualifyEdge({ adapters: fixtureAdapters({ signature: () => ({ status: 'Valid', subject }) }) });

function codePoints(pattern) {
  const found = [];
  for (let cp = 0; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const character = String.fromCodePoint(cp);
    if (pattern.test(character)) found.push(character);
  }
  return found;
}

test('a leading BOM stays part of the organization in the plain, hex-escaped and quoted forms', () => {
  for (const [form, subject] of forms(BOM, BOM + MS)) {
    const parsed = organizationOf(subject);
    assert.equal(parsed.ok, true, form);
    assert.equal(parsed.organization, BOM + MS, form);
    assert.notEqual(parsed.organization, MS, form);
  }
  assert.deepEqual(organizationOf(`O=${hexEscape(BOM)}`), { ok: true, organization: BOM });
  assert.deepEqual(organizationOf(`O=${BOM}${BOM}${MS}`), { ok: true, organization: BOM + BOM + MS });
});

test('a Valid signature whose organization starts with a BOM is not Microsoft Corporation', async () => {
  for (const [form, subject] of forms(BOM, BOM + MS)) {
    const report = await qualifyWith(subject);
    assert.equal(report.ok, false, form);
    assert.deepEqual(report.reasonCodes, ['PUBLISHER_NOT_MICROSOFT'], form);
    assert.equal(report.signature.publisher, BOM + MS, form);
  }
  assert.equal((await qualifyWith(subjectWith(MS))).ok, true);
});

const invisible = [
  ...codePoints(/\p{Cf}/u), ...codePoints(/\p{Z}/u).filter((character) => character !== ' '),
  ...codePoints(/\p{Cc}/u).filter((character) => character !== '\t'),
  ...codePoints(/[\uFE00-\uFE0F\u180B-\u180D\u180F\u034F\u115F\u1160\u17B4\u17B5\u2800\u3164\uFFA0\uFFFC\uFFFD]/u),
  ...codePoints(/[\u{E0100}-\u{E01EF}]/u),
];

test('the sweep covers every format character, joiner, zero-width character and variation selector', () => {
  for (const wanted of [BOM, '\u200B', '\u200C', '\u200D', '\u2060', '\u00AD', '\u202E', '\uFE0F', '\u{E0100}', '\u{E0001}', '\u00A0']) {
    assert.ok(invisible.includes(wanted), JSON.stringify(wanted));
  }
  assert.ok(invisible.length > 400, String(invisible.length));
});

test('no invisible character is stripped or normalized at the start, in the middle or at the end of the organization', () => {
  for (const character of invisible) {
    const placed = [character + MS, `Micro${character}soft Corporation`, MS + character];
    for (const value of placed) {
      for (const [form, subject] of forms(character, value)) {
        const parsed = organizationOf(subject);
        assert.deepEqual(parsed, { ok: true, organization: value }, `${form} ${JSON.stringify(value)}`);
      }
    }
  }
});

test('qualifyEdge refuses every invisible look-alike of the organization although the status is Valid', async () => {
  for (const character of invisible) {
    for (const value of [character + MS, `Micro${character}soft Corporation`, MS + character]) {
      const report = await qualifyWith(subjectWith(value));
      assert.equal(report.ok, false, JSON.stringify(value));
      assert.deepEqual(report.reasonCodes, ['PUBLISHER_NOT_MICROSOFT'], JSON.stringify(value));
    }
  }
});

test('nothing is case-folded, composed or compatibility-mapped on the way: look-alikes keep their own code points', () => {
  const lookAlikes = [
    '\u041Cicrosoft Corporation', '\u039Cicrosoft Corporation', '\uFF2Dicrosoft Corporation', 'Microsoft Corporation\u0301',
    'Microsoft Corporati\u006F\u0301n', 'Microsoft Corporati\u00F4n', 'Microsoft Corporation\u212A', 'Mi\uFB01 Corporation',
    'microsoft corporation', 'MICROSOFT CORPORATION', 'Microsoft Corporation\uD7FF', 'Mi\u017Frosoft Corporation',
  ];
  for (const value of lookAlikes) {
    assert.deepEqual(organizationOf(`O=${value}`), { ok: true, organization: value }, JSON.stringify(value));
    assert.notEqual(organizationOf(`O=${value}`).organization, MS);
  }
  assert.equal('\uFF2Dicrosoft Corporation'.normalize('NFKC'), MS);
});

test('Unicode whitespace and format characters around an attribute type are refused, never stripped', () => {
  for (const character of [BOM, '\u00A0', '\u2028', '\u2029', '\u3000', '\u2003', '\u200B', '\u0085', '\u000B']) {
    for (const subject of [`CN=x,${character}O=${MS}`, `${character}O=${MS}`, `O${character}=${MS}`, `O=${MS},${character}CN=x`]) {
      const parsed = parseSubject(subject);
      assert.equal(parsed.ok, false, JSON.stringify(subject));
      assert.equal(parsed.error, 'invalid attribute type', JSON.stringify(subject));
    }
  }
  assert.equal(organizationOf(`CN=x,  O=${MS}`).organization, MS);
  assert.equal(organizationOf(`CN=x,\tO\t=\t${MS}`).organization, MS);
});

test('the only insignificant characters are the ASCII space and tab around an unquoted value', () => {
  assert.equal(organizationOf(`O= \t${MS} \t`).organization, MS);
  assert.equal(organizationOf(`O=${MS}\\ `).organization, `${MS} `);
  assert.equal(organizationOf(`O="${MS} "`).organization, `${MS} `);
  assert.equal(organizationOf(`O=\u00A0${MS}`).organization, `\u00A0${MS}`);
});
