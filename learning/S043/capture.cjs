'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const phase = process.argv[2];

function writeNew(name, bytes) {
  const target = path.join(evidence, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function jsonNew(name, value) {
  writeNew(name, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Git provenance failed');
  return result.stdout.trim();
}

function fileDigests(names) {
  return Object.fromEntries(names.map((name) => [
    name, sha256(fs.readFileSync(path.join(root, name))),
  ]));
}

function extract(text, start, end) {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing exact source section ${start}`);
  return text.slice(first, last);
}

function sourceRow(text, id) {
  const row = text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
  if (!row) throw new Error(`Missing exact source row ${id}`);
  return row;
}

function bytesRecord(bytes) {
  return { length: bytes.length, sha256: sha256(bytes), base64: bytes.toString('base64') };
}

function readable(bytes) {
  return bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
}

if (process.env.CAPTURE_TEST_EVIDENCE !== '1') {
  throw new Error('Deliberate capture only: set CAPTURE_TEST_EVIDENCE=1; normal tests never write proof');
}

if (phase === 'source') {
  const files = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const sources = files.map((name) => fs.readFileSync(path.join(repo, name)));
  const [readme, backlog, kanban] = sources.map((bytes) => bytes.toString('utf8'));
  jsonNew('source-contract.json', {
    capturedAtUtc: new Date().toISOString(),
    cardId: 'A-S043', parentId: 'D-S043', packet: 'SC-S043', kano: 'S', kanoUnit: 'A-S043',
    workerId: 'worker-A-S043', sourceHead: git(['rev-parse', 'HEAD']),
    exactRows: {
      source: sourceRow(readme, 'S043'),
      backlog: sourceRow(backlog, 'D-S043'),
      portable: sourceRow(kanban, 'A-S043'),
      nativeRemainder: sourceRow(kanban, 'B-S043'),
    },
    atomicAndPortableContract: extract(kanban, '## Atomic card contract', '## Concurrent pull'),
    packetRule: kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed')),
    outcomeClassification: extract(readme, '### Definition of an interruption', '### Five-nines transition metric'),
    disclaimer: extract(readme, '## Microsoft Open Source Disclaimer', '## Sources'),
    sourceHashes: Object.fromEntries(files.map((name, index) => [name, sha256(sources[index])])),
    browserHelper: {
      path: 'testing\\browser\\isolated.cjs',
      sha256: sha256(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))),
      publishedRevision: '53c0c0d',
    },
  });
  process.stdout.write('Exact S043 source, acceptance, A-card contract and packet recorded.\n');
} else if (phase === 'iac') {
  const redBytes = fs.readFileSync(path.join(evidence, 'red.raw.json'));
  const red = JSON.parse(redBytes);
  const output = Buffer.from(red.stdout.base64, 'base64').toString('utf8');
  if (red.exitCode !== 1 || !output.includes('ERR_ASSERTION') || !output.includes("'unknown'")) {
    throw new Error('IaC decision requires the captured genuine behavioral RED');
  }
  jsonNew('iac-na.json', {
    decidedAtUtc: new Date().toISOString(),
    cardId: 'A-S043', status: 'N/A',
    decisionStage: 'After loadable-stub behavioral RED; before implementation',
    prerequisiteRed: 'red.raw.json', prerequisiteRedSha256: sha256(redBytes),
    actualRedExitCode: red.exitCode,
    reason: 'Resource-free portable synthetic lesson. No cloud, IaC, scaffold, identity registration, credentials, deployment or spending is authorized or required.',
  });
  process.stdout.write('IaC explicitly N/A after genuine RED and before implementation.\n');
} else if (phase === 'tooling') {
  const command = "$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe';"
    + "$sig=Get-AuthenticodeSignature -LiteralPath $edge;"
    + "[pscustomobject]@{Path=$edge;Status=$sig.Status.ToString();Signer=$sig.SignerCertificate.Subject;"
    + "Version=(Get-Item -LiteralPath $edge).VersionInfo.ProductVersion}|ConvertTo-Json -Compress";
  const executable = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: repo, windowsHide: true, timeout: 30000,
  });
  if (result.status !== 0) throw new Error(String(result.stderr));
  const edge = JSON.parse(result.stdout.toString('utf8').replace(/^\uFEFF/, ''));
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (edge.Status !== 'Valid' || !edge.Signer.includes('Microsoft Corporation')
      || !edge.Version.startsWith('156.') || playwrightVersion !== '1.56.1'
      || !process.version.startsWith('v22.')) throw new Error('Unapproved tooling pairing');
  jsonNew('tooling.json', {
    capturedAtUtc: new Date().toISOString(), nodeVersion: process.version, playwrightVersion,
    edge, command: [executable, '-NoProfile', '-NonInteractive', '-Command', command],
    signatureExitCode: result.status, signatureStdout: bytesRecord(result.stdout),
    signatureStderr: bytesRecord(result.stderr),
    helper: 'testing\\browser\\isolated.cjs',
    helperSha256: sha256(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))),
    helperPublishedRevision: '53c0c0d',
    packagesInstalled: false, browserDownloaded: false, unsafeFlags: false,
    foregroundLeaseUsed: false, productionNode24Validated: false,
    preflightLimitation: 'The initial Windows PowerShell 5 signature command could not autoload Microsoft.PowerShell.Security; the existing PowerShell 7 executable is used explicitly, without installing tooling or changing browser/runtime selection. That preflight error is not behavioral RED.',
    lifecycleLimit: 'Published helper only; known unattended cleanup/deadline limitation remains unqualified.',
  });
  process.stdout.write('Existing Node 22 / offline PW 1.56.1 / signed Edge 156 tooling recorded.\n');
} else if (phase === 'summary') {
  const record = (name) => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));
  const newest = (name) => {
    const candidates = fs.readdirSync(evidence)
      .filter((file) => new RegExp(`^${name}(?:-\\d{3})?\\.raw\\.json$`).test(file))
      .map((file) => ({ file, data: record(file) }))
      .sort((left, right) => left.data.startedAtUtc.localeCompare(right.data.startedAtUtc));
    if (!candidates.length) throw new Error(`Missing actual ${name} record`);
    return candidates.at(-1);
  };
  const red = record('red.raw.json');
  const replay = record('red-replay.raw.json');
  const greenRecord = newest('green');
  const syntaxRecord = newest('syntax');
  const browserRecord = newest('browser');
  const green = greenRecord.data;
  const syntax = syntaxRecord.data;
  const browserRaw = browserRecord.data;
  const browser = JSON.parse(Buffer.from(browserRaw.stdout.base64, 'base64').toString('utf8'));
  if (red.exitCode !== 1 || replay.exitCode !== 1 || [green, syntax, browserRaw].some((item) => item.exitCode !== 0)
      || browser.verdict !== 'PASS' || !browser.cleanup.awaitedCloseInFinally) {
    throw new Error('Summary requires the actual expected RED and successful focused/syntax/browser results');
  }
  const greenText = Buffer.from(green.stdout.base64, 'base64').toString('utf8');
  jsonNew('..\\evidence.json', {
    schemaVersion: 1, cardId: 'A-S043', sourceId: 'S043', parentId: 'D-S043',
    kano: 'S', kanoUnit: 'A-S043', packet: 'SC-S043', owner: 'worker-A-S043',
    mode: 'synthetic', visibleLabel: 'Training rehearsal - synthetic data - not a live Azure result',
    recordedAtUtc: new Date().toISOString(),
    sourceContract: 'learning\\S043\\evidence\\source-contract.json',
    configuration: {
      host: 'Browser-openable local file; no listener or HTTP fixture',
      surface: 'learning\\S043\\index.html', fixture: 'Four fixed ASCII parts; 48 bytes',
      clocks: 'Deterministic integer offsets; no wall-clock latency claim',
      owners: 'Synthetic v1 epoch 1 and v2 epoch 2; no real authentication',
      productionRuntimeValidated: false,
    },
    commitBinding: {
      sourceHeadAtCapture: record('source-contract.json').sourceHead,
      authority: 'Authorized publisher receipt and annotated tag identify the exact implementation commit.',
      publicationReceipt: '.git\\kanban-orchestrator\\published\\A-S043.json',
      contentHashes: 'learning\\S043\\evidence\\content-hashes.json',
    },
    workflow: [
      'Read exact README S043, D-S043, portable/atomic card contract and packet before behavior design.',
      'BDD preceded a loadable stub and genuine unknown-versus-success ERR_ASSERTION RED.',
      'Recorded resource-free IaC N/A after RED and before implementation.',
      'Implemented bounded deterministic multipart state and keyboard-accessible portable UI.',
      'Preserved a failed fieldset-oracle attempt separately; a later genuine browser assertion found Reset focusing a still-disabled control. Captured pre-fix app/test snapshots and enabled controls before restoring focus.',
      'Focused green, syntax, actual isolated DOM/keyboard/error/reset/failure/CSP checks and integrity.',
      'Scoped publication and parent-owned empirical acceptance remain separate from exercise outcomes.',
    ],
    tests: {
      bdd: 'learning\\S043\\multipart.feature',
      loadableStub: { artifact: 'evidence\\stub-load.raw.json', exitCode: 0 },
      red: { artifact: 'evidence\\red.raw.json', exitCode: red.exitCode, assertionFailures: 1,
        snapshots: 'evidence\\red\\*.snapshot', missingCodeOrToolFailure: false },
      redReplay: { artifact: 'evidence\\red-replay.raw.json', exitCode: replay.exitCode },
      green: { artifact: path.join('evidence', greenRecord.file), exitCode: green.exitCode,
        tests: Number(greenText.match(/# tests (\d+)/)?.[1]), failed: Number(greenText.match(/# fail (\d+)/)?.[1]) },
      syntax: { artifact: path.join('evidence', syntaxRecord.file), exitCode: syntax.exitCode },
      browser: { artifact: browser.capture, rawArtifact: path.join('evidence', browserRecord.file),
        exitCode: browserRaw.exitCode, verdict: browser.verdict, actualChecks: browser.checks.length,
        mechanism: 'Published openIsolatedLesson only; awaited close in finally; no DOM mocks',
        helperSha256: browser.helperSha256, playwrightVersion: browser.playwrightVersion,
        browserVersion: browser.browserVersion, finalHistoryCount: browser.observations.final.historyCount,
        historicalFailedAttempt: 'evidence\\browser-001.json',
        resetFocusRed: {
          artifact: 'evidence\\browser-002.json', rawArtifact: 'evidence\\browser-002.raw.json',
          snapshots: 'evidence\\reset-focus-red\\*.snapshot',
          assertion: 'Expected keyboard focus storage; actual reset-lesson while the configuration fieldset was still disabled.',
        },
        qualification: browser.oracleQualification },
      integrity: { command: 'node learning\\S043\\tests\\integrity.cjs', artifact: 'evidence\\integrity.raw.json' },
      normalVerification: 'Read-only to proof; verify.cjs checks the entire evidence tree before and after.',
    },
    verifierResult: 'PASS for synthetic preservation, byte/hash, duplicate, original-budget, unknown and guard expectations.',
    userImpactResult: {
      safe: 'success: 2 prior parts preserved, 4 total uploads, 48 bytes, matching SHA-256, 700/1000 ms',
      expectedNegatives: 'failure: accepted-part loss, duplicate uploads, same-length corruption or original-budget breach',
      missingProof: 'unknown: no speculative candidate upload or invented final bytes/hash',
      failurePrecedence: 'Known loss or deadline breach remains failure even when evidence is unavailable',
      nativeAzureResult: 'unknown', realHttpResult: 'unknown', realStorageDurability: 'unknown',
    },
    cleanupResult: {
      externalResourcesCreated: 0, browserClosedInFinally: browser.cleanup.awaitedCloseInFinally,
      finalResetObserved: browser.observations.final.phase === 'idle',
      historyRetained: browser.observations.final.historyCount,
      browserStorageWrites: false, listenerStarted: false,
    },
    iac: { status: 'N/A', artifact: 'evidence\\iac-na.json' },
    refinement: {
      completedScope: 'One portable A-S043 rehearsal; tests and evidence earn no extra unit.',
      retainedToDo: 'B-S043 / D-S043 native proof needs approved CORE, DATA, HOST, OBJECT and C024; original D-S039/D-S042 dependencies remain.',
      readiness: false,
      blocker: 'Native host/fixture/lease/identity/scaffold/deployment/spend approval and qualified real-upload evidence are unavailable and not inferred.',
      sharedBoardEdits: false,
    },
    reviewer: { role: 'Parent/controller', status: 'Pending independent empirical acceptance', workerSelfAccepted: false },
    acceptedAtUtc: null,
    limits: [
      'All input, parts, ownership and timing are synthetic; no Azure/HTTP/storage/native result.',
      'Synthetic ownership epochs are not credentials or distributed authentication.',
      'Existing Node 22 test tooling does not validate production Node 24.',
      'No cloud/IaC/scaffold/identity/deploy/spend/packages/framework/shared-file changes.',
      'Known shared-browser lifecycle limitations remain unqualified; no abandoned recovery prototype.',
    ],
  });
  process.stdout.write('Actual test and browser results summarized; parent acceptance remains pending.\n');
} else if (phase === 'seal' || phase === 'reseal') {
  let previousSeal = null;
  if (phase === 'reseal') {
    const original = path.join(evidence, 'content-hashes.json');
    const archived = path.join(evidence, 'content-hashes-pre-publication.json');
    if (fs.existsSync(archived)) throw new Error('Previous publication seal already archived; no overwrite');
    previousSeal = {
      artifact: 'evidence\\content-hashes-pre-publication.json',
      sha256: sha256(fs.readFileSync(original)),
      reason: 'Explicit producer reseal after the scoped CRLF publication-gate correction; prior seal retained byte-for-byte.',
    };
    fs.renameSync(original, archived);
  }
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('No links allowed in owned evidence bundle');
      if (entry.isDirectory()) walk(target);
      else {
        const relative = path.relative(root, target);
        if (relative === 'evidence\\content-hashes.json' || /^evidence\\integrity\./.test(relative)) continue;
        files.push(relative);
      }
    }
  }
  walk(root);
  jsonNew('content-hashes.json', {
    sealedAtUtc: new Date().toISOString(),
    algorithm: 'SHA-256', cardId: 'A-S043',
    exclusion: 'This seal and the subsequent integrity capture, avoiding self-reference.',
    ...(previousSeal ? { previousSeal } : {}),
    files: fileDigests(files.sort()),
  });
  process.stdout.write(`Sealed ${files.length} owned source/evidence files without modifying historical proof.\n`);
} else {
  const jobs = {
    'stub-load': ['-e', "const assert=require('node:assert/strict');const m=require('./learning/S043/upload.js');const s=m.createSession();assert.equal(typeof s.dispatch,'function');assert.equal(s.view().current.result.outcome,'unknown');console.log('Loadable multipart stub; unknown is not success.');"],
    red: ['--test', '--test-reporter=tap', 'learning\\S043\\tests\\model.test.cjs'],
    'red-replay': ['--test', '--test-reporter=tap', 'learning\\S043\\tests\\replay-red.cjs'],
    green: ['--test', '--test-reporter=tap',
      'learning\\S043\\tests\\model.test.cjs', 'learning\\S043\\tests\\surface.test.cjs'],
    syntax: ['learning\\S043\\tests\\syntax.cjs'],
    browser: ['learning\\S043\\tests\\browser.cjs'],
    integrity: ['learning\\S043\\tests\\integrity.cjs'],
    'publication-red': ['-e',
      "const r=require('node:child_process').spawnSync('git',['--no-pager','diff','--cached','--check','--','learning\\\\S043\\\\.gitattributes']);process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;"],
  };
  const jobName = phase.match(/^(green|syntax|browser|integrity)-\d{3}$/)?.[1] || phase;
  if (!Object.hasOwn(jobs, jobName)) throw new Error(`Unsupported capture phase ${phase}`);
  if (fs.existsSync(path.join(evidence, `${phase}.raw.json`))) {
    throw new Error(`Refusing to overwrite ${phase} history`);
  }
  if (phase === 'red') {
    for (const [source, snapshot] of [
      ['multipart.feature', 'red\\bdd.feature.snapshot'],
      ['upload.js', 'red\\upload.source.snapshot'],
      ['tests\\model.test.cjs', 'red\\assertion.source.snapshot'],
    ]) writeNew(snapshot, fs.readFileSync(path.join(root, source)));
  }
  if (phase === 'publication-red') {
    writeNew('publication-red\\attributes.source.snapshot', fs.readFileSync(path.join(root, '.gitattributes')));
  }
  const watched = ['multipart.feature', 'upload.js', 'tests\\model.test.cjs', 'capture.cjs', '.gitattributes', 'README.md'];
  for (const file of ['app.js', 'index.html', 'styles.css', 'manifest.json',
    'evidence.json', 'tests\\surface.test.cjs', 'tests\\browser.cjs', 'tests\\syntax.cjs', 'tests\\integrity.cjs']) {
    if (fs.existsSync(path.join(root, file))) watched.push(file);
  }
  const before = fileDigests(watched);
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, jobs[jobName], {
    cwd: repo, windowsHide: true, timeout: jobName === 'browser' ? 180000 : 60000,
    maxBuffer: 8 * 1024 * 1024, env: process.env,
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const record = {
    phase, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    executable: process.execPath, nodeVersion: process.version, arguments: jobs[jobName],
    cwd: repo, sourceHead: git(['rev-parse', 'HEAD']),
    exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
    inputSha256: before, inputsUnchanged: JSON.stringify(before) === JSON.stringify(fileDigests(watched)),
    stdout: bytesRecord(stdout), stderr: bytesRecord(stderr),
    readableNormalization: 'UTF-8; CRLF to LF and trailing spaces/tabs removed only; base64 preserves exact raw bytes.',
  };
  writeNew(`${phase}.stdout.txt`, readable(stdout));
  writeNew(`${phase}.stderr.txt`, readable(stderr));
  jsonNew(`${phase}.raw.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.stdout.write(`Captured ${phase}: actual exit ${result.status}; immutable raw bytes retained.\n`);
  process.exitCode = result.status === null ? 2 : result.status;
}
