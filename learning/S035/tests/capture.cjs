'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function writeNew(name, bytes) {
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, name), bytes, { flag: 'wx' });
}
function next(prefix) {
  let index = 1;
  while (fs.existsSync(path.join(evidence, `${prefix}-${String(index).padStart(3, '0')}.json`))) index++;
  return `${prefix}-${String(index).padStart(3, '0')}`;
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }).sort();
}
const [action, ...args] = process.argv.slice(2);
if (action === 'source') {
  const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
  const readme = read('README.md');
  const backlog = read('.docs\\wiki\\backlog.md');
  const kanban = read('.docs\\wiki\\kanban.md');
  const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
  const claim = JSON.parse(read('.docs\\wiki\\flow-state.json')).cards.find((card) => card.id === 'A-S035');
  const result = {
    capturedAtUtc: new Date().toISOString(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    source: row(readme, 'S035'), parent: row(backlog, 'D-S035'),
    card: row(kanban, 'A-S035'), nativeSibling: row(kanban, 'B-S035'),
    atomicContract: kanban.split('## Atomic card contract')[1].split('## Concurrent pull')[0].trim(),
    packetRule: kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed')),
    claim, helperCommit: '53c0c0d',
    hashes: ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md', 'testing\\browser\\isolated.cjs']
      .map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.join(repo, file))) })),
  };
  if (!result.source || !result.parent || !result.card || claim.owner !== 'worker-A-S035') throw new Error('Exact source/claim missing');
  writeNew(`${next('source-contract')}.json`, `${JSON.stringify(result, null, 2)}\n`);
} else if (['red', 'green', 'browser', 'verification'].includes(action)) {
  if (!args.length || args[0] !== '--test') throw new Error('Use an explicit Node --test command');
  if (action === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Browser capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1');
  const name = next(action);
  const inputs = files(root).filter((file) => !file.startsWith(`${evidence}${path.sep}`))
    .map((file) => ({ path: path.relative(repo, file), sha256: hash(fs.readFileSync(file)) }));
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: repo, encoding: null, maxBuffer: 8 * 1024 * 1024 });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  writeNew(`${name}.stdout.txt`, stdout);
  writeNew(`${name}.stderr.txt`, stderr);
  const snapshots = [];
  if (action === 'red') {
    for (const file of ['callback.feature', 'callback.js', 'tests\\callback.test.cjs']) {
      const bytes = fs.readFileSync(path.join(root, file));
      const snapshot = `${name}-${path.basename(file)}.snapshot.txt`;
      writeNew(snapshot, bytes);
      snapshots.push({ file: snapshot, sha256: hash(bytes) });
    }
  }
  const metadata = {
    action, startedAtUtc, completedAtUtc: new Date().toISOString(), cwd: repo,
    executable: process.execPath, nodeVersion: process.version,
    arguments: args, exitCode: result.status, signal: result.signal,
    error: result.error ? result.error.message : null, inputs, snapshots,
    stdout: { file: `${name}.stdout.txt`, sha256: hash(stdout), bytes: stdout.length },
    stderr: { file: `${name}.stderr.txt`, sha256: hash(stderr), bytes: stderr.length },
    captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  };
  writeNew(`${name}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = result.status === null ? 1 : result.status;
} else if (action === 'seal') {
  const manifestPath = path.join(root, 'evidence.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.sourceHashes = files(root).filter((file) => file !== manifestPath && !file.startsWith(`${evidence}${path.sep}`))
    .map((file) => ({ path: path.relative(root, file), sha256: hash(fs.readFileSync(file)) }));
  manifest.proofs = files(evidence).map((file) => ({
    path: path.relative(root, file), sha256: hash(fs.readFileSync(file)),
  }));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Sealed ${manifest.sourceHashes.length} source files and ${manifest.proofs.length} historical proof files.`);
} else {
  throw new Error('Explicit capture action required: source, red, green, browser, verification or seal');
}
