'use strict';

// Test tooling, not production code: the FRESH-CHECKOUT proof (self-review 2, L-0188). It builds a scratch tree that has the layout of the
// repository: this namespace, and the pinned imports taken from GIT BLOBS (LF bytes, as git archive writes them). Mode lf converts every
// text file of the namespace to LF, mode crlf converts every text file (imports included) to CRLF. The whole suite then runs in that tree
// EXCEPT evidence.test.cjs: it verifies the archive that this very run belongs to (it asserts these fresh manifests), so it runs alone as
// verify-1 in the real tree, and once more on the finished tree (the reviewer's fresh checkout of the published commit has the whole archive).
//   node fresh.cjs --mode lf|crlf --tree <dir> --out <json>
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { runInputs } = require('./evidence-verify.cjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const repo = path.resolve(__dirname, '..', '..', '..');
const imports = require('../imports.json');
const tree = path.resolve(args.tree);
const TEXT = /\.(c?js|json|md|html|css|feature|gitattributes|gitignore)$/;
const convert = (buffer, name) => {
  if (!TEXT.test(name) && !name.startsWith('.git')) return buffer;
  const lf = buffer.toString('latin1').replaceAll('\r\n', '\n');
  return Buffer.from(args.mode === 'crlf' ? lf.replaceAll('\n', '\r\n') : lf, 'latin1');
};

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'scratch') continue;
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) copy(source, path.join(to, entry.name));
    else fs.writeFileSync(path.join(to, entry.name), convert(fs.readFileSync(source), entry.name));
  }
}

fs.rmSync(tree, { recursive: true, force: true });
// The bytes this run copies (hashes taken just before the copy): evidence.test.cjs compares them with the live files.
const inputs = runInputs(path.join(repo, 'capability', 'C022'));
copy(path.join(repo, 'capability', 'C022'), path.join(tree, 'capability', 'C022'));
for (const dep of imports.dependencies) {
  const blob = execFileSync('git', ['show', `${dep.commit}:${dep.path}`], { cwd: repo, maxBuffer: 1 << 26 });
  const target = path.join(tree, dep.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, convert(blob, dep.path));
}
fs.mkdirSync(path.join(tree, 'testing', 'browser'), { recursive: true });
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
env.NODE_V8_COVERAGE = '';
const tests = fs.readdirSync(path.join(tree, 'capability', 'C022', 'tests')).filter((name) => name.endsWith('.test.cjs') && name !== 'evidence.test.cjs').sort().map((name) => path.join('capability', 'C022', 'tests', name));
const started = Date.now();
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=600000', ...tests], { cwd: tree, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 1500000 });
const out = `${run.stdout}${run.stderr}`;
const count = (key) => Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(out) || [])[1] || 0);
const document = {
  tool: 'tests/fresh.cjs', mode: args.mode, node: process.version, ms: Date.now() - started, exit: run.status, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skipped: count('skipped'),
  files: tests.length, failed: [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).slice(0, 20), inputs
};
fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(document, null, 1)}\n`, { flag: 'wx' });
console.log(JSON.stringify(document));
fs.rmSync(tree, { recursive: true, force: true });
