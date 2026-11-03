'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const evidence = path.join(lesson, 'evidence');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(file);
const relative = (file) => path.relative(lesson, file).split(path.sep).join('/');
const write = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
};
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
function nextLabel(stage) {
  let label = stage;
  for (let suffix = 2; fs.existsSync(path.join(evidence, 'raw', 'runs', label)); suffix += 1) {
    label = `${stage}-${String(suffix).padStart(3, '0')}`;
  }
  return label;
}
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Read-only Git query failed: ${result.stderr}`);
  return result.stdout;
}
function snapshot(file, target) {
  const bytes = read(file);
  write(target, bytes);
  return { path: relative(target), sha256: sha(bytes), bytes: bytes.length };
}

const mode = process.argv[2];
if (mode === 'source') {
  if (fs.existsSync(path.join(evidence, 'source-contract.json'))) throw new Error('Do not overwrite source provenance.');
  const head = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const rows = [
    ['readme', 'README.md', '| S091 | **Candidate crashes during warm-up:** Abort before exposure while production continues serving. |'],
    ['backlog', '.docs\\wiki\\backlog.md', '| D-S091 | P0 | Add candidate process failure during warm-up. | Failure causes visible safe abort before exposure; existing production journeys remain usable. | D-S028 |'],
    ['kanban', '.docs\\wiki\\kanban.md', '| A-S091 | D-S091 | S | Crash a warming candidate; distinguish safe abort from completed migration. | SOURCE |'],
  ];
  const sources = rows.map(([name, file, exactRow]) => {
    const gitPath = file.replaceAll('\\', '/');
    const bytesByFormat = { git: git(['show', `${head}:${gitPath}`]), working: read(path.join(root, file)) };
    const snapshots = {};
    for (const [format, bytes] of Object.entries(bytesByFormat)) {
      if (!bytes.toString('utf8').split(/\r?\n/).includes(exactRow)) throw new Error(`Exact ${name} ${format} contract is absent.`);
      if (name === 'readme' && !bytes.toString('utf8').includes('| S028 | **Warm-up timeout:** Abort explicitly and leave existing production routing intact. |')) {
        throw new Error('Original D-S028 source prerequisite is absent.');
      }
      const target = path.join(evidence, 'raw', 'source', `${name}.${format}.snapshot`);
      write(target, bytes);
      snapshots[format] = { path: relative(target), sha256: sha(bytes), bytes: bytes.length };
    }
    return { repoPath: gitPath, exactRow, snapshots };
  });
  json(path.join(evidence, 'source-contract.json'), {
    schemaVersion: 1, cardId: 'A-S091', parentId: 'D-S091', sourceId: 'S091',
    workerId: 'worker-A-S091', kano: 'S', kanoUnit: 'A-S091', packet: 'SC-S091', technicalEntryGate: 'SOURCE',
    capturedAtUtc: new Date().toISOString(), sourceHead: head,
    objective: 'Crash a warming candidate; distinguish safe abort from completed migration.',
    acceptance: 'Failure causes visible safe abort before exposure; existing production journeys remain usable.',
    originalDependency: 'D-S028: warm-up timeout; abort explicitly and leave existing production routing intact.',
    portableContract: 'Standalone browser-openable interactive synthetic trace with declared preconditions, actions, assertions, limits, exact banner, keyboard UX and no management calls or credentials.',
    packetContract: 'SC-S091 is the default independent A/B source pair, not a named delighter packet; A-S091 remains one frozen S unit.',
    sourceAcceptance: 'Safe aborts do not claim user migration. Actual candidate versions, journey correctness, session/state, effects and the original latency budget control migration credit. Failed and unknown started transitions stay counted; empty samples provide no transition evidence.',
    sources,
  });
  const feature = read(path.join(lesson, 'candidate-crash.feature'));
  json(path.join(evidence, 'bdd.json'), {
    cardId: 'A-S091', stage: 'BDD before loadable-stub behavioral RED',
    recordedAtUtc: new Date().toISOString(), path: 'candidate-crash.feature', sha256: sha(feature), bytes: feature.length,
    sourceContract: 'evidence/source-contract.json',
  });
  console.log('Captured exact S091/D-S091/A-S091 contracts, raw working/Git source bytes, and BDD provenance.');
} else if (mode === 'iac') {
  if (fs.existsSync(path.join(evidence, 'iac-decision.json'))) throw new Error('Do not overwrite the IaC decision.');
  const red = JSON.parse(read(path.join(evidence, 'red.json')));
  if (!red.verified) throw new Error('A genuine assertion RED must precede the IaC decision.');
  json(path.join(evidence, 'iac-decision.json'), {
    cardId: 'A-S091', stage: 'IaC after genuine behavioral RED', decidedAtUtc: new Date().toISOString(),
    decision: 'N/A', reason: 'Resource-free standalone HTML/JavaScript lesson. Crashes, warming, readiness, aborts, routing and production journeys are synthetic trace records only.',
    redReference: 'evidence/red.json', resourcesCreated: 0, managementCalls: 0, newPackages: 0, cloudSpend: 0,
    excluded: ['cloud', 'IaC generation', 'scaffold', 'identity', 'credentials', 'deployment', 'real candidate/process/resource fault actions'],
  });
  console.log('IaC N/A recorded after verified assertion RED; no resources or management actions.');
} else if (['red', 'focused', 'browser', 'syntax', 'integrity'].includes(mode)) {
  if (mode === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1.');
  if (mode === 'red' && fs.existsSync(path.join(evidence, 'red.json'))) throw new Error('Do not overwrite historical RED.');
  const runLabel = mode === 'red' ? 'red'
    : mode === 'integrity' ? JSON.parse(read(path.join(evidence, 'content-index.json'))).selfVerificationRun
      : nextLabel(mode);
  const target = mode === 'red' ? path.join(evidence, 'raw', 'red') : path.join(evidence, 'raw', 'runs', runLabel);
  if (fs.existsSync(target)) throw new Error('Do not overwrite a captured run.');
  fs.mkdirSync(target, { recursive: true });
  const snapshots = [];
  const originals = mode === 'red'
    ? ['model.js', 'tests\\behavior.test.cjs', 'candidate-crash.feature', '.gitattributes']
    : mode === 'browser' ? ['model.js', 'app.js', 'index.html', 'styles.css', 'tests\\browser.test.cjs'] : [];
  for (const file of originals) {
    const record = snapshot(path.join(lesson, file), path.join(target, `${path.basename(file)}.snapshot`));
    snapshots.push({ original: file.replaceAll('\\', '/'), ...record });
  }
  const tests = (names) => ['--test', ...names.map((name) => path.join('learning', 'S091', 'tests', `${name}.test.cjs`))];
  const commands = {
    red: [tests(['behavior'])], focused: [tests(['behavior', 'surface', 'provenance'])],
    browser: [tests(['browser'])], integrity: [tests(['integrity'])],
    syntax: ['model.js', 'app.js', ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => path.join('tests', file))]
      .map((file) => ['--check', path.join('learning', 'S091', file)]),
  }[mode];
  const startedAtUtc = new Date().toISOString();
  const results = commands.map((args) => {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: null, windowsHide: true, timeout: 150000 });
    return { args, status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
      stdout: result.stdout || Buffer.alloc(0), stderr: result.stderr || Buffer.alloc(0) };
  });
  const stdout = Buffer.concat(results.map((result) => result.stdout));
  const stderr = Buffer.concat(results.map((result) => result.stderr));
  const streams = {};
  for (const [name, bytes] of [['stdout.tap.raw', stdout], ['stderr.raw', stderr]]) {
    const file = path.join(target, name);
    write(file, bytes);
    streams[name] = { path: relative(file), sha256: sha(bytes), bytes: bytes.length };
  }
  const valid = mode === 'red'
    ? results[0].status === 1 && /ERR_ASSERTION/.test(stdout.toString()) && /# pass [1-9]/.test(stdout.toString())
      && !/MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND/.test(stdout.toString() + stderr.toString()) && !results[0].error
    : results.every((result) => result.status === 0 && !result.error);
  const report = {
    schemaVersion: 1, cardId: 'A-S091', stage: mode, runLabel, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    nodeVersion: process.version, cwd: root,
    commands: results.map(({ args, status, signal, error }) => ({ executable: process.execPath, args, status, signal, error })),
    expected: mode === 'red' ? 'One loadable-stub behavioral assertion fails while the initial API test passes.' : 'All selected commands exit zero.',
    verified: valid, snapshots, streams,
  };
  json(path.join(evidence, `${runLabel}.json`), report);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (!valid) process.exitCode = 1;
} else if (mode === 'seal') {
  const selfVerificationRun = nextLabel('integrity');
  const selfDirectory = `evidence/raw/runs/${selfVerificationRun}/`;
  const excluded = ['evidence/content-index.json', `evidence/${selfVerificationRun}.json`];
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        if (!entry.isFile()) throw new Error('No symlinks or special files in lesson provenance.');
        const name = relative(file);
        if (excluded.includes(name) || name.startsWith(selfDirectory)) continue;
        const raw = name.startsWith('evidence/raw/');
        const bytes = raw ? read(file) : Buffer.from(read(file).toString('utf8').replace(/\r\n/g, '\n'));
        files.push({ path: name, encoding: raw ? 'raw-bytes' : 'git-lf', bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  walk(lesson);
  json(path.join(evidence, 'content-index.json'), {
    schemaVersion: 1, cardId: 'A-S091', generatedAtUtc: new Date().toISOString(), selfVerificationRun,
    policy: 'Owned raw captures preserve exact bytes including CRLF. Other text is qualified as canonical Git LF, not working-byte/Git-byte identity.',
    exclusions: [...excluded, `${selfDirectory}**`], files,
  });
  console.log(`Sealed ${files.length} owned files with explicit self-reference exclusions.`);
} else {
  throw new Error('Use explicit source, red, iac, focused, browser, syntax, seal, or integrity author-capture mode.');
}
