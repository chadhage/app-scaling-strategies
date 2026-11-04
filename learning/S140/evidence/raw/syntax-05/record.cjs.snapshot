'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const lesson = __dirname;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const relative = (file) => path.relative(lesson, file).split(path.sep).join('\\');
const write = (file, value) => {
  const target = path.join(lesson, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(lesson, file), 'utf8'));
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`Read-only git failed: ${result.stderr}`);
  return result.stdout;
};
function workflow(phase, detail) {
  const file = 'evidence\\workflow.json';
  const data = fs.existsSync(path.join(lesson, file))
    ? readJSON(file)
    : { cardId: 'A-S140', kanoUnit: 'A-S140', kano: 'S', packet: 'SC-S140', events: [] };
  data.events.push({ phase, recordedAtUtc: new Date().toISOString(), ...detail });
  write(file, data);
}
function selected(buffer, definitions) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] === 10) {
      lines.push(buffer.subarray(start, index + 1));
      start = index + 1;
    }
  }
  if (start < buffer.length) lines.push(buffer.subarray(start));
  const text = lines.map((line) => line.toString('utf8').replace(/\r?\n$/, ''));
  const slices = definitions.map(({ label, start: first, end }) => {
    const startLine = text.findIndex((line) => line.startsWith(first));
    if (startLine < 0) throw new Error(`Exact source selector not found: ${label}`);
    let endLine = startLine;
    if (end) {
      endLine = text.findIndex((line, index) => index > startLine && line.startsWith(end)) - 1;
      if (endLine < startLine) throw new Error(`Exact source end not found: ${label}`);
      while (endLine > startLine && text[endLine] === '') endLine--;
    }
    const raw = Buffer.concat(lines.slice(startLine, endLine + 1));
    return { label, startLine: startLine + 1, endLine: endLine + 1, text: text.slice(startLine, endLine + 1), raw };
  });
  return { slices, buffer: Buffer.concat(slices.map((slice) => slice.raw)) };
}
const sourceDefinitions = [
  {
    name: 'README', file: 'README.md', definitions: [
      { label: 'S140', start: '| S140 |' },
      { label: 'side-effect boundary', start: 'Use isolated fixtures or appropriate sandboxes for journeys involving external side effects.' },
    ],
  },
  { name: 'backlog', file: '.docs\\wiki\\backlog.md', definitions: [{ label: 'D-S140', start: '| D-S140 |' }] },
  {
    name: 'kanban', file: '.docs\\wiki\\kanban.md', definitions: [
      { label: 'A-S140', start: '| A-S140 |' },
      { label: 'B-S140 native remainder', start: '| B-S140 |' },
      { label: 'portable A contract', start: '### Portable A-card lesson contract', end: '## Concurrent pull' },
      { label: 'packet rule', start: 'Packet membership is fixed before admission.' },
      { label: 'one-unit workflow', start: 'Implementation order is BDD specification,' },
      { label: 'parent completion', start: '- Every one of the 150 D-S parents' },
    ],
  },
];
function source() {
  const commit = git('rev-parse', 'HEAD').toString('utf8').trim();
  const sources = sourceDefinitions.map((definition) => {
    const working = fs.readFileSync(path.join(root, definition.file));
    const canonicalPath = definition.file.split('\\').join('/');
    const canonical = git('show', `${commit}:${canonicalPath}`);
    const variants = {};
    for (const [variant, buffer] of [['working', working], ['canonical', canonical]]) {
      const selection = selected(buffer, definition.definitions);
      const fullPath = `evidence\\raw\\source\\${definition.name}.${variant}.raw.gz`;
      const selectionPath = `evidence\\raw\\source\\${definition.name}.${variant}.selected.snapshot`;
      write(fullPath, zlib.gzipSync(buffer));
      write(selectionPath, selection.buffer);
      variants[variant] = {
        fullPath, selectionPath, sha256: hash(buffer), byteLength: buffer.length,
        crlfCount: (buffer.toString('utf8').match(/\r\n/g) || []).length,
        selectionSha256: hash(selection.buffer),
        selected: selection.slices.map(({ raw, ...slice }) => slice),
      };
    }
    return { name: definition.name, file: definition.file, canonicalPath, ...variants };
  });
  write('evidence\\source.json', {
    cardId: 'A-S140', sourceId: 'S140', parentId: 'D-S140', packet: 'SC-S140',
    capturedAtUtc: new Date().toISOString(), canonicalCommit: commit, sources,
    limit: 'Working-tree bytes (including CRLF) and canonical Git bytes are separate evidence, not interchangeable.',
  });
  workflow('source-read-and-preserved', { canonicalCommit: commit, exactAcceptanceRead: true });
}
function snapshot(files, directory) {
  return files.map((file) => {
    const bytes = fs.readFileSync(path.join(lesson, file));
    const target = `${directory}\\${file}.snapshot`;
    write(target, bytes);
    return { file, snapshot: target, sha256: hash(bytes), bytes: bytes.length };
  });
}
function captureRun(name, args, expected, snapshots = []) {
  let directory = `evidence\\raw\\${name}`;
  let attempt = 1;
  while (fs.existsSync(path.join(lesson, directory, 'run.json'))) {
    directory = `evidence\\raw\\${name}-${String(++attempt).padStart(2, '0')}`;
  }
  const inputs = snapshot(snapshots, directory);
  const startedAtUtc = new Date().toISOString();
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: null, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  write(`${directory}\\stdout.tap`, stdout);
  write(`${directory}\\stderr.txt`, stderr);
  const record = {
    proof: `${directory}\\run.json`,
    command: [process.execPath, ...args], startedAtUtc, completedAtUtc: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started), node: process.version, platform: process.platform,
    exitCode: result.status, signal: result.signal, error: result.error?.message || null, expected,
    stdout: { file: `${directory}\\stdout.tap`, sha256: hash(stdout), byteLength: stdout.length },
    stderr: { file: `${directory}\\stderr.txt`, sha256: hash(stderr), byteLength: stderr.length }, inputs,
  };
  write(`${directory}\\run.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  const text = stdout.toString('utf8');
  if (expected === 'assertion-red') {
    if (result.status !== 1 || !text.includes('ERR_ASSERTION')
      || !text.includes('ok 1 - loadable contract')
      || /MODULE_NOT_FOUND|SyntaxError|ReferenceError/.test(`${text}${stderr}`)) {
      throw new Error('Expected a genuine behavioral assertion RED on a loadable stub; raw output retained.');
    }
  } else if (result.status !== 0 || result.error) {
    throw new Error(`Expected GREEN for ${name}; raw failure retained.`);
  }
  return record;
}
function tooling() {
  let number = 1;
  let directory = 'evidence\\raw\\tooling';
  while (fs.existsSync(path.join(lesson, directory, 'stderr.txt'))) {
    directory = `evidence\\raw\\tooling-${String(++number).padStart(2, '0')}`;
  }
  const inputs = snapshot(['record.cjs'], directory);
  const command = "$item=Get-Item -LiteralPath 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; "
    + "$signature=Get-AuthenticodeSignature -LiteralPath $item.FullName; "
    + "[ordered]@{path=$item.FullName;signatureStatus=$signature.Status.ToString();productVersion=$item.VersionInfo.ProductVersion}|ConvertTo-Json -Compress";
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  write(`${directory}\\stdout.txt`, Buffer.from(result.stdout || ''));
  write(`${directory}\\stderr.txt`, Buffer.from(result.stderr || ''));
  const preflight = {
    command: ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', command],
    startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: result.status,
    error: result.error?.message || null, inputs, proof: `${directory}\\run.json`,
  };
  write(preflight.proof, preflight);
  if (result.status !== 0) throw new Error('Existing offline browser signature preflight failed; raw proof retained.');
  const browser = JSON.parse(result.stdout.trim());
  const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = hash(fs.readFileSync(helper));
  const playwright = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (browser.signatureStatus !== 'Valid' || browser.productVersion !== '156.0.4314.50'
    || playwright !== '1.56.1' || process.version !== 'v22.23.4'
    || helperSha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') {
    throw new Error('This installed offline pair does not match the explicitly qualified teaching tooling.');
  }
  write('evidence\\tooling.json', {
    capturedAtUtc: new Date().toISOString(), node: process.version, playwright, browser,
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperSha256 },
    preflight,
    limits: 'Existing offline local test pair only; no downloads, unsafe flags, production Node 24, native Azure or source-parent validation. Inactive recovery prototype is unqualified.',
  });
}
function listFiles(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Lesson evidence must not contain links.');
    return entry.isDirectory() ? listFiles(full) : [full];
  }).sort();
}
function seal() {
  const excluded = path.join(lesson, 'evidence', 'integrity.json');
  const files = listFiles().filter((file) => file !== excluded).map((file) => {
    const bytes = fs.readFileSync(file);
    return { file: relative(file), sha256: hash(bytes), byteLength: bytes.length };
  });
  write('evidence\\integrity.json', {
    cardId: 'A-S140', recordedAtUtc: new Date().toISOString(),
    hashMode: 'Exact worktree/raw bytes; scoped .gitattributes protects retained raw proof.',
    excluded: ['evidence\\integrity.json'], files,
  });
}
function canonicalize() {
  let number = 1;
  let directory;
  do { directory = `evidence\\raw\\canonical-byte-correction-${String(number++).padStart(2, '0')}`; }
  while (fs.existsSync(path.join(lesson, directory, 'report.json')));
  const publicationPath = path.join(root, '.git', 'kanban-orchestrator', 'published', 'A-S140.json');
  const priorPublication = fs.existsSync(publicationPath) ? JSON.parse(fs.readFileSync(publicationPath, 'utf8')) : null;
  const files = listFiles().filter((file) => !relative(file).startsWith('evidence\\raw\\')
    && (/\.(?:js|cjs|md|html|css|json|feature)$/.test(file) || path.basename(file) === '.gitattributes'));
  const changed = [];
  for (const file of files) {
    const before = fs.readFileSync(file);
    const crlfCount = (before.toString('utf8').match(/\r\n/g) || []).length;
    if (!crlfCount) continue;
    const name = relative(file);
    const rawPath = `${directory}\\${name}.snapshot`;
    const after = Buffer.from(before.toString('utf8').replace(/\r\n/g, '\n'));
    write(rawPath, before);
    const canonicalGitObject = git('hash-object', '--', file).toString('utf8').trim();
    fs.writeFileSync(file, after);
    changed.push({ file: name, rawPath, rawSha256: hash(before), canonicalSha256: hash(after), canonicalGitObject, crlfCount });
  }
  const proof = `${directory}\\report.json`;
  write(proof, {
    recordedAtUtc: new Date().toISOString(), action: 'Explicit owned text-file LF normalization; raw evidence is never converted.',
    priorPublication, changed, originalKanoUnit: 'A-S140', extraCredits: 0,
  });
  workflow('canonical-byte-portability-correction', {
    proof, supersededCommit: priorPublication?.commit || null, reason: 'Same original unit: ensure worktree seal and filtered canonical Git bytes agree on fresh checkout while retaining earlier raw CRLF proof.',
  });
}
function main(action) {
  if (action === 'canonicalize') return canonicalize();
  if (action === 'source') return source();
  if (action === 'red') {
    const run = captureRun('red', ['--test', '--test-reporter=tap', '.\\learning\\S140\\model.test.cjs'],
      'assertion-red', ['export-journey.feature', 'model.js', 'model.test.cjs']);
    return workflow('bdd-loadable-stub-assertion-red', { exitCode: run.exitCode, proof: run.proof });
  }
  if (action === 'iac-na') return workflow('iac-not-applicable', {
    reason: 'Resource-free, fixed-fiction browser teaching data only. No cloud, identity, storage, queue, credentials, deployment, spend, IaC or scaffolding operations.',
  });
  if (action === 'green') {
    const run = captureRun('green', ['--test', '--test-reporter=tap', '.\\learning\\S140\\model.test.cjs'], 'green',
      ['model.js', 'model.test.cjs', 'lesson.js', 'index.html', 'style.css']);
    return workflow('implemented-refactored-focused-green', { exitCode: run.exitCode, proof: run.proof });
  }
  if (action === 'tooling') return tooling();
  if (action === 'integrity') {
    const run = captureRun('integrity', ['--test', '--test-reporter=tap', '.\\learning\\S140\\integrity.test.cjs'], 'green');
    return workflow('focused-integrity-green', { exitCode: run.exitCode, proof: run.proof });
  }
  if (action === 'syntax') {
    const files = fs.readdirSync(lesson).filter((file) => /\.(?:cjs|js)$/.test(file)).sort();
    const checks = files.map((file) => {
      const result = spawnSync(process.execPath, ['--check', path.join(lesson, file)], { cwd: root, encoding: 'utf8', windowsHide: true });
      return { file, sha256: hash(fs.readFileSync(path.join(lesson, file))), exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
    });
    let number = 1;
    let directory;
    do { directory = `evidence\\raw\\syntax-${String(number++).padStart(2, '0')}`; }
    while (fs.existsSync(path.join(lesson, directory, 'report.json')));
    const inputs = snapshot(files, directory);
    const report = {
      recordedAtUtc: new Date().toISOString(), node: process.version,
      command: [process.execPath, '--check', '<each named lesson script>'], inputs, checks,
      proof: `${directory}\\report.json`,
    };
    write(report.proof, report);
    write('evidence\\syntax.json', report);
    if (checks.some((check) => check.exitCode !== 0)) throw new Error('Syntax failure retained.');
    return workflow('focused-syntax-green', { files, proof: 'evidence\\syntax.json' });
  }
  if (action === 'browser') {
    if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Deliberate browser capture requires exact CAPTURE_BROWSER_EVIDENCE=1.');
    const run = captureRun('browser', ['--test', '--test-reporter=tap', '.\\learning\\S140\\browser.test.cjs'], 'green',
      ['browser.test.cjs', 'model.js', 'lesson.js', 'index.html', 'style.css']);
    return workflow('actual-isolated-browser-observed', { exitCode: run.exitCode, proof: run.proof });
  }
  if (action === 'verify') {
    if (process.env.CAPTURE_BROWSER_EVIDENCE !== undefined) throw new Error('Normal verification must not enable capture.');
    const run = captureRun('verification', ['--test', '--test-reporter=tap',
      '.\\learning\\S140\\model.test.cjs', '.\\learning\\S140\\integrity.test.cjs', '.\\learning\\S140\\browser.test.cjs'], 'green');
    write('evidence\\verification.json', {
      cardId: 'A-S140', recordedAtUtc: new Date().toISOString(), focusedTestsPassed: run.exitCode === 0,
      browserObserved: true, readonlyTestMode: true, proof: run.proof,
      parentAcceptance: 'pending; parent only', nativeAzureResult: 'unverified',
    });
    return;
  }
  if (action === 'seal') return seal();
  throw new Error('Explicit capture action required: source, red, iac-na, green, syntax, tooling, integrity, browser, verify, canonicalize, seal.');
}

module.exports = { hash, listFiles, relative, selected, sourceDefinitions };
if (require.main === module) {
  try { main(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
