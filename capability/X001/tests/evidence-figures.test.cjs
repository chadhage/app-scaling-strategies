'use strict';

// F8: the summary figures are recomputed from the stored transcripts and the DOM snapshot. Every figure has a tamper test on an in-memory copy that
// must fail BY NAME, and the figures of the captures that exist are recomputed. The README states its figures in one machine-readable block that is
// compared with the recomputed ones. A consistent rewrite of a verifier together with its manifests is not detectable here (L-0096): only the
// published commit and tag are.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const figures = require('.\\evidence-figures.cjs');
const { manifests, historical, sha, root } = require('.\\evidence-check.cjs');

const gz = (text) => zlib.gzipSync(Buffer.from(text));
function fixture(text, extra = {}) {
  const dir = path.join(root, 'evidence', 'fix', 'fixture');
  const file = path.join(dir, 'fixture.json');
  const manifest = { schemaVersion: 1, summary: { tests: 3, pass: 3, fail: 0, skipped: 0, todo: 0, cancelled: 0 }, transcripts: { stdout: { path: 'raw\\fixture.stdout.raw.gz' } }, ...extra };
  const files = new Map([[file, Buffer.from(JSON.stringify(manifest))], [path.join(dir, 'raw', 'fixture.stdout.raw.gz'), gz(text)]]);
  return { file, dir, reader: (target) => { if (!files.has(target)) throw new Error(`unexpected read ${target}`); return files.get(target); }, files };
}
const TAP = '# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('suite figures: the counts of the transcript are the counts of the summary, and a summary of 71 tests over a transcript of 70 is reported by name', () => {
  const ok = fixture(TAP);
  assert.deepEqual(figures.suite(ok.file, ok.reader).problems, []);
  assert.deepEqual(figures.suite(ok.file, ok.reader).figures, { tests: 3, pass: 3, fail: 0, skipped: 0, todo: 0, cancelled: 0 });
  const tampered = fixture(TAP, { summary: { tests: 3, pass: 4, fail: 0, skipped: 0, todo: 0, cancelled: 0 } });
  assert.match(figures.suite(tampered.file, tampered.reader).problems.join('\n'), /summary\.pass is 4 but the transcript says 3/);
  const red = fixture('# tests 3\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\nnot ok 1 - x\n', { summary: { tests: 3, pass: 2, fail: 1, skipped: 0, todo: 0, cancelled: 0 } });
  assert.match(figures.suite(red.file, red.reader).problems.join('\n'), /not all green/);
  const hidden = fixture('# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\nnot ok 1 - hidden\n');
  assert.match(figures.suite(hidden.file, hidden.reader).problems.join('\n'), /the transcript has 1 failing tests but says 0/);
});

const coverageText = (lines = 100, branches = 99.5) => `timeline.js  lines 100.00  branches 99.50  functions 100.00  loaded true  node exit 0  PASS\n${JSON.stringify({
  cardId: 'X001', threshold: 85, coverage: [{ file: 'timeline.js', row: `#   timeline.js    |  ${lines.toFixed(2)} |    ${branches.toFixed(2)} |  100.00 | 5-6`, loaded: true, lines, branches, functions: 100, nodeExit: 0, failedTests: 0, passed: true }], passed: true })}\n`;

test('coverage figures: every number of the gate is the number of its Node coverage row, and a changed figure or a figure below 85 is reported by name', () => {
  const ok = fixture(coverageText());
  assert.deepEqual(figures.coverage(ok.file, ok.reader).problems, []);
  assert.deepEqual(figures.coverage(ok.file, ok.reader).figures, { 'timeline.js': [100, 99.5, 100] });
  const changed = fixture(coverageText().replace('"branches":99.5', '"branches":99.9'));
  assert.match(figures.coverage(changed.file, changed.reader).problems.join('\n'), /timeline\.js: the figures differ from the Node coverage row/);
  const low = fixture(coverageText(80, 99.5).replace('lines 100.00', 'lines 80.00'));
  assert.match(figures.coverage(low.file, low.reader).problems.join('\n'), /below 85 or not passed/);
  const table = fixture(coverageText().replace('branches 99.50', 'branches 98.00'));
  assert.match(figures.coverage(table.file, table.reader).problems.join('\n'), /the printed table differs from the JSON report/);
});

