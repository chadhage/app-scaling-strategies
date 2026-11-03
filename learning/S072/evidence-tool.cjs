'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const owned = __dirname;
const repo = path.resolve(owned, '..', '..');
const raw = path.join(owned, 'evidence', 'raw');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const writeNew = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' });
};
const json = (file, value) => writeNew(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => execFileSync('git', args, { cwd: repo, windowsHide: true });

function extract(buffer, selection) {
  const text = buffer.toString('utf8');
  if (selection.row) {
    const line = text.match(new RegExp(`^\\| ${selection.row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|[^\\r\\n]*(?:\\r\\n|\\n|$)`, 'm'));
    if (!line) throw new Error(`Missing exact source row ${selection.row}`);
    return Buffer.from(line[0]);
  }
  const start = text.indexOf(selection.start);
  const end = text.indexOf(selection.end, start + selection.start.length);
  if (start < 0 || end < 0) throw new Error('Missing source section boundary');
  return Buffer.from(text.slice(start, end));
}

function captureSource() {
  const commit = git('rev-parse', 'HEAD').toString().trim();
  const selections = [
    { name: 'readme-row', path: 'README.md', row: 'S072' },
    { name: 'acceptance', path: 'README.md', start: '## Acceptance and evidence', end: '## Recommended demonstration sequence' },
    { name: 'backlog-row', path: '.docs\\wiki\\backlog.md', row: 'D-S072' },
    { name: 'atomic-portable', path: '.docs\\wiki\\kanban.md', start: '## Atomic card contract', end: '## Concurrent pull and one-piece flow' },
    { name: 'a-card', path: '.docs\\wiki\\kanban.md', row: 'A-S072' },
    { name: 'b-card', path: '.docs\\wiki\\kanban.md', row: 'B-S072' },
    { name: 'source-gate', path: '.docs\\wiki\\kanban.md', row: 'SOURCE' },
  ];
  const proofs = selections.map((selection) => {
    const working = extract(fs.readFileSync(path.join(repo, selection.path)), selection);
    const canonical = extract(git('show', `${commit}:${selection.path.replaceAll('\\', '/')}`), selection);
    const workingPath = path.join('evidence', 'raw', 'source', `${selection.name}.working.snapshot`);
    const gitPath = path.join('evidence', 'raw', 'source', `${selection.name}.git.snapshot`);
    writeNew(path.join(owned, workingPath), working);
    writeNew(path.join(owned, gitPath), canonical);
    return { ...selection, workingPath, gitPath, workingSha256: sha(working), canonicalGitSha256: sha(canonical) };
  });
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'flow-state.json'), 'utf8'));
  const card = ledger.cards.find((item) => item.id === 'A-S072');
  if (!card || card.owner !== 'worker-A-S072' || card.packet !== 'SC-S072' || card.kano !== 'S' || card.state !== 'In Progress') {
    throw new Error('Exact claimed A-S072 packet/owner/class not available');
  }
  json(path.join(raw, 'source', 'claimed-card.json'), card);
  json(path.join(owned, 'evidence', 'source-contract.json'), {
    cardId: 'A-S072', workerId: 'worker-A-S072', parentId: 'D-S072', sourceId: 'S072',
    packet: 'SC-S072', kano: 'S', sourceCommit: commit, capturedAtUtc: new Date().toISOString(),
    objective: 'Compare unbounded and coalesced refill; identify a database-overloading stampede.',
    acceptance: 'Refill strategy is evidenced by data-tier load and journey latency; stampede-induced failures stay counted.',
    authorization: 'local-synthetic-only', iac: 'N/A - resource-free, standalone synthetic browser lesson',
    canonicalPolicy: 'Git-source buffers are authoritative; working snapshots preserve their original CRLF/LF bytes without normalization.',
    proofs,
  });
  console.log(`Captured exact S072 source and SC-S072 packet at ${commit}`);
}

function sourceFiles(directory = owned) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in owned scope');
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function captureCommand(label, expected, args) {
  if (!/^[a-z][a-z0-9-]*$/.test(label) || !['0', '1'].includes(expected) || !args.length) throw new Error('Invalid capture invocation');
  const out = path.join(raw, 'commands', label);
  for (const suffix of ['stdout', 'stderr', 'json']) {
    if (fs.existsSync(`${out}.${suffix}`)) throw new Error('Raw evidence is append-only; choose an honest new label');
  }
  if (label === 'red-model') {
    for (const file of ['model.js', 'tests\\model.test.cjs', 'refill.feature', '.gitattributes']) {
      writeNew(path.join(owned, 'evidence', 'red', `${file.replaceAll('\\', '-')}.snapshot`), fs.readFileSync(path.join(owned, file)));
    }
  }
  const sources = sourceFiles().filter((file) => !file.includes(`${path.sep}evidence${path.sep}`))
    .map((file) => ({ path: path.relative(owned, file), sha256: sha(fs.readFileSync(file)) }));
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, env: process.env, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  writeNew(`${out}.stdout`, result.stdout || Buffer.alloc(0));
  writeNew(`${out}.stderr`, result.stderr || Buffer.alloc(0));
  json(`${out}.json`, {
    label, startedAtUtc, completedAtUtc: new Date().toISOString(),
    executable: process.execPath, node: process.version, args, cwd: repo,
    exitCode: result.status, signal: result.signal, spawnError: result.error ? String(result.error) : null,
    expectedExitCode: Number(expected), captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
    stdoutSha256: sha(result.stdout || Buffer.alloc(0)), stderrSha256: sha(result.stderr || Buffer.alloc(0)),
    sources,
  });
  process.stdout.write(result.stdout || Buffer.alloc(0));
  process.stderr.write(result.stderr || Buffer.alloc(0));
  if (result.error || result.status !== Number(expected)) throw new Error(`Captured ${label}: expected exit ${expected}, observed ${result.status}`);
  if (label === 'red-model' && (!result.stdout.toString().includes('ERR_ASSERTION') || /MODULE_NOT_FOUND|SyntaxError/.test(result.stdout.toString()))) {
    throw new Error('RED must be an actual loaded behavioral assertion');
  }
}

function seal() {
  const target = path.join(owned, 'evidence', 'integrity.json');
  const files = sourceFiles().filter((file) => file !== target)
    .map((file) => {
      const relative = path.relative(owned, file);
      const rawEvidence = relative.startsWith('evidence\\raw\\') || relative.startsWith('evidence\\red\\');
      const working = fs.readFileSync(file);
      const canonical = rawEvidence ? working : Buffer.from(working.toString('utf8').replaceAll('\r\n', '\n'));
      return {
        path: relative, contentMode: rawEvidence ? 'raw-exact' : 'canonical-git-lf',
        sha256: sha(canonical), bytes: canonical.length,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    algorithm: 'SHA256',
    policy: 'Canonical Git LF for owned text sources; byte-exact for raw provenance and RED snapshots. Normal verification separately checks working bytes remain unchanged.',
    files,
  }, null, 2)}\n`);
  console.log(`Sealed ${files.length} owned source/evidence files; no raw evidence was rewritten.`);
}

const [action, ...args] = process.argv.slice(2);
if (action === 'source' && !args.length) captureSource();
else if (action === 'command') captureCommand(args[0], args[1], args.slice(2));
else if (action === 'seal' && !args.length) seal();
else throw new Error('Use source, command <new-label> <expected-exit> <node-args...>, or seal explicitly.');
