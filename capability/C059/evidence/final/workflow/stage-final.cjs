'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const name = process.argv[2];
const namespace = path.join(root, 'capability', 'C059');
const freeze = JSON.parse(fs.readFileSync(path.join(namespace, 'evidence', 'final', 'source-freeze.json'), 'utf8'));
const allTests = fs.readdirSync(path.join(namespace, 'tests')).filter((file) => file.endsWith('.test.cjs')).sort();
const tests = (names) => names.map((file) => path.join('capability', 'C059', 'tests', file.endsWith('.cjs') ? file : `${file}.test.cjs`));
const runTests = (files, extra = []) => ['--test', '--test-concurrency=1', '--test-timeout=900000', ...extra, ...files];
const baseInputs = [...new Set([
  ...freeze.source.filter((row) => /\.(?:cjs|js|html|css|feature)$/.test(row.path) || row.path.endsWith('imports.json')).map((row) => row.path),
  ...freeze.imports.map((row) => row.path),
  'capability\\C059\\evidence\\final\\source-freeze.json',
])];
const metaOld = ['mutants-server.cjs', 'mutants-checker.cjs', 'mutants-page.cjs', 'identifier-inventory.cjs'].map((file) => `capability\\C059\\evidence\\red\\final-metadata-old\\tests\\${file}`);
const definitions = {
  'final-d1-red-01': {
    args: runTests(tests(['queued-cancel'])), expectedExitCode: 1,
    env: { C059_RED_SUBJECT: 'capability\\C059\\evidence\\red\\stubs-10' },
    extraInputs: ['capability\\C059\\evidence\\red\\stubs-10\\server.cjs'],
    purpose: 'Final frozen-source D1 FAMILY behavioral RED on exactly the published decide(socket)-deletion mutant; 142 named tests, 54 ERR_ASSERTION failures, no timeout classification.',
  },
  'final-metadata-red-01': {
    args: runTests(tests(['equivalence-declaration', 'identifier-inventory'])), expectedExitCode: 1,
    env: { C059_RED_SUBJECT: 'capability\\C059\\evidence\\red\\final-metadata-old' }, extraInputs: metaOld,
    purpose: 'Final unchanged tests on the preserved pre-correction D1/D2 declarations and D5 changed-only scanner; seven tests with six behavioral metadata assertions failing.',
  },
  'final-policy-red-01': {
    args: ['capability\\C059\\tests\\mutation-policy-red.cjs'], expectedExitCode: 1,
    extraInputs: ['capability\\C059\\evidence\\red\\mutation-policy-old\\mutate-gen.cjs'],
    purpose: 'Final unchanged policy tests fail by assertion on an actual rerun of the immutable old generator; four assertion failures, raw output retained. No crash or timeout is credited as a kill.',
  },
  'syntax-9': { args: ['capability\\C059\\tests\\syntax.cjs'], purpose: 'Final frozen-source JavaScript syntax check; no behavior or per-file timing claim.' },
  'coverage-10': { args: ['capability\\C059\\tests\\coverage.cjs'], env: { C059_COVERAGE_PARALLEL: '2' }, purpose: 'Final five enumerated first-party production files, one real coverage command per file, each loaded and each >=85 line/branch/function; printed rows and nested counters, not per-file TAP durations.' },
  'mutgen-10': {
    args: ['capability\\C059\\tests\\mutate-gen.cjs', '--scratch', 'mutation-work\\full', '--out', 'capability\\C059\\evidence\\raw\\mutgen-report-10.json', '--workers', '2'],
    env: { C059_MUT_PROGRESS: 'mutation-progress-final.txt' }, timeoutMs: 5400000,
    purpose: 'Final full 247-mutant causal campaign, N2 normal priority, documented 900000 ms cap; every file TAP/counter, named causal kill, real equivalence demonstration and pristine restoration retained.',
  },
  'loop-5': { args: ['capability\\C059\\tests\\flood-loop.cjs', '20', '4', '4'], purpose: 'Final 20 flood runs, four at a time under four owned CPU burners; actual PIDs and structural assertions, no absolute-duration pass criterion.' },
  'f24-2': { args: ['capability\\C059\\tests\\f24-measure.cjs', '256', '32', '50000', 'hold'], purpose: 'One current frozen-production F24 measurement: actual 256 MB child, 32 pending sockets, observed heap/RSS, cap, closure and legitimate GET. Measurement is not a wall-clock test.' },
  'private-green-01': {
    args: runTests(tests(allTests)), inputs: freeze.source.map((row) => row.path),
    purpose: 'Whole private frozen-source non-browser suite before current real Edge observation. Flat TAP contains total counters and total duration only; no per-file timing claim.',
  },
  'browser-14': { args: ['capability\\C059\\tests\\browser.cjs'], browser: true, purpose: 'After actual private GREEN, one current real Microsoft-signed and qualified Edge 157 run, 21 programmatic keyboard/ARIA checks; GET-only helper, no native browser POST or screen-reader claim.' },
  'browser-cleanup-6': { args: ['capability\\C059\\tests\\browser-cleanup.cjs'], browser: true, purpose: 'Current real Edge injected-assertion cleanup proof; the unchanged sealed isolated helper and owned session/listener close in finally.' },
  'green-8': {
    args: runTests(tests(allTests)), inputs: freeze.source.map((row) => row.path),
    purpose: 'Whole current final non-browser suite after actual Edge acceptance and cleanup. Flat TAP contains total test counters and total duration only, NOT per-file timings.',
  },
  'fresh-build-lf-2': { args: ['capability\\C059\\tests\\fresh-tree.cjs', 'fresh-work\\lf', 'lf', '--ref', freeze.foreignGitRef], inputs: freeze.source.map((row) => row.path), purpose: 'Actual fixed-reference git-archive LF foreign tree plus byte-identical frozen C059 and current sealed helper sources; source preparation, not suite success.' },
  'fresh-build-crlf-2': { args: ['capability\\C059\\tests\\fresh-tree.cjs', 'fresh-work\\crlf', 'crlf', '--ref', freeze.foreignGitRef], inputs: freeze.source.map((row) => row.path), purpose: 'Actual fixed-reference git-archive CRLF foreign tree plus byte-identical frozen C059 and sealed helper sources; source preparation, not suite success.' },
  'final-audit-01': { args: ['capability\\C059\\tests\\final-evidence.cjs', '--complete'], inputs: freeze.source.map((row) => row.path), browser: true, purpose: 'Complete independent-replay entry point for actual source, raw, metadata, causal mutations, all five coverage rows, F24, current Edge and both fresh forms. Private verification, not self-acceptance or publication.' },
};
const lfSuites = [
  'checker', 'checker-reach', 'checker-kill', 'checker-fp', 'journey', 'journey-freeze', 'page', 'flow', 'tamper',
  'page-bind', 'page-kill', 'bind-null', 'keyboard', 'property', 'pins', 'node-close', 'mutate-classify',
  'empty-widget-equivalence', 'equivalence-declaration', 'identifier-inventory', 'mutation-policy',
];
for (const mode of ['lf', 'crlf']) {
  const inputRoot = path.join('fresh-work', mode);
  const files = mode === 'lf' ? tests(lfSuites) : tests(allTests);
  definitions[`fresh-${mode}-2`] = {
    args: runTests(files.map((file) => path.join(inputRoot, file))),
    inputs: freeze.source.map((row) => row.path), inputRoot, producerTextForms: true,
    purpose: `Actual ${mode.toUpperCase()} fresh tree: ${mode === 'lf' ? 'all declared service-free suites only; inherited C041 raw lesson-asset limit is not waived' : 'the complete current non-browser suite'}, unchanged C059 sources and fixed-reference foreign files. Flat TAP totals, no per-file timing claim.`,
  };
}
definitions['fresh-lf-pins-2'] = {
  args: runTests([path.join('fresh-work', 'lf', ...tests(['integrity.test.cjs']))], ['--test-name-pattern=every import is pinned|a tampered pin is caught']),
  inputRoot: path.join('fresh-work', 'lf'), producerTextForms: true,
  purpose: 'Actual LF import-pin positive/tamper assertions by name; accepted raw/LF forms, no producer repin and no claim that LF C041 lesson assets start the service.',
};
const definition = definitions[name];
if (!definition) throw new Error(`unknown final phase: ${name}`);
if (definition.browser) {
  definition.env = { ...(definition.env ?? {}), C059_PHYSICAL_CWD: '1' };
  const green = JSON.parse(fs.readFileSync(path.join(namespace, 'evidence', 'raw', 'private-green-01.json'), 'utf8'));
  assert.equal(green.exitCode, 0, 'real browser is authorized only after actual private GREEN');
  assert.equal(green.summary.tests, green.summary.pass);
  assert.equal(green.summary.fail, 0);
}
const inputs = [...new Set([
  ...(definition.inputs ?? baseInputs),
  ...freeze.imports.map((row) => row.path),
  ...(definition.browser || definition.inputRoot ? freeze.browserInputs.map((row) => row.path) : []),
  'capability\\C059\\evidence\\final\\source-freeze.json',
  ...(definition.extraInputs ?? []),
])];
const spec = { name, ...definition, inputs, expectedExitCode: definition.expectedExitCode ?? 0, timeoutMs: definition.timeoutMs ?? 5400000 };
delete spec.extraInputs;
delete spec.browser;
const specPath = path.join(root, 'final-specs', `${name}.json`);
fs.mkdirSync(path.dirname(specPath), { recursive: true });
fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx' });
const result = spawnSync(process.execPath, [path.join(root, 'capture-final.cjs'), specPath], {
  cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
else if (name === 'f24-2') {
  const manifest = JSON.parse(fs.readFileSync(path.join(namespace, 'evidence', 'raw', 'f24-2.json'), 'utf8'));
  const text = zlib.gunzipSync(fs.readFileSync(path.join(namespace, 'evidence', 'raw', manifest.transcripts.stdout.path))).toString('utf8');
  const measured = JSON.parse(text.trim().split(/\r?\n/).at(-1));
  const document = `# Current source-frozen F24 measurement\n\nActual capture: \`evidence\\\\raw\\\\f24-2.json\`. These are this run's observations, not the retained f24-1 or reviewer figures.\n\n\`\`\`json\n${JSON.stringify(measured, null, 2)}\n\`\`\`\n`;
  fs.writeFileSync(path.join(namespace, 'evidence', 'final', 'README-F24.md'), document, { flag: 'wx' });
}
