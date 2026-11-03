'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const raw = path.join(evidence, 'raw');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = relative => fs.readFileSync(path.join(root, relative));
const writeJson = (file, value) => fs.writeFileSync(path.join(evidence, file), `${JSON.stringify(value, null, 2)}\n`);
const gitPath = file => file.split(path.sep).join('/');
const timestamp = () => new Date().toISOString();
const label = () => timestamp().replace(/[:.]/g, '-');

function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.toString());
  return result.stdout;
}

function saveRaw(file, bytes) {
  const target = path.join(raw, file);
  fs.writeFileSync(target, bytes);
  return { path: path.join('raw', file), sha256: sha(bytes), bytes: bytes.length };
}

function endings(bytes) {
  const text = bytes.toString('utf8');
  const crlf = (text.match(/\r\n/g) || []).length;
  return { crlf, bareLf: (text.match(/\n/g) || []).length - crlf, bareCr: (text.match(/\r/g) || []).length - crlf };
}

function line(bytes, prefix) {
  const start = bytes.indexOf(Buffer.from(prefix));
  if (start < 0) throw new Error(`Missing exact source line ${prefix}`);
  const end = bytes.indexOf(10, start);
  return bytes.subarray(start, end < 0 ? bytes.length : end + 1);
}

function section(bytes, startText, endText) {
  const start = bytes.indexOf(Buffer.from(startText));
  const end = bytes.indexOf(Buffer.from(endText), start + startText.length);
  if (start < 0 || end < 0) throw new Error(`Missing source section ${startText}`);
  return bytes.subarray(start, end);
}

function inputs() {
  return [
    '.gitattributes', 'host-path.feature', 'manifest.json', 'README.md', 'model.js', 'app.js',
    'index.html', 'styles.css', 'tests\\model.test.cjs', 'tests\\bundle.test.cjs', 'tests\\browser.test.cjs',
    'tests\\fixtures\\csp-probe.js', 'scripts\\evidence.cjs'
  ].filter(file => fs.existsSync(path.join(root, file))).map(file => ({
    path: file, canonicalSha256: sha(canonical(read(file))), rawSha256: sha(read(file))
  }));
}

function captureSource() {
  const head = git(['rev-parse', 'HEAD']).toString().trim();
  const descriptors = [
    { path: 'README.md', fragments: [['readme-row', bytes => line(bytes, '| S104 |')]] },
    { path: '.docs\\wiki\\backlog.md', fragments: [['backlog-row', bytes => line(bytes, '| D-S104 |')]] },
    {
      path: '.docs\\wiki\\kanban.md',
      fragments: [
        ['atomic-portable', bytes => section(bytes, '## Atomic card contract', '## Concurrent pull and one-piece flow')],
        ['a-card', bytes => line(bytes, '| A-S104 |')],
        ['b-card', bytes => line(bytes, '| B-S104 |')],
        ['packet', bytes => line(bytes, 'Packet membership is fixed before admission.')]
      ]
    }
  ];
  const sourceFiles = descriptors.map(descriptor => {
    const working = fs.readFileSync(path.join(repo, descriptor.path));
    const gitBlobOid = git(['rev-parse', `${head}:${gitPath(descriptor.path)}`]).toString().trim();
    const blob = git(['cat-file', 'blob', gitBlobOid]);
    return {
      path: descriptor.path, gitBlobOid, gitBlobSha256: sha(blob),
      rawWorkingSha256AtCapture: sha(working), rawWorkingLineEndingsAtCapture: endings(working),
      fragments: descriptor.fragments.map(([name, extract]) => {
        const workingFragment = extract(working);
        const gitFragment = extract(blob);
        if (!canonical(workingFragment).equals(canonical(gitFragment))) {
          throw new Error(`Source changed semantically in ${name}; no inferred acceptance.`);
        }
        return {
          name, raw: saveRaw(`source-${name}.snapshot`, workingFragment),
          rawLineEndings: endings(workingFragment),
          git: saveRaw(`source-${name}.git.snapshot`, gitFragment),
          canonicalSha256: sha(canonical(gitFragment))
        };
      })
    };
  });
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json')));
  const card = ledger.cards.find(value => value.id === 'A-S104');
  if (card.owner !== 'worker-A-S104' || card.state !== 'In Progress') throw new Error('Claim no longer owned.');
  writeJson('source-contract.json', {
    schemaVersion: 1, cardId: 'A-S104', parentId: 'D-S104', packet: 'SC-S104', kano: 'S', kanoUnit: 'A-S104',
    capturedAtUtc: timestamp(), readBeforeBehaviorDesign: true, headAtCapture: head,
    inventory: inventory.cards.find(value => value.id === 'A-S104'),
    claim: { owner: card.owner, state: card.state, authorization: card.authorization, claimedAtUtc: card.claimedAtUtc },
    exactReadmeRow: '| S104 | **Host-header and redirect differences:** Prevent warm-up success from hiding production redirect or callback failures. |',
    exactBacklogRow: '| D-S104 | P1 | Add internal warm-up versus external host-header/redirect/callback probes. | External production-path failures are detected despite internal health success; approved redirects do not loop or lose state. | P006 |',
    exactACardRow: '| A-S104 | D-S104 | S | Compare internal warm-up and external redirects/callbacks; detect misleading internal success. | SOURCE |',
    sourceAcceptance: 'External production-path failures are detected despite internal health success; approved redirects do not loop or lose state.',
    sourceFiles,
    dependencyQualification: 'A-S104 consumes SOURCE only. B-S104 remains separate; D-S104 retains P006 and all original native acceptance gates.',
    byteQualification: 'Raw CRLF fragments are preserved with -text attributes. Canonical source is independently pinned to immutable Git blobs, not later HEAD.'
  });
}

