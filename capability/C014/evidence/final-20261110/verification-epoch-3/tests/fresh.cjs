'use strict';

// Test tooling, not production code: the FRESH-CHECKOUT run. It builds a scratch tree that holds only what the suite needs, the way a clean clone would look, and runs the
// whole non-browser suite (every tests\*.test.cjs, the integrity test included) there with ONE runner:
//   --mode=lf   : capability\C009 = git archive at its immutable imported commit, capability\C014 = this namespace with its text files LF-normalized
//                 (what git stores with core.autocrlf=true), without tests\scratch;
//   --mode=crlf : the same tree with every text file outside evidence\ converted to CRLF (the working tree of a Windows owner). evidence\ is `* -text -diff` and keeps its bytes.
// The tree is built under tests\scratch (ignored by git) and removed in `finally`. Output: the TAP of the runner, so that the shared recorder can summarise it; exit code of the runner.
// Usage (repository root): node capability\C014\tests\fresh.cjs --mode=lf
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const IMPORTED = ['authz.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'queue.cjs'];
const PINNED = JSON.parse(fs.readFileSync(path.join(ROOT, 'imports.json'), 'utf8')).accepted.C009.commit;
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
    execFileSync('git', ['-c', 'core.autocrlf=false', '--no-pager', 'archive', '--format=tar', `--output=${archive}`, PINNED, '--', ...IMPORTED.map((name) => `capability/C009/${name}`)], { cwd: process.env.C014_GIT_ANCHOR || REPOSITORY, windowsHide: true });
    execFileSync('tar', ['-x', '-C', base, '-f', archive], { windowsHide: true });
    fs.rmSync(archive);
    if (mode === 'crlf') {
      for (const name of IMPORTED) {
        const file = path.join(base, 'capability', 'C009', name);
        fs.writeFileSync(file, toCrlf(fs.readFileSync(file)));
      }
    }
    copyTree(ROOT, path.join(base, 'capability', 'C014'));
    fs.cpSync(path.join(REPOSITORY, 'testing', 'browser'), path.join(base, 'testing', 'browser'), { recursive: true });
    // the copy is made BEFORE the captures of these two runs exist: tests\integrity.test.cjs recognises the marker and does not ask a fresh copy for evidence about itself
    fs.mkdirSync(path.join(base, 'capability', 'C014', 'tests', 'scratch'), { recursive: true });
    fs.writeFileSync(path.join(base, 'capability', 'C014', 'tests', 'scratch', 'FRESH-COPY'), 'a fresh copy, made before the fresh-checkout captures existed\n');
    const tests = path.join(base, 'capability', 'C014', 'tests');
    const files = fs.readdirSync(tests).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join(tests, name));
    const env = { ...process.env, NODE_V8_COVERAGE: '' };
    delete env.NODE_TEST_CONTEXT;
    console.log(`fresh ${mode} tree: ${files.length} test files, ${IMPORTED.length} imported C009 files`);
    const census = process.env.C014_CENSUS_DIR ? ['--require', path.join(tests, 'final-census.cjs')] : [];
    const pins = {};
    const originalFreeze = path.join(ROOT, 'evidence', 'final-20261110', 'source-freeze-3.json');
    if (fs.existsSync(originalFreeze)) {
      const freeze = JSON.parse(fs.readFileSync(originalFreeze));
      for (const name of Object.keys(freeze.sources)) {
        const bytes = fs.readFileSync(path.join(base, 'capability', 'C014', name));
        pins[name] = { rawSha256: createHash('sha256').update(bytes).digest('hex'), canonicalLfSha256: createHash('sha256').update(toLf(bytes)).digest('hex') };
        if (pins[name].canonicalLfSha256 !== freeze.sources[name].canonicalLfSha256) throw new Error(`fresh source differs: ${name}`);
      }
    }
    const run = spawnSync(process.execPath, ['--require', path.join(tests, 'scratch-cwd.cjs'), ...census, '--test', '--test-concurrency=1', '--test-timeout=170000', ...files], { cwd: base, env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    if (process.env.C014_PRIVATE_EVIDENCE && process.env.C014_ACTIVE_CAPTURE) {
      const directory = path.join(process.env.C014_PRIVATE_EVIDENCE, 'fresh-children', process.env.C014_ACTIVE_CAPTURE);
      fs.mkdirSync(directory, { recursive: true });
      const streams = {};
      for (const stream of ['stdout', 'stderr']) {
        const bytes = run[stream] || Buffer.alloc(0);
        const gzip = zlib.gzipSync(bytes);
        fs.writeFileSync(path.join(directory, `${stream}.raw.gz`), gzip, { flag: 'wx' });
        streams[stream] = { path: `${stream}.raw.gz`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
          gzipSha256: createHash('sha256').update(gzip).digest('hex') };
      }
      fs.writeFileSync(path.join(directory, 'original.json'), JSON.stringify({ schema: 'C014-fresh-executed-inputs/1', mode, exit: run.status, sourcePins: pins, streams }, null, 2) + '\n', { flag: 'wx' });
    }
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
