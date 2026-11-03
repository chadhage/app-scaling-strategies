'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const owned = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(owned, file).split(path.sep).join('/');
const writeJSON = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function git(args) {
  const run = spawnSync('git', ['--no-pager', ...args], { cwd: root, encoding: null, windowsHide: true });
  if (run.error || run.status !== 0) throw new Error(`Read-only git failed: ${run.stderr}`);
  return run.stdout;
}

function captureSource() {
  const destination = path.join(owned, 'evidence', 'source-contract.json');
  if (fs.existsSync(destination)) throw new Error('Source provenance is immutable; refusing to overwrite.');
  const sourceCommit = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const rawRoot = path.join(owned, 'evidence', 'raw', 'source');
  fs.mkdirSync(rawRoot, { recursive: true });
  const sources = [
    ['readme', 'README.md'],
    ['backlog', '.docs/wiki/backlog.md'],
    ['kanban', '.docs/wiki/kanban.md']
  ].map(([label, sourcePath]) => {
    const working = fs.readFileSync(path.join(root, ...sourcePath.split('/')));
    const canonical = git(['show', `${sourceCommit}:${sourcePath}`]);
    const workingFile = path.join(rawRoot, `${label}.working.snapshot`);
    const canonicalFile = path.join(rawRoot, `${label}.git.snapshot`);
    fs.writeFileSync(workingFile, working);
    fs.writeFileSync(canonicalFile, canonical);
    return {
      sourcePath, sourceCommit,
      gitBlob: git(['rev-parse', `${sourceCommit}:${sourcePath}`]).toString('utf8').trim(),
      working: { file: relative(workingFile), sha256: sha256(working), bytes: working.length, crlf: (working.toString('utf8').match(/\r\n/g) || []).length },
      canonicalGit: { file: relative(canonicalFile), sha256: sha256(canonical), bytes: canonical.length },
      workingMatchesGitAfterCRLFNormalization: working.toString('utf8').replace(/\r\n/g, '\n') === canonical.toString('utf8')
    };
  });
  const inventory = JSON.parse(fs.readFileSync(path.join(root, '.git', 'kanban-orchestrator', 'inventory.json'), 'utf8'));
  const registeredCard = inventory.cards.find((card) => card.id === 'A-S083');
  if (!registeredCard || registeredCard.packet !== 'SC-S083' || registeredCard.kano !== 'S') throw new Error('Registered source card mismatch.');
  writeJSON(destination, {
    schemaVersion: 1, cardId: 'A-S083', workerId: 'worker-A-S083', sourceId: 'S083',
    parentId: 'D-S083', nativeSiblingId: 'B-S083', kano: 'S', kanoUnit: 'A-S083', packet: 'SC-S083',
    capturedAtUtc: new Date().toISOString(), sourceCommit, registeredCard, sources,
    exact: {
      readme: '| S083 | **Controller restart:** Resume from durable state without repeating a destructive transition. |',
      backlog: '| D-S083 | P0 | Add **Restart run worker/controller** while the console remains available. | Durable state restores progress without duplicate destructive actions or lost user outcomes. | D-S081 |',
      card: '| A-S083 | D-S083 | S | Restart a controller trace; identify duplicate destructive work after unsafe resumption. | SOURCE |',
      portableHeading: '### Portable A-card lesson contract',
      portable: 'An A card delivers a standalone, browser-openable lesson bundle with a small interactive exercise: choose an action or condition, inspect a synthetic trace, and check the expected outcome.',
      packet: 'every other A/B card belongs to SC-Snnn',
      banner: 'Training rehearsal - synthetic data - not a live Azure result'
    },
    interpretation: 'Only a fixed synthetic controller trace and receipt/outcome reconciliation are rehearsed. No actual controller restart, durable storage, destructive operation, platform action or source-parent completion is certified.',
    acceptanceOwner: 'Parent controller only; worker reports publication, not Done.',
    authorization: 'local-synthetic-only'
  });
  console.log(`Captured raw working bytes and immutable Git blobs at ${sourceCommit}.`);
}

