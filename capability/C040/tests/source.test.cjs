'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const source = require('..\\source.cjs');
const T = require('..\\tables.js');
const f = require('.\\fixtures.cjs');
const { buildSets, render, target } = require('.\\build-saved.cjs');

const hex = /^[0-9a-f]{64}$/;
const contractPath = 'capability\\C020\\contract.js';
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

test('imports.json pins every read-only dependency by raw bytes, LF bytes and accepted Git blob, and the one own bundle', () => {
  const { pins } = source;
  assert.equal(pins.schema, 'C040-source-pins/1');
  assert.deepEqual(Object.keys(pins.accepted).sort(), ['C020', 'C023', 'C029', 'C030', 'C031', 'C033', 'C034']);
  for (const [card, accepted] of Object.entries(pins.accepted)) {
    assert.match(accepted.commit, /^[0-9a-f]{40}$/);
    assert.equal(accepted.tag, `kanban/${card}/${accepted.commit.slice(0, 12)}`);
  }
  assert.equal(pins.dependencies.length, 19);
  for (const entry of pins.dependencies) {
    assert.ok(pins.accepted[entry.card], entry.path);
    assert.ok(entry.path.startsWith(`capability\\${entry.card}\\`), entry.path);
    for (const key of ['rawSha256', 'crlfToLfSha256', 'acceptedGitSha256']) assert.match(entry[key], hex, `${entry.path} ${key}`);
    assert.ok([entry.rawSha256, entry.crlfToLfSha256].includes(entry.acceptedGitSha256), `${entry.path}: the working bytes agree with the accepted blob`);
  }
  for (const card of ['C029', 'C030', 'C031']) assert.ok(pins.dependencies.some((entry) => entry.card === card && /(?:evaluator|detector)\.js$/.test(entry.path)), card);
  assert.deepEqual(pins.own.map((entry) => entry.path), ['capability\\C040\\saved.js']);
  assert.ok(Object.isFrozen(pins) && Object.isFrozen(pins.dependencies[0]));
  assert.ok(pins.dependencies.every((entry) => !entry.path.includes('publish')));
});

test('every pinned dependency reads back byte-identical to its raw or LF pin', () => {
  for (const entry of source.pins.dependencies) {
    const bytes = source.readPinned(entry.path);
    assert.ok([entry.rawSha256, entry.crlfToLfSha256].includes(source.hash(bytes)), entry.path);
    assert.equal(source.hash(source.normalize(bytes)), entry.crlfToLfSha256, entry.path);
  }
});

test('the accepted Git blobs of the exact accepted commits equal the pinned bytes', () => {
  const result = source.checkImports();
  assert.equal(result.length, source.pins.dependencies.length);
  result.forEach((row, index) => {
    const pin = source.pins.dependencies[index];
    assert.equal(row.path, pin.path);
    assert.equal(row.acceptedGitSha256, pin.acceptedGitSha256);
    assert.equal(row.crlfToLfSha256, pin.crlfToLfSha256);
    assert.equal(typeof row.rawEqualsGit, 'boolean');
  });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => source.checkImports(1), { code: 'NO_SOURCE_OVERRIDES' });
});

