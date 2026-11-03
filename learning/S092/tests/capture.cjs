'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { root, repo, read, sha, lf, git, acceptance, filesBelow, HELPER_SHA } = require('.\\provenance.cjs');
const now = () => new Date().toISOString();
function write(relative, bytes) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (relative, value) => write(relative, `${JSON.stringify(value, null, 2)}\n`);
function runCaptured(name, args) {
  const startedAtUtc = now();
  const result = spawnSync(process.execPath, args, { cwd: repo, encoding: null, maxBuffer: 4 * 1024 * 1024 });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  write(`evidence\\${name}.stdout.raw.gz`, zlib.gzipSync(stdout));
  write(`evidence\\${name}.stderr.raw.gz`, zlib.gzipSync(stderr));
  const number = (label) => Number(stdout.toString().match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] || 0);
  const record = {
    cardId: 'A-S092', workerId: 'worker-A-S092', command: [process.execPath, ...args],
    startedAtUtc, completedAtUtc: now(), exitCode: result.status,
    spawnError: result.error ? String(result.error) : null,
    tests: number('tests'), pass: number('pass'), fail: number('fail'),
    assertionFailures: (stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/.test(stdout.toString() + stderr.toString()),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  };
  json(`evidence\\${name}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return record;
}
const command = process.argv[2];
if (command === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const sources = [
    { path: 'README.md', name: 'readme' },
    { path: '.docs\\wiki\\backlog.md', name: 'backlog' },
    { path: '.docs\\wiki\\kanban.md', name: 'kanban' },
  ].map((item) => {
    const working = fs.readFileSync(path.join(repo, item.path));
    const committed = git(['show', `${baseline}:${item.path.replace(/\\/g, '/')}`]);
    const workingSnapshot = `evidence\\raw\\source\\${item.name}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source\\${item.name}.git.raw.gz`;
    write(workingSnapshot, zlib.gzipSync(working));
    write(gitSnapshot, zlib.gzipSync(committed));
    return {
      path: item.path, workingSnapshot, gitSnapshot, workingBytes: working.length, gitBytes: committed.length,
      workingSha256: sha(working), workingCanonicalSha256: sha(lf(working)),
      gitSha256: sha(committed), gitCanonicalSha256: sha(lf(committed)),
      workingContainsCRLF: working.includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(working).equals(lf(committed)),
    };
  });
  const unpack = (kind) => sources.map((item) => zlib.gunzipSync(read(item[kind])).toString());
  const observed = acceptance(...unpack('workingSnapshot'));
  assert.deepEqual(observed, acceptance(...unpack('gitSnapshot')), 'exact acceptance must match the declared Git source');
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S092', workerId: 'worker-A-S092', sourceId: 'S092',
    parentId: 'D-S092', siblingId: 'B-S092', kano: 'S', kanoUnit: 'A-S092', packet: 'SC-S092',
    entryGate: 'SOURCE', baseline, capturedAtUtc: now(),
    sourceReadBeforeBehaviorDesign: true, acceptanceEqualsBaseline: true,
    readWorkflow: 'Claim and exact authoritative README/backlog/atomic/portable/packet reads preceded the first owned file change.',
    nativeAcceptanceNotCompleted: true, sources, acceptance: observed,
  });
} else if (command === 'red') {
  const snapshots = ['canary.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
    const raw = read(source);
    const snapshot = `${path.basename(source)}.snapshot`;
    write(`evidence\\red\\${snapshot}`, raw);
    return { source, snapshot, bytes: raw.length, sha256: sha(raw), canonicalSha256: sha(lf(raw)) };
  });
  const run = runCaptured('red\\run', ['--test', '--test-concurrency=1', '.\\learning\\S092\\tests\\model.test.cjs']);
  json('evidence\\red\\snapshots.json', snapshots);
  assert.equal(run.exitCode, 1, 'RED must actually fail');
  assert.equal(run.tests, 16);
  assert.equal(run.pass, 1);
  assert.equal(run.fail, 15);
  assert.equal(run.assertionFailures, 15);
  assert.equal(run.missingCodeOrTools, false);
  assert.equal(run.spawnError, null);
} else if (command === 'iac') {
  const red = JSON.parse(read('evidence\\red\\run.json'));
  assert.equal(red.assertionFailures, 15);
  json('evidence\\iac-decision.json', {
    cardId: 'A-S092', status: 'N/A', decidedAtUtc: now(), beforeImplementation: true,
    reason: 'Resource-free, deterministic browser teaching trace. Canary, expansion and rollback are data only.',
    cloudOrResourceOperations: false, nativeCanaryOrRollbackCertified: false,
    identityCredentialsScaffoldDeploymentSpending: false, productionNode24Validated: false,
  });
} else if (command === 'tooling') {
  const helper = fs.readFileSync(path.join(repo, 'testing\\browser\\isolated.cjs'));
  assert.equal(sha(helper), HELPER_SHA);
  const signature = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress"],
  { cwd: repo, encoding: null });
  if (signature.error || signature.status !== 0) throw signature.error || new Error(signature.stderr.toString());
  const edge = JSON.parse(signature.stdout.toString().trim());
  assert.equal(edge.signatureStatus, 'Valid');
  assert.equal(edge.version, '156.0.4314.50');
  assert.match(edge.signer, /CN=Microsoft Corporation/);
  const playwright = JSON.parse(fs.readFileSync(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json')));
  assert.equal(playwright.version, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  const committedHelper = git(['show', '53c0c0d:testing/browser/isolated.cjs']);
  assert.equal(sha(lf(helper)), sha(lf(committedHelper)));
  write('evidence\\raw\\edge-signature.stdout.raw.gz', zlib.gzipSync(signature.stdout));
  write('evidence\\raw\\isolated.cjs.raw.gz', zlib.gzipSync(helper));
  json('evidence\\tooling.json', {
    capturedAtUtc: now(), node: process.version, playwright: playwright.version, edge,
    helperSha256: sha(helper), helperPublication: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    helperCanonicalGitSha256: sha(lf(committedHelper)), helperAPI: 'openIsolatedLesson',
    cleanup: 'await session.close() in finally', abandonedLifecyclePrototypeQualified: false,
    lifecycleLimit: 'Published helper still has documented context/shutdown deadline limitations.',
    noDownloadNoInstallNoUnsafeFlags: true, productionNode24Validated: false, nativeAzureValidated: false,
  });
} else if (command === 'green') {
  const run = runCaptured('verification\\green', [
    '--test', '--test-concurrency=1', '.\\learning\\S092\\tests\\model.test.cjs', '.\\learning\\S092\\tests\\surface.test.cjs',
  ]);
  assert.equal(run.exitCode, 0);
  assert.equal(run.fail, 0);
  assert.equal(run.spawnError, null);
} else if (command === 'syntax') {
  const startedAtUtc = now();
  const results = filesBelow().filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { cwd: repo, encoding: null });
    const stdout = result.stdout || Buffer.alloc(0);
    const stderr = result.stderr || Buffer.alloc(0);
    write(`evidence\\raw\\syntax\\${file.replace(/\\/g, '_')}.stdout.raw.gz`, zlib.gzipSync(stdout));
    write(`evidence\\raw\\syntax\\${file.replace(/\\/g, '_')}.stderr.raw.gz`, zlib.gzipSync(stderr));
    return { file, canonicalSha256: sha(lf(read(file))), exitCode: result.status,
      spawnError: result.error ? String(result.error) : null, stdoutSha256: sha(stdout), stderrSha256: sha(stderr) };
  });
  json('evidence\\syntax.json', { startedAtUtc, completedAtUtc: now(), results });
  assert.ok(results.every((item) => item.exitCode === 0 && item.spawnError === null));
} else if (command === 'index') {
  const files = filesBelow().filter((file) => file !== 'evidence\\content-index.json');
  const sources = files.filter((file) => !file.startsWith('evidence\\')).map((file) => ({
    file, canonicalLFSourceSha256: sha(lf(read(file))),
  }));
  const proof = files.filter((file) => file.startsWith('evidence\\')).map((file) => ({
    file, bytes: read(file).length, rawSha256: sha(read(file)),
  }));
  json('evidence\\content-index.json', {
    cardId: 'A-S092', capturedAtUtc: now(), canonicalRule: 'UTF-8 CRLF to LF for owned source only; proof remains byte-exact.',
    normalVerificationReadOnly: true, sources, proof,
  });
} else {
  throw new Error('Explicit capture command required: source, red, iac, tooling, green, syntax or index');
}
