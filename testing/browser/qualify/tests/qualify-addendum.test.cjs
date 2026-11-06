'use strict';

// N1 of the second review: the sealed qualified.json ([156]) is extended ONLY by qualified.addendum.jsonl, a hash-chained
// append-only file that readQualified reads after the sealed one. These tests use the real readQualified through qualifyEdge
// with a scratch folder (sealed fixture + addendum), never the shipped files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { requalifyEdge } = require('../requalify.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, SEALED_CRLF, SEALED_LF } = require('./chain.cjs');

const listAdapters = (overrides) => {
  const { readQualified, ...rest } = fixtureAdapters(overrides);
  return rest;
};

async function check({ addendum = null, sealed = SEALED_CRLF, version = '157.0.4341.42' } = {}) {
  const dir = scratchDir();
  try {
    fs.writeFileSync(path.join(dir, 'qualified.json'), sealed);
    if (addendum !== null) fs.writeFileSync(path.join(dir, 'qualified.addendum.jsonl'), addendum);
    return await qualifyEdge({ qualifiedPath: path.join(dir, 'qualified.json'), adapters: listAdapters({ fileVersion: () => version }) });
  } finally {
    removeDir(dir);
  }
}

test('without an addendum file the sealed list decides, as before: 156 qualifies and 157 does not', async () => {
  const sealed = await check({ version: '156.0.4314.58' });
  assert.equal(sealed.ok, true);
  assert.deepEqual(sealed.qualifiedMajors, [156]);
  const other = await check({ version: '157.0.4341.42' });
  assert.equal(other.ok, false);
  assert.deepEqual(other.reasonCodes, ['MAJOR_NOT_QUALIFIED']);
  assert.deepEqual(other.qualifiedMajors, [156]);
});

test('a valid addendum line qualifies its major and records where the major came from', async () => {
  const { text } = chain(SEALED_CRLF, [157]);
  const report = await check({ addendum: text });
  assert.equal(report.ok, true, report.reasons.join(' | '));
  assert.equal(report.major, 157);
  assert.deepEqual(report.qualifiedMajors, [156, 157]);
  assert.equal(report.qualifiedVia, 'addendum');
  assert.deepEqual(report.reasonCodes, []);
});

test('the sealed major still qualifies through the sealed file when an addendum exists, and a major beyond the chain does not', async () => {
  const { text } = chain(SEALED_CRLF, [157, 158]);
  const sealed = await check({ addendum: text, version: '156.0.4314.58' });
  assert.equal(sealed.ok, true, sealed.reasons.join(' | '));
  assert.equal(sealed.qualifiedVia, 'sealed');
  const last = await check({ addendum: text, version: '158.0.1.1' });
  assert.equal(last.ok, true, last.reasons.join(' | '));
  assert.deepEqual(last.qualifiedMajors, [156, 157, 158]);
  const beyond = await check({ addendum: text, version: '159.0.1.1' });
  assert.equal(beyond.ok, false);
  assert.deepEqual(beyond.reasonCodes, ['MAJOR_NOT_QUALIFIED']);
  assert.deepEqual(beyond.qualifiedMajors, [156, 157, 158]);
});

test('the anchor is the SHA-256 of the sealed file with CRLF turned into LF, so a CRLF and an LF checkout agree', async () => {
  const { text } = chain(SEALED_LF, [157]);
  for (const sealed of [SEALED_LF, SEALED_CRLF]) {
    const report = await check({ addendum: text, sealed });
    assert.equal(report.ok, true, report.reasons.join(' | '));
  }
  const edited = await check({ addendum: text, sealed: SEALED_LF.replace('sealed fixture', 'edited fixture') });
  assert.equal(edited.ok, false);
  assert.deepEqual(edited.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID']);
  assert.match(edited.reasons[0], /line 1: previous does not match qualified\.json/);
});

test('the longest accepted chain is 200 lines; one more is refused', async () => {
  const majors = Array.from({ length: 200 }, (_, i) => 157 + i);
  const full = await check({ addendum: chain(SEALED_CRLF, majors).text, version: '356.0.1.1' });
  assert.equal(full.ok, true, full.reasons.join(' | '));
  assert.equal(full.qualifiedMajors.length, 201);
  const over = await check({ addendum: chain(SEALED_CRLF, [...majors, 357]).text, version: '356.0.1.1' });
  assert.equal(over.ok, false);
  assert.match(over.reasons[0], /more than 200 lines/);
});

test('a broken addendum fails the sealed major too, and a broken sealed list stays a sealed-list problem', async () => {
  const broken = await check({ addendum: 'not json\n', version: '156.0.4314.58' });
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.reasonCodes, ['QUALIFIED_ADDENDUM_INVALID']);
  assert.deepEqual(broken.qualifiedMajors, []);
  assert.equal(broken.reasons[0].startsWith('QUALIFIED_ADDENDUM_INVALID: qualified.addendum.jsonl cannot be used: '), true, broken.reasons[0]);
  const sealed = await check({ addendum: chain(SEALED_CRLF, [157]).text, sealed: '{ "qualifiedMajors": "*" }' });
  assert.deepEqual(sealed.reasonCodes, ['QUALIFIED_MAJORS_INVALID']);
});

test('a requalification never launches anything while the addendum is broken', { timeout: 120000 }, async () => {
  const dir = scratchDir();
  try {
    fs.writeFileSync(path.join(dir, 'qualified.json'), SEALED_CRLF);
    fs.writeFileSync(path.join(dir, 'qualified.addendum.jsonl'), 'garbage\n');
    const calls = [];
    const slot = { acquire: async () => { calls.push('acquire'); return '1'; }, release: async () => { calls.push('release'); } };
    const report = await requalifyEdge({
      qualifyOptions: { qualifiedPath: path.join(dir, 'qualified.json'), adapters: listAdapters() }, slot, suites: ['pass-suite.cjs'], cwd: path.join(__dirname, 'fixtures'),
    });
    assert.equal(report.ok, false);
    assert.equal(report.requalification.ran, false);
    assert.match(report.requalification.skipped, /QUALIFIED_ADDENDUM_INVALID/);
    assert.deepEqual(calls, []);
  } finally {
    removeDir(dir);
  }
});
