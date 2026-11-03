'use strict';

// Deliberate append-only capture; never imported by the normal test suite.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { root, repo, read, sha, lf, git, acceptance, inventory, exactRaw } = require('./provenance.cjs');
function write(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const gzip = (file, bytes) => write(file, zlib.gzipSync(bytes));
const mode = process.argv[2];
if (mode === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const texts = [];
  const committed = [];
  const sources = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'].map((file, i) => {
    const raw = fs.readFileSync(path.join(repo, file));
    const original = git(['show', `${baseline}:${file.replace(/\\/g, '/')}`]);
    const workingSnapshot = `evidence\\raw\\source-${i}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source-${i}.git.raw.gz`;
    gzip(workingSnapshot, raw); gzip(gitSnapshot, original);
    texts.push(raw.toString()); committed.push(original.toString());
    return {
      path: file, workingSnapshot, gitSnapshot, workingBytes: raw.length,
      workingSha256: sha(raw), workingCanonicalSha256: sha(lf(raw)), gitSha256: sha(original),
      workingContainsCRLF: raw.includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(raw).equals(original),
    };
  });
  const exactAcceptance = acceptance(...texts);
  if (JSON.stringify(exactAcceptance) !== JSON.stringify(acceptance(...committed))) throw new Error('Acceptance differs from committed source.');
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json'), 'utf8'));
  const card = ledger.cards.find((item) => item.id === 'A-S084');
  if (card.owner !== 'worker-A-S084' || card.state !== 'In Progress') throw new Error('Claimed source identity differs.');
  json('evidence\\source-contract.json', {
    cardId: 'A-S084', workerId: 'worker-A-S084', kano: 'S', kanoUnit: 'A-S084', packet: 'SC-S084',
    baseline, recordedAtUtc: new Date().toISOString(), sourceReadBeforeBehaviorDesign: true,
    acceptanceEqualsBaseline: true, acceptance: exactAcceptance, sources,
    admittedContract: {
      deliver: card.deliver, authorization: card.authorization, technicalEntryGate: card.technicalEntryGate,
      parents: card.parents, claimedAtUtc: card.claimedAtUtc,
    },
    nativeAcceptanceNotCompleted: true,
  });
} else if (mode === 'tooling') {
  const command = [
    '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; $browser = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'; "
      + '$signature = Get-AuthenticodeSignature -FilePath $browser; '
      + '[ordered]@{ browserPath=$browser; browserVersion=(Get-Item $browser).VersionInfo.ProductVersion; '
      + 'signatureStatus=[string]$signature.Status; signer=$signature.SignerCertificate.Subject } | ConvertTo-Json -Compress',
  ];
  const result = spawnSync('pwsh.exe', command, { cwd: repo });
  if (result.error || result.status !== 0) throw new Error(`Tooling preflight failed: ${result.error || result.stderr}`);
  const tooling = JSON.parse(result.stdout.toString('utf8').replace(/^\uFEFF/, ''));
  if (tooling.signatureStatus !== 'Valid' || !/Microsoft Corporation/.test(tooling.signer)
      || !/^156\./.test(tooling.browserVersion)) throw new Error('Unqualified installed Edge.');
  gzip('evidence\\raw\\tooling.stdout.raw.gz', result.stdout);
  gzip('evidence\\raw\\tooling.stderr.raw.gz', result.stderr);
  json('evidence\\tooling.json', {
    ...tooling, cardId: 'A-S084', recordedAtUtc: new Date().toISOString(), runtime: process.version,
    playwrightVersion: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    helperPath: 'testing\\browser\\isolated.cjs',
    helperSha256: sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))),
    rawStdoutSha256: sha(result.stdout), rawStderrSha256: sha(result.stderr),
    command: ['pwsh.exe', ...command], packagesInstalled: false, browserDownloaded: false,
    foregroundLease: false, unsafeFlags: false, abandonedLifecyclePrototypeUsed: false,
    scope: 'Existing offline pairing preflight, not production Node24 or native Azure evidence.',
  });
} else if (['red', 'red-assertion', 'browser-focus-red', 'model-green', 'focused-green'].includes(mode)) {
  const isRed = mode.startsWith('red');
  const expectedFailure = isRed || mode === 'browser-focus-red';
  const folder = isRed ? 'evidence\\red' : 'evidence\\verification';
  const stem = mode === 'red' ? 'run' : mode === 'red-assertion' ? 'assertion-run' : mode;
  const snapshots = [];
  if (isRed) for (const file of ['model.js', 'duplicate-commands.feature', 'tests\\model.test.cjs']) {
    const raw = read(file);
    const snapshot = `${mode === 'red-assertion' ? 'assertion-' : ''}${file.replace(/\\/g, '__')}.snapshot`;
    write(`${folder}\\${snapshot}`, raw);
    snapshots.push({ source: file, snapshot, bytes: raw.length, sha256: sha(raw) });
  }
  if (mode === 'browser-focus-red') for (const file of ['styles.css', 'tests\\browser.test.cjs']) {
    const raw = read(file);
    const snapshot = `evidence\\raw\\browser-focus-${file.replace(/\\/g, '__')}.snapshot`;
    write(snapshot, raw);
    snapshots.push({ source: file, snapshot, bytes: raw.length, sha256: sha(raw) });
  }
  const selectors = mode === 'browser-focus-red' ? ['browser.test.cjs'] : mode === 'focused-green'
    ? ['model.test.cjs', 'surface.test.cjs', 'integrity.test.cjs', 'browser.test.cjs']
    : ['model.test.cjs'];
  const args = ['--test', '--test-concurrency=1', ...selectors.map((file) => path.join('learning', 'S084', 'tests', file))];
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '' }, maxBuffer: 16 * 1024 * 1024,
  });
  const output = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  gzip(`${folder}\\${stem}.stdout.raw.gz`, output);
  gzip(`${folder}\\${stem}.stderr.raw.gz`, stderr);
  const count = (name) => Number(output.toString().match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] || 0);
  const record = {
    cardId: 'A-S084', workerId: 'worker-A-S084', stage: mode, command: [process.execPath, ...args],
    startedAtUtc, completedAtUtc: new Date().toISOString(), runtime: process.version,
    exitCode: result.status, spawnError: result.error ? String(result.error) : null,
    tests: count('tests'), pass: count('pass'), fail: count('fail'),
    assertionFailures: (output.toString().match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/.test(output + stderr),
    rawStdoutSha256: sha(output), rawStderrSha256: sha(stderr), snapshots,
    qualifiedAssertionRed: mode === 'red-assertion',
    earlierUnqualifiedPrelude: mode === 'red-assertion' ? 'evidence\\red\\run.json' : null,
  };
  json(`${folder}\\${stem}.json`, record);
  process.stdout.write(output); process.stderr.write(stderr);
  if (record.spawnError || record.missingCodeOrTools
      || (expectedFailure ? record.exitCode !== 1 || !record.assertionFailures : record.exitCode !== 0)
      || (mode === 'red-assertion' && record.assertionFailures !== record.fail)) {
    process.exitCode = 1;
  } else console.log(`Captured ${mode}: ${record.tests} tests, ${record.pass} pass, ${record.fail} fail.`);
} else if (mode === 'iac') {
  const red = JSON.parse(read('evidence\\red\\assertion-run.json'));
  if (red.exitCode !== 1 || !red.assertionFailures || red.assertionFailures !== red.fail || red.missingCodeOrTools) {
    throw new Error('Real assertion-only RED required first.');
  }
  json('evidence\\iac-decision.json', {
    cardId: 'A-S084', status: 'N/A', decidedAtUtc: new Date().toISOString(), beforeImplementation: true,
    reason: 'Resource-free synthetic browser lesson. Commands, resources and swaps are fixed trace records, never operations.',
    nativeCommandRetryIdempotencySwapCertification: false,
    cloudIaCScaffoldIdentityCredentialsDeploySpendApproved: false,
  });
} else if (mode === 'seal' || mode === 'seal-final') {
  const indexFile = mode === 'seal-final' ? 'evidence\\content-index-final.json' : 'evidence\\content-index.json';
  const files = inventory().filter((file) => file !== indexFile
    && !file.startsWith('evidence\\verification\\'));
  json(indexFile, {
    cardId: 'A-S084', sealedAtUtc: new Date().toISOString(),
    textRule: 'Canonical LF Git-source text; narrow attributed raw proof retains exact bytes including CRLF.',
    exclusions: [indexFile, 'evidence\\verification\\**'],
    files: files.map((file) => ({
      path: file, mode: exactRaw(file) ? 'raw' : 'canonical-lf',
      sha256: sha(exactRaw(file) ? read(file) : lf(read(file))),
    })),
  });
} else throw new Error('Choose source, tooling, red, red-assertion, browser-focus-red, iac, model-green, focused-green, seal or seal-final explicitly.');