function captureTooling() {
  const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperBytes = fs.readFileSync(helperPath);
  const helperCommit = '53c0c0d82cc1db6780a87ac2b1085734af6d5c60';
  const helperBlob = git(['rev-parse', `${helperCommit}:testing/browser/isolated.cjs`]).toString().trim();
  const helperGit = git(['cat-file', 'blob', helperBlob]);
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  if (sha(helperBytes) !== expected || !canonical(helperBytes).equals(helperGit)) throw new Error('Unqualified browser helper.');
  if (!process.version.startsWith('v22.')) throw new Error('Only approved Node 22 tooling is selected.');
  const packagePath = path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json');
  const playwright = JSON.parse(fs.readFileSync(packagePath));
  if (playwright.version !== '1.56.1') throw new Error('No browser package fallback.');
  const script = "$p=@('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe') | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1; if(-not $p){throw 'Missing signed Edge'}; $f=Get-Item -LiteralPath $p; $s=Get-AuthenticodeSignature -LiteralPath $p; @{path=$p;version=$f.VersionInfo.FileVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress";
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: repo, maxBuffer: 1024 * 1024 });
  const stdout = saveRaw(`tooling-${label()}.stdout.snapshot`, result.stdout || Buffer.alloc(0));
  const stderr = saveRaw(`tooling-${label()}.stderr.snapshot`, result.stderr || Buffer.alloc(0));
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.toString());
  const browser = JSON.parse(result.stdout.toString());
  if (browser.signatureStatus !== 'Valid' || !browser.signer.includes('Microsoft Corporation') || !browser.version.startsWith('156.')) {
    throw new Error('Installed browser does not match signed Edge 156 prerequisite.');
  }
  writeJson('tooling-preflight.json', {
    capturedAtUtc: timestamp(), node: process.version, nodeExecutable: process.execPath, playwright: playwright.version,
    browser, helper: { path: 'testing\\browser\\isolated.cjs', commit: helperCommit, gitBlobOid: helperBlob, rawSha256: expected, canonicalGitSha256: sha(helperGit) },
    stdout, stderr, approvedLifecycle: false,
    limits: 'Offline existing Playwright 1.56.1 / signed Edge 156 / Node 22 test tooling only. No downloads, unsafe flags, production Node 24, external-host/authentication/native/source-parent certification. Lifecycle prototype remains unqualified.'
  });
}

