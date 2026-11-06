'use strict';

// Test tooling, not production code (U040, checklist line 2: a fresh checkout). It builds a scratch tree from the bytes of `git archive` of
// one commit (capability/C026 and the two files of capability/C001 that C026 imports; core.autocrlf=false, so the committed blobs themselves,
// each one checked against its blob id), overlays the WORKING capability/C026 (what this publication adds or changes), optionally converts the
// source text files to CRLF, runs every suite of the namespace in the scratch tree and exits with the code of that run. The two evidence
// verifiers are not part of the run: they need the addendum that lists this very run.
// capability/C026/.gitattributes is '* -text', so a fresh checkout of the namespace keeps the committed bytes (CRLF sources, LF evidence);
// the crlf mode converts only the source text files (.js .cjs .html .css .md .feature outside evidence/): the C001 imports and the C026 sources
// that are not CRLF already. Evidence, JSON and images are pinned by raw hash and are never converted.
// Usage: node capability\C026\tests\u040-fresh-tree.cjs <empty-scratch-dir-outside-the-repository> <lf|crlf>
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const NAMESPACE = 'capability/C026';
const IMPORTS = Object.freeze(['capability/C001/contract-guard.js', 'capability/C001/approved-contract.js']);
const VERIFIERS = Object.freeze(['evidence-final.test.cjs', 'u040-evidence.test.cjs']);
const CONVERTED = /\.(?:js|cjs|html|css|md|feature)$/;
const MAX_PATH_BUDGET = 240;
const SYSTEM_TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

const toNative = (relative) => relative.split('/').join(path.sep);
const blobId = (bytes) => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const lines = (bytes) => {
  const text = bytes.toString('latin1');
  const crlf = (text.match(/\r\n/g) ?? []).length;
  return { crlf, lf: (text.match(/\n/g) ?? []).length - crlf };
};

function git(args, input) {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete env[name];
  const run = spawnSync('git', args, { cwd: repository, env, input, encoding: null, maxBuffer: 1024 * 1024 * 1024, windowsHide: true });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(run.stderr ?? Buffer.alloc(0)).toString('utf8')}`);
  return run.stdout;
}

function walk(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    if (!entry.isFile()) throw new Error(`neither a file nor a directory: ${full}`);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

function main() {
  const [directory, mode] = process.argv.slice(2);
  if (directory === undefined || !['lf', 'crlf'].includes(mode)) throw new Error('usage: node u040-fresh-tree.cjs <empty-scratch-dir> <lf|crlf>');
  const scratch = path.resolve(directory);
  const outside = path.relative(repository, scratch);
  if (!(outside.startsWith('..') || path.isAbsolute(outside))) throw new Error('the scratch tree must be outside the repository');
  if (fs.existsSync(scratch) && fs.readdirSync(scratch).length > 0) throw new Error('the scratch directory must be empty');
  fs.mkdirSync(scratch, { recursive: true });
  const label = `U040 fresh-tree ${mode}`;

  const head = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error(`unexpected HEAD ${head}`);
  const listing = git(['ls-tree', '-r', '-z', head, '--', NAMESPACE, ...IMPORTS]).toString('utf8').split('\0').filter(Boolean)
    .map((entry) => /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(entry)).map((match) => [match[2], match[1]]);
  const blobs = new Map(listing);
  const archive = git(['-c', 'core.autocrlf=false', 'archive', '--format=tar', head, NAMESPACE, ...IMPORTS]);
  const tar = fs.existsSync(SYSTEM_TAR) ? SYSTEM_TAR : 'tar';
  const extract = spawnSync(tar, ['-xf', '-', '-C', scratch], { input: archive, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (extract.status !== 0) throw new Error(`tar failed: ${(extract.stderr ?? Buffer.alloc(0)).toString('utf8')}`);
  const archived = walk(scratch).sort();
  if (JSON.stringify(archived) !== JSON.stringify([...blobs.keys()].sort())) throw new Error(`the archive holds ${archived.length} files, git ls-tree lists ${blobs.size}`);
  for (const [key, id] of blobs) {
    if (blobId(fs.readFileSync(path.join(scratch, toNative(key)))) !== id) throw new Error(`${key} is not the committed blob`);
  }
  console.log(`${label}: git archive of ${head}: ${archived.length} files, each equal to its committed blob (core.autocrlf=false)`);

  const working = walk(path.join(repository, toNative(NAMESPACE))).map((relative) => `${NAMESPACE}/${relative}`);
  const modified = [];
  const added = [];
  for (const key of working) {
    const bytes = fs.readFileSync(path.join(repository, toNative(key)));
    if (!blobs.has(key)) added.push(key);
    else if (blobId(bytes) !== blobs.get(key)) modified.push(key);
    const target = path.join(scratch, toNative(key));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  const removed = [...blobs.keys()].filter((key) => key.startsWith(`${NAMESPACE}/`) && !working.includes(key));
  for (const key of removed) fs.rmSync(path.join(scratch, toNative(key)));
  console.log(`${label}: overlay of the working ${NAMESPACE}: ${modified.length} modified, ${added.length} added, ${removed.length} removed`);
  for (const [kind, list] of [['modified', modified], ['added', added], ['removed', removed]]) for (const key of list) console.log(`${label}:   ${kind} ${key}`);

  const converted = [];
  if (mode === 'crlf') {
    for (const key of walk(scratch)) {
      if (!CONVERTED.test(key) || key.startsWith(`${NAMESPACE}/evidence/`)) continue;
      const file = path.join(scratch, toNative(key));
      const before = fs.readFileSync(file);
      const after = Buffer.from(before.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');
      if (!before.equals(after)) {
        fs.writeFileSync(file, after);
        converted.push(key);
      }
    }
  }
  console.log(`${label}: converted to CRLF: ${converted.length} files${converted.length > 0 ? ` (${converted.join(', ')})` : ''}`);
  for (const key of IMPORTS) {
    const { crlf, lf } = lines(fs.readFileSync(path.join(scratch, toNative(key))));
    console.log(`${label}: ${key}: ${crlf} CRLF lines, ${lf} LF-only lines`);
  }
  const longest = Math.max(...walk(scratch).map((key) => path.join(scratch, toNative(key)).length));
  if (longest > MAX_PATH_BUDGET) throw new Error(`the longest path in the scratch tree has ${longest} characters (budget ${MAX_PATH_BUDGET}): use a shorter scratch directory`);

  const suites = fs.readdirSync(path.join(scratch, 'capability', 'C026', 'tests')).filter((name) => name.endsWith('.test.cjs') && !VERIFIERS.includes(name)).sort()
    .map((name) => path.join('capability', 'C026', 'tests', name));
  console.log(`${label}: running ${suites.length} suites in the scratch tree (not run: ${VERIFIERS.join(', ')})`);
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...suites], {
    cwd: scratch, env, encoding: null, maxBuffer: 256 * 1024 * 1024, timeout: 1200000, killSignal: 'SIGKILL', windowsHide: true
  });
  process.stdout.write(run.stdout ?? Buffer.alloc(0));
  process.stderr.write(run.stderr ?? Buffer.alloc(0));
  console.log(`${label}: the suites exited with ${run.status}${run.error ? ` (${run.error.code ?? run.error.message})` : ''}`);
  process.exitCode = run.status === 0 ? 0 : 1;
  if (run.status === 0) {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log(`${label}: scratch tree removed`);
  } else {
    console.log(`${label}: scratch tree kept for inspection: ${path.relative(repository, scratch)}`);
  }
}

main();