function captureRun(mode) {
  const commands = {
    red: ['--test', 'learning\\S083\\tests\\behavior.test.cjs'],
    'focused-green': ['--test', 'learning\\S083\\tests\\behavior.test.cjs', 'learning\\S083\\tests\\surface.test.cjs', 'learning\\S083\\tests\\provenance.test.cjs'],
    'browser-green': ['--test', 'learning\\S083\\tests\\browser.test.cjs']
  };
  const browserMode = /^browser-green(?:-\d{3})?$/.test(mode);
  const focusedMode = /^focused-green(?:-\d{3})?$/.test(mode);
  const args = browserMode ? commands['browser-green'] : focusedMode ? commands['focused-green'] : commands[mode];
  if (!args) throw new Error('Use source, red, focused-green, browser-green, syntax, tooling, or seal.');
  if (browserMode && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser evidence capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const output = path.join(owned, 'evidence', `${mode}.json`);
  if (fs.existsSync(output)) throw new Error(`Immutable ${mode} capture already exists.`);
  const rawRoot = path.join(owned, 'evidence', 'raw', mode === 'red' ? 'red' : path.join('runs', mode));
  fs.mkdirSync(rawRoot, { recursive: true });
  const inputs = ['model.js', 'controller-restart.feature', ...args.filter((arg) => arg.endsWith('.cjs')).map((arg) => path.relative(owned, path.join(root, arg)))];
  const capturedInputs = inputs.map((input) => {
    const file = path.join(owned, input);
    const bytes = fs.readFileSync(file);
    if (mode === 'red') {
      const snapshot = path.join(rawRoot, `${path.basename(file)}.snapshot`);
      fs.writeFileSync(snapshot, bytes);
      return { file: relative(file), sha256: sha256(bytes), snapshot: relative(snapshot) };
    }
    return { file: relative(file), canonicalSha256: sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) };
  });
  const startedAtUtc = new Date().toISOString();
  const run = spawnSync(process.execPath, args, {
    cwd: root, encoding: null, windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0' }, timeout: 180000, maxBuffer: 8 * 1024 * 1024
  });
  if (run.error) throw run.error;
  const stdout = path.join(rawRoot, 'stdout.tap.raw');
  const stderr = path.join(rawRoot, 'stderr.raw');
  fs.writeFileSync(stdout, run.stdout);
  fs.writeFileSync(stderr, run.stderr);
  writeJSON(output, {
    cardId: 'A-S083', workerId: 'worker-A-S083', stage: mode,
    command: [process.execPath, ...args], cwd: root, node: process.version,
    sourceCommit: git(['rev-parse', 'HEAD']).toString('utf8').trim(),
    startedAtUtc, finishedAtUtc: new Date().toISOString(),
    exitCode: run.status, signal: run.signal, capturedInputs,
    stdout: { file: relative(stdout), sha256: sha256(run.stdout), bytes: run.stdout.length },
    stderr: { file: relative(stderr), sha256: sha256(run.stderr), bytes: run.stderr.length },
    limit: 'Local Node22 tooling only; not production Node24 or native Azure evidence.'
  });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (mode === 'red') {
    const raw = Buffer.concat([run.stdout, run.stderr]).toString('utf8');
    if (run.status === 0 || !raw.includes('ERR_ASSERTION') || /MODULE_NOT_FOUND|SyntaxError/.test(raw)) {
      throw new Error('RED must be an actual loaded behavioral assertion failure.');
    }
    console.log('Qualified RED: loadable stub, genuine assertion failures, raw evidence retained.');
  } else if (run.status !== 0) {
    throw new Error(`${mode} did not pass.`);
  }
}

