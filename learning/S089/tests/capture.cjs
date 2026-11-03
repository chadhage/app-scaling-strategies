'use strict';

const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const {
  fs, path, root, repo, read, sha, lf, git, gitPath, acceptance, helperPath,
  helperSha256, testedHashes, ownedFiles, tree,
} = require('./provenance.cjs');

const write = (file, bytes) => {
  const destination = path.join(root, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
};
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const parsed = (file) => JSON.parse(read(file));
const stage = process.argv[2];
assert.equal(process.argv.length, 3, 'An explicit, single capture stage is required');

if (stage === 'source') {
  assert.equal(fs.existsSync(path.join(root, 'evidence\\source-contract.json')), false,
    'Raw source provenance cannot be overwritten');
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const working = [];
  const canonical = [];
  const sources = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md']
    .map((file, index) => {
      const bytes = fs.readFileSync(path.join(repo, file));
      const source = git(['show', `${baseline}:${gitPath(file)}`]);
      const workingSnapshot = `evidence\\raw\\source\\${index + 1}.working.raw.gz`;
      const gitSnapshot = `evidence\\raw\\source\\${index + 1}.git.raw.gz`;
      write(workingSnapshot, zlib.gzipSync(bytes));
      write(gitSnapshot, zlib.gzipSync(source));
      working.push(bytes.toString());
      canonical.push(source.toString());
      return {
        path: file, workingSnapshot, gitSnapshot, workingBytes: bytes.length,
        workingSha256: sha(bytes), workingCanonicalSha256: sha(lf(bytes)),
        gitSha256: sha(source), workingContainsCRLF: bytes.includes(Buffer.from('\r\n')),
        fullCanonicalEqualsBaseline: lf(bytes).equals(lf(source)),
      };
    });
  const contract = acceptance(...working);
  assert.deepEqual(contract, acceptance(...canonical), 'Exact acceptance changed from canonical Git');
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git\\kanban-orchestrator\\inventory.json')));
  const registryProjection = inventory.cards.find((card) => card.id === 'A-S089');
  assert.equal(registryProjection.packet, 'SC-S089');
  json('evidence\\source-contract.json', {
    cardId: 'A-S089', workerId: 'worker-A-S089', sourceId: 'S089', parentId: 'D-S089',
    nativeSiblingId: 'B-S089', kano: 'S', kanoUnit: 'A-S089', packet: 'SC-S089',
    entryGate: 'SOURCE', sourceReadBeforeBehaviorDesign: true,
    capturedAtUtc: new Date().toISOString(), baseline, acceptanceEqualsBaseline: true,
    acceptance: contract, sources, registryProjection, nativeAcceptanceNotCompleted: true,
    packetLimit: 'Default SC-S089 packet; one frozen S unit, no LP allocation or extra test/plumbing credit.',
  });
  console.log(`Preserved exact S089 source acceptance at ${baseline}`);
} else if (stage === 'iac') {
  const red = parsed('evidence\\verification\\red.json');
  assert.equal(red.exitCode, 1);
  assert.ok(red.assertionFailures > 0);
  assert.equal(fs.existsSync(path.join(root, 'evidence\\iac-decision.json')), false);
  json('evidence\\iac-decision.json', {
    cardId: 'A-S089', status: 'N/A', decidedAtUtc: new Date().toISOString(),
    beforeImplementation: true, reason: 'Resource-free, offline synthetic trace lesson; no infrastructure exists or is requested.',
    postRedStubSha256: sha(read('evidence\\red\\model.js.snapshot')),
    noCloudIaCScaffoldIdentityCredentialsDeploySpendPackagesFrameworkDownloads: true,
    actualNetworkManagementOrDataPlaneCertification: false,
  });
  console.log('IaC N/A recorded after actual behavioral RED and before implementation');
} else if (stage === 'tooling') {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const command = `$s=Get-AuthenticodeSignature -FilePath '${edge}'; `
    + `[pscustomobject]@{version=(Get-Item -LiteralPath '${edge}').VersionInfo.ProductVersion; `
    + `signatureStatus=$s.Status.ToString();signer=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress`;
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: repo, windowsHide: true, encoding: null,
  });
  write('evidence\\raw\\tooling.stdout', result.stdout || Buffer.alloc(0));
  write('evidence\\raw\\tooling.stderr', result.stderr || Buffer.alloc(0));
  assert.equal(result.status, 0);
  const signed = JSON.parse(result.stdout.toString().replace(/^\uFEFF/, ''));
  const playwrightVersion = require(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json')).version;
  assert.equal(signed.signatureStatus, 'Valid');
  assert.match(signed.signer, /Microsoft Corporation/);
  assert.equal(signed.version, '156.0.4314.50');
  assert.equal(playwrightVersion, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256);
  json('evidence\\tooling.json', {
    capturedAtUtc: new Date().toISOString(), node: process.version, playwrightVersion,
    browserVersion: signed.version, signatureStatus: signed.signatureStatus, signer: signed.signer,
    helper: { path: helperPath, sha256: helperSha256, publication: '53c0c0d' },
    packagesInstalled: false, browserDownloaded: false, unsafeFlags: false, foregroundLease: false,
    rawStdoutSha256: sha(result.stdout), rawStderrSha256: sha(result.stderr),
    productionNode24Validated: false,
    lifecycleLimit: 'Published helper only; bounded individual lesson evidence, not a qualified unattended runner.',
  });
  console.log('Qualified existing offline Node22 / Playwright1.56.1 / signed Edge156 tooling');
} else if (stage === 'seal') {
  const files = ownedFiles().filter((file) => file !== 'evidence\\content-index.json');
  json('evidence\\content-index.json', {
    cardId: 'A-S089', capturedAtUtc: new Date().toISOString(),
    qualification: 'Raw evidence bytes retained; other text is qualified against canonical LF Git source.',
    files: files.map((file) => {
      const bytes = read(file);
      const raw = file.startsWith('evidence\\raw\\') || file.startsWith('evidence\\red\\')
        || file.endsWith('.png') || file.endsWith('.gz');
      return {
        path: file, mode: raw ? 'raw' : 'canonical-lf',
        sha256: sha(raw ? bytes : lf(bytes)),
        gitBlob: git(['hash-object', `--path=${gitPath(path.relative(repo, path.join(root, file)))}`, '--stdin'], bytes).toString().trim(),
      };
    }),
  });
  console.log(`Sealed ${files.length} owned files without altering raw evidence`);
} else {
  const commands = {
    red: ['--test', 'tests\\model.test.cjs'],
    'model-green': ['--test', 'tests\\model.test.cjs', 'tests\\surface.test.cjs'],
    'browser-green': ['--test', 'tests\\browser.test.cjs'],
    'focused-green': ['--test', 'tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\integrity.test.cjs'],
    'readonly-green': ['--test', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
      'tests\\integrity.test.cjs', 'tests\\browser.test.cjs'],
    syntax: ['-e', `const{execFileSync}=require('node:child_process');const files=${JSON.stringify([
      'fixtures.js', 'model.js', 'app.js', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
      'tests\\browser.test.cjs', 'tests\\integrity.test.cjs', 'tests\\capture.cjs', 'tests\\provenance.cjs',
    ])};for(const file of files){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});}console.log('Syntax PASS: '+files.length+' files');`],
  };
  commands['publication-green'] = commands['focused-green'];
  commands['publication-readonly-green'] = commands['readonly-green'];
  commands['publication-syntax'] = commands.syntax;
  assert.ok(Object.hasOwn(commands, stage), 'Unknown capture stage');
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
  assert.equal(capture, stage === 'browser-green', 'Browser evidence is deliberate only');
  if (stage === 'red') {
    assert.equal(fs.existsSync(path.join(root, 'evidence\\verification\\red.json')), false,
      'Original RED cannot be overwritten');
  }
  if (stage === 'red') {
    const snapshots = ['outage.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'];
    json('evidence\\red\\snapshots.json', snapshots.map((file) => {
      const snapshot = `${file.replace(/\\/g, '-')}.snapshot`;
      const bytes = read(file);
      write(`evidence\\red\\${snapshot}`, bytes);
      return { source: file, snapshot, bytes: bytes.length, sha256: sha(bytes) };
    }));
  }
  const before = tree();
  const inputHashes = testedHashes();
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, commands[stage], {
    cwd: root, windowsHide: true, encoding: null, timeout: 180000,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: capture ? '1' : '0' },
  });
  const after = tree();
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const text = stdout.toString();
  const count = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
  write(`evidence\\raw\\${stage}.stdout`, stdout);
  write(`evidence\\raw\\${stage}.stderr`, stderr);
  const record = {
    name: stage, command: [process.execPath, ...commands[stage]], startedAtUtc,
    completedAtUtc: new Date().toISOString(), runtime: process.version,
    exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (text.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/.test(text + stderr.toString()),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr), inputHashes,
    browserCaptureEnabled: capture, verificationReadOnly: !capture,
    ownedTreeBefore: before, ownedTreeAfter: after,
  };
  json(`evidence\\verification\\${stage}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (!capture) assert.deepEqual(before, after, 'Verification wrote to the owned lesson tree');
  if (stage === 'red') {
    assert.equal(record.exitCode, 1, 'RED must be an actual assertion failure');
    assert.ok(record.assertionFailures > 0);
    assert.equal(record.missingCodeOrTools, false);
    console.log(`Qualified RED: ${record.assertionFailures} actual assertion failures`);
  } else {
    assert.equal(record.exitCode, 0, `${stage} did not pass`);
  }
}
