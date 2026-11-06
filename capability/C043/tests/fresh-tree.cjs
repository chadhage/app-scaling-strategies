'use strict';

// Test tooling, not production code: the FRESH-CHECKOUT proof (self-review line 2, X001 F1). It builds a scratch tree OUTSIDE the
// repository from the git objects (a local clone without checkout, so git cat-file works in it; nothing is ever cloned into
// the repository and no git setting is changed), extracts the imported namespaces from `git archive HEAD` (the LF blobs), lays
// the WORKING capability\C043 over them, optionally converts what it extracted to CRLF, and runs the whole non-browser suite of
// C043 in that tree. The mutation suite (tests\mutants.test.cjs, about 15 minutes) is skipped: it mutates the same files in
// place and needs nothing of the checkout that the other suites do not already prove.
// Usage (from the repository root): node capability\C043\tests\fresh-tree.cjs --into=<directory that does not exist yet> [--crlf] [--keep] [--skip=mutants.test.cjs] [--only=surface.test.cjs,units.test.cjs]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..');
const options = Object.fromEntries(process.argv.slice(2).map((argument) => { const [name, ...value] = argument.replace(/^--/, '').split('='); return [name, value.join('=') || 'true']; }));
const into = options.into ? path.resolve(options.into) : null;
const SKIP = new Set((options.skip ?? 'mutants.test.cjs').split(','));
const ONLY = options.only ? new Set(options.only.split(',')) : null;
const IMPORTED = ['capability/C042', 'capability/C001', '.docs/wiki/flow-state.json'];

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (into === null || path.relative(repository, into).startsWith('..') === false) fail('usage: node capability\\C043\\tests\\fresh-tree.cjs --into=<a directory outside the repository that does not exist yet> [--crlf] [--keep]');
if (fs.existsSync(into)) fail(`${into} exists: the scratch tree must be new`);

function toCrlf(directory) {
  let converted = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { converted += toCrlf(full); continue; }
    if (!/\.(?:c?js|json|md|feature|html|css|txt)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const crlf = text.replace(/\r?\n/g, '\r\n');
    if (crlf !== text) { fs.writeFileSync(full, crlf); converted += 1; }
  }
  return converted;
}

const git = (...args) => execFileSync('git', ['--no-pager', ...args], { maxBuffer: 512 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
git('clone', '--quiet', '--no-checkout', '--local', repository, into);
const archive = git('-C', into, 'archive', '--format=tar', 'HEAD', ...IMPORTED);
const extracted = spawnSync('tar', ['-x', '-C', into], { input: archive, windowsHide: true });
if (extracted.status !== 0) fail(`tar failed: ${extracted.stderr}`);
fs.cpSync(path.join(repository, 'capability', 'C043'), path.join(into, 'capability', 'C043'), {
  recursive: true,
  filter: (source) => !/[\\/]C043[\\/](?:data|tests[\\/]scratch)(?:[\\/]|$)/.test(source),
});
const converted = options.crlf ? ['capability/C042', 'capability/C001', '.docs'].reduce((total, name) => total + toCrlf(path.join(into, name)), 0) : 0;

const tests = fs.readdirSync(path.join(into, 'capability', 'C043', 'tests')).filter((name) => name.endsWith('.test.cjs') && !SKIP.has(name) && (ONLY === null || ONLY.has(name))).sort()
  .map((name) => path.join('capability', 'C043', 'tests', name));
const env = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C043_MUTANT', 'C043_KINDS', 'C043_FLOOD', 'C043_LIVENESS_MS', 'C043_STALL_MS', 'GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete env[key];
const started = Date.now();
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: into, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 3000000, windowsHide: true });
const output = `${run.stdout}${run.stderr}`;
const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1] ?? NaN);
const failing = [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim().slice(0, 140));
console.log(JSON.stringify({
  tree: options.crlf ? 'git archive HEAD of the imports (LF) converted to CRLF, working C043 overlaid' : 'git archive HEAD of the imports (LF), working C043 overlaid',
  crlfFilesConverted: converted, skipped: [...SKIP], files: tests.length, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skippedTests: count('skipped'),
  exit: run.status, seconds: Math.round((Date.now() - started) / 1000), failing: failing.slice(0, 20),
}));
if (run.status !== 0) console.error(output.split(/\r?\n/).slice(-60).join('\n'));
if (!options.keep) fs.rmSync(into, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
process.exitCode = run.status === 0 ? 0 : 1;
