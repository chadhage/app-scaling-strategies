'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const stage = process.argv[2];
if (process.argv.length !== 3 || !['source', 'red', 'iac', 'green', 'syntax'].includes(stage)) {
  throw new Error('Explicit historical producer only: capture.cjs source|red|iac|green|syntax');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
const output = path.join(evidence, `${stage === 'iac' ? 'iac-na' : stage}.json`);
if (fs.existsSync(output)) throw new Error(`Append-only stage already exists: ${output}`);
const startedAtUtc = new Date().toISOString();
fs.mkdirSync(evidence, { recursive: true });
function raw(name, bytes) {
  const file = path.join('raw', stage, `${name}.raw.gz`);
  const target = path.join(evidence, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, gzipSync(bytes), { flag: 'wx' });
  return { file, sha256: hash(bytes), bytes: bytes.length, crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
}
function snapshot(file) {
  return { source: file, ...raw(file.replace(/[\\/.]/g, '-'), read(file)) };
}
function child(args) {
  const result = spawnSync(process.execPath, args, { cwd: repo, timeout: 60000 });
  return {
    command: [process.execPath, ...args], status: result.status, signal: result.signal,
    error: result.error ? String(result.error) : null,
    stdout: raw(`stdout-${args.includes('--test') ? 'tests' : 'precheck'}`, result.stdout || Buffer.alloc(0)),
    stderr: raw(`stderr-${args.includes('--test') ? 'tests' : 'precheck'}`, result.stderr || Buffer.alloc(0)),
    text: (result.stdout || Buffer.alloc(0)).toString('utf8'),
  };
}
let record = { schemaVersion: 1, cardId: 'A-S109', workerId: 'worker-A-S109', stage, startedAtUtc };
if (stage === 'source') {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json'), 'utf8'));
  const card = inventory.cards.find((item) => item.id === 'A-S109');
  if (!card || card.kano !== 'S' || card.packet !== 'SC-S109') throw new Error('Frozen inventory mismatch');
  const entries = [
    ['readme', 'README.md', sourceCommit],
    ['backlog', '.docs\\wiki\\backlog.md', sourceCommit],
    ['kanban', '.docs\\wiki\\kanban.md', sourceCommit],
    ['helper', 'testing\\browser\\isolated.cjs', '53c0c0d'],
  ].map(([name, source, canonicalCommit]) => {
    const working = fs.readFileSync(path.join(repo, source));
    const gitPath = source.replace(/\\/g, '/');
    const canonical = execFileSync('git', ['show', `${canonicalCommit}:${gitPath}`], { cwd: repo });
    const lf = Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      name, source, canonicalCommit, working: raw(`${name}-working`, working),
      canonicalGit: raw(`${name}-canonical`, canonical),
      workingLfSha256: hash(lf), workingLfEqualsCanonical: lf.equals(canonical),
      workingEqualsCanonicalBytes: working.equals(canonical),
    };
  });
  record = { ...record, sourceCommit, card, entries, bdd: snapshot('lesson.feature'), attributes: snapshot('.gitattributes') };
} else if (stage === 'red') {
  if (!fs.existsSync(path.join(evidence, 'source.json'))) throw new Error('Source capture required before RED');
  const precheck = child(['-e', "const m=require('.\\\\learning\\\\S109\\\\model.js'); for(const n of ['initial','transition','summarize']) if(typeof m[n]!=='function') throw Error(n); console.log('Loadable stub API');"]);
  const result = child(['--test', '--test-name-pattern=raising outbound demand', 'learning\\S109\\tests\\model.test.cjs']);
  if (precheck.status !== 0 || result.status !== 1 || !/ERR_ASSERTION/.test(result.text)
      || /MODULE_NOT_FOUND|SyntaxError/.test(result.text)) throw new Error('RED must be a genuine loadable-stub assertion failure');
  delete precheck.text;
  delete result.text;
  record = {
    ...record, precheck, ...result, acceptedResult: true,
    snapshots: ['lesson.feature', 'model.js', 'index.html', 'tests\\model.test.cjs'].map(snapshot),
  };
} else if (stage === 'iac') {
  const previous = read('evidence\\red.json');
  const red = JSON.parse(previous);
  const stub = red.snapshots.find((item) => item.source === 'model.js');
  if (hash(read('model.js')) !== stub.sha256) throw new Error('Implementation preceded IaC N/A');
  record = {
    ...record, stage: 'IaC N/A', previousStageSha256: hash(previous), stubUnchangedAtThisStage: true,
    reason: 'Resource-free standalone fictional browser lesson; no cloud, IaC, sockets, network changes, deploy or spend.',
  };
} else {
  const args = stage === 'green'
    ? ['--test', 'learning\\S109\\tests\\model.test.cjs', 'learning\\S109\\tests\\integrity.test.cjs']
    : ['learning\\S109\\tools\\syntax.cjs'];
  const result = child(args);
  process.stdout.write(result.text);
  delete result.text;
  record = {
    ...record, ...result,
    snapshots: ['model.js', 'lesson.js', 'index.html', 'lesson.css', 'manifest.json',
      'lesson.feature', 'tests\\model.test.cjs', 'tests\\integrity.test.cjs', 'tools\\browser.cjs', 'tools\\syntax.cjs'].map(snapshot),
  };
  if (result.status !== 0) process.exitCode = 1;
}
record.finishedAtUtc = new Date().toISOString();
fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(`${stage}: ${path.relative(repo, output)}`);
