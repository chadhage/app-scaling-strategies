'use strict';

// Fresh-checkout proof (review finding F1): builds a SCRATCH tree holding exactly what the non-browser suites read (capability\X001 plus the sixteen
// pinned files of the accepted namespaces, taken from their accepted git blobs) and runs the suites there with the scratch tree as the working directory.
//   node capability\X001\tests\fresh-tree.cjs <scratch-dir-that-does-not-exist> <lf|crlf> [--own-from <commit>]
// lf   = the accepted blobs as a fresh checkout or `git archive` gives them (LF for the files whose pins were recorded as CRLF on the owner tree).
// crlf = the owner tree: every pinned file whose blob is LF text is converted to CRLF (what core.autocrlf=true produces on Windows).
// --own-from <commit> takes capability\X001 from that commit instead of the working tree (replays the first publication). The scratch tree is
// removed at the end. Git is used read-only: GIT_DIR points the nested suites at the real repository objects (accepted commits and tags only).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { childEnvironment } = require('.\\nested-runner.cjs');
const pins = require('..\\imports.json');

const repository = path.resolve(__dirname, '..', '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const posix = (file) => file.replaceAll('\\', '/');
const git = (args, input) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, input, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
const toCrlf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');

function blobs(keys) {
  const out = git(['cat-file', '--batch'], `${keys.join('\n')}\n`);
  const found = new Map();
  let offset = 0;
  for (const key of keys) {
    const eol = out.indexOf(10, offset);
    const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(out.toString('latin1', offset, eol));
    if (!header) throw new Error(`the git object ${key} does not exist`);
    const size = Number(header[2]);
    found.set(key, out.subarray(eol + 1, eol + 1 + size));
    offset = eol + 1 + size + 1;
  }
  return found;
}

function write(scratch, relative, bytes) {
  const target = path.join(scratch, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function build(scratch, form, ownFrom) {
  const keys = pins.dependencies.map((entry) => `${entry.commit}:${posix(entry.path)}`);
  const found = blobs(keys);
  pins.dependencies.forEach((entry, index) => {
    let bytes = found.get(keys[index]);
    if (form === 'crlf' && !bytes.includes(13) && entry.rawSha256 !== entry.crlfToLfSha256) {
      bytes = toCrlf(bytes);
      if (sha(bytes) !== entry.rawSha256) throw new Error(`${entry.path}: the CRLF form is not the owner-tree form`);
    }
    write(scratch, entry.path, bytes);
  });
  if (ownFrom) {
    const names = git(['ls-tree', '-r', '--name-only', ownFrom, '--', 'capability/X001']).toString('utf8').split(/\r?\n/).filter(Boolean);
    const own = blobs(names.map((name) => `${ownFrom}:${name}`));
    names.forEach((name) => write(scratch, name.replaceAll('/', '\\'), own.get(`${ownFrom}:${name}`)));
  } else {
    fs.cpSync(path.join(repository, 'capability', 'X001'), path.join(scratch, 'capability', 'X001'), { recursive: true, errorOnExist: true, force: false });
  }
}

function main() {
  const [target, form, ...rest] = process.argv.slice(2);
  const ownFrom = rest[0] === '--own-from' ? rest[1] : null;
  if (!target || !['lf', 'crlf'].includes(form) || !(rest.length === 0 || (ownFrom && rest.length === 2 && /^[0-9a-f]{40}$/.test(ownFrom)))) {
    throw new Error('usage: node fresh-tree.cjs <scratch-dir-that-does-not-exist> <lf|crlf> [--own-from <40-hex commit>]');
  }
  const scratch = path.resolve(target);
  if (fs.existsSync(scratch)) throw new Error('the scratch directory must not exist');
  let status = 1;
  try {
    build(scratch, form, ownFrom);
    const tests = fs.readdirSync(path.join(scratch, 'capability', 'X001', 'tests')).filter((name) => name.endsWith('.test.cjs')).sort()
      .map((name) => `capability\\X001\\tests\\${name}`);
    const gitDir = git(['rev-parse', '--absolute-git-dir']).toString('utf8').trim();
    console.log(`# fresh-tree: form=${form} own=${ownFrom || 'working tree'} suites=${tests.length} cwd=${scratch}`);
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=250000', '--test-reporter=tap', ...tests],
      { cwd: scratch, env: { ...childEnvironment(), GIT_DIR: gitDir }, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    status = result.status === null ? 1 : result.status;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  process.exitCode = status;
}

main();