function syntax(mode = 'syntax') {
  const output = path.join(owned, 'evidence', `${mode}.json`);
  if (fs.existsSync(output)) throw new Error('Syntax capture is immutable.');
  const files = ['model.js', 'app.js', ...fs.readdirSync(__dirname).filter((file) => /\.(cjs|js)$/.test(file)).map((file) => path.join('tests', file))];
  const startedAtUtc = new Date().toISOString();
  const checks = files.map((file) => {
    const run = spawnSync(process.execPath, ['--check', path.join(owned, file)], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (run.error || run.status !== 0) throw new Error(`Syntax failure ${file}: ${run.stderr}`);
    return { file: file.split(path.sep).join('/'), command: ['node', '--check', `learning\\S083\\${file}`], exitCode: run.status, stdout: run.stdout, stderr: run.stderr };
  });
  writeJSON(output, { cardId: 'A-S083', node: process.version, startedAtUtc, finishedAtUtc: new Date().toISOString(), checks });
  console.log(`${checks.length} JavaScript syntax checks passed.`);
}

function tooling() {
  const output = path.join(owned, 'evidence', 'tooling.json');
  if (fs.existsSync(output)) throw new Error('Tooling capture is immutable.');
  const helperFile = path.join(root, 'testing', 'browser', 'isolated.cjs');
  const helperHash = sha256(fs.readFileSync(helperFile));
  if (helperHash !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') throw new Error('Unapproved helper bytes.');
  const playwright = JSON.parse(fs.readFileSync(require.resolve('playwright/package.json', { paths: [path.join(root, 'testing', 'browser')] }), 'utf8')).version;
  const script = "$edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; $signature = Get-AuthenticodeSignature -LiteralPath $edge; [pscustomobject]@{ path=$edge; productVersion=(Get-Item -LiteralPath $edge).VersionInfo.ProductVersion; sha256=(Get-FileHash -LiteralPath $edge -Algorithm SHA256).Hash; signatureStatus=[string]$signature.Status; signer=$signature.SignerCertificate.Subject } | ConvertTo-Json";
  const args = ['-NoProfile', '-NonInteractive', '-Command', script];
  const startedAtUtc = new Date().toISOString();
  const run = spawnSync('pwsh', args, { cwd: root, encoding: null, windowsHide: true, timeout: 30000 });
  if (run.error || run.status !== 0) throw new Error(`Installed browser signature preflight failed: ${run.stderr}`);
  const edge = JSON.parse(run.stdout.toString('utf8').replace(/^\uFEFF/, ''));
  if (playwright !== '1.56.1' || !/^v22\./.test(process.version) || !/^156\./.test(edge.productVersion)
      || edge.signatureStatus !== 'Valid' || !edge.signer.includes('Microsoft Corporation')) throw new Error('Unapproved existing tooling.');
  const rawRoot = path.join(owned, 'evidence', 'raw', 'runs', 'tooling');
  fs.mkdirSync(rawRoot, { recursive: true });
  const stdout = path.join(rawRoot, 'stdout.raw');
  const stderr = path.join(rawRoot, 'stderr.raw');
  fs.writeFileSync(stdout, run.stdout);
  fs.writeFileSync(stderr, run.stderr);
  writeJSON(output, {
    cardId: 'A-S083', node: process.version, playwright, edge, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    command: ['pwsh', ...args], exitCode: run.status, helper: {
      file: 'testing/browser/isolated.cjs', sha256: helperHash,
      sourceCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60'
    },
    stdout: { file: relative(stdout), sha256: sha256(run.stdout) },
    stderr: { file: relative(stderr), sha256: sha256(run.stderr) },
    limits: 'Existing offline tooling only. No package install, browser download, unsafe flag or lifecycle prototype. Not production Node24 validation.'
  });
  console.log(`Qualified existing Node ${process.version}, Playwright ${playwright}, signed Edge ${edge.productVersion}.`);
}

function seal() {
  const output = path.join(owned, 'evidence', 'content-index.json');
  if (fs.existsSync(output)) throw new Error('Content index is immutable.');
  const entries = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const name = relative(file);
        const bytes = fs.readFileSync(file);
        const raw = name.startsWith('evidence/raw/');
        entries.push({
          file: name,
          representation: raw ? 'byte-exact' : 'canonical-utf8-lf',
          sha256: sha256(raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')))
        });
      }
    }
  }
  walk(owned);
  writeJSON(output, {
    schemaVersion: 1, cardId: 'A-S083', sealedAtUtc: new Date().toISOString(),
    policy: 'Every owned regular file except this self-index. Raw provenance is byte exact; ordinary Git text is qualified as UTF-8 with CRLF normalized to LF.',
    entries: entries.sort((a, b) => a.file.localeCompare(b.file))
  });
  console.log(`Sealed ${entries.length} source/proof files; verification remains read-only.`);
}

try {
  const mode = process.argv[2];
  if (mode === 'source') captureSource();
  else if (/^syntax(?:-\d{3})?$/.test(mode)) syntax(mode);
  else if (mode === 'tooling') tooling();
  else if (mode === 'seal') seal();
  else captureRun(mode);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
