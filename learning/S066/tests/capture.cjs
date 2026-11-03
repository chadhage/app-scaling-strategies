'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const stage = process.argv[2];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function write(file, bytes) {
  if (fs.existsSync(file)) throw new Error(`Evidence is append-only: ${path.relative(root, file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
function git(args) {
  const run = spawnSync('git', args, { cwd: repo, encoding: null });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return run.stdout;
}
function slices(readme, backlog, kanban) {
  const line = (text, id) => {
    const rows = text.split(/\r?\n/).filter((entry) => entry.startsWith(`| ${id} |`));
    if (rows.length !== 1) throw new Error(`Expected exact unique source row ${id}`);
    return rows[0];
  };
  const section = (text, from, to) => {
    const start = text.indexOf(from);
    const end = text.indexOf(to, start + from.length);
    if (start < 0 || end < 0) throw new Error('Exact source section missing.');
    return text.slice(start, end).replace(/\r\n/g, '\n').trimEnd();
  };
  const packet = kanban.split(/\r?\n/).find((entry) => entry.startsWith('Packet membership is fixed before admission.'));
  return {
    readmeS066: line(readme, 'S066'), backlogDS066: line(backlog, 'D-S066'),
    cardAS066: line(kanban, 'A-S066'), siblingBS066: line(kanban, 'B-S066'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packet,
    evidencePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
function evidenceHashes() {
  const hashes = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'verification') walk(file); }
      else hashes[path.relative(root, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(path.join(root, 'evidence'));
  return hashes;
}
if (stage === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const names = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = names.map((name) => fs.readFileSync(path.join(repo, name)));
  const committed = names.map((name) => git(['show', `${baseline}:${name.replace(/\\/g, '/')}`]));
  const raw = path.join(root, 'evidence', 'raw', 'source');
  const sources = names.map((name, index) => {
    const prefix = ['readme', 'backlog', 'kanban'][index];
    write(path.join(raw, `${prefix}.working.snapshot`), working[index]);
    write(path.join(raw, `${prefix}.git.snapshot`), committed[index]);
    return {
      path: name, workingSnapshot: `evidence\\raw\\source\\${prefix}.working.snapshot`,
      gitSnapshot: `evidence\\raw\\source\\${prefix}.git.snapshot`,
      workingBytes: working[index].length, workingSha256: sha(working[index]),
      workingCanonicalSha256: sha(lf(working[index])), gitSha256: sha(committed[index]),
      workingContainsCRLF: working[index].includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(working[index]).equals(committed[index]),
    };
  });
  const acceptance = slices(...working.map((bytes) => bytes.toString()));
  const baselineAcceptance = slices(...committed.map((bytes) => bytes.toString()));
  if (JSON.stringify(acceptance) !== JSON.stringify(baselineAcceptance)) {
    throw new Error('Exact acceptance differs from the declared committed source baseline.');
  }
  json(path.join(root, 'evidence', 'source-contract.json'), {
    cardId: 'A-S066', parentId: 'D-S066', siblingId: 'B-S066', packet: 'SC-S066',
    workerId: 'worker-A-S066', kano: 'S', kanoUnit: 'A-S066', entryGate: 'SOURCE',
    recordedAtUtc: new Date().toISOString(), baseline, sourceReadBeforeBehaviorDesign: true,
    sources, acceptance, acceptanceEqualsBaseline: true,
    mutableBoardLimit: 'Full-board accepted counts/links may differ concurrently; exact acceptance sections must match.',
    nativeAcceptanceNotCompleted: true,
  });
  console.log('Exact S066, D-S066, A/B, atomic/portable, packet and acceptance provenance retained.');
} else if (stage === 'iac') {
  const red = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', 'run.json'), 'utf8'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) {
    throw new Error('IaC decision requires genuine assertion RED first.');
  }
  json(path.join(root, 'evidence', 'iac-decision.json'), {
    cardId: 'A-S066', workerId: 'worker-A-S066', status: 'N/A',
    decidedAtUtc: new Date().toISOString(), afterRedCompletedAtUtc: red.completedAtUtc,
    redReference: 'evidence\\red\\run.json', beforeBehaviorImplementation: true,
    reason: 'Resource-free portable synthetic lesson. No cloud/IaC/scaffold/identity/deploy/spend.',
    nativeDatabaseCommitTransactionFailoverProof: false,
  });
  console.log('IaC N/A recorded after qualified RED and before behavior implementation.');
} else if (stage === 'seal') {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (relative === path.join('evidence', 'verification')) continue;
      if (entry.isDirectory()) walk(file);
      else if (relative !== path.join('evidence', 'content-index.json')) {
        const binary = relative.startsWith(`evidence${path.sep}raw${path.sep}`)
          || /\.(?:snapshot|gz|png)$/.test(relative);
        const bytes = fs.readFileSync(file);
        const canonical = binary ? bytes : lf(bytes);
        files.push({ path: relative, mode: binary ? 'raw' : 'text-lf',
          bytes: canonical.length, sha256: sha(canonical) });
      }
    }
  }
  walk(root);
  json(path.join(root, 'evidence', 'content-index.json'), {
    cardId: 'A-S066', recordedAtUtc: new Date().toISOString(),
    exclusions: ['evidence\\content-index.json', 'evidence\\verification\\**'],
    integrity: 'Canonical LF for Git text; exact bytes for narrowly attributed raw snapshots and gzip.',
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  });
  console.log(`Sealed ${files.length} owned source and proof files.`);
} else if (['red', 'model-green', 'initial-green', 'focused-green', 'syntax', 'publication-syntax', 'publication-green'].includes(stage)) {
  const directory = path.join(root, 'evidence', stage === 'red' ? 'red' : 'verification');
  const prefix = stage === 'red' ? 'run' : stage;
  const recordFile = path.join(directory, `${prefix}.json`);
  if (fs.existsSync(recordFile)) throw new Error('Capture is append-only; do not overwrite earlier provenance.');
  const record = {
    cardId: 'A-S066', workerId: 'worker-A-S066', stage, runtime: process.version,
    startedAtUtc: new Date().toISOString(), captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  if (stage === 'red') {
    record.snapshots = ['commit-outcomes.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
      const bytes = fs.readFileSync(path.join(root, source));
      const snapshot = path.basename(source) + '.snapshot';
      write(path.join(directory, snapshot), bytes);
      return { source, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    });
  }
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  if (stage === 'syntax' || stage === 'publication-syntax') {
    record.checks = ['fixtures.js', 'model.js', 'app.js', 'tests\\model.test.cjs',
      'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs', 'tests\\capture.cjs'].map((file) => {
      const run = spawnSync(process.execPath, ['--check', path.join(root, file)], { cwd: repo, encoding: null });
      stdout = Buffer.concat([stdout, run.stdout || Buffer.alloc(0)]);
      stderr = Buffer.concat([stderr, run.stderr || Buffer.alloc(0)]);
      return { file, exitCode: run.status, canonicalSha256: sha(lf(fs.readFileSync(path.join(root, file)))) };
    });
    record.exitCode = record.checks.every((item) => item.exitCode === 0) ? 0 : 1;
  } else {
    const names = stage === 'red' || stage === 'model-green' ? ['model']
      : stage === 'initial-green' ? ['model', 'surface', 'browser']
        : ['model', 'surface', 'integrity', 'browser'];
    const args = ['--test', '--test-reporter=tap', ...names.map((name) => path.join(root, 'tests', `${name}.test.cjs`))];
    record.command = [process.execPath, ...args];
    if (stage === 'focused-green' || stage === 'publication-green') record.proofBefore = evidenceHashes();
    const run = spawnSync(process.execPath, args, { cwd: repo, encoding: null, maxBuffer: 16 * 1024 * 1024 });
    stdout = run.stdout || Buffer.alloc(0);
    stderr = run.stderr || Buffer.alloc(0);
    record.exitCode = run.status;
    record.signal = run.signal;
    record.spawnError = run.error ? run.error.message : null;
    const text = stdout.toString() + stderr.toString();
    for (const field of ['tests', 'pass', 'fail']) record[field] = Number(text.match(new RegExp(`^# ${field} (\\d+)$`, 'm'))?.[1] || 0);
    record.assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
    record.missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError: Cannot/.test(text);
    if (stage === 'focused-green' || stage === 'publication-green') {
      record.proofAfter = evidenceHashes();
      record.normalVerificationReadOnlyToProof = JSON.stringify(record.proofBefore) === JSON.stringify(record.proofAfter);
      if (!record.normalVerificationReadOnlyToProof) record.exitCode = 1;
    }
    write(path.join(directory, `${prefix}.tap`), text.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
  }
  record.completedAtUtc = new Date().toISOString();
  record.rawStdoutSha256 = sha(stdout);
  record.rawStderrSha256 = sha(stderr);
  write(path.join(directory, `${prefix}.stdout.raw.gz`), zlib.gzipSync(stdout));
  write(path.join(directory, `${prefix}.stderr.raw.gz`), zlib.gzipSync(stderr));
  json(recordFile, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (stage === 'red') {
    if (record.exitCode !== 1 || record.assertionFailures < 1 || record.missingCodeOrTools) {
      throw new Error('Unqualified RED: expected behavioral assertion failure, not missing code, tooling or syntax.');
    }
  } else if (record.exitCode !== 0) process.exitCode = 1;
} else {
  throw new Error('Choose a deliberate stage: source, red, iac, model-green, initial-green, focused-green, syntax, publication-syntax, publication-green, seal.');
}
