'use strict';
// K-C001 mutation check (test tooling; never production code and never edits the real probe.cjs).
// Usage, from the repository root: node capability\C001\tests\fixtures\k-c001-mutation-check.cjs <scratch folder>
// Every mutant is a ONE-LINE change of a private copy of probe.cjs inside <scratch>\<id>\capability\C001 (next to copies of the real guard,
// the approved snapshot, the three K-C001 test files and their fixtures). The K-C001 tests run there and must FAIL for every mutant (killed);
// the unmutated copy must pass. Exit 0 only if the baseline passes and no mutant survives; the scratch folders are removed at the end.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const home = path.resolve(__dirname, '..', '..');
const scratch = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass a scratch folder outside the namespace.');
const TESTS = ['k-c001-probe-failclosed.test.cjs', 'k-c001-probe-ledger.test.cjs', 'k-c001-probe-reader.test.cjs'];
const FIXTURES = ['k-c001-probe-preload.cjs', 'k-c001-run-probe.cjs'];

const MUTANTS = [
  ['M01', 'source reason is always unavailable', "error instanceof SyntaxError ? 'SOURCE_INVALID_JSON' : 'SOURCE_UNAVAILABLE'", "'SOURCE_UNAVAILABLE'"],
  ['M02', 'source reason placed after the guard reasons', '[reason, ...decision.reasons]', '[...decision.reasons, reason]'],
  ['M03', 'source-failure answer not frozen', 'return Object.freeze({ ...decision, reasons:', 'return ({ ...decision, reasons:'],
  ['M04', 'exit code 0 for every decision', 'process.exitCode = decision.allowed ? 0 : 1;', 'process.exitCode = 0;'],
  ['M05', 'failure handler exits 0', 'process.exitCode = 1;', 'process.exitCode = 0;'],
  ['M06', 'failure message changed', "message: 'Local probe failed closed.'", "message: 'Local probe failed.'"],
  ['M07', 'failure handler leaks the underlying error', '.catch(() => {', ".catch((error) => { process.stderr.write(String(error && error.message) + '\\n');"],
  ['M08', 'failure reason code changed', "code: 'PROBE_FAILURE'", "code: 'PROBE_FAILED'"],
  ['M09', 'failure handler says allowed', '{ allowed: false, executed: false, reasons: [{', '{ allowed: true, executed: false, reasons: [{'],
  ['M10', 'extra arguments accepted', 'if (process.argv.length !== 3) {', 'if (process.argv.length < 3) {'],
  ['M11', 'invalid-arguments code changed', "code: 'INVALID_ARGUMENTS',", "code: 'INVALID_ARGUMENT',"],
  ['M12', 'invalid-arguments answer drops the guard reasons', '}, ...denied.reasons]', '}]'],
  ['M13', 'command line runs on require', 'if (require.main === module) {', 'if (true) {'],
  ['M14', 'wrong ledger file name', "'.docs', 'wiki', 'flow-state.json'", "'.docs', 'wiki', 'flow-state.jsn'"],
  ['M15', 'missing approvals section throws', 'state && state.approvals && state.approvals.C001', 'state.approvals.C001'],
  ['M16', 'module export not frozen', 'module.exports = Object.freeze({ evaluateCurrentApproval });', 'module.exports = { evaluateCurrentApproval };'],
  ['M17', 'decision printed compact', 'JSON.stringify(decision, null, 2)', 'JSON.stringify(decision)']
];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function build(id, source) {
  const ns = path.join(scratch, id, 'capability', 'C001');
  for (const file of ['contract-guard.js', 'approved-contract.js']) copy(path.join(home, file), path.join(ns, file));
  fs.writeFileSync(path.join(ns, 'probe.cjs'), source);
  for (const file of TESTS) copy(path.join(home, 'tests', file), path.join(ns, 'tests', file));
  for (const file of FIXTURES) copy(path.join(home, 'tests', 'fixtures', file), path.join(ns, 'tests', 'fixtures', file));
  return ns;
}

function runTests(ns) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...TESTS.map((file) => path.join(ns, 'tests', file))],
      { cwd: ns, env, timeout: 300000, killSignal: 'SIGKILL', windowsHide: true });
    let text = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { text += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { text += chunk; });
    child.on('error', fail);
    child.on('close', (status, signal) => {
      const count = (key) => Number((text.match(new RegExp(`^# ${key} (\\d+)`, 'm')) || [])[1]);
      const failed = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).slice(0, 4);
      done({ status, signal, tests: count('tests'), pass: count('pass'), fail: count('fail'), failedTests: failed });
    });
  });
}

(async () => {
  const original = fs.readFileSync(path.join(home, 'probe.cjs'), 'utf8');
  const baseline = await runTests(build('m00', original));
  const mutants = [];
  for (const [id, description, search, replacement] of MUTANTS) {
    if (original.split(search).length !== 2) throw new Error(`${id}: the search text must occur exactly once in probe.cjs`);
    const line = original.slice(0, original.indexOf(search)).split('\n').length;
    const result = await runTests(build(id.toLowerCase(), original.replace(search, () => replacement)));
    const outcome = result.signal ? 'timeout' : result.status === 0 ? 'survived' : 'killed';
    mutants.push({ id, description, line, search, replacement, outcome, ...result });
  }
  const survived = mutants.filter((mutant) => mutant.outcome === 'survived');
  const summary = { total: mutants.length, killed: mutants.filter((mutant) => mutant.outcome === 'killed').length, survived: survived.length,
    timeout: mutants.filter((mutant) => mutant.outcome === 'timeout').length, baselinePassed: baseline.status === 0 };
  console.log(JSON.stringify({ schemaVersion: 1, tool: 'k-c001-mutation-check', node: process.version, baseline, summary, mutants }, null, 2));
  process.exitCode = summary.baselinePassed && survived.length === 0 && summary.timeout === 0 ? 0 : 1;
})().catch((error) => {
  console.error(String(error && error.stack));
  process.exitCode = 2;
}).finally(() => {
  for (const name of fs.existsSync(scratch) ? fs.readdirSync(scratch) : []) {
    if (/^m\d\d$/.test(name)) fs.rmSync(path.join(scratch, name), { recursive: true, force: true });
  }
  try { fs.rmdirSync(scratch); } catch { /* not empty or not ours: leave it */ }
});
