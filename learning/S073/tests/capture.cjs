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
const json = (file, data) => put(file, `${JSON.stringify(data, null, 2)}\n`);
const git = (args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: null });
  if (run.status !== 0) throw new Error(String(run.stderr));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const contract = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow')).replace(/\r\n/g, '\n');
const packetRule = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const mode = process.argv[2];

if (mode === 'source') {
  const baselineCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const names = ['readme', 'backlog', 'kanban'];
  const files = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const evidence = [];
  const contents = [];
  for (const [i, file] of files.entries()) {
    const raw = fs.readFileSync(path.join(repo, file));
    const gitBlob = git(['rev-parse', `${baselineCommit}:${file.replace(/\\/g, '/')}`]).toString().trim();
    const committed = git(['cat-file', 'blob', gitBlob]);
    const snapshot = `evidence\\source\\${names[i]}.working.snapshot`;
    const gitSnapshot = `evidence\\source\\${names[i]}.git.snapshot`;
    put(snapshot, raw);
    put(gitSnapshot, committed);
    const text = raw.toString('utf8');
    const gitText = committed.toString('utf8');
    const extract = i === 0 ? (value) => row(value, 'S073')
      : i === 1 ? (value) => row(value, 'D-S073')
        : (value) => [row(value, 'A-S073'), row(value, 'B-S073'), contract(value), packetRule(value)].join('\n');
    if (!row(text, ['S073', 'D-S073', 'A-S073'][i]) || extract(text) !== extract(gitText)) {
      throw new Error(`Exact source acceptance mismatch: ${file}`);
    }
    evidence.push({
      path: file, snapshot, gitSnapshot, gitBlob,
      rawBytes: raw.length, rawSha256: sha(raw), rawHasCRLF: raw.includes(Buffer.from('\r\n')),
      canonicalWorkingSha256: sha(canonical(raw)),
      gitBytes: committed.length, gitSha256: sha(committed),
      canonicalWholeFileEqual: canonical(raw).equals(canonical(committed)),
      exactAcceptanceSlicesMatch: true,
    });
    contents.push(text);
  }
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S073', parentId: 'D-S073', nativeSibling: 'B-S073',
    kano: 'S', kanoUnit: 'A-S073', packet: 'SC-S073', owner: 'worker-A-S073',
    ownedScope: 'learning\\S073\\**', entryGate: 'SOURCE', baselineCommit,
    capturedAtUtc: new Date().toISOString(), exactSourceReadBeforeBehaviorDesign: true,
    sourceLocation: 'The exact S073 row in root README.md; no separate source S073 directory is present.',
    sourceRow: row(contents[0], 'S073'), backlogRow: row(contents[1], 'D-S073'),
    cardRow: row(contents[2], 'A-S073'), nativeRow: row(contents[2], 'B-S073'),
    atomicAndPortableContract: contract(contents[2]), packetRule: packetRule(contents[2]), files: evidence,
    boundary: 'Only synthetic cache loss and required-profile recovery decisions; no real authentication, session, identity, durable store or outage.',
    originalAcceptanceUnfulfilled: 'B-S073 and D-S073 require actual approved durable recovery/outage proof within budgets.',
  });
  console.log('Captured exact S073 acceptance, raw working bytes and immutable canonical Git blobs.');
} else if (['red', 'green', 'browser', 'browser-final', 'final-green'].includes(mode)) {
  const files = process.argv.slice(3);
  if (!files.length || files.some((file) => !/^tests\\[\w.-]+\.test\.cjs$/.test(file))) {
    throw new Error('Specify exact owned tests\\*.test.cjs paths.');
  }
  if (mode.startsWith('browser') && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const snapshots = [];
  if (mode === 'red') {
    for (const file of ['cache-outage.feature', 'model.js', ...files]) {
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
  const assertions = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/.test(text);
  json(`evidence\\${mode}\\run.json`, {
    schemaVersion: 1, cardId: 'A-S073', workerId: 'worker-A-S073', mode,
    command: `node ${args.join(' ')}`, cwd: 'learning\\S073', runtime: process.version,
    startedAtUtc, completedAtUtc: new Date().toISOString(),
    exitCode: run.status, signal: run.signal, spawnError: run.error?.message || null,
    tests: count('tests'), passed: count('pass'), failed: count('fail'),
    assertionFailures: assertions, missingCodeOrTools,
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr), snapshots,
    browserCaptureExplicitlyEnabled: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
    canonicalSourceHashes: Object.fromEntries(['model.js', ...files].map((file) =>
      [file, sha(canonical(fs.readFileSync(path.join(root, file))))])),
  });
  if (mode === 'red') {
    if (run.status !== 1 || assertions < 1 || missingCodeOrTools || run.error) {
      throw new Error(`Unqualified behavioral RED:\n${text}`);
    }
  } else if (run.status !== 0 || count('fail') || run.error) {
    throw new Error(`Verification failed:\n${text}`);
  }
  console.log(`${mode}: exit ${run.status}; ${count('pass')} passed; ${count('fail')} failed; ${assertions} assertion failures.`);
} else {
  throw new Error('Use source, red, green, browser, browser-final or final-green. Capture is exclusive and never overwrites evidence.');
}
