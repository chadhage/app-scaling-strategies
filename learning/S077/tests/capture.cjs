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
  if (run.status !== 0 || run.error) throw new Error(String(run.stderr || run.error));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const contract = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow'));
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const mode = process.argv[2];

if (mode === 'source') {
  const baselineCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const contents = [];
  const files = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'].map((file, index) => {
    const raw = fs.readFileSync(path.join(repo, file));
    const gitBlob = git(['rev-parse', `${baselineCommit}:${file.replace(/\\/g, '/')}`]).toString().trim();
    const blob = git(['cat-file', 'blob', gitBlob]);
    const name = ['readme', 'backlog', 'kanban'][index];
    const snapshot = `evidence\\source\\${name}.working.snapshot`;
    const gitSnapshot = `evidence\\source\\${name}.git.snapshot`;
    const text = raw.toString('utf8');
    const extract = index === 0 ? (value) => row(value, 'S077')
      : index === 1 ? (value) => row(value, 'D-S077')
        : (value) => [row(value, 'A-S077'), row(value, 'B-S077'),
          contract(value).replace(/\r\n/g, '\n'), packet(value)].join('\n');
    if (!extract(text) || extract(text) !== extract(blob.toString('utf8'))) {
      throw new Error(`Missing or changed exact acceptance: ${file}`);
    }
    put(snapshot, raw);
    put(gitSnapshot, blob);
    contents.push(text);
    return {
      path: file, snapshot, gitSnapshot, gitBlob, rawBytes: raw.length, rawSha256: sha(raw),
      rawHasCRLF: raw.includes(Buffer.from('\r\n')), rawCanonicalSha256: sha(canonical(raw)),
      gitBytes: blob.length, gitSha256: sha(blob),
      wholeFileCanonicalEquality: canonical(raw).equals(canonical(blob)),
      exactAcceptanceSlicesMatch: true,
    };
  });
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S077', parentId: 'D-S077', nativeSibling: 'B-S077',
    kano: 'S', kanoUnit: 'A-S077', packet: 'SC-S077', owner: 'worker-A-S077',
    entryGate: 'SOURCE', ownedScope: 'learning\\S077\\**', baselineCommit,
    capturedAtUtc: new Date().toISOString(), sourceReadBeforeBehaviorDesign: true,
    sourceRow: row(contents[0], 'S077'), backlogRow: row(contents[1], 'D-S077'),
    cardRow: row(contents[2], 'A-S077'), nativeRow: row(contents[2], 'B-S077'),
    atomicAndPortableContract: contract(contents[2]), packetRule: packet(contents[2]), files,
    acceptanceBoundary: 'Synthetic message redelivery only. B-S077 and D-S077 remain incomplete; no actual broker redelivery, idempotency or durable business-effect certification.',
    distinction: 'One message redelivered after modeled lock expiry, with separate delivery and business-effect ledgers. Not replacement S075 consumer expansion, S076 consumer retirement, S078 scheduler fencing or S084 command idempotency.',
    refinement: 'Keep one frozen S unit. Tests, browser proof, tooling and refinement earn no additional units; no unowned To Do edits.',
  });
  console.log('Captured exact S077 acceptance, raw CRLF provenance and immutable Git blobs.');
} else if (mode === 'iac-na') {
  const red = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', 'run.json'), 'utf8'));
  if (red.exitCode !== 1 || red.assertionFailures !== 8 || red.missingCodeOrTools) {
    throw new Error('IaC decision requires the genuine behavioral RED first.');
  }
  json('evidence\\iac-decision.json', {
    cardId: 'A-S077', status: 'N/A', stage: 'after behavioral RED; before behavior implementation',
    decidedAtUtc: new Date().toISOString(), afterRedCompletedAtUtc: red.completedAtUtc,
    reason: 'Resource-free local synthetic message-redelivery lesson. No cloud, IaC, scaffold, identity, credentials, deployment or expenditure is authorized.',
    resourcesCreated: 0, managementCalls: 0, generatedInfrastructureFiles: 0,
  });
  console.log('Recorded IaC N/A after behavioral RED and before implementation.');
} else if (['red', 'focused-green', 'browser-green'].includes(mode)) {
  const files = process.argv.slice(3);
  if (!files.length || files.some((file) => !/^tests\\[\w.-]+\.test\.cjs$/.test(file))) {
    throw new Error('Use explicit owned tests\\*.test.cjs paths.');
  }
  if (mode === 'browser-green' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const snapshots = [];
  if (mode === 'red') {
    for (const file of ['message-redelivery.feature', 'model.js', ...files]) {
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
    schemaVersion: 1, cardId: 'A-S077', workerId: 'worker-A-S077', mode,
    command: `node ${args.join(' ')}`, cwd: 'learning\\S077', runtime: process.version,
    startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: run.status,
    signal: run.signal, spawnError: run.error?.message || null,
    tests: count('tests'), passed: count('pass'), failed: count('fail'),
    assertionFailures, missingCodeOrTools, rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
    snapshots, sourceHashes: Object.fromEntries(['model.js', ...files].map((file) =>
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
  throw new Error('Use source, red, iac-na, focused-green or browser-green. Capture never overwrites proof.');
}
