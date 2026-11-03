'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { root, repo, sha, lf, read, git, acceptance } = require('./provenance.cjs');
const stage = process.argv[2];
function write(file, bytes) {
  const destination = path.join(root, file);
  if (fs.existsSync(destination)) throw new Error(`Append-only evidence already exists: ${file}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
if (stage === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const names = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = names.map((name) => fs.readFileSync(path.join(repo, name)));
  const committed = names.map((name) => git(['show', `${baseline}:${name.replace(/\\/g, '/')}`]));
  const selected = acceptance(...working.map(String));
  if (JSON.stringify(selected) !== JSON.stringify(acceptance(...committed.map(String)))) {
    throw new Error('Exact acceptance must match the declared committed source.');
  }
  const sources = names.map((name, index) => {
    const prefix = ['readme', 'backlog', 'kanban'][index];
    const workingSnapshot = `evidence\\raw\\source\\${prefix}.working.snapshot`;
    const gitSnapshot = `evidence\\raw\\source\\${prefix}.git.snapshot`;
    write(workingSnapshot, working[index]);
    write(gitSnapshot, committed[index]);
    return {
      path: name, workingSnapshot, gitSnapshot,
      workingBytes: working[index].length, workingSha256: sha(working[index]),
      workingCanonicalSha256: sha(lf(working[index])), gitSha256: sha(committed[index]),
      workingContainsCRLF: working[index].includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(working[index]).equals(committed[index]),
    };
  });
  json('evidence\\source-contract.json', {
    cardId: 'A-S074', workerId: 'worker-A-S074', parentId: 'D-S074', siblingId: 'B-S074',
    packet: 'SC-S074', kano: 'S', kanoUnit: 'A-S074', entryGate: 'SOURCE',
    recordedAtUtc: new Date().toISOString(), baseline, sourceReadBeforeBehaviorDesign: true,
    sources, acceptance: selected, acceptanceEqualsBaseline: true,
    dependencyLimit: 'D-S031 remains a source-parent prerequisite; fixed externalized synthetic state is not native completion.',
    mutableBoardLimit: 'Full-board counts/links may change concurrently; exact authoritative acceptance slices must match.',
    nativeAcceptanceNotCompleted: true,
  });
  console.log('Exact S074/D-S074, dependency, A/B, portable/atomic, packet and outcome contracts retained.');
} else if (stage === 'iac') {
  const red = JSON.parse(read('evidence\\red\\run.json'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) {
    throw new Error('IaC decision requires genuine assertion RED.');
  }
  json('evidence\\iac-decision.json', {
    cardId: 'A-S074', workerId: 'worker-A-S074', status: 'N/A',
    decidedAtUtc: new Date().toISOString(), afterRedCompletedAtUtc: red.completedAtUtc,
    redReference: 'evidence\\red\\run.json', beforeBehaviorImplementation: true,
    reason: 'Resource-free synthetic session eviction lesson; no cloud/IaC/scaffold/identity/credentials/deploy/spend.',
    actualSessionEvictionCacheDurabilityCertification: false,
  });
  console.log('IaC N/A after genuine RED, before behavior implementation.');
} else if (stage === 'seal') {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (relative === path.join('evidence', 'verification')) continue;
      if (entry.isDirectory()) walk(file);
      else if (relative !== path.join('evidence', 'content-index.json')) {
        const raw = relative.startsWith(`evidence${path.sep}raw${path.sep}`) || /\.(snapshot|gz|png)$/.test(relative);
        const bytes = raw ? fs.readFileSync(file) : lf(fs.readFileSync(file));
        files.push({ path: relative, mode: raw ? 'raw' : 'text-lf', bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  walk(root);
  json('evidence\\content-index.json', {
    cardId: 'A-S074', recordedAtUtc: new Date().toISOString(),
    integrity: 'Canonical LF for Git text; exact raw bytes for narrow owned .gitattributes evidence paths.',
    exclusions: ['evidence\\content-index.json', 'evidence\\verification\\**'],
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  });
  console.log(`Sealed ${files.length} owned source/evidence files.`);
} else if (['red', 'model-green', 'browser-green', 'syntax', 'focused-green', 'publication-green'].includes(stage)) {
  const directory = stage === 'red' ? 'evidence\\red' : 'evidence\\verification';
  const prefix = stage === 'red' ? 'run' : stage;
  if (fs.existsSync(path.join(root, directory, `${prefix}.json`))) throw new Error('Capture is append-only.');
  const record = {
    cardId: 'A-S074', workerId: 'worker-A-S074', stage, runtime: process.version,
    startedAtUtc: new Date().toISOString(), captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  if (stage === 'red') {
    record.snapshots = ['eviction.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
      const bytes = read(source);
      const snapshot = `${path.basename(source)}.snapshot`;
      write(`${directory}\\${snapshot}`, bytes);
      return { source, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    });
  }
  const syntaxFiles = ['fixtures.js', 'model.js', 'app.js', 'tests\\capture.cjs', 'tests\\provenance.cjs',
    'tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs'];
  const commands = stage === 'syntax' ? syntaxFiles.map((file) => ['--check', file])
    : [['--test', '--test-reporter=tap', '--test-concurrency=1',
      ...(stage === 'red' || stage === 'model-green' ? ['tests\\model.test.cjs']
        : stage === 'browser-green' ? ['tests\\browser.test.cjs']
          : ['tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs'])]];
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let exitCode = 0;
  record.commands = commands.map((args) => [process.execPath, ...args]);
  for (const args of commands) {
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: null, timeout: 240000 });
    stdout = Buffer.concat([stdout, run.stdout || Buffer.alloc(0)]);
    stderr = Buffer.concat([stderr, run.stderr || Buffer.alloc(0)]);
    if (run.error) record.spawnError = run.error.message;
    if (run.status !== 0) exitCode = run.status === null ? 1 : run.status;
  }
  const output = stdout.toString() + stderr.toString();
  const count = (name) => Number(output.match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] || 0);
  Object.assign(record, {
    completedAtUtc: new Date().toISOString(), exitCode, spawnError: record.spawnError || null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (output.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/.test(output),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  });
  write(`${directory}\\${prefix}.stdout.raw.gz`, zlib.gzipSync(stdout));
  write(`${directory}\\${prefix}.stderr.raw.gz`, zlib.gzipSync(stderr));
  json(`${directory}\\${prefix}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = exitCode;
} else {
  throw new Error('Use an explicit source, red, iac, model-green, browser-green, syntax, seal, focused-green or publication-green stage.');
}
