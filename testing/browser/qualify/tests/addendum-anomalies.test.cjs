'use strict';

// N1: every anomaly of qualified.addendum.jsonl fails closed with the typed code QUALIFIED_ADDENDUM_INVALID and ITS OWN
// reason (a removed rule must not hide behind another refusal), also for the sealed major 156.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, fields, lineOf, anchorOf, sha, SEALED_CRLF } = require('./chain.cjs');

const listAdapters = (overrides) => {
  const { readQualified, ...rest } = fixtureAdapters(overrides);
  return rest;
};

async function refuse(build, label) {
  const dir = scratchDir();
  try {
    fs.writeFileSync(path.join(dir, 'qualified.json'), SEALED_CRLF);
    build(path.join(dir, 'qualified.addendum.jsonl'), dir);
    return await qualifyEdge({ qualifiedPath: path.join(dir, 'qualified.json'), adapters: listAdapters({ fileVersion: () => '156.0.4314.58' }) });
  } finally {
    removeDir(dir);
  }
}

const base = chain(SEALED_CRLF, [157, 158]);
const [l1, l2] = base.lines;
const first = (extra) => chain(SEALED_CRLF, [{ major: 157, ...extra }]).text;
const bytes = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'));

const CASES = [
  ['an earlier line was edited (its time)', `${l1.replace('09:00:00', '09:00:01')}\n${l2}\n`, /line 2: previous does not match the previous line/],
  ['the anchor is wrong', first({ previous: sha('other') }), /line 1: previous does not match qualified\.json/],
  ['the first line was deleted', `${l2}\n`, /line 1: previous does not match qualified\.json/],
  ['two lines were reordered', `${l2}\n${l1}\n`, /line 1: previous does not match qualified\.json/],
  ['a line was duplicated', `${l1}\n${l1}\n`, /line 2: previous does not match the previous line/],
  ['the same major twice with a valid chain', chain(SEALED_CRLF, [157, 157]).text, /line 2: major 157 is listed twice/],
  ['an extra line that is not JSON', `${l1}\nnot json\n`, /line 2 is not valid JSON/],
  ['an extra line that is a JSON array', `${l1}\n[]\n`, /line 2 is not a JSON object/],
  ['an extra blank line at the end', `${l1}\n\n`, /line 2 is blank/],
  ['a blank line between two lines', `${l1}\n\n${l2}\n`, /line 2 is blank/],
  ['no final line feed', l1, /does not end with a line feed/],
  ['a byte order mark', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(`${l1}\n`)]), /starts with a byte order mark/],
  ['CRLF line endings', `${l1}\r\n`, /contains a carriage return/],
  ['an empty file', '', /the file is empty/],
  ['an oversized file', Buffer.alloc(65537, 0x78), /larger than 65536 bytes/],
  ['a byte that is not printable ASCII', `${l1.replace('T09', 'T0\u00e9')}\n`, /contains a byte that is not printable ASCII/],
  ['an extra key', `${lineOf({ ...fields(157, anchorOf(SEALED_CRLF)), note: 'x' })}\n`, /line 1 does not have exactly the keys/],
  ['a missing key', `${lineOf((({ atUtc, ...rest }) => rest)(fields(157, anchorOf(SEALED_CRLF))))}\n`, /line 1 does not have exactly the keys/],
  ['keys in another order', `${lineOf((({ major, ...rest }) => ({ ...rest, major }))(fields(157, anchorOf(SEALED_CRLF))))}\n`, /line 1 does not have exactly the keys/],
  ['a __proto__ key in place of major', `${l1.replace('"major"', '"__proto__"')}\n`, /line 1 does not have exactly the keys/],
  ['spaces inside the line', `${l1.replace(',', ', ')}\n`, /line 1 is not in canonical form/],
  ['a duplicate key', `${l1.replace('"major":157', '"major":157,"major":157')}\n`, /line 1 is not in canonical form/],
  ['the sealed major 156', first({ major: 156, version: '156.0.4314.58' }), /line 1: major must be an integer above 156 and at most 65535/],
  ['major 155', first({ major: 155, version: '155.0.1.1' }), /line 1: major must be an integer above 156/],
  ['major 0', first({ major: 0, version: '0.0.0.1' }), /line 1: major must be an integer above 156/],
  ['major 65536', first({ major: 65536, version: '65536.0.0.1' }), /line 1: major must be an integer above 156/],
  ['a fractional major', first({ major: 157.5, version: '157.0.4341.42' }), /line 1: major must be an integer above 156/],
  ['a major written as a string', first({ major: '157' }), /line 1: major must be an integer above 156/],
  ['a wildcard major', first({ major: '*', version: '157.0.4341.42' }), /line 1: major must be an integer above 156/],
  ['a range of majors', first({ major: '157-159', version: '157.0.4341.42' }), /line 1: major must be an integer above 156/],
  ['a version of another major', first({ version: '158.0.4341.42' }), /line 1: version is not major\.minor\.build\.patch of the same major/],
  ['a version with three parts', first({ version: '157.0.4341' }), /line 1: version is not major\.minor\.build\.patch of the same major/],
  ['a version with a leading zero', first({ version: '157.00.4341.42' }), /line 1: version is not major\.minor\.build\.patch of the same major/],
  ['an upper-case binarySha256', first({ binarySha256: sha('binary-157').toUpperCase() }), /line 1: binarySha256 is not 64 lowercase hex digits/],
  ['a short reportSha256', first({ reportSha256: sha('report-157').slice(0, 63) }), /line 1: reportSha256 is not 64 lowercase hex digits/],
  ['a previous that is not hex', first({ previous: 'zz'.repeat(32) }), /line 1: previous is not 64 lowercase hex digits/],
  ['a time with an offset', first({ atUtc: '2026-11-07T09:00:00+01:00' }), /line 1: atUtc is not a UTC time like/],
  ['a time that is not a calendar date', first({ atUtc: '2026-02-30T09:00:00.000Z' }), /line 1: atUtc is not a UTC time like/],
];

for (const [label, content, reason] of CASES) {
  test(`anomaly: ${label} fails closed with its own reason, also for the sealed major`, async () => {
    const report = await refuse((file) => fs.writeFileSync(file, bytes(content)), label);
    assert.equal(report.ok, false, label);
    assert.deepEqual(report.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID'], label);
    assert.deepEqual(report.qualifiedMajors, [], label);
    assert.match(report.reasons[0], reason, label);
  });
}

test('a directory, a junction and a symbolic link in place of the addendum file are refused as not regular files', async () => {
  const folder = await refuse((file) => fs.mkdirSync(file), 'directory');
  assert.deepEqual(folder.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID']);
  assert.match(folder.reasons[0], /the file is not a regular file/);
  const junction = await refuse((file, dir) => {
    fs.mkdirSync(path.join(dir, 'elsewhere'));
    fs.symlinkSync(path.join(dir, 'elsewhere'), file, 'junction');
  }, 'junction');
  assert.deepEqual(junction.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID']);
  assert.match(junction.reasons[0], /the file is not a regular file/);
  let linked = null;
  try {
    linked = await refuse((file, dir) => {
      fs.writeFileSync(path.join(dir, 'real.jsonl'), chain(SEALED_CRLF, [157]).text);
      fs.symlinkSync(path.join(dir, 'real.jsonl'), file, 'file');
    }, 'file symlink');
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
  }
  if (linked !== null) {
    assert.deepEqual(linked.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID']);
    assert.match(linked.reasons[0], /the file is not a regular file/);
  }
});