function captureRun(stage, argumentsList, expectedExit) {
  const startedAtUtc = timestamp();
  const id = `${stage}-${label()}`;
  const snapshots = stage === 'red' ? {
    stub: saveRaw(`${id}.model.js.snapshot`, read('model.js')),
    assertions: saveRaw(`${id}.assertions.cjs.snapshot`, read('tests\\model.test.cjs')),
    bdd: saveRaw(`${id}.feature.snapshot`, read('host-path.feature'))
  } : {};
  const inputHashes = inputs();
  const result = spawnSync(process.execPath, argumentsList, { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
  const stdout = saveRaw(`${id}.stdout.tap.snapshot`, result.stdout || Buffer.alloc(0));
  const stderr = saveRaw(`${id}.stderr.snapshot`, result.stderr || Buffer.alloc(0));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const record = {
    cardId: 'A-S104', stage, startedAtUtc, finishedAtUtc: timestamp(), cwd: repo,
    executable: process.execPath, node: process.version, arguments: argumentsList, command: ['node', ...argumentsList].join(' '),
    exitCode: result.status, signal: result.signal, missingCodeOrTools: Boolean(result.error) || /MODULE_NOT_FOUND|SyntaxError|ENOENT/.test(text),
    snapshotsAutoDiscovered: false, inputHashes, ...snapshots, stdout, stderr
  };
  saveRaw(`${id}.invocation.json.snapshot`, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
  if (stage === 'red' && (!/ERR_ASSERTION/.test(text) || !/expected: 'failure'/.test(text) || record.missingCodeOrTools)) {
    throw new Error('Not a genuine wrong-behavior assertion RED.');
  }
  if (result.status !== expectedExit || result.error) {
    process.stdout.write(result.stdout || Buffer.alloc(0));
    process.stderr.write(result.stderr || Buffer.alloc(0));
    throw new Error(`Unexpected ${stage} exit ${result.status}; raw attempt preserved.`);
  }
  writeJson(stage === 'red' ? 'red.json' : stage === 'browser' ? 'browser-run.json' : 'focused-green.json', record);
  process.stdout.write(result.stdout);
}

function captureIaC() {
  const red = JSON.parse(read('evidence\\red.json'));
  if (sha(read('model.js')) !== red.stub.sha256) throw new Error('IaC decision must precede implementation.');
  writeJson('iac-decision.json', {
    cardId: 'A-S104', decision: 'N/A', decidedAtUtc: timestamp(), resourceOperations: false,
    stubUnchangedSha256: red.stub.sha256,
    reason: 'Resource-free standalone synthetic lesson. Host, redirects, callbacks, authentication and routing are fixed teaching DATA ONLY; no IaC, cloud, identity, credentials, deployment or spend.'
  });
}

function captureSyntax() {
  const files = ['model.js', 'app.js', 'tests\\model.test.cjs', 'tests\\bundle.test.cjs', 'tests\\browser.test.cjs', 'tests\\fixtures\\csp-probe.js', 'scripts\\evidence.cjs'];
  const startedAtUtc = timestamp();
  const runs = files.map(file => {
    const args = ['--check', path.join('learning', 'S104', file)];
    const result = spawnSync(process.execPath, args, { cwd: repo });
    const id = `syntax-${file.replace(/[\\.:]/g, '-')}-${label()}`;
    return { arguments: args, exitCode: result.status, error: result.error?.message || null,
      stdout: saveRaw(`${id}.stdout.snapshot`, result.stdout || Buffer.alloc(0)),
      stderr: saveRaw(`${id}.stderr.snapshot`, result.stderr || Buffer.alloc(0)) };
  });
  writeJson('syntax-green.json', { startedAtUtc, finishedAtUtc: timestamp(), node: process.version, inputHashes: inputs(), runs });
  if (runs.some(run => run.exitCode !== 0 || run.error)) throw new Error('Syntax failed; raw attempts retained.');
}

function captureIndex() {
  function walk(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (entry.isSymbolicLink()) throw new Error('No lesson symlinks.');
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
    });
  }
  const files = walk(root).filter(file => file !== 'evidence\\content-index.json').sort();
  writeJson('content-index.json', {
    schemaVersion: 1, cardId: 'A-S104', capturedAtUtc: timestamp(),
    qualification: 'Raw evidence hashes use untouched bytes; other owned files use canonical LF Git-source bytes. This index excludes itself only.',
    files: files.map(file => {
      const bytes = read(file);
      const rawEvidence = file.startsWith('evidence\\raw\\');
      return { path: file, bytes: rawEvidence ? bytes.length : canonical(bytes).length,
        qualification: rawEvidence ? 'raw-preserved' : 'canonical-git-source', sha256: sha(rawEvidence ? bytes : canonical(bytes)) };
    })
  });
}

fs.mkdirSync(raw, { recursive: true });
const stage = process.argv[2];
if (stage === 'source') captureSource();
else if (stage === 'tooling') captureTooling();
else if (stage === 'red') captureRun('red', ['--test', 'learning\\S104\\tests\\model.test.cjs'], 1);
else if (stage === 'iac') captureIaC();
else if (stage === 'focused') captureRun('focused', ['--test', 'learning\\S104\\tests\\model.test.cjs', 'learning\\S104\\tests\\bundle.test.cjs'], 0);
else if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE === '1') captureRun('browser', ['--test', 'learning\\S104\\tests\\browser.test.cjs'], 0);
else if (stage === 'syntax') captureSyntax();
else if (stage === 'index') captureIndex();
else throw new Error('Deliberate capture requires source, tooling, red, iac, focused, syntax, index, or browser with CAPTURE_BROWSER_EVIDENCE=1.');
