'use strict';

// Test tooling, not production code: the FRESH-CHECKOUT run. It builds a scratch tree that holds only what the suite needs, the way a clean clone would look, and runs the
// whole non-browser suite (every tests\*.test.cjs, the integrity test included) there with ONE runner:
//   --mode=lf   : capability\C009 = `git archive HEAD` of the eight imported production files (blobs as stored, LF), capability\C014 = this namespace with its text files LF-normalized
//                 (what git stores with core.autocrlf=true), without tests\scratch;
//   --mode=crlf : the same tree with every text file outside evidence\ converted to CRLF (the working tree of a Windows owner). evidence\ is `* -text -diff` and keeps its bytes.
// The tree is built under tests\scratch (ignored by git) and removed in `finally`. Output: the TAP of the runner, so that the shared recorder can summarise it; exit code of the runner.
// Usage (repository root): node capability\C014\tests\fresh.cjs --mode=lf
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const IMPORTED = ['authz.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'queue.cjs'];
const TEXT = /\.(?:cjs|js|json|md|html|css|feature)$|^\.gitignore$/;
const mode = (process.argv.find((item) => item.startsWith('--mode=')) || '--mode=lf').slice(7);
if (!['lf', 'crlf'].includes(mode)) throw new Error('--mode is lf or crlf');

const toLf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const toCrlf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');

function copyTree(from, to, relative = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    const inside = path.posix.join(relative, entry.name);
    if (entry.name === 'scratch' && relative === 'tests') continue;
    if (entry.isDirectory()) { copyTree(source, target, inside); continue; }
    const bytes = fs.readFileSync(source);
    const evidence = inside.startsWith('evidence/');
    fs.writeFileSync(target, evidence || !TEXT.test(entry.name) ? bytes : mode === 'lf' ? toLf(bytes) : toCrlf(bytes));
  }
}

function main() {
  const base = path.join(ROOT, 'tests', 'scratch', `fresh-${mode}`);
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  let status = 1;
  try {
    // the imported C009 files exactly as git stores them at HEAD
    const archive = path.join(base, 'c009.tar');
    execFileSync('git', ['--no-pager', 'archive', '--format=tar', `--output=${archive}`, 'HEAD', '--', ...IMPORTED.map((name) => `capability/C009/${name}`)], { cwd: REPOSITORY, windowsHide: true });
    execFileSync('tar', ['-x', '-C', base, '-f', archive], { windowsHide: true });
    fs.rmSync(archive);
    if (mode === 'crlf') {
      for (const name of IMPORTED) {
        const file = path.join(base, 'capability', 'C009', name);
        fs.writeFileSync(file, toCrlf(fs.readFileSync(file)));
      }
    }
    copyTree(ROOT, path.join(base, 'capability', 'C014'));
    // the copy is made BEFORE the captures of these two runs exist: tests\integrity.test.cjs recognises the marker and does not ask a fresh copy for evidence about itself
    fs.mkdirSync(path.join(base, 'capability', 'C014', 'tests', 'scratch'), { recursive: true });
    fs.writeFileSync(path.join(base, 'capability', 'C014', 'tests', 'scratch', 'FRESH-COPY'), 'a fresh copy, made before the fresh-checkout captures existed\n');
    const tests = path.join(base, 'capability', 'C014', 'tests');
    const files = fs.readdirSync(tests).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join(tests, name));
    const env = { ...process.env, NODE_V8_COVERAGE: '' };
    delete env.NODE_TEST_CONTEXT;
    console.log(`fresh ${mode} tree: ${files.length} test files, ${IMPORTED.length} imported C009 files`);
    const run = spawnSync(process.execPath, ['--require', path.join(tests, 'scratch-cwd.cjs'), '--test', '--test-concurrency=1', '--test-timeout=170000', ...files], { cwd: base, env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    // the runner prints the absolute location of a failing test: the tree path is a placeholder in what is recorded
    const text = (bytes) => bytes.toString('utf8').split(base).join('<FRESH>').split(REPOSITORY).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+/g, '<HOME>');
    process.stdout.write(text(run.stdout || Buffer.alloc(0)));
    process.stderr.write(text(run.stderr || Buffer.alloc(0)));
    status = run.status === null ? 1 : run.status;
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  process.exitCode = status;
}

main();
