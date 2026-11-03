'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const evidence = path.join(lesson, 'evidence');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(lesson, file).split(path.sep).join('/');
const write = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
};
const json = (file, data) => write(file, `${JSON.stringify(data, null, 2)}\n`);
const read = (file) => fs.readFileSync(file);
function nextRunLabel(stage) {
  let label = stage;
  for (let suffix = 2; fs.existsSync(path.join(evidence, 'raw', 'runs', label)); suffix += 1) {
    label = `${stage}-${String(suffix).padStart(3, '0')}`;
  }
  return label;
}
const git = (args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`git failed: ${result.stderr}`);
  return result.stdout;
};
const mode = process.argv[2];

if (mode === 'source') {
  if (fs.existsSync(path.join(evidence, 'source-contract.json'))) throw new Error('Source provenance is immutable; do not overwrite it.');
  const head = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const sources = [
    ['readme', 'README.md', '| S088 | **Permission failure:** Surface the failure and preserve existing traffic rather than reporting success. |'],
    ['backlog', '.docs\\wiki\\backlog.md', '| D-S088 | P0 | Add scoped permission-denial fixtures for a leased platform action. | The operation fails visibly; production routing and state remain honest; no broad success fallback is returned. | none |'],
    ['kanban', '.docs\\wiki\\kanban.md', '| A-S088 | D-S088 | S | Deny an operation; identify an invalid success-shaped error response. | SOURCE |'],
  ];
  const records = sources.map(([name, file, exactRow]) => {
    const gitPath = file.replaceAll('\\', '/');
    const committed = git(['show', `${head}:${gitPath}`]);
    const working = read(path.join(root, file));
    for (const [label, bytes] of [['git', committed], ['working', working]]) {
      if (!bytes.toString('utf8').split(/\r?\n/).some((line) => line.trim() === exactRow)) {
        throw new Error(`${name} ${label} does not contain the exact contracted row`);
      }
    }
    const snapshots = {};
    for (const [label, bytes] of [['git', committed], ['working', working]]) {
      const target = path.join(evidence, 'raw', 'source', `${name}.${label}.snapshot`);
      write(target, bytes);
      snapshots[label] = { path: relative(target), sha256: sha(bytes), bytes: bytes.length };
    }
    return { repoPath: gitPath, exactRow, snapshots };
  });
  json(path.join(evidence, 'source-contract.json'), {
    schemaVersion: 1, cardId: 'A-S088', parentId: 'D-S088', sourceId: 'S088',
    packet: 'SC-S088', kano: 'S', kanoUnit: 'A-S088', technicalEntryGate: 'SOURCE',
    owner: 'worker-A-S088', capturedAtUtc: new Date().toISOString(), sourceHead: head,
    objective: 'Deny an operation; identify an invalid success-shaped error response.',
    acceptance: 'The operation fails visibly; production routing and state remain honest; no broad success fallback is returned.',
    portableContract: 'Standalone browser-openable interactive synthetic exercise; fixed trace, assertions, limits, keyboard controls, exact training banner, no management calls or credentials.',
    packetContract: 'SC-S088 contains the independent A/B source pair, not a delighter packet. Only the single frozen A-S088 S unit is delivered here.',
    sources: records,
  });
  console.log('Captured exact committed and working source bytes for S088, D-S088, and A-S088.');
} else if (['red', 'focused', 'browser', 'syntax', 'integrity'].includes(mode)) {
  if (mode === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  const runLabel = mode === 'red' ? 'red' : nextRunLabel(mode);
  const target = path.join(evidence, 'raw', mode === 'red' ? 'red' : path.join('runs', runLabel));
  fs.mkdirSync(target, { recursive: true });
  if (mode === 'red' && fs.existsSync(path.join(evidence, 'red.json'))) throw new Error('RED provenance is immutable; do not overwrite it.');
  const snapshots = [];
  if (mode === 'red' || mode === 'browser') {
    const originals = mode === 'red'
      ? ['model.js', 'tests\\behavior.test.cjs', 'permission-failure.feature']
      : ['model.js', 'app.js', 'index.html', 'styles.css', 'tests\\browser.test.cjs'];
    for (const file of originals) {
      const bytes = read(path.join(lesson, file));
      const output = path.join(target, `${path.basename(file)}.snapshot`);
      write(output, bytes);
      snapshots.push({ original: file.replaceAll('\\', '/'), path: relative(output), sha256: sha(bytes), bytes: bytes.length });
    }
  }
  const commands = {
    red: [['--test', path.join('learning', 'S088', 'tests', 'behavior.test.cjs')]],
    focused: [['--test', ...['behavior', 'surface', 'provenance'].map((name) => path.join('learning', 'S088', 'tests', `${name}.test.cjs`))]],
    browser: [['--test', path.join('learning', 'S088', 'tests', 'browser.test.cjs')]],
    syntax: ['model.js', 'app.js', ...fs.readdirSync(__dirname).filter((name) => name.endsWith('.cjs')).map((name) => path.join('tests', name))].map((file) => ['--check', path.join('learning', 'S088', file)]),
    integrity: [['--test', path.join('learning', 'S088', 'tests', 'integrity.test.cjs')]],
  }[mode];
  const startedAtUtc = new Date().toISOString();
  const results = commands.map((args) => {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: null, windowsHide: true, timeout: 120000 });
    return { args, status: result.status, signal: result.signal, error: result.error ? String(result.error) : null, stdout: result.stdout || Buffer.alloc(0), stderr: result.stderr || Buffer.alloc(0) };
  });
  const stdout = Buffer.concat(results.map((result) => result.stdout));
  const stderr = Buffer.concat(results.map((result) => result.stderr));
  const streams = {};
  for (const [name, bytes] of [['stdout.tap.raw', stdout], ['stderr.raw', stderr]]) {
    const output = path.join(target, name);
    write(output, bytes);
    streams[name] = { path: relative(output), sha256: sha(bytes), bytes: bytes.length };
  }
  const isRed = mode === 'red';
  const valid = isRed
    ? results.length === 1 && results[0].status === 1 && /ERR_ASSERTION/.test(stdout.toString()) && /# pass [1-9]/.test(stdout.toString()) && !/MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND/.test(stdout.toString() + stderr.toString())
    : results.every((result) => result.status === 0 && !result.error);
  const report = {
    schemaVersion: 1, cardId: 'A-S088', stage: mode, runLabel, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    nodeVersion: process.version, cwd: root, commands: results.map(({ args, status, signal, error }) => ({ executable: process.execPath, args, status, signal, error })),
    expected: isRed ? 'Actual assertion failure against a loadable stub, with at least one passing load/initial-state test.' : 'All focused commands exit zero.',
    verified: valid, streams, snapshots,
  };
  json(path.join(evidence, `${runLabel}.json`), report);
  if (mode === 'focused' && valid) json(path.join(evidence, 'focused-green.json'), { ...report, provenanceRecord: `evidence/${runLabel}.json` });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (!valid) process.exitCode = 1;
} else if (mode === 'index') {
  const selfVerificationRun = nextRunLabel('integrity');
  const selfVerificationDirectory = `evidence/raw/runs/${selfVerificationRun}/`;
  const excluded = new Set(['evidence/content-index.json', `evidence/${selfVerificationRun}.json`]);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const name = relative(file);
        if (excluded.has(name) || name.startsWith(selfVerificationDirectory)) continue;
        const raw = name.startsWith('evidence/raw/');
        const bytes = read(file);
        const canonical = raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
        files.push({ path: name, encoding: raw ? 'raw-bytes' : 'git-lf', sha256: sha(canonical), bytes: canonical.length });
      } else throw new Error(`Unexpected non-file lesson entry: ${file}`);
    }
  }
  walk(lesson);
  json(path.join(evidence, 'content-index.json'), {
    schemaVersion: 1, cardId: 'A-S088', generatedAtUtc: new Date().toISOString(),
    policy: 'Raw captures/snapshots are byte-preserved by owned .gitattributes. Other owned text is qualified as canonical Git LF, not a claim that working CRLF bytes equal Git bytes.',
    selfVerificationRun,
    exclusions: [...excluded, `${selfVerificationDirectory}**`],
    files,
  });
  console.log(`Indexed ${files.length} canonical-source and raw-evidence files.`);
} else {
  throw new Error('Use an explicit source, red, focused, browser, syntax, integrity, or index capture mode.');
}
