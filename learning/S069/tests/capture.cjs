'use strict';

// Explicit evidence recorder, never imported by the normal verification suite.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const now = () => new Date().toISOString();
function write(file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value, { flag: 'wx' });
}
function json(file, value) { write(file, `${JSON.stringify(value, null, 2)}\n`); }
function git(args) {
  const result = spawnSync('git', args, { cwd: repo });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function acceptance(readme, backlog, kanban) {
  const row = (text, id) => {
    const matches = text.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    if (matches.length !== 1) throw new Error(`Expected exact source row ${id}`);
    return matches[0];
  };
  const section = (text, start, end) => {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    if (from < 0 || to < from) throw new Error(`Missing section ${start}`);
    return text.slice(from, to).replace(/\r\n/g, '\n').trimEnd();
  };
  return {
    readmeS069: row(readme, 'S069'),
    backlogDS069: row(backlog, 'D-S069'),
    cardAS069: row(kanban, 'A-S069'),
    siblingBS069: row(kanban, 'B-S069'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packetPolicy: kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.')),
    sourceEvidencePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
function recordSource() {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const sourcePaths = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = [];
  const committed = [];
  const sources = sourcePaths.map((file, index) => {
    const raw = fs.readFileSync(path.join(repo, file));
    const gitBytes = git(['show', `${baseline}:${file.replace(/\\/g, '/')}`]);
    const workingSnapshot = `evidence\\raw\\source-${index + 1}.working.snapshot`;
    const gitSnapshot = `evidence\\raw\\source-${index + 1}.git.snapshot`;
    write(workingSnapshot, raw);
    write(gitSnapshot, gitBytes);
    working.push(raw.toString());
    committed.push(gitBytes.toString());
    return {
      path: file, workingSnapshot, gitSnapshot, workingBytes: raw.length,
      workingSha256: sha(raw), workingCanonicalSha256: sha(canonical(raw)),
      gitSha256: sha(gitBytes), workingContainsCRLF: raw.includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: canonical(raw).equals(gitBytes),
    };
  });
  const exact = acceptance(...working);
  const equals = JSON.stringify(exact) === JSON.stringify(acceptance(...committed));
  if (!equals) throw new Error('Relevant working acceptance differs from the declared Git baseline.');
  json('evidence\\source-contract.json', {
    cardId: 'A-S069', workerId: 'worker-A-S069', parentId: 'D-S069',
    kano: 'S', kanoUnit: 'A-S069', packet: 'SC-S069', baseline,
    recordedAtUtc: now(), sourceReadBeforeBehaviorDesign: true,
    acceptanceEqualsBaseline: equals, nativeAcceptanceNotCompleted: true,
    sources, acceptance: exact,
    snapshotPolicy: 'Raw working bytes including CRLF are preserved. Git source uses canonical LF; full-document differences are recorded, not concealed.',
  });
}
function recordRun(stage) {
  const isRed = stage === 'red';
  const prefix = isRed ? 'evidence\\red' : 'evidence\\verification';
  const label = isRed ? 'red' : 'model-green';
  const snapshots = [];
  if (isRed) {
    for (const file of ['writer-epochs.feature', 'model.js', 'tests\\model.test.cjs']) {
      const raw = fs.readFileSync(path.join(root, file));
      const snapshot = `${path.basename(file)}.snapshot`;
      write(`${prefix}\\${snapshot}`, raw);
      snapshots.push({ source: file, snapshot, bytes: raw.length, sha256: sha(raw), canonicalSha256: sha(canonical(raw)) });
    }
  }
  const startedAtUtc = now();
  const args = ['--test', '--test-reporter=tap', path.join(root, 'tests', 'model.test.cjs')];
  const run = spawnSync(process.execPath, args, { cwd: repo, timeout: 60000 });
  const output = run.stdout || Buffer.alloc(0);
  const errors = run.stderr || Buffer.alloc(0);
  const combined = output.toString() + errors.toString();
  write(`evidence\\raw\\${label}.stdout.raw`, output);
  write(`evidence\\raw\\${label}.stderr.raw`, errors);
  const count = (name) => Number(combined.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/.test(combined);
  const result = {
    cardId: 'A-S069', stage, startedAtUtc, completedAtUtc: now(), runtime: process.version,
    command: [process.execPath, ...args], exitCode: run.status, spawnError: run.error?.message || null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (combined.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools, rawStdout: `evidence\\raw\\${label}.stdout.raw`,
    rawStderr: `evidence\\raw\\${label}.stderr.raw`, rawStdoutSha256: sha(output),
    rawStderrSha256: sha(errors), snapshots,
  };
  json(isRed ? `${prefix}\\run.json` : `${prefix}\\model-green.json`, result);
  process.stdout.write(output);
  process.stderr.write(errors);
  if (isRed ? !(run.status === 1 && result.assertionFailures > 0 && !missingCodeOrTools)
    : run.status !== 0) throw new Error(`Unexpected ${stage} result; retained raw output is authoritative.`);
}
function recordDecision() {
  const red = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', 'run.json'), 'utf8'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) throw new Error('Genuine RED required.');
  const stub = red.snapshots.find((item) => item.source === 'model.js');
  if (sha(fs.readFileSync(path.join(root, 'model.js'))) !== stub.sha256) throw new Error('IaC decision must precede implementation.');
  json('evidence\\iac-decision.json', {
    cardId: 'A-S069', status: 'N/A', decidedAtUtc: now(), beforeBehaviorImplementation: true,
    reason: 'Resource-free synthetic local browser lesson. No cloud, IaC, scaffold, identity, credentials, deployment or spending.',
    redReference: 'evidence\\red\\run.json', nativeEpochLeaseFencingConcurrentWriterProof: false,
  });
}
function recordVerification(action) {
  const browser = action === 'browser';
  if (browser && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1.');
  if (!browser && process.env.CAPTURE_BROWSER_EVIDENCE === '1') throw new Error('Focused verification must not refresh browser proof.');
  const label = browser ? 'browser-capture' : 'focused-green';
  const files = browser ? ['browser'] : ['model', 'surface', 'integrity', 'browser'];
  const args = ['--test', '--test-reporter=tap', ...files.map((file) => path.join(root, 'tests', `${file}.test.cjs`))];
  const startedAtUtc = now();
  const sourceFiles = [
    '.gitattributes', 'README.md', 'index.html', 'styles.css', 'model.js', 'app.js', 'manifest.json',
    'writer-epochs.feature', ...['model', 'surface', 'integrity', 'browser'].map((file) => `tests\\${file}.test.cjs`),
    'tests\\capture.cjs',
  ];
  const testedSourceHashes = Object.fromEntries(sourceFiles.map((file) => [file, sha(canonical(fs.readFileSync(path.join(root, file))))]));
  const result = spawnSync(process.execPath, args, { cwd: repo, timeout: 300000 });
  const output = result.stdout || Buffer.alloc(0);
  const errors = result.stderr || Buffer.alloc(0);
  write(`evidence\\raw\\${label}.stdout.raw`, output);
  write(`evidence\\raw\\${label}.stderr.raw`, errors);
  const combined = output.toString() + errors.toString();
  const count = (name) => Number(combined.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  json(`evidence\\verification\\${label}.json`, {
    cardId: 'A-S069', startedAtUtc, completedAtUtc: now(), runtime: process.version,
    command: [process.execPath, ...args], exitCode: result.status, spawnError: result.error?.message || null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'), testedSourceHashes,
    browserCaptureExplicitlyEnabled: browser, rawStdout: `evidence\\raw\\${label}.stdout.raw`,
    rawStderr: `evidence\\raw\\${label}.stderr.raw`, rawStdoutSha256: sha(output), rawStderrSha256: sha(errors),
  });
  process.stdout.write(output);
  process.stderr.write(errors);
  if (result.status !== 0) throw new Error(`${label} failed; raw results remain preserved.`);
}

if (require.main === module) {
  const action = process.argv[2];
  if (action === 'source') recordSource();
  else if (action === 'red' || action === 'green') recordRun(action);
  else if (action === 'iac') recordDecision();
  else if (action === 'browser' || action === 'focused') recordVerification(action);
  else throw new Error('Explicit capture action required: source | red | iac | green | browser | focused');
}
module.exports = { acceptance };
