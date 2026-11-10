'use strict';

// Test tooling, not production code: the FRESH-CHECKOUT proof (self-review 2, L-0188, rev-C010 R-notes). It builds a scratch tree with the layout of
// the repository: this namespace (the working bytes) and the five pinned C009 files taken from GIT BLOBS (LF bytes, as git archive writes them).
// Mode lf converts every text file of the namespace to LF, mode crlf converts every text file (imports included) to CRLF; the evidence folder is
// `-text` in git and stays byte-exact in both. The whole suite then runs in that tree. The evidence test verifies the archive this very run is
// part of, so a capture run leaves it out (--without-evidence) and a second run, on the sealed tree, runs it alone (--only evidence.test.cjs).
//   node tests\fresh.cjs --mode lf|crlf --tree <dir outside the repository> --out <json> [--without-evidence | --only <file>]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { pinInputs } = require('./evidence-pins.cjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const imports = require('../imports.json');
const tree = path.resolve(args.tree);
if (tree.toLowerCase().startsWith(repository.toLowerCase())) throw new Error('--tree must be outside the repository');
const TEXT = /\.(c?js|json|md|html|css|feature|gitattributes|gitignore)$/;
const convert = (buffer, name) => {
  if (!TEXT.test(name) && !name.startsWith('.git')) return buffer;
  const lf = buffer.toString('latin1').replaceAll('\r\n', '\n');
  return Buffer.from(args.mode === 'crlf' ? lf.replaceAll('\n', '\r\n') : lf, 'latin1');
};

function copy(from, to, inEvidence) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) copy(source, path.join(to, entry.name), inEvidence || entry.name === 'evidence');
    else fs.writeFileSync(path.join(to, entry.name), inEvidence ? fs.readFileSync(source) : convert(fs.readFileSync(source), entry.name));
  }
}

const inputs = pinInputs(root);
fs.rmSync(tree, { recursive: true, force: true });
copy(root, path.join(tree, 'capability', 'C010'), false);
for (const dep of imports.dependencies) {
  const blob = execFileSync('git', ['-C', repository, 'show', `${dep.commit}:${dep.path.replaceAll('\\', '/')}`], { maxBuffer: 1 << 26 });
  const target = path.join(tree, dep.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, convert(blob, dep.path));
}
const env = { ...process.env, C010_GIT_REPOSITORY: repository };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
delete env.C010_SUBJECT_DIR;
const all = fs.readdirSync(path.join(tree, 'capability', 'C010', 'tests')).filter((name) => name.endsWith('.test.cjs')).sort();
const selected = args.only ? all.filter((name) => name === args.only) : all.filter((name) => !('without-evidence' in args) || name !== 'evidence.test.cjs');
const tests = selected.map((name) => path.join('capability', 'C010', 'tests', name));
const started = Date.now();
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=3', '--test-timeout=170000', ...tests], { cwd: tree, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 1500000 });
const out = `${run.stdout}${run.stderr}`;
const count = (key) => Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(out) || [])[1] || 0);
const document = {
  tool: 'tests/fresh.cjs', mode: args.mode, node: process.version, evidenceTest: selected.includes('evidence.test.cjs'), ms: Date.now() - started, exit: run.status, tests: count('tests'), pass: count('pass'), fail: count('fail'),
  cancelled: count('cancelled'), skipped: count('skipped'), files: tests.length, inputs, failed: [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).slice(0, 20)
};
fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(document, null, 1)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ mode: document.mode, exit: document.exit, tests: document.tests, pass: document.pass, fail: document.fail, files: document.files, ms: document.ms }));
fs.rmSync(tree, { recursive: true, force: true });
process.exitCode = run.status === 0 && document.fail === 0 && document.cancelled === 0 && document.tests > 0 ? 0 : 1;
