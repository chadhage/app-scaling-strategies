'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const put = (file, data) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data, { flag: 'wx' });
};
const json = (file, value) => put(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: null });
  if (run.status !== 0) throw new Error(String(run.stderr));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const atomic = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow'));
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const list = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? list(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]);
const mode = process.argv[2];

if (mode === 'source') {
  const baselineCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const files = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const snapshots = [];
  const contents = [];
  for (const [index, file] of files.entries()) {
    const raw = fs.readFileSync(path.join(repo, file));
    const objectPath = `${baselineCommit}:${file.replace(/\\/g, '/')}`;
    const gitBlob = git(['rev-parse', objectPath]).toString().trim();
    const committed = git(['cat-file', 'blob', gitBlob]);
    const name = ['readme', 'backlog', 'kanban'][index];
    const snapshot = `evidence\\source\\${name}.working.snapshot`;
    const gitSnapshot = `evidence\\source\\${name}.git.snapshot`;
    put(snapshot, raw);
    put(gitSnapshot, committed);
    const text = raw.toString('utf8');
    const gitText = committed.toString('utf8');
    const extract = index === 0 ? (value) => row(value, 'S068')
      : index === 1 ? (value) => row(value, 'D-S068')
        : (value) => [row(value, 'A-S068'), row(value, 'B-S068'),
          atomic(value).replace(/\r\n/g, '\n'), packet(value)].join('\n');
    if (!extract(text) || extract(text) !== extract(gitText)) {
      throw new Error(`Exact S068 acceptance drift in ${file}`);
    }
    snapshots.push({
      path: file, snapshot, gitSnapshot, gitBlob,
      rawBytes: raw.length, rawSha256: sha(raw), rawHasCRLF: raw.includes(Buffer.from('\r\n')),
      rawCanonicalSha256: sha(canonical(raw)),
      canonicalGitBytes: committed.length, canonicalGitSha256: sha(committed),
      wholeFileCanonicalEquality: canonical(raw).equals(canonical(committed)),
      exactAcceptanceSlicesMatch: true,
    });
    contents.push(text);
  }
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S068', parentId: 'D-S068', nativeSibling: 'B-S068',
    kano: 'S', kanoUnit: 'A-S068', packet: 'SC-S068', owner: 'worker-A-S068',
    ownedScope: 'learning\\S068\\**', entryGate: 'SOURCE', baselineCommit,
    sourceCapturedAtUtc: new Date().toISOString(), sourceReadBeforeBehaviorDesign: true,
    sourceRow: row(contents[0], 'S068'), backlogRow: row(contents[1], 'D-S068'),
    cardRow: row(contents[2], 'A-S068'), nativeRow: row(contents[2], 'B-S068'),
    atomicAndPortableContract: atomic(contents[2]), packetRule: packet(contents[2]),
    files: snapshots,
    acceptanceBoundary: 'Synthetic capability, lock and request receipts only. No actual database index, lock, load or native capability observation. B-S068 and D-S068 remain incomplete.',
    refinement: 'One frozen S unit. Only the bounded online/blocking comparison; no source-parent, native, test, plumbing or refinement credit. No shared To Do edits.',
  });
  console.log('Exact S068 acceptance captured: raw working bytes and immutable canonical Git blobs.');
} else if (['red', 'model-green', 'browser-green', 'focused-green'].includes(mode)) {
  const files = process.argv.slice(3);
  if (!files.length || files.some((file) => !/^tests\\[\w.-]+\.test\.cjs$/.test(file))) {
    throw new Error('Supply exact owned tests\\*.test.cjs paths.');
  }
  if (files.some((file) => file.endsWith('browser.test.cjs'))
      && mode === 'browser-green' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser proof capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const snapshots = [];
  if (mode === 'red') {
    for (const file of ['index-under-load.feature', 'fixture.js', 'model.js', ...files]) {
      const data = fs.readFileSync(path.join(root, file));
      const snapshot = `evidence\\red\\${path.basename(file)}.snapshot`;
      put(snapshot, data);
      snapshots.push({ source: file, snapshot, bytes: data.length, sha256: sha(data) });
    }
  }
  const startedAtUtc = new Date().toISOString();
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', ...files];
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: null, timeout: 240000 });
  const stdout = run.stdout || Buffer.alloc(0);
  const stderr = run.stderr || Buffer.alloc(0);
  put(`evidence\\${mode}\\stdout.raw`, stdout);
  put(`evidence\\${mode}\\stderr.raw`, stderr);
  const text = stdout.toString() + stderr.toString();
  const count = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  const assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/.test(text);
  json(`evidence\\${mode}\\run.json`, {
    schemaVersion: 1, cardId: 'A-S068', workerId: 'worker-A-S068', mode,
    command: `node ${args.join(' ')}`, cwd: 'learning\\S068', runtime: process.version,
    startedAtUtc, completedAtUtc: new Date().toISOString(),
    exitCode: run.status, signal: run.signal, spawnError: run.error?.message || null,
    tests: count('tests'), passed: count('pass'), failed: count('fail'),
    assertionFailures, missingCodeOrTools, rawStdoutSha256: sha(stdout),
    rawStderrSha256: sha(stderr), snapshots,
    sourceHashes: Object.fromEntries(['fixture.js', 'model.js', ...files].map((file) =>
      [file, sha(canonical(fs.readFileSync(path.join(root, file))))])),
    browserCaptureExplicitlyEnabled: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  });
  if (mode === 'red') {
    if (run.status !== 1 || assertionFailures < 1 || missingCodeOrTools || run.error) {
      throw new Error(`Not a qualified behavioral RED:\n${text}`);
    }
  } else if (run.status !== 0 || count('fail') !== 0 || run.error) {
    throw new Error(`Green verification failed:\n${text}`);
  }
  console.log(`${mode}: exit ${run.status}; ${count('pass')} passed, ${count('fail')} failed; ${assertionFailures} assertion failures.`);
} else if (mode === 'iac-na') {
  const red = JSON.parse(fs.readFileSync(path.join(root, 'evidence\\red\\run.json'), 'utf8'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) {
    throw new Error('Record a genuine behavioral RED before the IaC step.');
  }
  json('evidence\\iac-na.json', {
    cardId: 'A-S068', workerId: 'worker-A-S068', recordedAtUtc: new Date().toISOString(),
    status: 'N/A', afterBehavioralRed: red.completedAtUtc, beforeImplementation: true,
    reason: 'Resource-free standalone synthetic HTML/JavaScript lesson. No database or infrastructure is created, changed or contacted.',
    authorization: 'local-synthetic-only',
    noActions: ['cloud', 'IaC', 'scaffold', 'identity', 'credentials', 'deploy', 'spend',
      'packages', 'framework', 'downloads', 'native index build', 'actual database locks or load'],
  });
  console.log('IaC N/A recorded after behavioral RED and before implementation.');
} else if (mode === 'syntax') {
  const files = list().filter((file) => /\.(?:js|cjs)$/.test(file));
  const startedAtUtc = new Date().toISOString();
  const runs = files.map((file) => ({
    file: path.relative(root, file),
    run: spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: null }),
  }));
  const stdout = Buffer.concat(runs.map(({ run }) => run.stdout || Buffer.alloc(0)));
  const stderr = Buffer.concat(runs.map(({ run }) => run.stderr || Buffer.alloc(0)));
  put('evidence\\syntax\\stdout.raw', stdout);
  put('evidence\\syntax\\stderr.raw', stderr);
  json('evidence\\syntax\\run.json', {
    startedAtUtc, completedAtUtc: new Date().toISOString(), runtime: process.version,
    files: runs.map(({ file, run }) => ({ file, exitCode: run.status,
      canonicalSha256: sha(canonical(fs.readFileSync(path.join(root, file)))) })),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  });
  if (runs.some(({ run }) => run.status !== 0 || run.error)) throw new Error(String(stderr));
  console.log(`Syntax: ${files.length} owned JavaScript files passed.`);
} else if (mode === 'seal') {
  const files = list().filter((file) => path.relative(root, file) !== 'evidence\\integrity.json');
  json('evidence\\integrity.json', {
    schemaVersion: 1, cardId: 'A-S068', createdAtUtc: new Date().toISOString(),
    excludes: ['evidence\\integrity.json'],
    rawPolicy: 'Only source snapshots, RED snapshots and named raw command output are byte-exact. Text source is qualified as canonical Git LF.',
    files: files.sort().map((file) => {
      const relative = path.relative(root, file);
      const raw = /^evidence\\source\\.+\.snapshot$|^evidence\\red\\.+\.snapshot$|^evidence\\(?:red|model-green|browser-green|focused-green|syntax)\\.+\.raw$/.test(relative);
      const data = fs.readFileSync(file);
      return { file: relative, mode: raw ? 'raw' : 'canonical-lf',
        bytes: (raw ? data : canonical(data)).length, sha256: sha(raw ? data : canonical(data)) };
    }),
  });
  console.log(`Sealed ${files.length} owned files; normal verification never rewrites proof.`);
} else {
  throw new Error('Use source, red, iac-na, model-green, browser-green, focused-green, syntax or seal. Capture never overwrites proof.');
}
