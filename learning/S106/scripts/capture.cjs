'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const raw = path.join(evidence, 'raw');
const stage = process.argv[2];
const identity = {
  schemaVersion: 1, sourceId: 'S106', cardId: 'A-S106', parentId: 'D-S106',
  workerId: 'worker-A-S106', packet: 'SC-S106', kano: 'S', kanoUnit: 'A-S106',
  mode: 'synthetic'
};
const helperCommit = '53c0c0d';
const helperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const gitPath = file => file.split(path.sep).join('/');
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repo });
const time = () => new Date().toISOString();
const runId = () => time().replace(/[:.]/g, '-');

function writeJson(name, value) {
  fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
}

function snapshot(name, bytes) {
  const relative = path.join('raw', name);
  const target = path.join(evidence, relative);
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite raw evidence: ${relative}`);
  fs.writeFileSync(target, bytes);
  return { path: relative, sha256: sha(bytes), bytes: bytes.length };
}

function lines(bytes, prefix) {
  const entries = bytes.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) || [];
  const found = entries.filter(line => line.startsWith(prefix));
  if (found.length !== 1) throw new Error(`Expected one exact source line: ${prefix}`);
  return Buffer.from(found[0]);
}

function section(bytes, first, next) {
  const text = bytes.toString('utf8');
  const start = text.indexOf(first);
  const end = text.indexOf(next, start + first.length);
  if (start < 0 || end < start) throw new Error(`Missing source section ${first}`);
  return Buffer.from(text.slice(start, end));
}

function allFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Owned evidence cannot use symlinks');
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? allFiles(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

function inputs() {
  return allFiles(root).filter(file => !file.startsWith(`evidence${path.sep}`))
    .map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
}

function execute(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repo, encoding: null, env: process.env, timeout: 120000
  });
  const output = Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]);
  return { exitCode: result.status, signal: result.signal, error: result.error?.message || null, output };
}

function captureRun(name, args) {
  const startedAtUtc = time();
  const result = execute(args);
  const output = snapshot(`${name}-${runId()}.output.snapshot`, result.output);
  const record = {
    ...identity, startedAtUtc, finishedAtUtc: time(), node: process.version,
    command: [process.execPath, ...args], exitCode: result.exitCode, signal: result.signal,
    error: result.error, passed: result.exitCode === 0, inputs: inputs(), output
  };
  const prior = path.join(evidence, `${name}.json`);
  if (fs.existsSync(prior)) {
    record.priorAttempts = [JSON.parse(fs.readFileSync(prior, 'utf8'))];
  }
  writeJson(`${name}.json`, record);
  process.stdout.write(result.output);
  if (!record.passed) process.exitCode = 1;
  return record;
}

function captureSource() {
  const sourceCommit = git('rev-parse', 'HEAD').toString('utf8').trim();
  const definitions = [
    ['README.md', [
      ['readme-s106', bytes => lines(bytes, '| S106 |')],
      ['outcome-classification', bytes => section(bytes, '### Outcome classification', '### Five-nines transition metric')]
    ]],
    [path.join('.docs', 'wiki', 'backlog.md'), [
      ['backlog-d-s106', bytes => lines(bytes, '| D-S106 |')]
    ]],
    [path.join('.docs', 'wiki', 'kanban.md'), [
      ['card-a-s106', bytes => lines(bytes, '| A-S106 |')],
      ['card-b-s106', bytes => lines(bytes, '| B-S106 |')],
      ['atomic-card-contract', bytes => section(bytes, '## Atomic card contract', '### Portable A-card lesson contract')],
      ['portable-a-contract', bytes => section(bytes, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow')],
      ['packet-rule', bytes => lines(bytes, 'The selected policy is')]
    ]]
  ];
  const sources = definitions.map(([file, fragments]) => {
    const bytes = fs.readFileSync(path.join(repo, file));
    const objectPath = `${sourceCommit}:${gitPath(file)}`;
    const blob = git('show', objectPath);
    return {
      repositoryPath: file,
      workingTreeRawSha256: sha(bytes),
      workingTreeLineEndings: bytes.includes(Buffer.from('\r\n')) ? 'CRLF' : 'LF',
      canonicalGit: {
        commit: sourceCommit, blobOid: git('rev-parse', objectPath).toString('utf8').trim(),
        sha256: sha(blob), lineEndings: blob.includes(Buffer.from('\r\n')) ? 'CRLF' : 'LF'
      },
      fragments: fragments.map(([label, pick]) => {
        const working = pick(bytes);
        const pinned = pick(blob);
        if (!canonical(working).equals(canonical(pinned))) throw new Error(`Source excerpt differs from pinned Git: ${label}`);
        return {
          label, workingTreeRaw: snapshot(`${label}.raw.snapshot`, working),
          canonicalGit: snapshot(`${label}.git.snapshot`, pinned),
          equalAfterCRLFNormalization: true
        };
      })
    };
  });
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json'), 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json'), 'utf8'));
  const card = inventory.cards.find(item => item.id === identity.cardId);
  const claim = ledger.cards.find(item => item.id === identity.cardId);
  if (claim.owner !== identity.workerId || claim.state !== 'In Progress' || card.packet !== identity.packet || card.kano !== 'S') {
    throw new Error('Original claimed card, packet or frozen Kano class mismatch');
  }
  writeJson('source-contract.json', {
    ...identity, capturedAtUtc: time(), sourceCommit, sources, originalCard: card,
    claim: { state: claim.state, owner: claim.owner, claimedAtUtc: claim.claimedAtUtc, authorization: claim.authorization },
    packetMembers: inventory.cards.filter(item => item.packet === identity.packet).map(item => item.id),
    qualification: 'Exact S106 row in repository README.md, D-S106 acceptance, A/B rows, portable/atomic contract and packet rule were read before behavior design. Raw working-tree CRLF excerpts and pinned canonical Git blobs are separately qualified.',
    originalAcceptance: 'Required private connectivity is verified without exposing management access; public-probe success alone cannot approve the path.',
    nativeLimit: 'B-S106, P006 and D-S106 original native acceptance remain unfulfilled; one frozen A-S106 S unit only.'
  });
}

function captureRed() {
  if (fs.existsSync(path.join(evidence, 'red.json'))) throw new Error('RED is immutable and cannot be recaptured');
  const startedAtUtc = time();
  const bdd = snapshot('red-bdd.feature.snapshot', fs.readFileSync(path.join(root, 'private-path.feature')));
  const stub = snapshot('red-loadable-stub.js.snapshot', fs.readFileSync(path.join(root, 'model.js')));
  const assertion = snapshot('red-assertion.cjs.snapshot', fs.readFileSync(path.join(root, 'tests', 'model.test.cjs')));
  const load = execute(['-e', 'const m=require(process.argv[1]);if(typeof m.evaluate!=="function")process.exit(3);console.log("S106 stub loaded");', path.join(root, 'model.js')]);
  const loadOutput = snapshot('red-stub-load.output.snapshot', load.output);
  const result = execute(['--test', path.join('learning', 'S106', 'tests', 'model.test.cjs')]);
  const output = snapshot('red-assertion.output.snapshot', result.output);
  const genuine = load.exitCode === 0 && result.exitCode === 1
    && /ERR_ASSERTION/.test(result.output.toString('utf8'))
    && /public success cannot certify an unobserved actual private path/.test(result.output.toString('utf8'))
    && /'success'/.test(result.output.toString('utf8')) && /'unknown'/.test(result.output.toString('utf8'));
  writeJson('red.json', {
    ...identity, startedAtUtc, finishedAtUtc: time(), node: process.version,
    command: 'node --test learning\\S106\\tests\\model.test.cjs',
    stubLoadExitCode: load.exitCode, assertionExitCode: result.exitCode,
    genuineBehavioralAssertionRed: genuine, bdd, stub, assertion, loadOutput, output,
    qualification: 'A loadable deliberately wrong behavioral stub failed an actual success-versus-unknown assertion, not import, syntax or tooling. All RED bytes are outside automatic test discovery.'
  });
  process.stdout.write(result.output);
  if (!genuine) throw new Error('Genuine assertion RED not established');
}

function captureIac() {
  const red = JSON.parse(fs.readFileSync(path.join(evidence, 'red.json'), 'utf8'));
  if (!red.genuineBehavioralAssertionRed) throw new Error('IaC decision requires genuine prior RED');
  writeJson('iac-decision.json', {
    ...identity, decidedAtUtc: time(), decision: 'N/A', priorRedFinishedAtUtc: red.finishedAtUtc,
    rationale: 'Resource-free standalone HTML/JavaScript lesson. All network/DNS/identity/dependency observations are fictional teaching DATA ONLY. No cloud, IaC, scaffold, identity, credentials, packages, deployment or spend is authorized.'
  });
}

function captureTooling() {
  const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperBytes = fs.readFileSync(helperPath);
  const canonicalBlob = git('show', `${helperCommit}:testing/browser/isolated.cjs`);
  if (sha(helperBytes) !== helperSha || !/^v22\./.test(process.version)) throw new Error('Unqualified helper or Node tooling');
  const playwrightPackage = require.resolve('playwright/package.json', { paths: [path.dirname(helperPath)] });
  const playwrightVersion = JSON.parse(fs.readFileSync(playwrightPackage, 'utf8')).version;
  const command = '$ErrorActionPreference="Stop";$p=Join-Path ${env:ProgramFiles(x86)} "Microsoft\\Edge\\Application\\msedge.exe";$v=(Get-Item -LiteralPath $p).VersionInfo;$s=Get-AuthenticodeSignature -LiteralPath $p;@{path=$p;fileVersion=$v.FileVersion;productVersion=$v.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress';
  const browser = JSON.parse(execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: repo }).toString('utf8'));
  if (playwrightVersion !== '1.56.1' || !/^156\./.test(browser.productVersion)
      || browser.signatureStatus !== 'Valid' || !/Microsoft Corporation/.test(browser.signer)) {
    throw new Error('Installed offline browser pairing is not qualified');
  }
  writeJson('tooling-preflight.json', {
    ...identity, checkedAtUtc: time(), node: process.version, playwrightVersion, browser,
    helper: {
      path: path.join('testing', 'browser', 'isolated.cjs'),
      commit: git('rev-parse', `${helperCommit}^{commit}`).toString('utf8').trim(),
      gitBlobOid: git('rev-parse', `${helperCommit}:testing/browser/isolated.cjs`).toString('utf8').trim(),
      rawSha256: helperSha, rawLineEndings: 'CRLF', canonicalGitSha256: sha(canonicalBlob), canonicalGitLineEndings: 'LF'
    },
    qualification: 'Existing offline Playwright 1.56.1 / Microsoft-signed Edge 156 / Node 22 test tooling only. Published helper only; lifecycle prototype unqualified. Not production Node 24, native Azure or source-parent evidence. No download or package installation.'
  });
}

function captureSyntax() {
  const startedAtUtc = time();
  const targets = allFiles(root).filter(file => /\.(js|cjs)$/.test(file));
  const runs = targets.map(file => {
    const result = execute(['--check', path.join(root, file)]);
    return {
      path: file, exitCode: result.exitCode, signal: result.signal, error: result.error,
      output: snapshot(`syntax-${file.replace(/[\\]/g, '-')}-${runId()}.output.snapshot`, result.output)
    };
  });
  writeJson('syntax-green.json', {
    ...identity, startedAtUtc, finishedAtUtc: time(), node: process.version,
    passed: runs.every(run => run.exitCode === 0), inputs: inputs(), runs,
    qualification: 'Node 22 syntax checks are test tooling, not production Node 24 validation.'
  });
  if (runs.some(run => run.exitCode !== 0)) throw new Error('Focused syntax failed');
}

fs.mkdirSync(raw, { recursive: true });
if (stage === 'source') captureSource();
else if (stage === 'red') captureRed();
else if (stage === 'iac') captureIac();
else if (stage === 'tooling') captureTooling();
else if (stage === 'tooling-attempt') captureRun('tooling-attempt', [path.join('learning', 'S106', 'scripts', 'capture.cjs'), 'tooling']);
else if (stage === 'syntax') captureSyntax();
else if (stage === 'focused') captureRun('focused-green', ['--test',
  path.join('learning', 'S106', 'tests', 'model.test.cjs'),
  path.join('learning', 'S106', 'tests', 'bundle.test.cjs')]);
else if (stage === 'browser') {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Browser producer capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
  captureRun('browser-run', ['--test', path.join('learning', 'S106', 'tests', 'browser.test.cjs')]);
} else if (stage === 'integrity') {
  const files = allFiles(root).filter(file => file !== path.join('evidence', 'content-index.json'))
    .map(file => {
      const bytes = fs.readFileSync(path.join(root, file));
      return { path: file, bytes: bytes.length, sha256: sha(bytes) };
    });
  writeJson('content-index.json', { ...identity, capturedAtUtc: time(), qualification: 'Raw bytes; narrow evidence -text attributes preserve CRLF snapshots separately from canonical Git source qualification.', files });
} else {
  throw new Error('Select exactly one producer stage: source, red, iac, tooling, tooling-attempt, syntax, focused, browser, integrity');
}
