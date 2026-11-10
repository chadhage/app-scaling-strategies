'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const namespace = path.resolve(__dirname, '..');
const root = path.resolve(namespace, '..', '..');
const mode = process.argv[2];
const work = process.env.C011_FRESH_WORK;
const output = process.env.C011_FRESH_OUTPUT;
const repository = process.env.C011_GIT_REPOSITORY;
assert.ok(['lf', 'crlf'].includes(mode));
const within = (value) => {
  const relative = typeof value === 'string' ? path.relative(path.join(root, 'private'), value) : '..';
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
assert.ok(within(work) && within(output) && repository && path.isAbsolute(repository), 'fresh work and evidence must be explicitly owned');
assert.equal(fs.existsSync(work), false);
assert.equal(fs.existsSync(output), false);
const context = JSON.parse(fs.readFileSync(path.join(namespace, 'dependency-context.json')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const archives = [];
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'C011_SUBJECT_DIR']) delete env[name];

function extract(buffer, expected) {
  const observed = [];
  for (let at = 0; at + 512 <= buffer.length;) {
    const header = buffer.subarray(at, at + 512);
    if (header.every((value) => value === 0)) break;
    const string = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const name = string(0, 100);
    const size = parseInt(string(124, 12).trim() || '0', 8);
    const type = string(156, 1);
    assert.ok(Number.isSafeInteger(size) && size >= 0);
    const bytes = buffer.subarray(at + 512, at + 512 + size);
    if (type === '0' || type === '') {
      assert.ok(expected.has(name), 'archive contains only the exact accepted dependency files');
      const target = path.join(work, ...name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      observed.push({ path: name, sha256: hash(bytes) });
    } else assert.ok(type === '5' || type === 'g', 'no symlink, hardlink or unknown archive member is accepted');
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual(observed.map((entry) => entry.path).sort(), [...expected].sort());
  return observed;
}

function convert(directory, evidence = false) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) convert(file, evidence || entry.name === 'evidence');
    else if (!evidence && entry.name !== 'qualified.json' && /\.(?:cjs|js|json|html|css|md|feature)$/.test(entry.name)) {
      const lf = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      fs.writeFileSync(file, mode === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf);
    }
  }
}

fs.mkdirSync(work, { recursive: false });
let result;
try {
  for (const card of ['C009', 'C010']) {
    const sources = context.sources.filter((source) => source.card === card);
    const paths = sources.map((source) => source.path.replaceAll('\\', '/'));
    const bytes = execFileSync('git', ['-C', repository, '--no-pager', 'archive', '--format=tar', context.commits[card], ...paths], { env, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    archives.push({ card, commit: context.commits[card], archiveSha256: hash(bytes), members: extract(bytes, new Set(paths)) });
  }
  fs.mkdirSync(path.join(work, 'capability', 'C011'), { recursive: true });
  fs.cpSync(namespace, path.join(work, 'capability', 'C011'), { recursive: true, errorOnExist: false });
  fs.cpSync(path.join(root, 'testing', 'browser'), path.join(work, 'testing', 'browser'), { recursive: true });
  convert(path.join(work, 'capability'));
  convert(path.join(work, 'testing', 'browser'));
  env.C011_ASSERTION_DIR = path.join(work, 'assertions');
  const args = [path.join(work, 'capability', 'C011', 'tests', 'suite.cjs'), process.env.C011_FRESH_FINAL === '1' ? 'final' : 'core'];
  result = spawnSync(process.execPath, args, { cwd: work, env, windowsHide: true, timeout: 1200000, maxBuffer: 128 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  const text = (result.stdout || Buffer.alloc(0)).toString('utf8');
  const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? -1)]));
  const assertions = /C011_ASSERTIONS (.+)$/m.exec(text)?.[1];
  fs.writeFileSync(output, JSON.stringify({
    schema: 'C011-fresh/1', mode, ownSource: 'exact single frozen unpublished candidate; not falsely attributed to HEAD',
    dependencies: 'actual git archive of current accepted commits', evidenceAndPolicyBytesConverted: false,
    archives, code: result.status, signal: result.signal, spawnError: result.error?.message || null, summary,
    assertions: assertions ? JSON.parse(assertions) : null,
    stdoutSha256: hash(result.stdout || Buffer.alloc(0)), stderrSha256: hash(result.stderr || Buffer.alloc(0))
  }, null, 2) + '\n', { flag: 'wx' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, 'the whole fresh namespace must pass');
} finally {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
