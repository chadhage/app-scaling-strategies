'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const stage = process.argv[2];
if (!['red', 'initial-green', 'focused-green', 'syntax', 'seal'].includes(stage)) {
  throw new Error('Choose a deliberate capture stage: red, initial-green, focused-green, syntax, seal.');
}
const git = (args, input, cwd = repo) => {
  const run = spawnSync('git', args, { cwd, input, encoding: null });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return run.stdout;
};
function proofHashes() {
  const hashes = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'verification') walk(absolute);
      } else hashes[path.relative(root, absolute)] = sha(fs.readFileSync(absolute));
    }
  };
  walk(path.join(root, 'evidence'));
  return hashes;
}
if (stage === 'seal') {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) walk(absolute);
      else if (relative !== path.join('evidence', 'content-index.json')
          && !relative.startsWith(path.join('evidence', 'verification') + path.sep)) {
        const bytes = fs.readFileSync(absolute);
        const binary = /\.(?:snapshot|gz)$/.test(relative);
        const canonical = binary ? bytes : lf(bytes);
        files.push({
          path: relative, mode: binary ? 'binary' : 'text-lf', bytes: canonical.length,
          sha256: sha(canonical),
          gitBlobSha1: git(['hash-object', '--', entry.name], undefined, directory).toString().trim(),
        });
      }
    }
  }
  walk(root);
  json(path.join(root, 'evidence', 'content-index.json'), {
    cardId: 'A-S061', createdAtUtc: new Date().toISOString(),
    mode: 'canonical Git text LF; raw binary snapshots and gzip',
    exclusions: ['evidence\\content-index.json', 'evidence\\verification\\**'],
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  });
} else {
  const directory = stage === 'red' ? path.join(root, 'evidence', 'red')
    : path.join(root, 'evidence', 'verification');
  fs.mkdirSync(directory, { recursive: true });
  const prefix = stage === 'red' ? 'run' : stage;
  const recordPath = path.join(directory, prefix + '.json');
  if (fs.existsSync(recordPath)) throw new Error('Capture is append-only; do not overwrite existing provenance.');
  const record = {
    cardId: 'A-S061', workerId: 'worker-A-S061', stage, runtime: process.version,
    startedAtUtc: new Date().toISOString(),
    deliberateBrowserCapture: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  if (stage === 'red') {
    record.snapshots = ['read-replica.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
      const snapshot = path.basename(source) + '.snapshot';
      const bytes = fs.readFileSync(path.join(root, source));
      fs.writeFileSync(path.join(directory, snapshot), bytes);
      return { source, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    });
  }
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  if (stage === 'syntax') {
    const files = ['fixtures.js', 'model.js', 'app.js', 'tests\\capture.cjs', 'tests\\model.test.cjs',
      'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs'];
    record.checks = files.map((file) => {
      const run = spawnSync(process.execPath, ['--check', path.join(root, file)], { cwd: repo, encoding: null });
      stdout = Buffer.concat([stdout, run.stdout || Buffer.alloc(0)]);
      stderr = Buffer.concat([stderr, run.stderr || Buffer.alloc(0)]);
      return { file, exitCode: run.status, sourceSha256: sha(lf(fs.readFileSync(path.join(root, file)))) };
    });
    record.exitCode = record.checks.every((check) => check.exitCode === 0) ? 0 : 1;
  } else {
    const files = stage === 'red' ? ['model.test.cjs']
      : stage === 'initial-green' ? ['model.test.cjs', 'surface.test.cjs', 'browser.test.cjs']
        : ['model.test.cjs', 'surface.test.cjs', 'integrity.test.cjs', 'browser.test.cjs'];
    const args = ['--test', '--test-reporter=tap', ...files.map((file) => path.join(root, 'tests', file))];
    record.command = [process.execPath, ...args];
    if (stage === 'focused-green') record.proofBefore = proofHashes();
    const run = spawnSync(process.execPath, args, { cwd: repo, encoding: null, maxBuffer: 20 * 1024 * 1024 });
    stdout = run.stdout || Buffer.alloc(0);
    stderr = run.stderr || Buffer.alloc(0);
    record.exitCode = run.status;
    record.signal = run.signal;
    record.spawnError = run.error ? run.error.message : null;
    const text = stdout.toString() + stderr.toString();
    for (const [field, marker] of [['tests', 'tests'], ['passed', 'pass'], ['failed', 'fail']]) {
      record[field] = Number(text.match(new RegExp(`^# ${marker} (\\d+)$`, 'm'))?.[1] || 0);
    }
    record.assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
    record.missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError: Cannot/.test(text);
    if (stage === 'focused-green') {
      record.proofAfter = proofHashes();
      record.normalVerificationReadOnlyToProof = JSON.stringify(record.proofBefore) === JSON.stringify(record.proofAfter);
      if (!record.normalVerificationReadOnlyToProof) record.exitCode = 1;
    }
    fs.writeFileSync(path.join(directory, stage + '.tap'), text.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
  }
  record.completedAtUtc = new Date().toISOString();
  record.rawStdoutSha256 = sha(stdout);
  record.rawStderrSha256 = sha(stderr);
  fs.writeFileSync(path.join(directory, prefix + '.stdout.raw.gz'), zlib.gzipSync(stdout));
  fs.writeFileSync(path.join(directory, prefix + '.stderr.raw.gz'), zlib.gzipSync(stderr));
  json(recordPath, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (stage === 'red') {
    if (record.exitCode !== 1 || record.assertionFailures < 1 || record.missingCodeOrTools) {
      throw new Error('Unqualified RED: expected real behavioral assertions, not missing code, tooling or syntax.');
    }
  } else if (record.exitCode !== 0) process.exitCode = 1;
}