const mutantReport = (changes = {}) => {
  const named = ['D1-reconnects', 'D2-resyncs', 'D6-epoch-changes', 'D7-connection', 'B12-gap-position', 'P12-verification'].map((name, index) => ({ id: `n${index}`, file: 'describe.js', op: `named-${name}`, outcome: 'killed', by: ['t'] }));
  const mutantList = [...named, { id: 'a', file: 'page.js', op: 'if-true', outcome: 'killed', by: ['t'] }, { id: 'b', file: 'page.js', op: 'if-false', outcome: 'equivalent', proof: 'p' }];
  return { schema: 'X001-mutants/2', files: ['describe.js', 'page.js', 'timeline.js'], pristine: { 'a.test.cjs': 'passed' }, mutants: mutantList, summary: { generated: 8, killed: 7, equivalent: 1, survived: [] }, ...changes };
};

test('mutation figures: the counts are recomputed from the list of mutants, a survivor or an unnamed kill or a missing proof or a missing reviewer mutant is reported by name', () => {
  const ok = fixture(JSON.stringify(mutantReport()));
  assert.deepEqual(figures.mutants(ok.file, ok.reader).problems, []);
  assert.deepEqual(figures.mutants(ok.file, ok.reader).figures.generated, 8);
  const inflated = fixture(JSON.stringify(mutantReport({ summary: { generated: 8, killed: 9, equivalent: 1, survived: [] } })));
  assert.match(figures.mutants(inflated.file, inflated.reader).problems.join('\n'), /the summary differs from the recomputed counts/);
  const report = mutantReport();
  report.mutants[6].outcome = 'SURVIVED';
  assert.match(figures.mutants(fixture(JSON.stringify(report)).file, fixture(JSON.stringify(report)).reader).problems.join('\n'), /a mutant survived or was invalid/);
  const unnamed = mutantReport();
  unnamed.mutants[6].by = [];
  const unnamedFixture = fixture(JSON.stringify(unnamed));
  assert.match(figures.mutants(unnamedFixture.file, unnamedFixture.reader).problems.join('\n'), /killed without a named failing test/);
  for (const change of [{ outcome: 'TIMEOUT', suite: 'timeout', by: ['timeout'] }, { outcome: 'killed', suite: 'timeout', by: ['timeout'] }]) {
    const timedOut = mutantReport();
    Object.assign(timedOut.mutants[6], change);
    const timedOutFixture = fixture(JSON.stringify(timedOut));
    assert.match(figures.mutants(timedOutFixture.file, timedOutFixture.reader).problems.join('\n'), /a mutant timed out: its outcome is undecided/);
  }
  const noProof = mutantReport();
  delete noProof.mutants[7].proof;
  const noProofFixture = fixture(JSON.stringify(noProof));
  assert.match(figures.mutants(noProofFixture.file, noProofFixture.reader).problems.join('\n'), /an equivalent mutant has no proof/);
  const missing = mutantReport();
  missing.mutants = missing.mutants.filter((item) => !item.op.includes('D7-connection'));
  const missingFixture = fixture(JSON.stringify(missing));
  assert.match(figures.mutants(missingFixture.file, missingFixture.reader).problems.join('\n'), /the reviewer mutant D7-connection is not killed/);
  const pageOnly = mutantReport({ files: ['page.js'] });
  pageOnly.mutants = pageOnly.mutants.filter((item) => !/D[0-9]|B12/.test(item.op));
  const pageOnlyFixture = fixture(JSON.stringify(pageOnly));
  assert.doesNotMatch(figures.mutants(pageOnlyFixture.file, pageOnlyFixture.reader).problems.join('\n'), /reviewer mutant/, 'a report of page.js needs P12 and none of the describe.js or timeline.js mutants');
  const noP12 = mutantReport({ files: ['page.js'] });
  noP12.mutants = noP12.mutants.filter((item) => !item.op.includes('P12'));
  const noP12Fixture = fixture(JSON.stringify(noP12));
  assert.match(figures.mutants(noP12Fixture.file, noP12Fixture.reader).problems.join('\n'), /the reviewer mutant P12-verification is not killed/);
  for (const files of [undefined, [], ['saved.js']]) {
    const unnamedScope = fixture(JSON.stringify(mutantReport({ files })));
    assert.match(figures.mutants(unnamedScope.file, unnamedScope.reader).problems.join('\n'), /the report does not name its mutated files/);
  }
  const unchecked = fixture(JSON.stringify(mutantReport({ pristine: undefined })));
  assert.match(figures.mutants(unchecked.file, unchecked.reader).problems.join('\n'), /did not check that the unmutated suites pass/);
  const brokenBaseline = fixture(JSON.stringify(mutantReport({ pristine: { 'a.test.cjs': 'FAILED ["x"]' } })));
  assert.match(figures.mutants(brokenBaseline.file, brokenBaseline.reader).problems.join('\n'), /a\.test\.cjs: the unmutated suite did not pass under the campaign runner/);
});

