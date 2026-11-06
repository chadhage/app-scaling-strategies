'use strict';

// Pre-publication self-review of the second fix (RUN\orders\_PREPUB-SELF-REVIEW.md), the lines that tests can prove:
// 1 TWO INSTANCES (two appends at once, a neighbour untouched), 5 NO SHARED MUTABLE RETURNS (a walker scrambles every returned
// object and the next call must not notice), 7 TOTAL ON HOSTILE INPUT (a seeded fuzz of the report, the bytes of the addendum
// and the report file: a typed answer, never a throw), 8 BUDGETS (the number of sequential bounded waits is counted, not timed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const addendum = require('../addendum.cjs');
const adapters = require('../adapters.cjs');
const { qualifyEdge } = require('../qualify.cjs');
const { validateQualifiedMajors } = require('../version.cjs');
const { SHA, EDGE, fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, anchorOf, SEALED_CRLF } = require('./chain.cjs');

const suite = (file, version) => ({
  file, tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0, testsPassed: true, passed: true, timedOut: false, browserVersionsSeen: [version],
});
const reportFor = (major) => {
  const version = `${major}.0.4341.42`;
  return {
    schemaVersion: 1, ok: false, reasonCodes: ['MAJOR_NOT_QUALIFIED'], path: EDGE, version, major, signature: { status: 'Valid', publisher: 'Microsoft Corporation' }, sha256: SHA,
    requalification: {
      ran: true, passed: true, candidateMajor: major, suites: [suite('isolated.test.cjs', version), suite('loopback.test.cjs', version)],
      edgeAfter: { path: EDGE, version, sha256: SHA, ok: false }, edgeChangedDuringRun: false,
    },
  };
};
const verifyFor = (major) => async () => {
  await new Promise((resolve) => setImmediate(resolve));
  return { ok: true, version: `${major}.0.4341.42`, major, sha256: SHA, signature: { status: 'Valid', publisher: 'Microsoft Corporation' } };
};
const NOW = () => new Date('2026-11-07T09:00:00.000Z');

function workspace(t, majors = []) {
  const dir = scratchDir();
  t.after(() => removeDir(dir));
  const files = { qualifiedFile: path.join(dir, 'qualified.json'), addendumFile: path.join(dir, 'qualified.addendum.jsonl') };
  fs.writeFileSync(files.qualifiedFile, SEALED_CRLF);
  for (const major of majors) fs.writeFileSync(path.join(dir, `report-${major}.json`), JSON.stringify(reportFor(major)));
  return { ...files, dir, report: (major) => path.join(dir, `report-${major}.json`) };
}

test('1 TWO INSTANCES: two appends running at once keep both lines in one valid chain, release the lock and leave a neighbour untouched', async (t) => {
  const space = workspace(t, [157, 158]);
  const neighbour = { lock: path.join(space.dir, 'other.addendum.jsonl.lock'), file: path.join(space.dir, 'other.addendum.jsonl') };
  fs.writeFileSync(neighbour.lock, 'neighbour');
  fs.writeFileSync(neighbour.file, 'neighbour data\n');
  const run = (major) => addendum.appendFromReport({ reportPath: space.report(major), qualifiedFile: space.qualifiedFile, addendumFile: space.addendumFile, verify: verifyFor(major), now: NOW });
  const [first, second] = await Promise.all([run(157), run(158)]);
  assert.deepEqual([first.ok, second.ok], [true, true], `${first.error} | ${second.error}`);
  const verified = addendum.verifyFiles({ qualifiedFile: space.qualifiedFile, addendumFile: space.addendumFile });
  assert.deepEqual([verified.ok, verified.majors], [true, [156, 157, 158]]);
  assert.equal(fs.existsSync(`${space.addendumFile}.lock`), false, 'the lock is released');
  assert.deepEqual([fs.readFileSync(neighbour.lock, 'utf8'), fs.readFileSync(neighbour.file, 'utf8')], ['neighbour', 'neighbour data\n']);
  const again = await Promise.all([run(157), run(158)]);
  assert.deepEqual(again.map((answer) => answer.error), ['major 157 is already listed', 'major 158 is already listed']);
});

// Mutates every reachable object in place (strict mode: a frozen value throws, which is an acceptable answer too).
function scramble(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  try {
    for (const key of Object.keys(value)) {
      if (value[key] !== null && typeof value[key] === 'object') scramble(value[key], seen);
      else value[key] = 'scrambled';
    }
    if (Array.isArray(value)) value.push('scrambled');
    else value.scrambled = true;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
}

test('5 NO SHARED MUTABLE RETURNS: scrambling every object a public function returned does not change what the next call returns', async (t) => {
  const space = workspace(t);
  fs.writeFileSync(space.addendumFile, chain(SEALED_CRLF, [157, 158]).text);
  const anchor = anchorOf(SEALED_CRLF);
  const sealedMajors = [156];
  const bytes = fs.readFileSync(space.addendumFile);
  const data = { qualifiedMajors: [156, 157] };
  const calls = {
    verifyFiles: () => addendum.verifyFiles({ qualifiedFile: space.qualifiedFile, addendumFile: space.addendumFile }),
    parseAddendum: () => addendum.parseAddendum(bytes, { anchor, sealedMajors }),
    readAddendum: () => addendum.readAddendum(space.addendumFile, { anchor, sealedMajors }),
    readQualified: () => adapters.readQualified(space.qualifiedFile),
    validateQualifiedMajors: () => validateQualifiedMajors(data),
    checkReport: () => addendum.checkReport(reportFor(157), { sealedMajors, knownMajors: sealedMajors }),
  };
  for (const [name, call] of Object.entries(calls)) {
    const first = JSON.stringify(call());
    scramble(call());
    assert.equal(JSON.stringify(call()), first, `${name} returns shared state`);
  }
  assert.deepEqual([sealedMajors, data.qualifiedMajors, [...bytes]], [[156], [156, 157], [...fs.readFileSync(space.addendumFile)]], 'an argument was kept and changed');
  const reports = await Promise.all([0, 1].map(() => qualifyEdge({ qualifiedPath: space.qualifiedFile, adapters: (({ readQualified, ...rest }) => rest)(fixtureAdapters({ fileVersion: () => '157.0.4341.42' })) })));
  scramble(reports[0]);
  assert.deepEqual(reports[1].qualifiedMajors, [156, 157, 158]);
  assert.deepEqual(reports[1].reasonCodes, []);
});

const rng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};
const HOSTILE = [() => undefined, () => null, () => NaN, () => Infinity, () => -1, () => 0, () => 1.5, () => '', () => 'x', () => '157', () => [], () => [null], () => ({}),
  () => ({ a: 1 }), () => true, () => false, () => 'a'.repeat(100000), () => 10 ** 21, () => ['isolated.test.cjs'], () => Object.create(null)];

