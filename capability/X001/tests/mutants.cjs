'use strict';

// Mutation self-check (L-0104, L-0147): every limit, cap and guard line is changed in a PRIVATE COPY and a named test must fail.
// Usage (repository root):  node capability\X001\tests\mutants.cjs <scratch-dir-that-does-not-exist>
// The copy holds only the files the focused suites load; the scratch directory is removed at the end; the namespace is never written.
// Exit 0 only when every mutant was killed. The JSON report on stdout lists each mutant, the suites run and what happened.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnvironment } = require('.\\nested-runner.cjs');
const { catalog } = require('.\\mutant-list.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const copy = [
  'capability\\C044\\cursor.js', 'capability\\C044\\reducer.js', 'capability\\C034\\trace.js', 'capability\\C020\\contract.js', 'capability\\C020\\inspector.js',
  'capability\\C033\\journey.js', 'capability\\X001\\timeline.js', 'capability\\X001\\describe.js', 'capability\\X001\\page.js', 'capability\\X001\\saved.js',
  'capability\\X001\\index.html', 'capability\\X001\\style.css', ...fs.readdirSync(__dirname).filter((name) => /^(dom-stub|invariants|nested-runner)\.cjs$|\.test\.cjs$/.test(name)
    && !/^(evidence|imports|red-replay|surface|exhaustive|properties)\.test\.cjs$/.test(name)).map((name) => `capability\\X001\\tests\\${name}`),
];
const scratch = path.resolve(process.argv[2] || '');
if (process.argv.length !== 3 || fs.existsSync(scratch)) throw new Error('usage: node mutants.cjs <scratch-dir-that-does-not-exist>');

function run(files) {
  const present = files.filter((name) => fs.existsSync(path.join(scratch, 'capability', 'X001', 'tests', name)));
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', '--test-reporter=tap', ...present.map((name) => `capability\\X001\\tests\\${name}`)],
    { cwd: scratch, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const failed = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
  return { exit: result.status, failed };
}

const report = { schema: 'X001-mutants/1', pristine: null, mutants: [] };
try {
  for (const relative of copy) {
    fs.mkdirSync(path.dirname(path.join(scratch, relative)), { recursive: true });
    fs.copyFileSync(path.join(repository, relative), path.join(scratch, relative));
  }
  const suites = (file) => catalog.suites[file];
  report.pristine = Object.fromEntries(Object.keys(catalog.suites).map((file) => [file, run(suites(file)).exit]));
  for (const mutant of catalog.mutants) {
    const target = path.join(scratch, 'capability', 'X001', mutant.file);
    const original = fs.readFileSync(target, 'utf8');
    const count = original.split(mutant.find).length - 1;
    if (count !== 1) { report.mutants.push({ name: mutant.name, file: mutant.file, outcome: `INVALID (the line occurs ${count} times)` }); continue; }
    fs.writeFileSync(target, original.replace(mutant.find, () => mutant.replace));
    try {
      const outcome = run(suites(mutant.file));
      const survived = outcome.exit === 0;
      report.mutants.push({ name: mutant.name, file: mutant.file, outcome: !survived ? 'killed' : mutant.equivalent ? 'equivalent' : 'SURVIVED', exit: outcome.exit,
        killedBy: outcome.failed.slice(0, 3), ...(mutant.equivalent ? { reason: mutant.equivalent } : {}) });
    } finally {
      fs.writeFileSync(target, original);
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
const summary = {
  killed: report.mutants.filter((item) => item.outcome === 'killed').length, equivalent: report.mutants.filter((item) => item.outcome === 'equivalent').map((item) => item.name),
  notKilled: report.mutants.filter((item) => !['killed', 'equivalent'].includes(item.outcome)).map((item) => `${item.name}: ${item.outcome}`),
};
console.log(JSON.stringify({ ...report, summary }, null, 1));
process.exitCode = summary.notKilled.length === 0 && Object.values(report.pristine).every((exit) => exit === 0) ? 0 : 1;
