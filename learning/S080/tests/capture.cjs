'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { root, repo, read, sha, lf, git, acceptance } = require('./provenance.cjs');
const stage = process.argv[2];

function write(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');

if (stage === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const names = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = names.map((name) => fs.readFileSync(path.join(repo, name)));
  const committed = names.map((name) => git(['show', `${baseline}:${name.replace(/\\/g, '/')}`]));
  const selected = acceptance(...working.map(String));
  if (JSON.stringify(selected) !== JSON.stringify(acceptance(...committed.map(String)))) {
    throw new Error('Exact acceptance differs from declared Git baseline.');
  }
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json')));
  const card = ledger.cards.find((item) => item.id === 'A-S080');
  if (card?.owner !== 'worker-A-S080' || card.state !== 'In Progress'
      || card.kano !== 'S' || card.packet !== 'SC-S080' || card.authorization !== 'local-synthetic-only') {
    throw new Error('Exact claimed local-synthetic contract required.');
  }
  const sources = names.map((name, index) => {
    const prefix = ['readme', 'backlog', 'kanban'][index];
    const workingSnapshot = `evidence\\raw\\source\\${prefix}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source\\${prefix}.git.raw.gz`;
    write(workingSnapshot, zlib.gzipSync(working[index]));
    write(gitSnapshot, zlib.gzipSync(committed[index]));
    return {
      path: name, workingSnapshot, gitSnapshot,
      workingBytes: working[index].length, workingSha256: sha(working[index]),
      workingCanonicalSha256: sha(lf(working[index])), gitSha256: sha(committed[index]),
      workingContainsCRLF: working[index].includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(working[index]).equals(committed[index]),
    };
  });
  json('evidence\\source-contract.json', {
    cardId: 'A-S080', workerId: 'worker-A-S080', parentId: 'D-S080', siblingId: 'B-S080',
    kano: 'S', kanoUnit: 'A-S080', packet: 'SC-S080', entryGate: 'SOURCE',
    recordedAtUtc: new Date().toISOString(), baseline, sourceReadBeforeBehaviorDesign: true,
    admittedContract: {
      deliver: card.deliver, authorization: card.authorization, priority: card.priority,
      claimedAtUtc: card.claimedAtUtc,
    },
    sources, acceptance: selected, acceptanceEqualsBaseline: true,
    mutableBoardLimit: 'Concurrent board counts and links are not frozen; exact acceptance slices must still agree.',
    nativeAcceptanceNotCompleted: true,
  });
  console.log('Exact S080/D-S080/A/B, atomic/portable, SC packet and outcome contracts preserved before BDD.');
} else if (stage === 'tooling') {
  const command = [
    "$ErrorActionPreference='Stop'",
    "$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'",
    '$signature=Get-AuthenticodeSignature -LiteralPath $edge',
    '[ordered]@{edgePath=$edge;browserVersion=(Get-Item -LiteralPath $edge).VersionInfo.ProductVersion;signatureStatus=[string]$signature.Status;signer=$signature.SignerCertificate.Subject}|ConvertTo-Json -Depth 5',
  ].join('; ');
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: repo, encoding: null, timeout: 30000,
  });
  if (result.status !== 0 || result.error) throw new Error(result.error?.message || result.stderr.toString());
  const observed = JSON.parse(result.stdout.toString().replace(/^\uFEFF/, ''));
  const helperSha256 = sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs')));
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (observed.signatureStatus !== 'Valid' || !observed.signer.includes('Microsoft Corporation')
      || !observed.browserVersion.startsWith('156.') || process.version !== 'v22.23.4'
      || playwrightVersion !== '1.56.1'
      || helperSha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') {
    throw new Error('Unqualified browser pairing; no install, download, or unsafe fallback is allowed.');
  }
  write('evidence\\raw\\tooling.stdout.raw.gz', zlib.gzipSync(result.stdout));
  write('evidence\\raw\\tooling.stderr.raw.gz', zlib.gzipSync(result.stderr));
  json('evidence\\tooling.json', {
    cardId: 'A-S080', recordedAtUtc: new Date().toISOString(), runtime: process.version,
    ...observed, playwrightVersion, helperSha256, helperPublication: '53c0c0d',
    command: ['pwsh.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    priorCaptureLimitation: 'The first Windows PowerShell signature-capture attempt could not autoload its security module. No evidence file or passing result was produced; the existing PowerShell 7 host is used here.',
    packagesInstalled: false, browserDownloaded: false, foregroundLease: false, unsafeFlags: false,
    rawStdoutSha256: sha(result.stdout), rawStderrSha256: sha(result.stderr),
    lifecycleLimit: 'Published helper only; known unattended lifecycle limitation remains; abandoned prototype is not used.',
    productionNode24OrNativeCertification: false,
  });
  console.log('Qualified existing signed Edge156 / offline Playwright1.56.1 / Node22 tooling; no changes or downloads.');
} else if (stage === 'iac') {
  const red = JSON.parse(read('evidence\\red\\run.json'));
  if (red.exitCode !== 1 || red.assertionFailures < 1 || red.missingCodeOrTools) {
    throw new Error('Actual loadable assertion RED required before the IaC decision.');
  }
  json('evidence\\iac-decision.json', {
    cardId: 'A-S080', workerId: 'worker-A-S080', status: 'N/A',
    decidedAtUtc: new Date().toISOString(), afterRedCompletedAtUtc: red.completedAtUtc,
    beforeImplementation: true, redReference: 'evidence\\red\\run.json',
    reason: 'Resource-free synthetic browser lesson; no cloud/IaC/scaffold/identity/credentials/deploy/spend.',
    actualBrokerPartitionCheckpointOwnershipCertification: false,
  });
  console.log('IaC N/A recorded after actual assertion RED and before implementation.');
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
    cardId: 'A-S080', recordedAtUtc: new Date().toISOString(),
    integrity: 'Canonical LF for Git text; exact bytes for narrow owned raw-evidence attributes.',
    exclusions: ['evidence\\content-index.json', 'evidence\\verification\\**'],
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  });
  console.log(`Sealed ${files.length} owned source and evidence files.`);
} else if (['red', 'model-green', 'browser-green', 'syntax', 'focused-green', 'publication-green'].includes(stage)) {
  const directory = stage === 'red' ? 'evidence\\red' : 'evidence\\verification';
  const name = stage === 'red' ? 'run' : stage;
  if (fs.existsSync(path.join(root, directory, `${name}.json`))) throw new Error('Append-only capture already exists.');
  const record = {
    cardId: 'A-S080', workerId: 'worker-A-S080', stage, runtime: process.version,
    startedAtUtc: new Date().toISOString(), captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  if (stage === 'red') {
    record.snapshots = ['partition-reassignment.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
      const bytes = read(source);
      const snapshot = `${path.basename(source)}.snapshot`;
      write(`${directory}\\${snapshot}`, bytes);
      return { source, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    });
  }
  const syntaxFiles = ['fixtures.js', 'model.js', 'app.js', 'tests\\provenance.cjs', 'tests\\capture.cjs',
    'tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs'];
  const commands = stage === 'syntax' ? syntaxFiles.map((file) => ['--check', file]) : [[
    '--test', '--test-reporter=tap', '--test-concurrency=1',
    ...(stage === 'red' || stage === 'model-green' ? ['tests\\model.test.cjs']
      : stage === 'browser-green' ? ['tests\\browser.test.cjs']
        : ['tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs']),
  ]];
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let exitCode = 0;
  record.commands = commands.map((args) => [process.execPath, ...args]);
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
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/.test(output),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  });
  write(`${directory}\\${name}.stdout.raw.gz`, zlib.gzipSync(stdout));
  write(`${directory}\\${name}.stderr.raw.gz`, zlib.gzipSync(stderr));
  json(`${directory}\\${name}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = exitCode;
} else {
  throw new Error('Choose source/tooling/red/iac/model-green/browser-green/syntax/seal/focused-green/publication-green.');
}
