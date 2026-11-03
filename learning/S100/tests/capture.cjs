'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const raw = path.join(root, 'evidence', 'raw');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(root, name));
const utc = () => new Date().toISOString();
const write = (name, bytes) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};
const json = (name, value) => write(name, `${JSON.stringify(value, null, 2)}\n`);
const compress = (name, bytes) => write(path.join('evidence', 'raw', name), gzipSync(bytes));
const git = (...args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: null });
  if (run.status !== 0) throw new Error(`git failed: ${run.stderr.toString()}`);
  return run.stdout;
};
const relative = (target) => path.relative(root, target);

function execute(stage, args, expectedStatus = 0) {
  const startedAtUtc = utc();
  const run = spawnSync(process.execPath, args, {
    cwd: repo, encoding: null, maxBuffer: 16 * 1024 * 1024, env: process.env,
  });
  const stdout = run.stdout || Buffer.alloc(0);
  const stderr = run.stderr || Buffer.alloc(0);
  compress(`${stage}.stdout.raw.gz`, stdout);
  compress(`${stage}.stderr.raw.gz`, stderr);
  const record = {
    stage, startedAtUtc, endedAtUtc: utc(), executable: process.execPath,
    nodeVersion: process.version, command: [process.execPath, ...args],
    exitStatus: run.status, signal: run.signal, error: run.error?.message || null,
    stdout: relative(path.join(raw, `${stage}.stdout.raw.gz`)),
    stderr: relative(path.join(raw, `${stage}.stderr.raw.gz`)),
    stdoutRawSha256: sha(stdout), stderrRawSha256: sha(stderr),
    stdoutArchiveSha256: sha(read(path.join('evidence', 'raw', `${stage}.stdout.raw.gz`))),
    stderrArchiveSha256: sha(read(path.join('evidence', 'raw', `${stage}.stderr.raw.gz`))),
  };
  json(path.join('evidence', `${stage}.json`), record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (run.error || run.signal || run.status !== expectedStatus) {
    throw new Error(`${stage}: expected exit ${expectedStatus}, observed ${run.status}; raw output preserved`);
  }
  return { record, stdout, stderr };
}

function source() {
  const head = git('rev-parse', 'HEAD').toString().trim();
  const files = [
    ['readme', 'README.md', /^\| S100 \|.*$/m],
    ['backlog', path.join('.docs', 'wiki', 'backlog.md'), /^\| D-S100 \|.*$/m],
    ['kanban', path.join('.docs', 'wiki', 'kanban.md'), /^\| A-S100 \|.*$/m],
  ];
  let kanban;
  const sourceFiles = files.map(([name, file, row]) => {
    const working = fs.readFileSync(path.join(repo, file));
    const gitPath = file.split(path.sep).join('/');
    const canonical = git('show', `${head}:${gitPath}`);
    const oid = git('rev-parse', `${head}:${gitPath}`).toString().trim();
    const exactRow = working.toString().match(row)?.[0].replace(/\r$/, '');
    const canonicalRow = canonical.toString().match(row)?.[0].replace(/\r$/, '');
    if (!exactRow || exactRow !== canonicalRow) throw new Error(`Source row mismatch: ${file}`);
    compress(`source-${name}.working.raw.gz`, working);
    compress(`source-${name}.git.raw.gz`, canonical);
    if (name === 'kanban') kanban = working.toString();
    return {
      path: file, gitBlobOid: oid, gitBlobSha256: sha(canonical),
      workingRawSha256: sha(working), exactRow,
      workingContainsCRLF: working.includes(Buffer.from('\r\n')),
      canonicalContainsCRLF: canonical.includes(Buffer.from('\r\n')),
      rawArchive: path.join('evidence', 'raw', `source-${name}.working.raw.gz`),
      canonicalArchive: path.join('evidence', 'raw', `source-${name}.git.raw.gz`),
      wholeWorkingMatchesCanonicalAfterCRLFNormalization:
        working.toString().replace(/\r\n/g, '\n') === canonical.toString(),
    };
  });
  const section = (heading, next) => {
    const value = kanban.split(heading)[1]?.split(next)[0]?.trim();
    if (!value) throw new Error(`Missing contract section: ${heading}`);
    return value;
  };
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json')));
  const claimed = ledger.cards.find((card) => card.id === 'A-S100');
  if (claimed?.owner !== 'worker-A-S100' || claimed.state !== 'In Progress') {
    throw new Error('Claim identity/state mismatch');
  }
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')))
    .cards.find((card) => card.id === 'A-S100');
  json(path.join('evidence', 'source-contract.json'), {
    schemaVersion: 1, cardId: 'A-S100', parentId: 'D-S100', kano: 'S',
    kanoUnit: 'A-S100', packet: 'SC-S100', capturedAtUtc: utc(),
    beforeBehaviorImplementation: true, headAtCapture: head, sourceFiles,
    atomicContract: section('## Atomic card contract', '### Portable A-card lesson contract'),
    portableContract: section('### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packetRule: kanban.match(/^Packet membership is fixed before admission\..*$/m)?.[0].replace(/\r$/, ''),
    nativeSiblingRow: kanban.match(/^\| B-S100 \|.*$/m)?.[0].replace(/\r$/, ''),
    inventory, claim: {
      owner: claimed.owner, state: claimed.state, authorization: claimed.authorization,
      claimedAtUtc: claimed.claimedAtUtc,
    },
    sourceAcceptance: sourceFiles[1].exactRow,
    dependencyQualification: 'D-S042, D-S049 and BASE remain original native/source prerequisites; this admitted A slice consumes SOURCE only. B-S100 and D-S100 are not completed.',
    byteQualification: 'Raw working bytes and canonical Git blob bytes are separately preserved and hashed. Raw CRLF preservation is not canonical-source certification; mutable administrative prose may differ.',
  });
  write(path.join('evidence', 'raw', 'bdd.feature.snapshot'), read('forced-work.feature'));
  json(path.join('evidence', 'bdd.json'), {
    specifiedAtUtc: utc(), source: 'forced-work.feature',
    sourceSha256: sha(read('forced-work.feature')), beforeAssertionRed: true,
  });
}

function red() {
  const frozen = ['model.js', path.join('tests', 'model.test.cjs'), 'forced-work.feature'];
  const snapshots = frozen.map((file) => {
    const target = path.join('evidence', 'red', `${path.basename(file)}.snapshot`);
    const bytes = read(file);
    write(target, bytes);
    return { source: file, snapshot: target, sha256: sha(bytes) };
  });
  json(path.join('evidence', 'red', 'snapshots.json'), {
    beforeImplementation: true, capturedAtUtc: utc(), snapshots,
    discovery: 'Snapshots have .snapshot extensions outside tests; ordinary discovery never runs them.',
  });
  const run = execute('red', ['--test', path.join('learning', 'S100', 'tests', 'model.test.cjs')], 1);
  if (!/ERR_ASSERTION/.test(run.stdout.toString()) || !/0 !== 4/.test(run.stdout.toString())) {
    throw new Error('RED was not the required loadable-stub behavioral assertion failure');
  }
  json(path.join('evidence', 'red.json'), {
    ...run.record, genuineAssertionRed: true,
    assertion: 'The loaded stub reported 0 attempted journeys; the acceptance assertion required 4.',
    snapshots: path.join('evidence', 'red', 'snapshots.json'),
  });
}

function tooling() {
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  if (sha(helper) !== expected) throw new Error('The published helper bytes do not match the authorized digest');
  const packageVersion = JSON.parse(fs.readFileSync(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'))).version;
  const signature = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $s=Get-AuthenticodeSignature -LiteralPath $p; [ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress"],
  { cwd: repo, encoding: null });
  compress('edge-signature.stdout.raw.gz', signature.stdout || Buffer.alloc(0));
  compress('edge-signature.stderr.raw.gz', signature.stderr || Buffer.alloc(0));
  if (signature.status !== 0) throw new Error('Signed Edge preflight failed; no fallback or download');
  const edge = JSON.parse(signature.stdout.toString());
  if (process.version !== 'v22.23.4' || packageVersion !== '1.56.1'
      || edge.version !== '156.0.4314.50' || edge.signatureStatus !== 'Valid'
      || !edge.signer.includes('Microsoft Corporation')) {
    throw new Error('Existing offline tooling differs from the approved tested pair');
  }
  git('merge-base', '--is-ancestor', '53c0c0d', 'HEAD');
  json(path.join('evidence', 'tooling.json'), {
    checkedAtUtc: utc(), nodeVersion: process.version, runtimeRole: 'test tooling only',
    productionNode24Qualified: false, playwrightVersion: packageVersion, edge,
    helperPublishedCommit: '53c0c0d', helperWorkingSha256: sha(helper),
    helperApi: 'openIsolatedLesson with awaited finally close',
    lifecyclePrototypeQualified: false,
    lifecycleLimit: 'The published helper has no overall context/shutdown recovery deadline; no abandoned prototype or process termination is used.',
    installation: 'Existing offline tooling only; no packages, downloads, global installs or security weakening.',
    signatureRawStdoutSha256: sha(signature.stdout),
  });
}

function seal() {
  const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
  if (objectFormat !== 'sha1') throw new Error('This byte qualification expects the existing SHA-1 Git repository');
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (relative(target) !== path.join('evidence', 'content-index.json')) {
        const bytes = fs.readFileSync(target);
        const file = relative(target);
        const rawProof = file.startsWith(`evidence${path.sep}`)
          && ['.snapshot', '.gz', '.png'].includes(path.extname(file));
        if (!rawProof && !Buffer.from(bytes.toString('utf8')).equals(bytes)) {
          throw new Error(`Unexpected non-UTF8 text file: ${file}`);
        }
        const canonical = rawProof ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
        const gitBlobOid = createHash('sha1')
          .update(Buffer.from(`blob ${canonical.length}\0`)).update(canonical).digest('hex');
        files.push({
          path: file, byteMode: rawProof ? 'raw-preserved' : 'lf-canonical-git-text',
          workingRawBytes: bytes.length, workingRawSha256: sha(bytes),
          bytes: canonical.length, sha256: sha(canonical), gitBlobOid,
        });
      }
    }
  }
  walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  json(path.join('evidence', 'content-index.json'), {
    schemaVersion: 2, generatedAtUtc: utc(), gitObjectFormat: objectFormat, files,
    scope: 'Every owned regular file except this non-self-hashing index: raw proof bytes are exact, ordinary UTF-8 text uses canonical Git LF bytes. Captured working-raw hashes are separately recorded, not confused with portable Git-source hashes.',
    verification: 'Normal tests are read-only and verify the actual Git clean-filter blob ID for every indexed path, plus captured immutable source Git blobs. CRLF/LF working text may differ; raw snapshots and archives must never normalize.',
  });
  console.log(`Sealed ${files.length} owned byte hashes.`);
}

const stage = process.argv[2];
if (stage === 'source') source();
else if (stage === 'red') red();
else if (stage === 'tooling') tooling();
else if (stage === 'iac') {
  json(path.join('evidence', 'iac-decision.json'), {
    decidedAtUtc: utc(), applicability: 'N/A', afterAssertionRed: true,
    beforeBehaviorImplementation: true,
    reason: 'A resource-free standalone synthetic HTML/JS lesson. Termination and work are fixed data only; no IaC, Azure, identity, credential, deployment or spend operations are authorized or necessary.',
  });
} else if (stage === 'focused') {
  execute('focused-green', ['--test',
    path.join('learning', 'S100', 'tests', 'model.test.cjs'),
    path.join('learning', 'S100', 'tests', 'surface.test.cjs')]);
} else if (stage === 'browser') {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser evidence capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
  }
  execute('browser-run', ['--test', path.join('learning', 'S100', 'tests', 'browser.test.cjs')]);
} else if (stage === 'green' || stage === 'qualification-green' || stage === 'portability-green') {
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') throw new Error('Final green must run read-only browser verification');
  execute(stage, ['--test', '--test-concurrency=1',
    path.join('learning', 'S100', 'tests', 'model.test.cjs'),
    path.join('learning', 'S100', 'tests', 'surface.test.cjs'),
    path.join('learning', 'S100', 'tests', 'integrity.test.cjs'),
    path.join('learning', 'S100', 'tests', 'browser.test.cjs')]);
} else if (stage === 'syntax') {
  const files = ['model.js', 'app.js',
    path.join('tests', 'model.test.cjs'), path.join('tests', 'surface.test.cjs'),
    path.join('tests', 'browser.test.cjs'), path.join('tests', 'integrity.test.cjs'),
    path.join('tests', 'capture.cjs')];
  const results = files.map((file) => execute(`syntax-${path.basename(file)}`, [
    '--check', path.join('learning', 'S100', file),
  ]).record);
  json(path.join('evidence', 'syntax.json'), { capturedAtUtc: utc(), results });
} else if (stage === 'seal') seal();
else throw new Error('Explicit source/red/iac/tooling/focused/browser/green/qualification-green/portability-green/syntax/seal stage required');