const baselineReport = (changes = {}) => ({ schema: 'X001-mutants/2', files: ['describe.js'], generated: 0, pristine: { 'a.test.cjs': 'passed', 'b.test.cjs': 'passed' }, mutants: [], ...changes });

test('baseline figures: every suite passed unmutated under the campaign runner and nothing was mutated; a failed suite, no suite or a mutant is reported by name', () => {
  const ok = fixture(JSON.stringify(baselineReport()));
  assert.deepEqual(figures.pristine(ok.file, ok.reader), { figures: { suites: 2 }, problems: [] });
  const failed = fixture(JSON.stringify(baselineReport({ pristine: { 'a.test.cjs': 'passed', 'b.test.cjs': 'FAILED ["x"]' } })));
  assert.match(figures.pristine(failed.file, failed.reader).problems.join('\n'), /b\.test\.cjs: the unmutated suite did not pass under the campaign runner/);
  const none = fixture(JSON.stringify(baselineReport({ pristine: {} })));
  assert.match(figures.pristine(none.file, none.reader).problems.join('\n'), /the baseline names no suite/);
  const mutated = fixture(JSON.stringify(baselineReport({ generated: 1, mutants: [{ id: 'x' }] })));
  assert.match(figures.pristine(mutated.file, mutated.reader).problems.join('\n'), /a baseline run mutates nothing/);
});

function browserFixture(change = (summary) => summary, html = null) {
  const rows = Array.from({ length: 44 }, (_, index) => `<li id="entry-${index + 1}">x</li>`).join('');
  const lines = ['connection', 'epoch', 'last', 'applied', 'duplicates', 'out-of-order', 'rejected', 'reconnects', 'resyncs', 'gaps', 'epoch-changes', 'marker', 'failure', 'completed', 'failed', 'unknown']
    .map((name) => `<dd id="st-${name}">1</dd>`).join('');
  const snapshot = Buffer.from(html || `<main><p>Position 17 of 44</p><ol>${rows}</ol><dl>${lines}</dl></main>`);
  const dir = path.join(root, 'evidence', 'fix', 'browser', 'browser-fixture');
  const summary = change({ checks: new Array(12).fill({ passed: true }), counts: { positionsChecked: 351, actions: 334 }, browserVersion: '156.0.4314.58', edge: { version: '156.0.4314.58' }, snapshotSha256: sha(snapshot) });
  const summaryBytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  const files = new Map([[path.join(dir, 'summary.json'), summaryBytes], [path.join(dir, 'dom-restart-gap-position-17.html'), snapshot]]);
  const printed = `evidence written to x summarySha256=${sha(Buffer.from(`${JSON.stringify(change({ checks: new Array(12).fill({ passed: true }), counts: { positionsChecked: 351, actions: 334 }, browserVersion: '156.0.4314.58', edge: { version: '156.0.4314.58' }, snapshotSha256: sha(snapshot) }), null, 2)}\n`))} snapshotSha256=${sha(snapshot)}\nPASS all 12 browser checks (351 positions, 334 key actions) on Edge 156.0.4314.58\n`;
  return { dir, printed, reader: (target) => files.get(target) };
}

test('browser figures: positionsChecked, actions, checks and edge.version are recomputed from the printed transcript, and every changed figure or a changed snapshot is reported by name', () => {
  const ok = browserFixture();
  assert.deepEqual(figures.browser(ok.dir, ok.printed, ok.reader).problems, []);
  const positions = browserFixture((summary) => ({ ...summary, counts: { positionsChecked: 352, actions: 334 } }));
  const positionsProblems = figures.browser(positions.dir, positions.printed.replace(/summarySha256=[0-9a-f]{64}/, `summarySha256=${'0'.repeat(64)}`), positions.reader).problems.join('\n');
  assert.match(positionsProblems, /positionsChecked differs from the transcript/);
  const version = browserFixture((summary) => ({ ...summary, edge: { version: '157.0.1.1' } }));
  assert.match(figures.browser(version.dir, version.printed, version.reader).problems.join('\n'), /edge\.version differs from the transcript/);
  const snapshot = browserFixture(undefined, '<main><p>Position 17 of 44</p></main>');
  assert.match(figures.browser(snapshot.dir, snapshot.printed, snapshot.reader).problems.join('\n'), /does not list the 44 entries|does not show the sixteen/);
  assert.match(figures.browser(ok.dir, 'nothing', ok.reader).problems.join('\n'), /no final PASS line/);
});

