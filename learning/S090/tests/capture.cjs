'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { root, repo, read, sha, canonical, git, acceptance } = require('.\\provenance.cjs');
const stage = process.argv[2];
const identity = { cardId: 'A-S090', workerId: 'worker-A-S090' };
function write(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
if (stage === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const names = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = names.map((file) => fs.readFileSync(path.join(repo, file)));
  const committed = names.map((file) => git(['show', `${baseline}:${file.replace(/\\/g, '/')}`]));
  const selected = acceptance(...working.map(String));
  if (JSON.stringify(selected) !== JSON.stringify(acceptance(...committed.map(String)))) {
    throw new Error('Exact source acceptance differs from canonical Git baseline.');
  }
  const sources = names.map((file, index) => {
    const prefix = ['readme', 'backlog', 'kanban'][index];
    const workingSnapshot = `evidence\\raw\\source\\${prefix}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source\\${prefix}.git.raw.gz`;
    write(workingSnapshot, zlib.gzipSync(working[index]));
    write(gitSnapshot, zlib.gzipSync(committed[index]));
    return {
      path: file, workingSnapshot, gitSnapshot, workingBytes: working[index].length,
      workingSha256: sha(working[index]), workingCanonicalSha256: sha(canonical(working[index])),
      gitSha256: sha(committed[index]), workingContainsCRLF: working[index].includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: canonical(working[index]).equals(canonical(committed[index])),
    };
  });
  json('evidence\\source-contract.json', {
    ...identity, sourceId: 'S090', parentId: 'D-S090', siblingId: 'B-S090',
    kano: 'S', kanoUnit: 'A-S090', packet: 'SC-S090', entryGate: 'SOURCE',
    recordedAtUtc: new Date().toISOString(), baseline, sourceReadBeforeBehaviorDesign: true,
    acceptanceEqualsBaseline: true, sources, acceptance: selected,
    mutableBoardLimit: 'Only exact acceptance slices are required to agree with the current concurrent board.',
    nativeAcceptanceNotCompleted: true,
  });
  console.log('Preserved exact S090, D-S090, A/B, packet, lifecycle and portable contracts with raw CRLF and Git bytes.');
} else if (stage === 'iac') {
  const red = JSON.parse(read('evidence\\red\\run.json'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) throw new Error('Genuine assertion RED required.');
  json('evidence\\iac-decision.json', {
    ...identity, status: 'N/A', decidedAtUtc: new Date().toISOString(),
    afterRedCompletedAtUtc: red.completedAtUtc, beforeImplementation: true,
    reason: 'Resource-free synthetic browser lesson. No cloud, IaC, scaffold, identity, credentials, deployment or spend.',
    retirementIsTeachingTraceOnly: true, nativeDrainRetentionRetirementCertified: false,
  });
  console.log('IaC N/A follows actual assertion RED and precedes implementation.');
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
        const bytes = raw ? read(relative) : canonical(read(relative));
        files.push({ path: relative, mode: raw ? 'raw' : 'text-lf', bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  walk(root);
  json('evidence\\content-index.json', {
    ...identity, recordedAtUtc: new Date().toISOString(),
    integrity: 'Exact raw bytes under narrow owned attributes; canonical LF for Git-source text.',
    exclusions: ['evidence\\content-index.json', 'evidence\\verification\\**'],
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  });
  console.log(`Sealed ${files.length} owned source/evidence files.`);
} else if (['red', 'model-green', 'syntax', 'syntax-final', 'browser-check', 'browser-green', 'focused-green'].includes(stage)
    || /^browser-check-\d+$/.test(stage)) {
  const directory = stage === 'red' ? 'evidence\\red' : 'evidence\\verification';
  const name = stage === 'red' ? 'run' : stage;
  if (fs.existsSync(path.join(root, directory, `${name}.json`))) throw new Error('Capture is append-only; evidence already exists.');
  const record = {
    ...identity, stage, runtime: process.version, startedAtUtc: new Date().toISOString(),
    captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  if (stage === 'red') {
    record.snapshots = ['retirement.feature', 'model.js', 'tests\\model.test.cjs'].map((source) => {
      const bytes = read(source);
      const snapshot = `${path.basename(source)}.snapshot`;
      write(`${directory}\\${snapshot}`, bytes);
      return { source, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    });
  }
  const syntaxFiles = ['model.js', 'theme.js', 'app.js', 'tests\\provenance.cjs', 'tests\\capture.cjs',
    'tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs'];
  record.sourceHashes = Object.fromEntries(['retirement.feature', 'manifest.json', 'README.md', 'styles.css',
    '.gitattributes', 'index.html', ...syntaxFiles].filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => [file, sha(canonical(read(file)))]));
  const commands = stage.startsWith('syntax') ? syntaxFiles.map((file) => ['--check', file]) : [[
    '--test', '--test-reporter=tap', '--test-concurrency=1',
    ...(stage === 'red' || stage === 'model-green' ? ['tests\\model.test.cjs']
      : stage === 'browser-green' || stage.startsWith('browser-check') ? ['tests\\browser.test.cjs']
        : ['tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs']),
  ]];
  record.commands = commands.map((args) => [process.execPath, ...args]);
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let exitCode = 0;
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: null, timeout: 240000 });
    stdout = Buffer.concat([stdout, result.stdout || Buffer.alloc(0)]);
    stderr = Buffer.concat([stderr, result.stderr || Buffer.alloc(0)]);
    if (result.error) record.spawnError = result.error.message;
    if (result.status !== 0) exitCode = result.status === null ? 1 : result.status;
  }
  const output = stdout.toString() + stderr.toString();
  const count = (key) => Number(output.match(new RegExp(`^# ${key} (\\d+)`, 'm'))?.[1] || 0);
  Object.assign(record, {
    completedAtUtc: new Date().toISOString(), exitCode, spawnError: record.spawnError || null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (output.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/.test(output),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  });
  write(`${directory}\\${name}.stdout.raw.gz`, zlib.gzipSync(stdout));
  write(`${directory}\\${name}.stderr.raw.gz`, zlib.gzipSync(stderr));
  json(`${directory}\\${name}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = exitCode;
} else throw new Error('Choose explicit source, red, iac, model-green, syntax, browser-green, seal or focused-green.');
