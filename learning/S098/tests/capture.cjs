'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, repo, read, sha, lf, git, acceptance, filesBelow, rawProtected, HELPER_SHA } = require('.\\provenance.cjs');

const now = () => new Date().toISOString();
function write(relative, bytes) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (relative, value) => write(relative, `${JSON.stringify(value, null, 2)}\n`);

function runCaptured(stage, args, environment = {}) {
  const startedAtUtc = now();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, encoding: null, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '', ...environment },
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const stdoutFile = `evidence\\raw\\${stage}.stdout.raw.gz`;
  const stderrFile = `evidence\\raw\\${stage}.stderr.raw.gz`;
  write(stdoutFile, zlib.gzipSync(stdout));
  write(stderrFile, zlib.gzipSync(stderr));
  const count = (label) => Number(stdout.toString().match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] || 0);
  const record = {
    cardId: 'A-S098', workerId: 'worker-A-S098', stage,
    command: [process.execPath, ...args], startedAtUtc, completedAtUtc: now(),
    exitCode: result.status, spawnError: result.error ? String(result.error) : null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/.test(stdout.toString() + stderr.toString()),
    stdoutFile, stderrFile, rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
  };
  json(`evidence\\${stage}.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return record;
}

function passed(record) {
  assert.equal(record.exitCode, 0);
  assert.equal(record.spawnError, null);
  assert.equal(record.fail, 0);
}

const stage = process.argv[2];
if (stage === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const sources = [
    { path: 'README.md', name: 'readme' },
    { path: '.docs\\wiki\\backlog.md', name: 'backlog' },
    { path: '.docs\\wiki\\kanban.md', name: 'kanban' },
  ].map((item) => {
    const gitPath = item.path.replace(/\\/g, '/');
    const working = fs.readFileSync(path.join(repo, item.path));
    const committed = git(['show', `${baseline}:${gitPath}`]);
    const workingSnapshot = `evidence\\raw\\source-${item.name}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source-${item.name}.git.raw.gz`;
    write(workingSnapshot, zlib.gzipSync(working));
    write(gitSnapshot, zlib.gzipSync(committed));
    return {
      path: item.path, gitPath, gitBlob: git(['rev-parse', `${baseline}:${gitPath}`]).toString().trim(),
      workingSnapshot, gitSnapshot, workingBytes: working.length, gitBytes: committed.length,
      workingSha256: sha(working), gitSha256: sha(committed),
      workingContainsCRLF: working.includes(Buffer.from('\r\n')),
      workingCanonicalSha256: sha(lf(working)), gitCanonicalSha256: sha(lf(committed)),
      fullCanonicalEqualsBaseline: lf(working).equals(lf(committed)),
    };
  });
  const unpack = (kind) => sources.map((item) => zlib.gunzipSync(read(item[kind])).toString());
  const exact = acceptance(...unpack('workingSnapshot'));
  assert.deepEqual(exact, acceptance(...unpack('gitSnapshot')));
  assert.equal(exact.source, '| S098 | **Rollback after new writes:** Preserve and interpret data created by the new version. |');
  assert.equal(exact.backlog, '| D-S098 | P0 | Add new-version writes followed by supported rollback or forward recovery. | New committed state remains interpretable and correct; rollback cannot silently discard or corrupt writes. | D-S060 |');
  json('evidence\\source-contract.json', {
    schemaVersion: 1, cardId: 'A-S098', workerId: 'worker-A-S098', sourceId: 'S098',
    parentId: 'D-S098', siblingId: 'B-S098', kano: 'S', kanoUnit: 'A-S098',
    packet: 'LP-COMPARE', entryGate: 'SOURCE', ownedScope: 'learning\\S098\\**',
    baseline, capturedAtUtc: now(), sourceReadBeforeBehaviorDesign: true,
    acceptanceEqualsBaseline: true, acceptance: exact, sources,
    refinement: 'One fixed-data write-aware recovery exercise, not a schema-evolution replacement, native proof or delighter. No further card is admitted.',
    qualification: 'Raw CRLF source snapshots are immutable. Exact selected contracts equal the recorded canonical Git source; volatile whole-board changes need not equal the baseline.',
  });
} else if (stage === 'bdd') {
  assert.equal(JSON.parse(read('evidence\\source-contract.json')).acceptanceEqualsBaseline, true);
  const feature = read('write-aware-recovery.feature');
  write('evidence\\raw\\bdd.feature.snapshot', feature);
  json('evidence\\bdd.json', {
    cardId: 'A-S098', recordedAtUtc: now(), beforeStubAssertionRun: true,
    featureSha256: sha(feature), featureCanonicalSha256: sha(lf(feature)),
    boundedUnit: 'A-S098', packet: 'LP-COMPARE', additionalCredit: 0,
  });
} else if (stage === 'red') {
  const snapshots = ['write-aware-recovery.feature', 'fixtures.js', 'model.js', 'tests\\model.test.cjs'].map((source) => {
    const raw = read(source);
    const snapshot = `evidence\\red\\${path.basename(source)}.snapshot`;
    write(snapshot, raw);
    return { source, snapshot, bytes: raw.length, sha256: sha(raw), canonicalSha256: sha(lf(raw)) };
  });
  json('evidence\\red\\snapshots.json', snapshots);
  const record = runCaptured('red', ['--test', '--test-concurrency=1', '.\\learning\\S098\\tests\\model.test.cjs']);
  assert.equal(record.exitCode, 1, 'RED must be an actual assertion failure');
  assert.ok(record.assertionFailures > 0);
  assert.equal(record.missingCodeOrTools, false);
  assert.equal(record.spawnError, null);
} else if (stage === 'iac') {
  assert.ok(JSON.parse(read('evidence\\red.json')).assertionFailures > 0);
  json('evidence\\iac-decision.json', {
    cardId: 'A-S098', status: 'N/A', decidedAtUtc: now(), afterAssertionRed: true, beforeImplementation: true,
    reason: 'Resource-free browser workbook; committed writes, readers, rollback and recovery are fixed synthetic teaching data only.',
    cloudIaCIdentityCredentialsScaffoldDeploySpend: false, actualDataOperations: false,
    nativeCompatibilityOrRecoveryCertified: false, productionNode24Validated: false,
  });
} else if (stage === 'tooling') {
  const helper = fs.readFileSync(path.join(repo, 'testing\\browser\\isolated.cjs'));
  assert.equal(sha(helper), HELPER_SHA);
  const helperCommit = git(['rev-parse', '53c0c0d^{commit}']).toString().trim();
  const committedHelper = git(['show', `${helperCommit}:testing/browser/isolated.cjs`]);
  assert.equal(sha(lf(committedHelper)), sha(lf(helper)));
  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress"],
  { cwd: repo, encoding: null });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr.toString());
  const edge = JSON.parse(result.stdout.toString().trim());
  assert.equal(edge.signatureStatus, 'Valid');
  assert.equal(edge.version, '156.0.4314.50');
  assert.match(edge.signer, /CN=Microsoft Corporation/);
  const playwright = JSON.parse(fs.readFileSync(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json')));
  assert.equal(playwright.version, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  write('evidence\\raw\\edge-signature.stdout.raw.gz', zlib.gzipSync(result.stdout));
  json('evidence\\tooling.json', {
    capturedAtUtc: now(), node: process.version, playwright: playwright.version, edge,
    helperSha256: HELPER_SHA, helperCommit, helperCanonicalGitSha256: sha(committedHelper), helperAPI: 'openIsolatedLesson',
    cleanup: 'await session.close() in finally', abandonedLifecyclePrototypeQualified: false,
    lifecycleLimit: 'Published helper context/shutdown deadlines remain unqualified for unattended CI.',
    downloadsInstallsUnsafeFlagsForegroundLeases: false, nativeOrNode24Certification: false,
  });
} else if (stage === 'green') {
  passed(runCaptured('green', ['--test', '--test-concurrency=1',
    '.\\learning\\S098\\tests\\model.test.cjs', '.\\learning\\S098\\tests\\surface.test.cjs']));
} else if (stage === 'browser') {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Browser proof writing requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
  passed(runCaptured('browser-run', ['--test', '--test-concurrency=1', '.\\learning\\S098\\tests\\browser.test.cjs'],
    { CAPTURE_BROWSER_EVIDENCE: '1' }));
} else if (['syntax', 'syntax-final', 'syntax-publication'].includes(stage)) {
  const startedAtUtc = now();
  const files = stage === 'syntax-publication' ? ['tests\\capture.cjs', 'tests\\integrity.test.cjs']
    : filesBelow().filter((file) => /\.(?:js|cjs)$/.test(file));
  const results = files.map((file) => {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { cwd: repo, encoding: null });
    const stdout = result.stdout || Buffer.alloc(0);
    const stderr = result.stderr || Buffer.alloc(0);
    write(`evidence\\raw\\${stage}-${path.basename(file)}.stdout.raw.gz`, zlib.gzipSync(stdout));
    write(`evidence\\raw\\${stage}-${path.basename(file)}.stderr.raw.gz`, zlib.gzipSync(stderr));
    assert.equal(result.status, 0, file);
    assert.equal(result.error, undefined, file);
    return { file, exitCode: result.status, sourceCanonicalSha256: sha(lf(read(file))), stdoutSha256: sha(stdout), stderrSha256: sha(stderr) };
  });
  json(`evidence\\${stage}.json`, { cardId: 'A-S098', startedAtUtc, completedAtUtc: now(), results });
} else if (stage === 'focused' || stage === 'publication-focused') {
  passed(runCaptured(stage, ['--test', '--test-concurrency=1',
    '.\\learning\\S098\\tests\\model.test.cjs', '.\\learning\\S098\\tests\\surface.test.cjs',
    '.\\learning\\S098\\tests\\integrity.test.cjs', '.\\learning\\S098\\tests\\browser.test.cjs']));
} else if (stage === 'index') {
  const entries = filesBelow().filter((file) => file !== 'evidence\\content-index.json').map((file) => {
    const raw = read(file);
    return {
      file, rawProtected: rawProtected(file), bytes: raw.length, workingSha256: sha(raw),
      canonicalGitSha256: sha(rawProtected(file) ? raw : lf(raw)),
    };
  });
  json('evidence\\content-index.json', {
    cardId: 'A-S098', recordedAtUtc: now(), excludesOnlySelf: true,
    policy: 'Owned raw/red attributes preserve exact bytes. Other UTF-8 source is qualified as canonical Git LF; working raw hashes remain provenance, not an LF-checkout failure.',
    entries,
  });
} else {
  throw new Error('Explicit capture stage required: source, bdd, red, iac, tooling, green, browser, syntax, syntax-final, syntax-publication, focused, publication-focused or index');
}
