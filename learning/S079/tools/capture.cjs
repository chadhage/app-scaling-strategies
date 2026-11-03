'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function writeNew(relative, bytes) {
  const target = path.join(lesson, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
  return target;
}
function git(args) {
  const run = spawnSync('git', args, { cwd: repo, windowsHide: true });
  if (run.error || run.status !== 0) throw run.error || new Error(run.stderr.toString());
  return run.stdout;
}
function ownedTree(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? ownedTree(target) : [{
        path: path.relative(lesson, target), sha256: hash(fs.readFileSync(target)),
      }];
    });
}
function captureSources() {
  const commit = git(['rev-parse', 'HEAD']).toString().trim();
  const sources = [
    ['readme', 'README.md', [
      ['scenario', /^\| S079 \|.*$/m],
      ['outcomePolicy', /### Outcome classification[\s\S]*?(?=### Five-nines transition metric)/],
    ]],
    ['backlog', path.join('.docs', 'wiki', 'backlog.md'), [
      ['parent', /^\| D-S079 \|.*$/m],
      ['dependency', /^\| D-S075 \|.*$/m],
    ]],
    ['kanban', path.join('.docs', 'wiki', 'kanban.md'), [
      ['card', /^\| A-S079 \|.*$/m],
      ['nativeSibling', /^\| B-S079 \|.*$/m],
      ['atomicContract', /Every listed row is one card[\s\S]*?(?=### Portable A-card lesson contract)/],
      ['portableContract', /### Portable A-card lesson contract[\s\S]*?(?=## Concurrent pull and one-piece flow)/],
      ['packetRule', /^Packet membership is fixed before admission\..*$/m],
      ['parentCompletion', /^- A source parent is complete only when.*$/m],
    ]],
  ];
  const records = sources.map(([name, relative, selections]) => {
    const working = fs.readFileSync(path.join(repo, relative));
    const gitPath = relative.split(path.sep).join('/');
    const canonical = git(['show', `${commit}:${gitPath}`]);
    const workingFile = path.join('evidence', 'raw', 'source', `${name}.working.raw.gz`);
    const canonicalFile = path.join('evidence', 'raw', 'source', `${name}.git.raw.gz`);
    writeNew(workingFile, zlib.gzipSync(working));
    writeNew(canonicalFile, zlib.gzipSync(canonical));
    const select = (bytes, regex) => {
      const match = bytes.toString('utf8').replace(/\r\n/g, '\n').match(regex);
      if (!match) throw new Error(`Exact source selector missing: ${name} ${regex}`);
      return match[0].trimEnd();
    };
    const slices = selections.map(([id, regex]) => {
      const text = select(working, regex);
      if (text !== select(canonical, regex)) throw new Error(`Uncommitted source contract difference: ${id}`);
      return { id, text, sha256: hash(Buffer.from(text)) };
    });
    return {
      path: relative, gitPath, commit,
      working: { snapshot: workingFile, sha256: hash(working), bytes: working.length,
        crlf: (working.toString().match(/\r\n/g) || []).length },
      canonical: { snapshot: canonicalFile, sha256: hash(canonical), bytes: canonical.length },
      slices,
    };
  });
  writeNew(path.join('evidence', 'source-contract.json'), `${JSON.stringify({
    cardId: 'A-S079', parentId: 'D-S079', workerId: 'worker-A-S079',
    kano: 'S', kanoUnit: 'A-S079', packet: 'SC-S079', authorization: 'local-synthetic-only',
    capturedAtUtc: new Date().toISOString(), readBeforeBehaviorDesign: true, sources: records,
    sourceAcceptance: 'Capacity drains real work within the declared deadline and ordering contract; overdue jobs are failures.',
    sourceDependency: 'D-S075', nativeSibling: 'B-S079',
    limits: 'A portable synthetic exercise only. Native sibling, original prerequisite and all source acceptance remain incomplete.',
  }, null, 2)}\n`);
}

const phase = process.argv[2];
if (phase === 'sources') {
  captureSources();
  console.log('Exact source working bytes and canonical Git bytes preserved.');
} else if (phase === 'iac-na') {
  const red = JSON.parse(fs.readFileSync(path.join(lesson, 'evidence', 'raw', 'red', 'run.json')));
  const stub = fs.readFileSync(path.join(lesson, 'evidence', 'raw', 'red', 'model.js.snapshot'));
  if (red.exitCode !== 1 || !stub.equals(fs.readFileSync(path.join(lesson, 'model.js')))) {
    throw new Error('Declare IaC N/A after behavioral RED and before replacing the stub.');
  }
  writeNew(path.join('evidence', 'iac-na.json'), `${JSON.stringify({
    stage: 'IaC', status: 'N/A', recordedAtUtc: new Date().toISOString(),
    afterBehavioralRed: path.join('evidence', 'raw', 'red', 'run.json'),
    beforeImplementation: true,
    reason: 'Resource-free, deterministic synthetic browser lesson. No infrastructure or service is created.',
    authorization: 'No cloud, IaC, scaffold, identity, credentials, deployment, expenditure, package or framework changes.',
  }, null, 2)}\n`);
  console.log('IaC N/A recorded after actual RED and before implementation.');
} else {
  const revision = process.argv[3];
  if (revision !== undefined && !/^\d{3}$/.test(revision)) throw new Error('Capture revision must be three digits.');
  const captureName = revision === undefined ? phase : `${phase}-${revision}`;
  const commands = {
    red: ['--test', path.join(lesson, 'tests', 'model.test.cjs')],
    'model-green': ['--test', path.join(lesson, 'tests', 'model.test.cjs')],
    'focused-green': ['--test', '--test-concurrency=1',
      ...['model', 'surface', 'integrity'].map((name) => path.join(lesson, 'tests', `${name}.test.cjs`))],
    'browser-green': ['--test', path.join(lesson, 'tests', 'browser.test.cjs')],
    'normal-green': ['--test', '--test-concurrency=1',
      ...['model', 'surface', 'integrity', 'browser'].map((name) => path.join(lesson, 'tests', `${name}.test.cjs`))],
  };
  if (!Object.hasOwn(commands, phase)) throw new Error('Choose sources, red, iac-na, model-green, focused-green, browser-green or normal-green.');
  if (phase === 'browser-green' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    throw new Error('Browser proof requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
  }
  if (phase === 'normal-green' && process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    throw new Error('Normal read-only verification must not enable browser capture.');
  }
  if (phase === 'red' && revision !== undefined) throw new Error('The original RED capture cannot be revised.');
  const prefix = path.join('evidence', phase === 'red' ? 'raw' : 'captures', captureName);
  if (fs.existsSync(path.join(lesson, prefix))) throw new Error(`Append-only capture exists: ${phase}`);
  if (phase === 'red') {
    for (const relative of ['.gitattributes', 'backlog-surge.feature', 'model.js', path.join('tests', 'model.test.cjs')]) {
      writeNew(path.join(prefix, `${path.basename(relative)}.snapshot`), fs.readFileSync(path.join(lesson, relative)));
    }
  }
  const startedAtUtc = new Date().toISOString();
  const before = phase === 'normal-green' ? ownedTree() : null;
  const run = spawnSync(process.execPath, commands[phase], {
    cwd: repo, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, S079_CAPTURE_RUN: captureName },
  });
  if (run.error) throw run.error;
  const after = before ? ownedTree() : null;
  const readOnly = before ? JSON.stringify(before) === JSON.stringify(after) : null;
  writeNew(path.join(prefix, 'stdout.txt'), run.stdout);
  writeNew(path.join(prefix, 'stderr.txt'), run.stderr);
  writeNew(path.join(prefix, 'run.json'), `${JSON.stringify({
    phase, captureName, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    command: [process.execPath, ...commands[phase]], node: process.version,
    exitCode: run.status, signal: run.signal,
    stdoutSha256: hash(run.stdout), stderrSha256: hash(run.stderr),
    expectedBehavioralRed: phase === 'red',
    readOnlyVerification: readOnly,
    verifiedFileCount: before ? before.length : null,
    beforeTreeSha256: before ? hash(Buffer.from(JSON.stringify(before))) : null,
    afterTreeSha256: after ? hash(Buffer.from(JSON.stringify(after))) : null,
    scope: 'Synthetic S079 only; tooling tests and repeated runs earn no additional credit.',
  }, null, 2)}\n`);
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (readOnly === false) throw new Error('Normal verification changed owned source or proof files.');
  if (phase === 'red') {
    if (run.status === 0 || !run.stdout.includes(Buffer.from('ERR_ASSERTION'))) {
      throw new Error('Expected actual assertion RED was not observed.');
    }
    console.log('Preserved actual assertion RED; no missing code/tool credit.');
  } else process.exitCode = run.status;
}
