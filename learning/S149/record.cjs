'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(__dirname, file).split(path.sep).join('\\');
const read = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const identity = {
  cardId: 'A-S149', workerId: 'worker-A-S149', sourceId: 'S149', parentId: 'D-S149',
  kanoUnit: 'A-S149', kano: 'S', priority: 'P1', packet: 'SC-S149', technicalEntryGate: 'SOURCE',
};
function captureOnly() {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Capture requires exact CAPTURE_BROWSER_EVIDENCE=1; normal verification is read-only.');
  }
}
function write(file, value, exclusive = false) {
  captureOnly();
  const target = path.join(__dirname, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`,
    { flag: exclusive ? 'wx' : 'w' });
}
function listFiles(directory = __dirname) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in owned evidence.');
    return entry.isDirectory() ? listFiles(file) : [file];
  }).sort();
}
function inventory() {
  return listFiles().map((file) => ({ file: relative(file), sha256: hash(fs.readFileSync(file)) }));
}
function unique(name) {
  captureOnly();
  const directory = `evidence\\raw\\${name}-${crypto.randomUUID()}`;
  fs.mkdirSync(path.join(__dirname, directory), { recursive: true });
  return directory;
}
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`Read-only Git failed: ${String(result.stderr)}`);
  return result.stdout;
}
function powershell(command) {
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`PowerShell preflight failed: ${result.stderr || result.error?.message}`);
  return JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
}
function workflow(phase, detail) {
  const data = fs.existsSync(path.join(__dirname, 'evidence', 'workflow.json'))
    ? read('evidence\\workflow.json') : { ...identity, extraCredits: 0, events: [] };
  data.events.push({ phase, recordedAtUtc: new Date().toISOString(), ...detail });
  write('evidence\\workflow.json', data);
}
function selectBytes(buffer, selectors) {
  const lines = [];
  let offset = 0;
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] === 10) {
      lines.push(buffer.subarray(offset, index + 1));
      offset = index + 1;
    }
  }
  if (offset < buffer.length) lines.push(buffer.subarray(offset));
  const text = lines.map((line) => line.toString('utf8').replace(/\r?\n$/, ''));
  const slices = selectors.map(({ label, first, until }) => {
    const begin = text.findIndex((line) => line.startsWith(first));
    if (begin < 0) throw new Error(`Exact source ${label} is missing.`);
    let end = begin;
    if (until) {
      const boundary = text.findIndex((line, index) => index > begin && line.startsWith(until));
      if (boundary <= begin) throw new Error(`Exact source boundary ${label} is missing.`);
      end = boundary - 1;
      while (end > begin && text[end] === '') end--;
    }
    const bytes = Buffer.concat(lines.slice(begin, end + 1));
    return { label, startLine: begin + 1, endLine: end + 1, text: text.slice(begin, end + 1), bytes };
  });
  return { bytes: Buffer.concat(slices.map((slice) => slice.bytes)), slices };
}
const definitions = [
  {
    file: 'README.md', name: 'README', selectors: [
      { label: 'S149', first: '| S149 |' },
      { label: 'acceptance and evidence', first: '## Acceptance and evidence', until: '## Recommended demonstration sequence' },
    ],
  },
  {
    file: '.docs\\wiki\\backlog.md', name: 'backlog', selectors: [
      { label: 'D-S149', first: '| D-S149 |' },
      { label: 'source-parent prerequisites', first: '- Every D-S item additionally requires' },
    ],
  },
  {
    file: '.docs\\wiki\\kanban.md', name: 'kanban', selectors: [
      { label: 'A-S149', first: '| A-S149 |' },
      { label: 'B-S149', first: '| B-S149 |' },
      { label: 'SOURCE', first: '| SOURCE |' },
      { label: 'portable contract', first: '### Portable A-card lesson contract', until: '## Concurrent pull' },
      { label: 'BDD workflow', first: 'Implementation order is BDD specification,' },
      { label: 'fixed packet', first: 'Packet membership is fixed before admission.' },
      { label: 'original parents', first: '- Every one of the 150 D-S parents' },
    ],
  },
];
function source() {
  captureOnly();
  if (fs.existsSync(path.join(__dirname, 'evidence', 'source.json'))) throw new Error('Frozen source is write-once.');
  const captured = powershell(`
    $ErrorActionPreference='Stop'
    $mutex=[Threading.Mutex]::new($false,'Local\\AppScalingStrategies_KanbanState_v1')
    $held=$false
    try {
      $held=$mutex.WaitOne([TimeSpan]::FromSeconds(30))
      if(-not $held){throw 'State mutex timed out; no unlocked fallback'}
      $files=@('README.md','.docs\\wiki\\backlog.md','.docs\\wiki\\kanban.md','.git\\kanban-orchestrator\\inventory.json')
      $buffers=@{}
      foreach($file in $files){$buffers[$file]=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PWD $file)))}
      $ledger=[IO.File]::ReadAllText((Join-Path $PWD '.docs\\wiki\\flow-state.json')) | ConvertFrom-Json -AsHashtable
      $card=@($ledger.cards | Where-Object id -eq 'A-S149')
      if($card.Count -ne 1 -or $card[0].state -ne 'In Progress' -or $card[0].owner -ne 'worker-A-S149'){throw 'Exact claim mismatch'}
      @{buffers=$buffers;claimedCard=$card[0];readHandlesClosedBeforeRelease=$true;mutex='Local\\AppScalingStrategies_KanbanState_v1'} | ConvertTo-Json -Depth 20 -Compress
    } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
  `);
  const directory = unique('source');
  const commit = git('rev-parse', 'HEAD').toString('utf8').trim();
  const sources = definitions.map((definition) => {
    const working = Buffer.from(captured.buffers[definition.file], 'base64');
    const canonicalPath = definition.file.split('\\').join('/');
    const canonical = git('show', `${commit}:${canonicalPath}`);
    const variants = {};
    for (const [variant, bytes] of [['working', working], ['canonical', canonical]]) {
      const selected = selectBytes(bytes, definition.selectors);
      const fullPath = `${directory}\\${definition.name}.${variant}.raw.gz`;
      const selectedPath = `${directory}\\${definition.name}.${variant}.selected.snapshot`;
      write(fullPath, zlib.gzipSync(bytes), true);
      write(selectedPath, selected.bytes, true);
      variants[variant] = {
        fullPath, selectedPath, sha256: hash(bytes), byteLength: bytes.length,
        crlfCount: (bytes.toString('utf8').match(/\r\n/g) || []).length,
        selectionSha256: hash(selected.bytes),
        slices: selected.slices.map(({ bytes: ignored, ...slice }) => slice),
      };
    }
    return { name: definition.name, file: definition.file, canonicalPath, ...variants };
  });
  const inventoryBytes = Buffer.from(captured.buffers['.git\\kanban-orchestrator\\inventory.json'], 'base64');
  const inventoryPath = `${directory}\\inventory.raw.snapshot`;
  write(inventoryPath, inventoryBytes, true);
  const fixed = JSON.parse(inventoryBytes);
  write('evidence\\source.json', {
    ...identity, capturedAtUtc: new Date().toISOString(), canonicalCommit: commit, sources,
    inventory: { file: inventoryPath, sha256: hash(inventoryBytes), cards: fixed.cards.filter((card) => ['A-S149', 'B-S149'].includes(card.id)) },
    claimedCard: captured.claimedCard,
    stateRead: { mutex: captured.mutex, readHandlesClosedBeforeRelease: captured.readHandlesClosedBeforeRelease },
    limit: 'Original working raw CRLF and immutable canonical Git bytes are independently retained; no live evidence, certification or parent completion.',
  }, true);
  workflow('source-read-and-frozen', { exactAcceptanceRead: true, canonicalCommit: commit });
}
function captureRun(name, files, expected, inputFiles = files) {
  const directory = unique(name);
  const inputs = inputFiles.map((file) => {
    const bytes = fs.readFileSync(path.join(__dirname, file));
    const snapshot = `${directory}\\${file}.snapshot`;
    write(snapshot, bytes, true);
    return { file, snapshot, sha256: hash(bytes), byteLength: bytes.length };
  });
  const args = ['--test', '--test-reporter=tap', ...files.map((file) => path.join(__dirname, file))];
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: null, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: process.env,
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  write(`${directory}\\stdout.tap`, stdout, true);
  write(`${directory}\\stderr.txt`, stderr, true);
  const proof = `${directory}\\run.json`;
  write(proof, {
    ...identity, command: [process.execPath, ...args], startedAtUtc, completedAtUtc: new Date().toISOString(),
    node: process.version, expected, exitCode: result.status, signal: result.signal,
    error: result.error?.message || null, inputs,
    stdout: { file: `${directory}\\stdout.tap`, sha256: hash(stdout), byteLength: stdout.length },
    stderr: { file: `${directory}\\stderr.txt`, sha256: hash(stderr), byteLength: stderr.length },
  }, true);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { proof, result, stdout: stdout.toString('utf8') };
}
function red() {
  const result = captureRun('assertion-red', ['model.test.cjs'], 'assertion-red',
    ['statistics.feature', 'model.js', 'model.test.cjs', 'index.html', 'lesson.js', 'style.css']);
  if (result.result.status !== 1 || !result.stdout.includes('ERR_ASSERTION')
      || !result.stdout.includes('UNKNOWN_EVIDENCE') || /MODULE_NOT_FOUND|SyntaxError|ReferenceError/.test(result.stdout)) {
    throw new Error('A loadable genuine behavioral assertion RED is required.');
  }
  workflow('bdd-loadable-assertion-red', { proof: result.proof });
}
function iac() {
  const data = read('evidence\\workflow.json');
  if (data.events.at(-1)?.phase !== 'bdd-loadable-assertion-red') throw new Error('IaC N/A must follow genuine RED.');
  workflow('iac-not-applicable', {
    reason: 'Resource-free deterministic standalone fictional lesson. No cloud, infrastructure, scaffold, identity, credentials, deployment, load/trial operation or spend is authorized.',
  });
}
function tooling() {
  const helperFile = path.join(root, 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = hash(fs.readFileSync(helperFile));
  if (helperSha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') throw new Error('Published helper hash mismatch.');
  const browser = powershell(`
    $ErrorActionPreference='Stop'
    $file='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    $signature=Get-AuthenticodeSignature -LiteralPath $file
    if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Approved signed Edge missing'}
    @{file=$file;version=(Get-Item -LiteralPath $file).VersionInfo.ProductVersion;signatureStatus=[string]$signature.Status;signer=$signature.SignerCertificate.Subject;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress
  `);
  const packages = ['playwright', 'playwright-core'].map((name) => {
    const file = path.join(root, 'testing', 'browser', 'node_modules', name, 'package.json');
    const bytes = fs.readFileSync(file);
    const metadata = JSON.parse(bytes);
    if (metadata.version !== '1.56.1') throw new Error('Only approved offline Playwright 1.56.1 is qualified.');
    return { name, version: metadata.version, packageJsonSha256: hash(bytes), mode: 'already-installed approved offline first-party tooling' };
  });
  if (browser.version !== '156.0.4314.50' || !process.version.startsWith('v22.')) throw new Error('Exact approved tooling pair is required.');
  write('evidence\\tooling.json', {
    ...identity, node: process.version, browser, packages,
    helper: { file: 'testing\\browser\\isolated.cjs', sha256: helperSha256, api: 'openIsolatedLesson', awaitedFinallyCloseRequired: true },
    limits: 'No installs, downloads, unsafe flags, foreground leases, production Node24, native/source-parent proof or lifecycle-prototype qualification.',
  }, true);
}
function green() {
  const result = captureRun('focused-green', ['model.test.cjs', 'integrity.test.cjs'], 'green',
    ['model.test.cjs', 'integrity.test.cjs', 'model.js', 'lesson.js', 'record.cjs', 'statistics.feature', 'index.html', 'style.css', 'manifest.json', 'remainder.json', 'README.md']);
  if (result.result.status !== 0) throw new Error(`Focused GREEN failed; retained ${result.proof}`);
  workflow('focused-green', { proof: result.proof });
}
function browser() {
  const result = captureRun('browser-run', ['browser.test.cjs'], 'browser-green',
    ['browser.test.cjs', 'model.js', 'lesson.js', 'index.html', 'style.css', 'manifest.json', 'README.md']);
  if (result.result.status !== 0) throw new Error(`Actual browser check failed; retained ${result.proof}`);
  workflow('actual-browser-green', { proof: result.proof });
}
function seal() {
  const data = read('evidence\\workflow.json');
  if (!data.events.some((event) => event.phase === 'focused-green')
      || !data.events.some((event) => event.phase === 'actual-browser-green')
      || !read('evidence\\browser.json').passed) throw new Error('Verified unit and browser proofs are required before sealing.');
  write('evidence\\seal.json', { ...identity, files: inventory().filter((entry) => entry.file !== 'evidence\\seal.json'), extraCredits: 0 });
}
function runReadOnly(files) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files.map((file) => path.join(__dirname, file))], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: process.env,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw new Error(`Read-only verification failed (${result.status}): ${result.error?.message || ''}`);
}
function verify() {
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') throw new Error('Unset deliberate capture for read-only verify.');
  const before = inventory();
  const sealed = read('evidence\\seal.json');
  if (JSON.stringify(before.filter((entry) => entry.file !== 'evidence\\seal.json')) !== JSON.stringify(sealed.files)) {
    throw new Error('Owned bytes differ from the publication-ready seal; recapture deliberately, never during verification.');
  }
  let failure;
  try {
    runReadOnly(['model.test.cjs', 'integrity.test.cjs']);
    runReadOnly(['browser.test.cjs']);
  } catch (error) { failure = error; }
  if (JSON.stringify(inventory()) !== JSON.stringify(before)) throw new Error('Normal verification changed owned bytes.');
  if (failure) throw failure;
  console.log('READ-ONLY verified: model, syntax/source/raw integrity, actual isolated DOM/keyboard/error/reset/CSP; all owned bytes unchanged.');
}
const modes = { source, red, iac, tooling, green, browser, seal, verify };
if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (!Object.hasOwn(modes, mode)) throw new Error('Use source, red, iac, tooling, green, browser, seal or verify.');
    if (mode !== 'verify') captureOnly();
    modes[mode]();
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
module.exports = { hash, relative, listFiles, inventory, selectBytes, definitions, git, identity };