test('a pin read refuses an unknown path, a non-file, an oversize file and altered bytes', (t) => {
  assert.throws(() => source.readPinned('capability\\C034\\README.md'), { code: 'CLOSED_SOURCE_PIN' });
  assert.throws(() => source.readPinned('..\\..\\etc\\passwd'), { code: 'CLOSED_SOURCE_PIN' });
  t.mock.method(fs, 'lstatSync', () => ({ isFile: () => false, size: 1 }), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_FILE' });
  t.mock.method(fs, 'lstatSync', () => ({ isFile: () => true, size: 1048577 }), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_FILE' });
  t.mock.method(fs, 'readFileSync', () => Buffer.from('tampered'), { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_PIN_MISMATCH' });
});

test('a pin read accepts the LF form of a CRLF working file but not a half-converted one', (t) => {
  const real = source.readPinned(contractPath);
  const lf = source.normalize(real);
  t.mock.method(fs, 'readFileSync', () => lf, { times: 1 });
  assert.equal(source.hash(source.readPinned(contractPath)), source.pins.dependencies.find((entry) => entry.path === contractPath).crlfToLfSha256);
  const mixed = Buffer.from(lf.toString('utf8').replace('\n', '\r\n'));
  t.mock.method(fs, 'readFileSync', () => mixed, { times: 1 });
  assert.throws(() => source.readPinned(contractPath), { code: 'SOURCE_PIN_MISMATCH' });
});

test('the accepted-blob check fails closed on a malformed, truncated, altered or over-long git reply', (t) => {
  const reply = (output) => t.mock.method(childProcess, 'execFileSync', () => output, { times: 1 });
  reply(Buffer.from('not a header\n'));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
  reply(Buffer.from('no newline at all'));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
  reply(Buffer.from(`${'a'.repeat(40)} blob 3\nxyz\n`));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_PIN' });
  reply(Buffer.from(`${'a'.repeat(40)} blob 10\nxyz\n`));
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_PIN' });
  const original = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (...args) => Buffer.concat([original(...args), Buffer.from('x')]), { times: 1 });
  assert.throws(() => source.checkImports(), { code: 'ACCEPTED_GIT_BLOB' });
});

test('the own saved bundle is pinned, the catalog is only built from verified bytes and the producers load only after every pin verified', (t) => {
  assert.equal(source.checkOwnBundle(), true);
  assert.throws(() => source.checkOwnBundle(1), { code: 'NO_SOURCE_OVERRIDES' });
  assert.equal(source.catalog().ids.length, 8);
  assert.throws(() => source.catalog(1), { code: 'NO_SOURCE_OVERRIDES' });
  assert.throws(() => source.producers(1), { code: 'NO_SOURCE_OVERRIDES' });
  const producers = source.producers();
  assert.deepEqual(Object.keys(producers), ['cohort', 'cohortEvaluator', 'effect', 'latency', 'ledger']);
  assert.ok(Object.isFrozen(producers));
  t.mock.method(fs, 'readFileSync', () => Buffer.from('changed'), { times: 1 });
  assert.throws(() => source.catalog(), { code: 'SOURCE_PIN_MISMATCH' });
  t.mock.method(fs, 'readFileSync', () => Buffer.from('changed'), { times: 1 });
  assert.throws(() => source.producers(), { code: 'SOURCE_PIN_MISMATCH' });
});

test('replaying the generator over the pinned producers reproduces saved.js byte for byte', async () => {
  const sets = await buildSets(source.producers());
  const bytes = Buffer.from(render(sets), 'utf8');
  assert.ok(bytes.equals(fs.readFileSync(target)), 'saved.js must be exactly what the generator makes from the accepted producers');
  assert.equal(source.hash(bytes), source.pins.own[0].rawSha256);
  assert.equal(sets.length, 8);
  assert.ok(!bytes.includes(13), 'LF only');
});

async function fresh(producers, origin) {
  if (origin.kind === 'producer-saved-output') {
    if (origin.producer === 'C031') return producers.cohort.evaluateSaved(origin.id);
    return origin.producer === 'C030' ? producers.effect.inspectSource(origin.id) : producers.latency.evaluateSaved(origin.id);
  }
  if (origin.kind === 'producer-control-output') return producers.latency.evaluateControl(origin.id);
  return origin.producer === 'C031' ? producers.cohortEvaluator.evaluateFleet(f.cohortFleet()) : producers.effect.inspectFiction(f.effectFiction(producers.ledger));
}

test('every saved producer output equals the producers own fresh output and the table numbers equal the producers own numbers', async () => {
  const producers = source.producers();
  const catalog = source.catalog();
  const compared = [];
  for (const id of catalog.ids) {
    const described = catalog.describe(id);
    const tables = catalog.tables(id);
    for (const tableId of T.tableIds) {
      const origin = described.origins[tableId];
      if (!['producer-saved-output', 'producer-control-output', 'producer-on-fictional-input'].includes(origin.kind)) continue;
      const report = await fresh(producers, origin);
      assert.equal(report.valid, true, `${id} ${tableId}`);
      const saved = require('..\\saved.js').sets.find((set) => set.id === id).reports[tableId].output;
      assert.deepEqual(roundTrip(f.slim[tableId](report)), roundTrip(saved), `${id} ${tableId}: saved output equals the producer's output`);
      const view = T.view(tables[tableId]);
      const fromFull = T.view(T.fromReport(tableId, report));
      assert.deepEqual(fromFull.statusCounts, view.statusCounts, `${id} ${tableId}: the slim saved output builds the same table as the full report`);
      assert.deepEqual(fromFull.rows.map((row) => [row.id, row.status]), view.rows.map((row) => [row.id, row.status]));
      assert.equal(view.state, 'COMPLETE', `${id} ${tableId}`);
      assert.equal(view.total, tables[tableId].producerTotal);
      if (tableId === 'cohort') {
        assert.equal(view.total, report.counts.clients);
        assert.equal(view.statusCounts.ACTUAL_TRANSITION, report.counts.actualTransition);
        assert.equal(view.statusCounts.ACTUAL_TRANSITION, report.successRate.numerator);
        assert.equal(view.statusCounts.FAILED, report.counts.failed);
        assert.equal(view.statusCounts.UNKNOWN, report.counts.unknown);
        assert.equal(view.statusCounts.UNCHANGED, report.counts.unchanged);
        assert.equal(view.statusCounts.NOT_TRANSITIONED_YET, report.counts.notTransitionedYet);
        assert.deepEqual([tables.cohort.producer.numerator, tables.cohort.producer.denominator, tables.cohort.producer.percent],
          [report.successRate.numerator, report.successRate.denominator, report.successRate.percent]);
        assert.equal(tables.cohort.rows.filter((row) => row.values.eligible).length, report.counts.eligible);
      } else if (tableId === 'effect') {
        assert.equal(tables.effect.producer.originals, report.counts.originals);
        assert.deepEqual(tables.effect.producer.decision, report.decision);
        assert.deepEqual(new Set(tables.effect.rows.map((row) => row.values.original)).size, report.counts.originals);
      } else {
        assert.equal(view.total, report.counts.originals);
        assert.equal(view.statusCounts.WITHIN, report.counts.pass);
        assert.equal(view.statusCounts.EXCEEDED + view.statusCounts.FAILED, report.counts.fail);
        assert.equal(view.statusCounts.UNKNOWN, report.counts.unknown);
      }
      compared.push(`${id}/${tableId}`);
    }
  }
  assert.equal(compared.length, 11, 'three sets are producer-backed in all three tables and the 45-row set in two; the fictional-shaped and mutated outputs are covered by the model tests');
});

test('every output of the three accepted producers builds a COMPLETE table whose numbers agree, never an empty or inconsistent one', async () => {
  const producers = source.producers();
  const cohortIds = producers.cohort.ids;
  assert.equal(cohortIds.length, 8);
  for (const id of cohortIds) assert.equal(T.fromCohort(producers.cohort.evaluateSaved(id)).state, 'COMPLETE', id);
  assert.equal(producers.effect.sourceIds.length, 21);
  for (const id of producers.effect.sourceIds) {
    const table = T.fromEffects(producers.effect.inspectSource(id));
    assert.equal(table.state, 'COMPLETE', id);
    assert.ok(table.rowCount > 0, id);
  }
  for (const id of producers.latency.savedIds) assert.equal(T.fromLatency(producers.latency.evaluateSaved(id)).state, 'COMPLETE', id);
  for (const id of producers.latency.controlIds) assert.equal(T.fromLatency(await producers.latency.evaluateControl(id)).state, 'COMPLETE', id);
  for (const id of producers.latency.modelIds) assert.equal(T.fromLatency(producers.latency.evaluateModel(id)).state, 'COMPLETE', id);
});

test('the historical saved sets keep the exact producer numbers visible: 3 of 7 and 1 of 2 clients, seven and two originals without effect rows, 2 + 2 + 3 and 1 + 0 + 1 journeys', () => {
  const closed = source.catalog().tables('closed-history');
  assert.deepEqual([closed.cohort.producer.numerator, closed.cohort.producer.denominator, closed.cohort.producer.percent], [3, 7, '42.86%']);
  assert.deepEqual(T.view(closed.cohort).statusCounts, { ACTUAL_TRANSITION: 3, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 1, UNKNOWN: 3, NOT_SAVED: 0 });
  assert.deepEqual(T.view(closed.effect).statusCounts, { ONE_INTENDED_EFFECT: 0, DUPLICATE: 0, MISSING: 0, MISSING_OBSERVATION: 0, UNKNOWN: 7, NOT_SAVED: 0 });
  assert.deepEqual(T.view(closed.latency).statusCounts, { WITHIN: 2, EXCEEDED: 1, FAILED: 1, UNKNOWN: 3, NOT_SAVED: 0 });
  const [third] = closed.latency.rows.filter((row) => row.status === 'EXCEEDED');
  assert.deepEqual([third.id, third.values.budget, third.values.observed], ['synthetic-C033-attempt-3', 1000, 1118.9000000953674]);
  const held = source.catalog().tables('held-snapshot');
  assert.deepEqual([held.cohort.producer.numerator, held.cohort.producer.denominator], [1, 2]);
  assert.deepEqual(T.view(held.cohort).statusCounts, { ACTUAL_TRANSITION: 1, UNCHANGED: 0, NOT_TRANSITIONED_YET: 1, FAILED: 0, UNKNOWN: 0, NOT_SAVED: 0 });
  assert.deepEqual(T.view(held.latency).statusCounts, { WITHIN: 1, EXCEEDED: 0, FAILED: 0, UNKNOWN: 1, NOT_SAVED: 0 });
});

test('the retry set keeps the failed first original in every table although the retry succeeded', () => {
  const retry = source.catalog().tables('fiction-failed-then-retry');
  assert.deepEqual(retry.latency.rows.map((row) => [row.id, row.status, row.values.retry]), [['synthetic-C033-attempt-1', 'EXCEEDED', true], ['synthetic-C033-attempt-2', 'WITHIN', true]]);
  assert.deepEqual(retry.effect.rows.map((row) => `${row.values.original}:${row.status}`),
    ['original-001:ONE_INTENDED_EFFECT', 'original-001:ONE_INTENDED_EFFECT', 'original-001:MISSING', 'original-002:ONE_INTENDED_EFFECT', 'original-002:ONE_INTENDED_EFFECT', 'original-002:ONE_INTENDED_EFFECT']);
  assert.equal(retry.cohort.rows.filter((row) => row.attention).length, 2);
  const missing = retry.effect.rows[2];
  assert.equal(missing.text.effectKey, 'job-c030-fiction|profile-effects/1|synthetic-002|completion-receipt');
  assert.deepEqual([missing.values.lower, missing.values.upper, missing.values.deliveries], [0, 0, 1]);
});

test('the saved fictional negatives behave as the card says in all three tables', () => {
  const sets = source.catalog();
  const unrecognised = sets.tables('negative-unrecognised-status');
  assert.ok(unrecognised.cohort.rows.some((row) => row.producerStatus === 'PARTIALLY_MIGRATED' && row.status === 'UNKNOWN'));
  assert.ok(unrecognised.effect.rows.some((row) => row.producerStatus === 'MOSTLY_ONE_APPLICATION' && row.status === 'UNKNOWN'));
  assert.ok(unrecognised.latency.rows.some((row) => row.producerStatus === 'HEALTHY_ISH' && row.status === 'UNKNOWN'));
  for (const tableId of T.tableIds) {
    const empty = sets.tables('negative-empty')[tableId];
    assert.match(T.view(empty).summary, /no attempts recorded/);
    const truncated = sets.tables('negative-truncated')[tableId];
    assert.equal(truncated.state, 'INCOMPLETE');
    assert.ok(T.view(truncated).statusCounts.NOT_SAVED > 0);
    const duplicated = sets.tables('negative-duplicated-row')[tableId];
    assert.ok(duplicated.extraRows > 0);
    assert.ok(duplicated.rows.some((row) => row.flags.includes('DUPLICATE_ROW')));
  }
  assert.deepEqual(['cohort', 'effect', 'latency'].map((tableId) => sets.tables('negative-truncated')[tableId].total), [10, 6, 2]);
  assert.deepEqual(['cohort', 'effect', 'latency'].map((tableId) => sets.tables('negative-duplicated-row')[tableId].rowCount), [12, 7, 3]);
});

test('the generator refuses nothing silently: saved.js has no clock, no network word and no absolute path', () => {
  const text = fs.readFileSync(target, 'utf8');
  assert.doesNotMatch(text, /Date\.now|new Date|Math\.random|https?:\/\/|[A-Za-z]:\\\\/);
  assert.equal(path.basename(target), 'saved.js');
});
