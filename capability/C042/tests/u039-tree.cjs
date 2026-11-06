'use strict';

// Test tooling, not production code (U039): the fresh-checkout check. It builds a scratch tree from the bytes of HEAD (`git archive` of
// capability/C001, capability/C042 and the ledger), overlays the working namespace capability/C042 (what is about to be published),
// converts every text file to LF or to CRLF on request, and runs the whole non-browser suite of the namespace inside that tree with the
// tree as the working directory: no test may depend on an untracked file, an ignored folder or one line ending. The tree is removed
// afterwards. `--baseline` skips the overlay (the accepted bytes alone), to tell a failure that predates U039 (a sealed test that pins
// raw bytes) from a new one. Nothing is written outside the scratch directory; git is only read.
// Usage (repository root): node capability\C042\tests\u039-tree.cjs <raw|lf|crlf> [--baseline] [--dir <scratch directory>] [--keep]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const MODES = ['raw', 'lf', 'crlf'];
const mode = process.argv[2];
if (!MODES.includes(mode)) { console.error('usage: node u039-tree.cjs <raw|lf|crlf> [--baseline] [--dir <scratch directory>] [--keep]'); process.exit(2); }
const baseline = process.argv.includes('--baseline');
const keep = process.argv.includes('--keep');
const at = process.argv.indexOf('--dir');
const dir = path.resolve(at > 0 ? process.argv[at + 1] : path.join(__dirname, 'scratch', `u039-tree-${mode}${baseline ? '-baseline' : ''}`));
const TEXT = /\.(?:c?js|json|md|feature|txt|html|css)$|\.git(?:attributes|ignore)$/;
const SKIPPED = ['capability/C042/tests/scratch/', 'capability/C042/data/'];
const toLf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const toCrlf = (bytes) => Buffer.from(toLf(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
// Only a directory this run created is ever removed (a path that already exists makes the run fail before anything is touched).
let created = false;

function walk(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory() ? walk(path.join(directory, entry.name), `${name}/`) : [name];
  });
}

function build() {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir);
  created = true;
  const tarball = `${dir}.tar`;
  try {
    execFileSync('git', ['archive', '--format=tar', `--output=${tarball}`, 'HEAD', 'capability/C001', 'capability/C042', '.docs/wiki/flow-state.json'], { cwd: repository });
    execFileSync('tar', ['-xf', tarball, '-C', dir]);
  } finally {
    fs.rmSync(tarball, { force: true });
  }
  let overlaid = 0;
  if (!baseline) {
    for (const name of walk(root, 'capability/C042/')) {
      if (SKIPPED.some((skipped) => name.startsWith(skipped))) continue;
      const target = path.join(dir, ...name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // The bytes only: a sealed file may carry the read-only attribute in the working tree, and the conversion below must be able to rewrite it.
      if (fs.existsSync(target)) fs.chmodSync(target, 0o666);
      fs.writeFileSync(target, fs.readFileSync(path.join(repository, ...name.split('/'))));
      overlaid += 1;
    }
  }
  let converted = 0;
  if (mode !== 'raw') {
    for (const name of walk(dir)) {
      if (!TEXT.test(name) || name.includes('/raw/')) continue;
      const file = path.join(dir, ...name.split('/'));
      const bytes = fs.readFileSync(file);
      const next = mode === 'lf' ? toLf(bytes) : toCrlf(bytes);
      if (!next.equals(bytes)) { fs.chmodSync(file, 0o666); fs.writeFileSync(file, next); converted += 1; }
    }
  }
  return { overlaid, converted };
}

function main() {
  const built = build();
  const tests = fs.readdirSync(path.join(dir, 'capability', 'C042', 'tests')).filter((name) => name.endsWith('.test.cjs')).sort();
  console.log(`# u039-tree: mode ${mode}${baseline ? ' (baseline, no overlay)' : ''}; ${built.overlaid} files overlaid, ${built.converted} converted; ${tests.length} test files; tree ${path.relative(repository, dir) || dir}`);
  const env = lib.childEnv();
  for (const key of ['U039_SUBJECT', 'U039_CLOSE_MS', 'U039_STRICT_EVIDENCE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
  const args = ['--test', '--test-concurrency=1', ...tests.map((name) => path.join('capability', 'C042', 'tests', name))];
  const run = spawnSync(process.execPath, args, { cwd: dir, env, maxBuffer: 512 * 1024 * 1024, windowsHide: true, timeout: 1700000, killSignal: 'SIGKILL' });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  if (run.error) console.error(`# u039-tree: ${run.error.message}`);
  process.exitCode = run.status ?? 1;
}

try {
  main();
} finally {
  if (!keep && created) fs.rmSync(dir, { recursive: true, force: true });
}