const browserCapture = (file) => {
  const dir = path.join(root, 'evidence', 'fix', 'browser');
  const directory = fs.readdirSync(dir).filter((entry) => entry.startsWith('browser-') && fs.existsSync(path.join(dir, entry, 'summary.json')));
  assert.equal(directory.length, 1, 'one browser observation directory');
  const transcript = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file), JSON.parse(fs.readFileSync(file, 'utf8')).transcripts.stdout.path))).toString('utf8');
  return figures.browser(path.join(dir, directory[0]), transcript);
};

test('the README states its figures in one machine-readable block, every figure equals the recomputed one, and no figure is stated without a capture', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const stated = figures.readmeFigures(readme);
  assert.ok(stated, 'README.md has a <!-- figures:begin --> block');
  assert.equal(figures.readmeFigures('no block'), null);
  const current = manifests().filter((file) => !historical(file));
  const recomputed = {};
  for (const file of current) {
    const name = path.basename(file, '.json');
    if (/^green-suite-1$/.test(name)) Object.assign(recomputed, { 'suite.tests': String(figures.suite(file).figures.tests) });
    if (/^fresh-tree-(lf|crlf)$/.test(name)) recomputed[`${name}.tests`] = String(figures.suite(file).figures.tests);
    if (/^coverage-1$/.test(name)) for (const [source, [lines, branches, functions]] of Object.entries(figures.coverage(file).figures)) recomputed[`coverage.${source}`] = `${lines} / ${branches} / ${functions}`;
    if (/^pristine-1$/.test(name)) recomputed['pristine.suites'] = String(figures.pristine(file).figures.suites);
    if (/^mutants-\d+$/.test(name)) {
      const { figures: counts } = figures.mutants(file);
      Object.assign(recomputed, { [`${name}.files`]: counts.files.join(','), [`${name}.generated`]: String(counts.generated), [`${name}.killed`]: String(counts.killed), [`${name}.equivalent`]: String(counts.equivalent) });
    }
    if (/^browser-run-1$/.test(name)) {
      const { figures: seen } = browserCapture(file);
      Object.assign(recomputed, { 'browser.checks': String(seen.checks), 'browser.positionsChecked': String(seen.positionsChecked), 'browser.actions': String(seen.actions), 'browser.edge': seen.edge });
    }
  }
  for (const [name, value] of Object.entries(recomputed)) assert.equal(stated[name], value, `README figure ${name}`);
  const figureName = /^(suite\.tests|fresh-tree-(lf|crlf)\.tests|coverage\..+|pristine\.suites|mutants-\d+\..+|browser\..+)$/;
  assert.deepEqual(Object.keys(stated).filter((name) => figureName.test(name) && !(name in recomputed)), [], 'a figure the README states has no capture to recompute it from');
  const tampered = readme.replace(/suite\.tests: (\d+)/, (_, n) => `suite.tests: ${Number(n) + 1}`);
  if (stated['suite.tests']) assert.notEqual(figures.readmeFigures(tampered)['suite.tests'], stated['suite.tests'], 'a changed README figure is visible to the comparison');
});

test('every capture of the fix that exists recomputes: suites, coverage, mutants and the browser observation', () => {
  const current = manifests().filter((file) => !historical(file));
  assert.ok(current.length >= 3, 'the three REDs of the fix are archived');
  for (const file of current) {
    const name = path.basename(file, '.json');
    if (/^green-suite/.test(name) || /^fresh-tree/.test(name) || /^red-replay/.test(name)) assert.deepEqual(figures.suite(file).problems, [], name);
    if (/^coverage/.test(name)) assert.deepEqual(figures.coverage(file).problems, [], name);
    if (/^mutants/.test(name)) assert.deepEqual(figures.mutants(file).problems, [], name);
    if (/^pristine/.test(name)) assert.deepEqual(figures.pristine(file).problems, [], name);
    if (/^browser-run/.test(name)) assert.deepEqual(browserCapture(file).problems, [], name);
  }
});
