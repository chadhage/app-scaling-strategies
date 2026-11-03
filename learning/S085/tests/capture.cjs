'use strict';

const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { spawnSync, execFileSync } = require('node:child_process');
const { fs, path, root, repo, read, sha, lf, git, acceptance, helperPath, helperSha256, testedHashes } = require('./provenance.cjs');
const now = () => new Date().toISOString();
function save(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (file, value) => save(file, `${JSON.stringify(value, null, 2)}\n`);
const load = (file) => JSON.parse(read(file));
function ownedFiles() {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push([path.relative(root, absolute), sha(fs.readFileSync(absolute))]);
    }
  }
  walk(root);
  return files.sort((a, b) => a[0].localeCompare(b[0]));
}
function run(name, files, extraEnv = {}) {
  for (const extension of ['json', 'stdout.raw.gz', 'stderr.raw.gz']) {
    assert.equal(fs.existsSync(path.join(root, `evidence\\verification\\${name}.${extension}`)), false, 'Capture is append-only');
  }
  const args = ['--test', '--test-concurrency=1', ...files.map((file) => path.join(root, file))];
  const before = ownedFiles();
  const startedAtUtc = now();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, env: { ...process.env, ...extraEnv }, windowsHide: true,
    timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  const text = stdout.toString();
  const after = ownedFiles();
  const record = {
    name, command: [process.execPath, ...args], startedAtUtc, completedAtUtc: now(),
    exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
    tests: Number(text.match(/# tests (\d+)/)?.[1] || 0),
    pass: Number(text.match(/# pass (\d+)/)?.[1] || 0),
    fail: Number(text.match(/# fail (\d+)/)?.[1] || 0),
    assertionFailures: (text.match(/code: 'ERR_ASSERTION'/g) || []).length,
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
    browserCaptureEnabled: (extraEnv.CAPTURE_BROWSER_EVIDENCE ?? process.env.CAPTURE_BROWSER_EVIDENCE) === '1',
    ownedFilesBefore: before.length, ownedFilesAfter: after.length,
    ownedTreeBeforeSha256: sha(JSON.stringify(before)), ownedTreeAfterSha256: sha(JSON.stringify(after)),
    verificationReadOnly: JSON.stringify(before) === JSON.stringify(after),
    inputHashes: fs.existsSync(path.join(root, 'app.js')) ? testedHashes() : { model: sha(lf(read('model.js'))) },
  };
  save(`evidence\\verification\\${name}.stdout.raw.gz`, zlib.gzipSync(stdout));
  save(`evidence\\verification\\${name}.stderr.raw.gz`, zlib.gzipSync(stderr));
  json(`evidence\\verification\\${name}.json`, record);
  console.log(`${name}: exit ${record.exitCode}; tests ${record.tests}; pass ${record.pass}; fail ${record.fail}; owned files unchanged ${record.verificationReadOnly}. Raw stdout/stderr retained.`);
  if (record.spawnError) console.error(record.spawnError);
  return record;
}

const command = process.argv[2];
if (command === 'source') {
  const baseline = git(['rev-parse', 'HEAD']).toString().trim();
  const paths = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'];
  const working = [];
  const committed = [];
  const sources = paths.map((sourcePath, index) => {
    const bytes = fs.readFileSync(path.join(repo, sourcePath));
    const gitBytes = git(['show', `${baseline}:${sourcePath.replace(/\\/g, '/')}`]);
    working.push(bytes.toString());
    committed.push(gitBytes.toString());
    const workingSnapshot = `evidence\\raw\\source\\${index + 1}.working.raw.gz`;
    const gitSnapshot = `evidence\\raw\\source\\${index + 1}.git.raw.gz`;
    save(workingSnapshot, zlib.gzipSync(bytes));
    save(gitSnapshot, zlib.gzipSync(gitBytes));
    return {
      path: sourcePath, workingSnapshot, gitSnapshot, workingBytes: bytes.length,
      workingSha256: sha(bytes), workingCanonicalSha256: sha(lf(bytes)),
      gitSha256: sha(gitBytes), workingContainsCRLF: bytes.includes(Buffer.from('\r\n')),
      fullCanonicalEqualsBaseline: lf(bytes).equals(lf(gitBytes)),
    };
  });
  const accepted = acceptance(...working);
  assert.deepEqual(accepted, acceptance(...committed), 'Relevant source acceptance must equal canonical Git baseline');
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git\\kanban-orchestrator\\inventory.json')));
  const admitted = inventory.cards.find((card) => card.id === 'A-S085');
  assert.equal(admitted.packet, 'SC-S085');
  assert.equal(admitted.kano, 'S');
  json('evidence\\source-contract.json', {
    cardId: 'A-S085', workerId: 'worker-A-S085', sourceId: 'S085', parentId: 'D-S085',
    nativeSiblingId: 'B-S085', kano: 'S', kanoUnit: 'A-S085', packet: 'SC-S085',
    entryGate: 'SOURCE', sourceReadBeforeBehaviorDesign: true, capturedAtUtc: now(),
    baseline, acceptanceEqualsBaseline: true, acceptance: accepted, sources,
    registryProjection: admitted,
    packetLimit: 'SC-S085 is the registered scenario packet, not an LP delighter packet; one frozen S unit only.',
    nativeAcceptanceNotCompleted: true,
  });
} else if (command === 'red') {
  const snapshots = ['promotion.feature', 'model.js', 'tests\\model.test.cjs'].map((source) => {
    const snapshot = `${path.basename(source)}.snapshot`;
    const raw = read(source);
    save(`evidence\\red\\${snapshot}`, raw);
    return { source, snapshot, bytes: raw.length, sha256: sha(raw) };
  });
  const record = run('red', ['tests\\model.test.cjs']);
  assert.equal(record.exitCode, 1);
  assert.equal(record.spawnError, null);
  assert.equal(record.tests, 13);
  assert.equal(record.pass, 1);
  assert.equal(record.fail, 12);
  assert.equal(record.assertionFailures, 12);
  const stdout = zlib.gunzipSync(read('evidence\\verification\\red.stdout.raw.gz')).toString();
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/);
  json('evidence\\red\\run.json', { ...record, snapshots, missingCodeOrTools: false });
} else if (command === 'iac') {
  const red = load('evidence\\red\\run.json');
  assert.equal(red.fail, 12);
  json('evidence\\iac-decision.json', {
    status: 'N/A', decidedAtUtc: now(), beforeImplementation: true,
    reason: 'Resource-free synthetic local HTML/JS lesson. No cloud or infrastructure operations.',
    postRedStubCanonicalSha256: sha(lf(read('model.js'))),
    actualConcurrentControllerLockEpochPromotionCertification: false,
    noCloudIaCScaffoldIdentityCredentialsDeploySpendPackagesDownloads: true,
  });
} else if (command === 'tooling') {
  assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256);
  const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const ps = `$p='${browser}';$s=Get-AuthenticodeSignature $p;[ordered]@{signatureStatus=\"$($s.Status)\";signer=$s.SignerCertificate.Subject;browserVersion=(Get-Item $p).VersionInfo.ProductVersion}|ConvertTo-Json -Compress`;
  const signature = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }));
  assert.equal(signature.signatureStatus, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  json('evidence\\tooling.json', {
    capturedAtUtc: now(), runtime: process.version,
    playwrightVersion: require(path.join(repo, 'testing\\browser\\node_modules\\playwright\\package.json')).version,
    browserPath: browser, ...signature, helperPath, helperSha256, helperPublication: '53c0c0d',
    packagesInstalled: false, browserDownloaded: false, foregroundLease: false, unsafeFlags: false,
    productionNode24Validated: false,
    limitation: 'Only published openIsolatedLesson and awaited finally close; abandoned lifecycle prototype is unqualified. Published helper has documented shutdown limitations.',
  });
} else if (command === 'green') {
  const result = run('model-green', ['tests\\model.test.cjs', 'tests\\surface.test.cjs']);
  assert.equal(result.exitCode, 0);
} else if (command === 'browser') {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Browser capture requires deliberate opt-in');
  const result = run('browser-green', ['tests\\browser.test.cjs']);
  assert.equal(result.exitCode, 0);
} else if (command === 'index') {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const file = path.relative(root, absolute);
      if (file === 'evidence\\verification') continue;
      if (entry.isDirectory()) walk(absolute);
      else if (file !== 'evidence\\content-index.json') {
        const raw = fs.readFileSync(absolute);
        const exact = file.startsWith('evidence\\raw\\') || file.endsWith('.snapshot') || /\.(gz|png)$/.test(file);
        const canonical = exact ? raw : lf(raw);
        const repoPath = path.relative(repo, absolute).replace(/\\/g, '/');
        const cleanObject = git(['hash-object', '--stdin', `--path=${repoPath}`], raw).toString().trim();
        const expectedObject = cryptoObject(canonical);
        assert.equal(cleanObject, expectedObject, `Git clean filters must preserve declared mode: ${file}`);
        files.push({ path: file, mode: exact ? 'raw' : 'canonical-lf', sha256: sha(canonical), gitBlob: expectedObject });
      }
    }
  }
  function cryptoObject(bytes) {
    return require('node:crypto').createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  }
  walk(root);
  json('evidence\\content-index.json', {
    capturedAtUtc: now(), files: files.sort((a, b) => a.path.localeCompare(b.path)),
    exclusions: ['self-reference: evidence\\content-index.json', 'append-only raw command transcripts: evidence\\verification'],
    rawProvenancePreserved: true, gitCleanFilterCheckedWithoutWritingObjects: true,
  });
} else if (command === 'final') {
  const result = run('focused-green', ['tests\\model.test.cjs', 'tests\\surface.test.cjs',
    'tests\\integrity.test.cjs', 'tests\\browser.test.cjs'], { CAPTURE_BROWSER_EVIDENCE: '' });
  assert.equal(result.exitCode, 0);
} else {
  throw new Error('Explicit capture command required: source, red, iac, tooling, green, browser, index, final');
}
