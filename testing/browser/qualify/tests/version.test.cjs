'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseVersion, validateQualifiedMajors } = require('../version.cjs');

test('a four part decimal version is parsed to major, minor, build and patch', () => {
  assert.deepEqual(parseVersion('156.0.4314.58'), { ok: true, major: 156, minor: 0, build: 4314, patch: 58, text: '156.0.4314.58' });
  assert.deepEqual(parseVersion('0.0.0.0'), { ok: true, major: 0, minor: 0, build: 0, patch: 0, text: '0.0.0.0' });
  assert.equal(parseVersion('65535.65535.65535.65535').ok, true);
});

test('anything that is not exactly four plain decimal parts of at most 16 bits is refused', () => {
  const refused = [
    '', '156', '156.0.4314', '156.0.4314.58.1', 'v156.0.4314.58', '156.0.04314.58', '156.0.4314.58 ', ' 156.0.4314.58',
    '156.0.4314.58\n', '156,0,4314,58', '156.0.4314.58 (Official build)', '1.2.3.-4', '1.2.3.4e1', '١٥٦.0.4314.58', '156..4314.58',
  ];
  for (const text of refused) {
    const result = parseVersion(text);
    assert.equal(result.ok, false, JSON.stringify(text));
    assert.match(result.error, /plain decimal/);
  }
  assert.deepEqual(parseVersion('156.0.4314.65536'), { ok: false, error: 'a version part exceeds 65535' });
  assert.deepEqual(parseVersion('99999.0.0.0'), { ok: false, error: 'a version part exceeds 65535' });
  for (const value of [null, undefined, 156, ['156.0.4314.58'], { toString: () => '156.0.4314.58' }]) {
    assert.deepEqual(parseVersion(value), { ok: false, error: 'the version is not a string' });
  }
});

test('qualified majors must be a non-empty list of distinct integers from 1 to 65535', () => {
  assert.deepEqual(validateQualifiedMajors({ qualifiedMajors: [156] }), { ok: true, majors: [156] });
  assert.deepEqual(validateQualifiedMajors({ qualifiedMajors: [1, 65535, 156] }), { ok: true, majors: [1, 65535, 156] });
  const refused = [
    null, undefined, 156, '[156]', [156], {}, { majors: [156] }, { qualifiedMajors: [] }, { qualifiedMajors: 156 },
    { qualifiedMajors: '*' }, { qualifiedMajors: ['*'] }, { qualifiedMajors: ['156'] }, { qualifiedMajors: [156.5] },
    { qualifiedMajors: [0] }, { qualifiedMajors: [-1] }, { qualifiedMajors: [65536] }, { qualifiedMajors: [NaN] },
    { qualifiedMajors: [Infinity] }, { qualifiedMajors: [156, '157'] }, { qualifiedMajors: [null] },
  ];
  for (const data of refused) {
    assert.equal(validateQualifiedMajors(data).ok, false, JSON.stringify(data));
  }
  assert.deepEqual(validateQualifiedMajors({ qualifiedMajors: [156, 156] }), { ok: false, error: 'qualifiedMajors has a duplicate' });
});

test('the shipped qualified.json is valid, lists 156 and explains how a major is added', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'qualified.json'), 'utf8'));
  const result = validateQualifiedMajors(data);
  assert.equal(result.ok, true);
  assert.ok(result.majors.includes(156));
  assert.match(data.note, /requalif|--requalify/);
  assert.match(data.note, /no newer-is-fine rule and no wildcard/);
});