function paths(value, prefix = [], found = []) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      found.push([...prefix, key]);
      paths(value[key], [...prefix, key], found);
    }
  }
  return found;
}

function hostileCopy(base, random) {
  const copy = JSON.parse(JSON.stringify(base));
  for (let round = 1 + Math.floor(random() * 3); round > 0; round -= 1) {
    const where = paths(copy);
    const target = where[Math.floor(random() * where.length)];
    const holder = target.slice(0, -1).reduce((node, key) => node[key], copy);
    const key = target[target.length - 1];
    if (random() < 0.25) delete holder[key];
    else holder[key] = HOSTILE[Math.floor(random() * HOSTILE.length)]();
  }
  return copy;
}

test('7 TOTAL ON HOSTILE INPUT: a seeded fuzz of the report, of the bytes of the addendum and of the report file never throws and always answers typed', async (t) => {
  const random = rng(20261107);
  // The report reaches checkReport() as parsed JSON (a file), so the direct fuzz uses values that JSON can carry; the file fuzz below
  // goes through the real boundary. An in-memory object with a null prototype or a throwing getter is outside that domain (see README).
  const asJson = (value) => JSON.parse(JSON.stringify(value));
  for (let i = 0; i < 2500; i += 1) {
    const answer = addendum.checkReport(asJson(hostileCopy(reportFor(157), random)), { sealedMajors: [156], knownMajors: [156] });
    assert.equal(typeof answer.ok, 'boolean', `report fuzz ${i}`);
    assert.ok(answer.ok || typeof answer.error === 'string', `report fuzz ${i}`);
  }
  const valid = Buffer.from(chain(SEALED_CRLF, [157, 158]).text);
  for (let i = 0; i < 2500; i += 1) {
    const copy = Buffer.from(valid);
    for (let round = 1 + Math.floor(random() * 3); round > 0; round -= 1) copy[Math.floor(random() * copy.length)] = Math.floor(random() * 256);
    const cut = random() < 0.2 ? copy.subarray(0, Math.floor(random() * copy.length)) : copy;
    const answer = addendum.parseAddendum(cut, { anchor: anchorOf(SEALED_CRLF), sealedMajors: [156] });
    assert.equal(typeof answer.ok, 'boolean', `byte fuzz ${i}`);
    assert.ok(answer.ok || typeof answer.error === 'string', `byte fuzz ${i}`);
  }
  const space = workspace(t);
  const reportPath = path.join(space.dir, 'fuzz-report.json');
  for (let i = 0; i < 100; i += 1) {
    fs.writeFileSync(reportPath, JSON.stringify(hostileCopy(reportFor(157), random)));
    const answer = await addendum.appendFromReport({ reportPath, qualifiedFile: space.qualifiedFile, addendumFile: space.addendumFile, verify: verifyFor(157), now: NOW, dryRun: true });
    assert.equal(typeof answer.ok, 'boolean', `file fuzz ${i}`);
    assert.ok(answer.ok || typeof answer.error === 'string', `file fuzz ${i}`);
  }
  assert.equal(fs.existsSync(space.addendumFile), false, 'a dry run writes nothing');
});

test('8 BUDGETS: the sequential bounded waits are counted, not timed: clock, list, candidates, one stat per candidate, the three-way read, the second digest, the last look', async () => {
  const calls = [];
  const spy = (name, answer) => (...args) => {
    calls.push(name);
    return answer(...args);
  };
  const candidates = ['C:\\a\\msedge.exe', 'C:\\b\\msedge.exe', 'C:\\c\\msedge.exe', 'C:\\d\\msedge.exe', 'C:\\e\\msedge.exe'];
  const base = fixtureAdapters();
  const report = await qualifyEdge({
    adapters: {
      now: spy('now', base.now), readQualified: spy('readQualified', base.readQualified), candidates: spy('candidates', () => candidates),
      statFile: spy('statFile', base.statFile), sha256: spy('sha256', base.sha256), signature: spy('signature', base.signature), fileVersion: spy('fileVersion', base.fileVersion),
    },
  });
  assert.equal(report.ok, true, report.reasons.join(' | '));
  assert.deepEqual(calls, ['now', 'readQualified', 'candidates', ...candidates.map(() => 'statFile'), 'sha256', 'signature', 'fileVersion', 'sha256', 'statFile']);
  // 1 clock + 1 list + 1 candidates + 5 stats + 1 (digest, signature and version together) + 1 second digest + 1 last look = 11 waits
  assert.equal(calls.length - 2, 11);
});
