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
const git = (args, input) => {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null });
  if (result.status !== 0 || result.error) throw new Error(String(result.stderr || result.error));
  return result.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const section = (text, begin, end) => {
  const normalized = canonical(Buffer.from(text)).toString();
  const start = normalized.indexOf(begin);
  const stop = normalized.indexOf(end, start + begin.length);
  if (start < 0 || stop < 0) throw new Error(`Missing exact source section: ${begin}`);
  return normalized.slice(start, stop);
};
const packetRule = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]).sort();
const mode = process.argv[2];

if (mode === 'source') {
  const baselineCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const sources = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const contents = [];
  const entries = sources.map((file, index) => {
    const raw = fs.readFileSync(path.join(repo, file));
    const gitBlob = git(['rev-parse', `${baselineCommit}:${file.replace(/\\/g, '/')}`]).toString().trim();
    const blob = git(['cat-file', 'blob', gitBlob]);
    const name = ['readme', 'backlog', 'kanban'][index];
    const snapshot = `evidence\\raw\\source\\${name}.working.snapshot`;
    const gitSnapshot = `evidence\\raw\\source\\${name}.git.snapshot`;
    const acceptance = (data) => {
      const text = data.toString('utf8');
      if (index === 0) return [row(text, 'S078'),
        section(text, '## Acceptance and evidence', '## Recommended demonstration sequence')].join('\n');
      if (index === 1) return row(text, 'D-S078');
      return [row(text, 'A-S078'), row(text, 'B-S078'),
        section(text, '## Atomic card contract', '## Concurrent pull and one-piece flow'), packetRule(text)].join('\n');
    };
    if (!acceptance(raw) || acceptance(raw) !== acceptance(blob)) throw new Error(`Exact source acceptance changed: ${file}`);
    put(snapshot, raw);
    put(gitSnapshot, blob);
    contents.push(raw.toString('utf8'));
    return {
      path: file, snapshot, gitSnapshot, gitBlob,
      rawBytes: raw.length, rawSha256: sha(raw), rawHasCRLF: raw.includes(Buffer.from('\r\n')),
      rawCanonicalSha256: sha(canonical(raw)), gitBytes: blob.length, gitSha256: sha(blob),
      wholeFileCanonicalEquality: canonical(raw).equals(canonical(blob)), exactAcceptanceSlicesMatch: true,
    };
  });
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S078', parentId: 'D-S078', nativeSibling: 'B-S078',
    kano: 'S', kanoUnit: 'A-S078', packet: 'SC-S078', workerId: 'worker-A-S078',
    entryGate: 'SOURCE', ownedScope: 'learning\\S078\\**', baselineCommit,
    capturedAtUtc: new Date().toISOString(), exactSourceReadBeforeBehaviorDesign: true,
    sourceRow: row(contents[0], 'S078'), backlogRow: row(contents[1], 'D-S078'),
    cardRow: row(contents[2], 'A-S078'), nativeRow: row(contents[2], 'B-S078'),
    atomicAndPortableContract: section(contents[2], '## Atomic card contract', '## Concurrent pull and one-piece flow'),
    acceptanceAndEvidence: section(contents[0], '## Acceptance and evidence', '## Recommended demonstration sequence'),
    packetRule: packetRule(contents[2]), files: entries,
    boundary: 'Portable synthetic scheduler lesson only. B-S078 and D-S078 remain incomplete; no real scheduler, ownership lease, fencing or scheduled-effect execution certification.',
    refinement: 'One frozen S unit; all four bounded configurations serve the same occurrence-ownership objective. No unrelated To Do edits; tests, plumbing and refinement earn no additional credit.',
  });
  console.log('Exact source acceptance captured with raw working CRLF and immutable Git blobs.');
} else if (mode === 'iac-na') {
  const red = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red.json'), 'utf8'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) {
    throw new Error('IaC decision requires genuine assertion RED first.');
  }
  json('evidence\\iac-decision.json', {
    cardId: 'A-S078', status: 'N/A', decidedAtUtc: new Date().toISOString(),
    stage: 'after behavioral RED; before implementation', afterRedCompletedAtUtc: red.completedAtUtc,
    reason: 'Resource-free synthetic lesson. No cloud, IaC, scaffold, identity, credentials, deployment or spending authorized.',
    resourcesCreated: 0, managementCalls: 0, generatedInfrastructureFiles: 0,
  });
  console.log('IaC N/A recorded after behavioral RED.');
} else if (['red', 'focused-green', 'browser-green'].includes(mode)) {
  const selected = process.argv.slice(3);
  if (!selected.length || selected.some((file) => !/^tests\\[\w.-]+\.test\.cjs$/.test(file))) {
    throw new Error('Use explicit owned tests\\*.test.cjs paths.');
  }
  if (mode === 'browser-green' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const snapshots = [];
  if (mode === 'red') {
    for (const file of ['scheduler-fencing.feature', 'model.js', ...selected]) {
      const data = fs.readFileSync(path.join(root, file));
      const snapshot = `evidence\\raw\\red\\${path.basename(file)}.snapshot`;
      put(snapshot, data);
      snapshots.push({ source: file, snapshot, bytes: data.length, sha256: sha(data) });
    }
  }
  const startedAtUtc = new Date().toISOString();
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', ...selected];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: null, timeout: 240000 });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const stdoutPath = `evidence\\raw\\${mode}\\stdout.tap.raw`;
  const stderrPath = `evidence\\raw\\${mode}\\stderr.raw`;
  put(stdoutPath, stdout);
  put(stderrPath, stderr);
  const text = stdout.toString() + stderr.toString();
  const count = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  const assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/.test(text);
  json(`evidence\\${mode}.json`, {
    schemaVersion: 1, cardId: 'A-S078', workerId: 'worker-A-S078', mode,
    command: `node ${args.join(' ')}`, cwd: 'learning\\S078', runtime: process.version,
    startedAtUtc, completedAtUtc: new Date().toISOString(),
    exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
    tests: count('tests'), passed: count('pass'), failed: count('fail'), assertionFailures, missingCodeOrTools,
    stdoutPath, stderrPath, rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr), snapshots,
    sourceHashes: Object.fromEntries(['model.js', ...selected].map((file) => [file, sha(canonical(fs.readFileSync(path.join(root, file))))])),
    browserCaptureExplicitlyEnabled: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  });
  if (mode === 'red') {
    if (result.status !== 1 || assertionFailures < 1 || missingCodeOrTools || result.error) {
      throw new Error(`Not qualified behavioral RED:\n${text}`);
    }
  } else if (result.status !== 0 || count('fail') !== 0 || result.error) {
    throw new Error(`Not green; retain this evidence without overwriting:\n${text}`);
  }
  console.log(`${mode}: exit ${result.status}; ${count('pass')} passed; ${count('fail')} failed; ${assertionFailures} assertion failures.`);
} else if (mode === 'syntax') {
  const checks = files().filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: null });
    return {
      file, exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
      sourceCanonicalSha256: sha(canonical(fs.readFileSync(path.join(root, file)))),
      stdoutBase64: (result.stdout || Buffer.alloc(0)).toString('base64'),
      stderrBase64: (result.stderr || Buffer.alloc(0)).toString('base64'),
    };
  });
  const outcome = checks.every((check) => check.exitCode === 0 && !check.spawnError) ? 'PASS' : 'FAIL';
  json('evidence\\syntax.json', { cardId: 'A-S078', runtime: process.version, capturedAtUtc: new Date().toISOString(), outcome, checks });
  if (outcome !== 'PASS') throw new Error('Syntax capture failed.');
  console.log(`Syntax PASS: ${checks.length} owned JavaScript files.`);
} else if (mode === 'seal') {
  const entries = files().filter((file) => file !== 'evidence\\content-index.json').map((file) => {
    const raw = fs.readFileSync(path.join(root, file));
    const hashMode = file.startsWith('evidence\\raw\\') ? 'raw' : 'canonical-LF';
    const data = hashMode === 'raw' ? raw : canonical(raw);
    return {
      file, hashMode, bytes: data.length, sha256: sha(data),
      expectedGitBlobSha1: crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'),
    };
  });
  json('evidence\\content-index.json', {
    schemaVersion: 1, cardId: 'A-S078', capturedAtUtc: new Date().toISOString(),
    sourceNormalization: 'CRLF -> LF only outside evidence/raw; raw source, RED snapshots and process outputs are byte-preserved.',
    excludedSelf: 'evidence\\content-index.json', files: entries,
  });
  console.log(`Sealed ${entries.length} files without normalizing raw proof.`);
} else {
  throw new Error('Explicit capture only: source, red, iac-na, focused-green, browser-green, syntax or seal. Existing proof is never overwritten.');
}
