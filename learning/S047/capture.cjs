'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const owned = __dirname;
const repo = path.resolve(owned, '..', '..');
const evidence = path.join(owned, 'evidence');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stage = process.argv[2];
if (!/^(bdd|stub-load|red|red-replay|green|syntax|tooling|browser|integrity)(?:-\d{3})?$/.test(stage || '')) {
  throw new Error('Choose an explicit owned evidence stage.');
}
const kind = stage.replace(/-\d{3}$/, '');
if (kind === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1.');
}
fs.mkdirSync(evidence, { recursive: true });
const stem = path.join(evidence, stage);
for (const suffix of ['.raw.json', '.stdout.txt', '.stderr.txt']) {
  if (fs.existsSync(stem + suffix)) throw new Error(`Historical evidence already exists: ${stage}`);
}

function sourceHashes(directory = owned, prefix = '') {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && ['evidence', 'evidence.json'].includes(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, sourceHashes(file, relative));
    else if (entry.isFile()) hashes[relative] = sha256(fs.readFileSync(file));
  }
  return hashes;
}

function captureContract() {
  const read = (relative) => fs.readFileSync(path.join(repo, ...relative.split('/')), 'utf8');
  const row = (relative, id) => {
    const text = read(relative);
    const lines = text.split(/\r?\n/);
    const matches = lines.map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter((item) => item.line.startsWith(`| ${id} |`));
    if (matches.length !== 1) throw new Error(`Expected exactly one source row for ${id}`);
    return { path: relative, fileSha256: sha256(Buffer.from(text)), ...matches[0] };
  };
  const kanban = read('.docs/wiki/kanban.md');
  const card = JSON.parse(read('.docs/wiki/flow-state.json')).cards.find((item) => item.id === 'A-S047');
  const contract = {
    schemaVersion: 1,
    capturedAtUtc: new Date().toISOString(),
    sourceId: 'S047', parentId: 'D-S047', cardId: 'A-S047',
    source: row('README.md', 'S047'),
    parent: row('.docs/wiki/backlog.md', 'D-S047'),
    card: row('.docs/wiki/kanban.md', 'A-S047'),
    nativeSibling: row('.docs/wiki/kanban.md', 'B-S047'),
    atomicContract: kanban.slice(kanban.indexOf('## Atomic card contract'), kanban.indexOf('### Portable A-card lesson contract')),
    portableContract: kanban.slice(kanban.indexOf('### Portable A-card lesson contract'), kanban.indexOf('## Concurrent pull')),
    packet: { id: card.packet, kano: card.kano, kanoUnit: card.kanoUnit, owner: card.owner, authorization: card.authorization },
  };
  if (contract.packet.id !== 'SC-S047' || contract.packet.kano !== 'S'
      || contract.packet.owner !== 'worker-A-S047' || contract.packet.authorization !== 'local-synthetic-only') {
    throw new Error('Claim/packet contract mismatch');
  }
  fs.writeFileSync(path.join(evidence, 'source-contract.json'), JSON.stringify(contract, null, 2) + '\n', { flag: 'wx' });
}

const snapshots = {};
if (kind === 'bdd') captureContract();
if (kind === 'red') {
  const directory = path.join(evidence, 'red');
  fs.mkdirSync(directory, { recursive: true });
  for (const [source, name] of [
    ['stream.js', 'stream.source.snapshot'],
    ['tests/model.test.cjs', 'assertion.source.snapshot'],
    ['stream.feature', 'bdd.feature.snapshot'],
  ]) {
    const bytes = fs.readFileSync(path.join(owned, ...source.split('/')));
    fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
    snapshots[`red/${name}`] = sha256(bytes);
  }
}

const local = (...parts) => path.join(owned, ...parts);
const commands = {
  bdd: ['-e', `const fs=require('node:fs');const s=fs.readFileSync(${JSON.stringify(local('stream.feature'))},'utf8');console.log(JSON.stringify({feature:'S047',scenarios:(s.match(/  Scenario(?: Outline)?:/g)||[]).length,stubNotYetLoaded:true}));`],
  'stub-load': ['-e', `const assert=require('node:assert/strict');const a=require(${JSON.stringify(local('stream.js'))});const l=a.createLesson();for(const n of ['snapshot','start','cutover','resume','verify','reset'])assert.equal(typeof l[n],'function');l.start({...a.DEFAULTS});l.cutover();l.resume();console.log(JSON.stringify({loadable:true,result:l.verify()}));l.reset();assert.equal(l.snapshot().phase,'ready');`],
  red: ['--test', local('tests', 'model.test.cjs')],
  'red-replay': [local('tests', 'replay-red.cjs')],
  green: ['--test', local('tests', 'model.test.cjs'), local('tests', 'surface.test.cjs')],
  syntax: [local('tests', 'syntax.cjs')],
  tooling: [local('tests', 'tooling.cjs')],
  browser: [local('tests', 'browser.cjs')],
  integrity: [local('tests', 'integrity.cjs')],
};
const expectedExit = kind === 'red' || kind === 'red-replay' ? 1 : 0;
const env = { ...process.env };
if (kind !== 'browser') delete env.CAPTURE_BROWSER_EVIDENCE;
const sources = sourceHashes();
const started = new Date();
const result = spawnSync(process.execPath, commands[kind], { cwd: repo, env, encoding: null, maxBuffer: 8 * 1024 * 1024 });
const finished = new Date();
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
fs.writeFileSync(stem + '.stdout.txt', stdout, { flag: 'wx' });
fs.writeFileSync(stem + '.stderr.txt', stderr, { flag: 'wx' });
const record = {
  schemaVersion: 1, cardId: 'A-S047', workerId: 'worker-A-S047', packet: 'SC-S047', kanoUnit: 'A-S047',
  stage, mode: 'local-synthetic', startedAtUtc: started.toISOString(), finishedAtUtc: finished.toISOString(),
  durationMs: finished - started,
  command: { executable: process.execPath, arguments: commands[kind], cwd: repo },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  environment: { CAPTURE_BROWSER_EVIDENCE: env.CAPTURE_BROWSER_EVIDENCE || null },
  expectedExit, actualExit: result.status, signal: result.signal,
  error: result.error ? { code: result.error.code, message: result.error.message } : null,
  stdout: { path: `${stage}.stdout.txt`, bytes: stdout.length, sha256: sha256(stdout) },
  stderr: { path: `${stage}.stderr.txt`, bytes: stderr.length, sha256: sha256(stderr) },
  sourceHashes: sources, snapshotHashes: snapshots,
};
fs.writeFileSync(stem + '.raw.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
if (result.error || result.signal || result.status !== expectedExit) throw new Error(`${stage}: unexpected execution result`);
if (expectedExit === 1 && (!stdout.includes('ERR_ASSERTION') || !stdout.includes('1 !== 4'))) {
  throw new Error('RED must be the genuine checkpoint assertion, not missing code or tooling.');
}
console.log(`${stage}: captured exit ${result.status}; raw stdout/stderr and source hashes retained`);
