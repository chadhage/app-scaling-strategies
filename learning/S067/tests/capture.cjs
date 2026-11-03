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
    const snapshot = `evidence/source/${name}.working.snapshot`;
    const gitSnapshot = `evidence/source/${name}.git.snapshot`;
    put(snapshot, raw);
    put(gitSnapshot, committed);
    const text = raw.toString('utf8');
    const gitText = committed.toString('utf8');
    const extract = index === 0 ? (value) => row(value, 'S067')
      : index === 1 ? (value) => row(value, 'D-S067')
        : (value) => [row(value, 'A-S067'), row(value, 'B-S067'),
          atomic(value).replace(/\r\n/g, '\n'), packet(value)].join('\n');
    if (extract(text) !== extract(gitText)) throw new Error(`Acceptance drift in ${file}`);
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
  json('evidence/source-contract.json', {
    schemaVersion: 1, cardId: 'A-S067', parentId: 'D-S067', nativeSibling: 'B-S067',
    kano: 'S', kanoUnit: 'A-S067', packet: 'SC-S067', owner: 'worker-A-S067',
    ownedScope: 'learning\\S067\\**', entryGate: 'SOURCE', baselineCommit,
    sourceCapturedAtUtc: new Date().toISOString(), sourceReadBeforeBehaviorDesign: true,
    sourceRow: row(contents[0], 'S067'), backlogRow: row(contents[1], 'D-S067'),
    cardRow: row(contents[2], 'A-S067'), nativeRow: row(contents[2], 'B-S067'),
    atomicAndPortableContract: atomic(contents[2]), packetRule: packet(contents[2]),
    files: snapshots,
    distinction: 'Controlled lag and a declared freshness budget on an existing reader; not S061 reader expansion, sharding, failover or writer transfer.',
    acceptanceBoundary: 'Actual database lag, routing and freshness remain unproved. B-S067 and D-S067 remain incomplete.',
    refinement: 'One frozen S unit. No extra test, plumbing, refinement, native or duplicate lesson units; no shared To Do edits.',
  });
  console.log('Exact S067 source acceptance, raw bytes and immutable Git blobs captured.');
} else if (['red', 'initial-green', 'browser-green'].includes(mode)) {
  const files = process.argv.slice(3);
  if (!files.length || files.some((file) => !/^tests\\[\w.-]+\.test\.cjs$/.test(file))) {
    throw new Error('Pass exact owned tests\\*.test.cjs paths.');
  }
  const snapshots = [];
  if (mode === 'red') {
    for (const file of ['replica-lag.feature', 'fixture.js', 'model.js', ...files]) {
      const data = fs.readFileSync(path.join(root, file));
      const snapshot = `evidence/red/${path.basename(file)}.snapshot`;
      put(snapshot, data);
      snapshots.push({ source: file, snapshot, bytes: data.length, sha256: sha(data) });
    }
  }
  const startedAtUtc = new Date().toISOString();
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', ...files];
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: null, timeout: 240000 });
  const stdout = run.stdout || Buffer.alloc(0);
  const stderr = run.stderr || Buffer.alloc(0);
  put(`evidence/${mode}/stdout.raw`, stdout);
  put(`evidence/${mode}/stderr.raw`, stderr);
  const text = stdout.toString() + stderr.toString();
  const count = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  const assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/.test(text);
  json(`evidence/${mode}/run.json`, {
    schemaVersion: 1, cardId: 'A-S067', workerId: 'worker-A-S067', mode,
    command: `node ${args.join(' ')}`, cwd: 'learning\\S067', runtime: process.version,
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
} else {
  throw new Error('Use source, red, initial-green or browser-green; capture never overwrites proof.');
}
