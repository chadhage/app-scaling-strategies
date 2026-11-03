'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const [permission, stage] = process.argv.slice(2);
if (permission !== '--capture') throw new Error('Evidence writes require --capture and a deliberate stage.');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
const write = (file, bytes) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: null, windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error(String(result.stderr || result.error));
  return result.stdout;
};
const evidence = (...parts) => path.join('evidence', ...parts);
const sourceFile = evidence('source-contract.json');

if (stage === 'source') {
  if (fs.existsSync(path.join(root, sourceFile))) throw new Error('Source provenance already exists; preserve the first read.');
  const baselineCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const section = (start, end) => (buffer) => {
    const text = buffer.toString('utf8');
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    if (from < 0 || to < from) throw new Error(`Missing exact source section ${start}`);
    return Buffer.from(text.slice(from, to));
  };
  const row = (id) => (buffer) => {
    const match = buffer.toString('utf8').match(new RegExp(`^\\| ${id} \\|[^\\r\\n]*(?:\\r?\\n|$)`, 'm'));
    if (!match) throw new Error(`Missing exact source row ${id}`);
    return Buffer.from(match[0]);
  };
  const paragraph = (buffer) => {
    const match = buffer.toString('utf8').match(/^Packet membership is fixed before admission\.[^\r\n]*(?:\r?\n|$)/m);
    if (!match) throw new Error('Missing default packet rule');
    return Buffer.from(match[0]);
  };
  const selections = [
    ['README.md', 'source-readme.snapshot', section('### F. N-tier and version compatibility', '### G. Database')],
    ['.docs\\wiki\\backlog.md', 'source-backlog.snapshot', section('### F. N-tier and version compatibility', '### G. Database')],
    ['.docs\\wiki\\kanban.md', 'source-portable-contract.snapshot', section('## Atomic card contract', '## Concurrent pull')],
    ['.docs\\wiki\\kanban.md', 'source-card.snapshot', row('A-S060')],
    ['.docs\\wiki\\kanban.md', 'source-native-sibling.snapshot', row('B-S060')],
    ['.docs\\wiki\\kanban.md', 'source-packet-rule.snapshot', paragraph],
  ];
  const entries = selections.map(([file, snapshot, select]) => {
    const gitPath = file.replace(/\\/g, '/');
    const blob = git(['rev-parse', `${baselineCommit}:${gitPath}`]).toString().trim();
    const committed = git(['cat-file', 'blob', blob]);
    const raw = select(fs.readFileSync(path.join(repo, file)));
    const committedSelection = select(committed);
    if (!canonical(raw).equals(canonical(committedSelection))) throw new Error(`Source drift: ${file}`);
    write(evidence(snapshot), raw);
    return {
      path: file, gitPath, gitBlob: blob, canonicalGitFileSha256: sha(committed),
      snapshot, rawBytes: raw.length, rawSha256: sha(raw), rawHasCRLF: raw.includes(Buffer.from('\r\n')),
      canonicalSelectedSha256: sha(canonical(committedSelection)),
    };
  });
  const manifest = {
    schemaVersion: 1, cardId: 'A-S060', parentId: 'D-S060', kano: 'S', kanoUnit: 'A-S060',
    packet: 'SC-S060', owner: 'worker-A-S060', entryGate: 'SOURCE', ownedScope: 'learning\\S060\\**',
    baselineCommit, sourceReadAndQualifiedAtUtc: new Date().toISOString(),
    sourceRow: row('S060')(fs.readFileSync(path.join(repo, 'README.md'))).toString().trimEnd(),
    backlogRow: row('D-S060')(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'backlog.md'))).toString().trimEnd(),
    cardRow: row('A-S060')(fs.readFileSync(path.join(repo, '.docs', 'wiki', 'kanban.md'))).toString().trimEnd(),
    sourceFiles: entries,
    qualification: 'Exact raw selected working-tree bytes are preserved; their canonical LF bytes equal selections from the recorded Git blobs. Git object paths use Git slash syntax, not OS path syntax.',
    refinement: 'One small local synthetic schema-recovery exercise; no additional unit, parent or native work is admitted. B-S060 and D-S060 real data/host acceptance remain incomplete.',
  };
  json(sourceFile, manifest);
  console.log(JSON.stringify({ stage, outcome: 'PASS', snapshots: entries.length }));
} else if (stage === 'iac') {
  const red = JSON.parse(read(evidence('red', 'run.json')));
  if (red.exitCode !== 1 || red.assertionFailures !== 1 || red.missingCodeOrTools) {
    throw new Error('IaC decision requires genuine assertion RED first');
  }
  const target = evidence('iac-decision.json');
  if (fs.existsSync(path.join(root, target))) throw new Error('Preserve the original IaC decision.');
  json(target, {
    cardId: 'A-S060', status: 'N/A', stage: 'After genuine behavioral RED and before behavior implementation',
    decidedAtUtc: new Date().toISOString(), afterRedCompletedAtUtc: red.completedAtUtc,
    reason: 'Resource-free offline synthetic schema-recovery lesson. No database or Azure resource is created; cloud/IaC/scaffold/identity/deploy/spend are not authorized.',
  });
  console.log('IaC N/A recorded after assertion RED.');
} else if (['red', 'initial-green', 'green', 'syntax', 'syntax-002', 'acceptance'].includes(stage)) {
  const target = evidence(stage, 'run.json');
  if (fs.existsSync(path.join(root, target))) throw new Error(`Preserve existing ${stage} evidence.`);
  const red = stage === 'red';
  const syntax = stage.startsWith('syntax');
  const args = syntax
    ? ['--check', 'model.js']
    : ['--test', ...(red ? ['--test-name-pattern=compatible reversal preserves'] : []),
      path.join('tests', 'model.test.cjs'),
      ...(!red ? [path.join('tests', 'surface.test.cjs')] : []),
      ...(stage === 'acceptance' ? [path.join('tests', 'browser.test.cjs'), path.join('tests', 'integrity.test.cjs')] : [])];
  const snapshots = red ? ['schema-recovery.feature', 'fixtures.js', 'model.js', path.join('tests', 'model.test.cjs')]
    .map((file) => {
      const buffer = read(file);
      const snapshot = `${path.basename(file)}.snapshot`;
      write(evidence('red', snapshot), buffer);
      return { source: file, snapshot, bytes: buffer.length, sha256: sha(buffer) };
    }) : [];
  const startedAtUtc = new Date().toISOString();
  let commands = [{ executable: process.execPath, args }];
  if (syntax) {
    commands = [
      'fixtures.js', 'model.js', 'app.js', path.join('tests', 'model.test.cjs'),
      path.join('tests', 'surface.test.cjs'), path.join('tests', 'browser.test.cjs'),
      path.join('tests', 'integrity.test.cjs'), path.join('tests', 'capture.cjs'), path.join('tests', 'csp-probe.js'),
    ].map((file) => ({ executable: process.execPath, args: ['--check', file] }));
  }
  const results = commands.map((command) => spawnSync(command.executable, command.args, {
    cwd: root, encoding: null, windowsHide: true,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '', NODE_OPTIONS: '' },
  }));
  const stdout = Buffer.concat(results.map((result) => result.stdout || Buffer.alloc(0)));
  const stderr = Buffer.concat(results.map((result) => result.stderr || Buffer.alloc(0)));
  const text = stdout.toString() + stderr.toString();
  const failed = results.find((result) => result.status !== 0 || result.error || result.signal);
  const exitCode = failed ? (failed.status ?? 1) : 0;
  const record = {
    cardId: 'A-S060', stage, runtime: process.version, commands,
    startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode,
    spawnError: results.find((result) => result.error)?.error.message || null,
    signal: results.find((result) => result.signal)?.signal || null,
    tests: Number(text.match(/# tests (\d+)/)?.[1] || 0),
    passed: Number(text.match(/# pass (\d+)/)?.[1] || 0),
    failed: Number(text.match(/# fail (\d+)/)?.[1] || 0),
    assertionFailures: (text.match(/code: 'ERR_ASSERTION'/g) || []).length,
    missingCodeOrTools: results.some((result) => Boolean(result.error))
      || /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/.test(text),
    rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr), snapshots,
  };
  write(evidence(stage, 'stdout.raw'), stdout);
  write(evidence(stage, 'stderr.raw'), stderr);
  json(target, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (red && (exitCode !== 1 || record.assertionFailures !== 1 || record.missingCodeOrTools)) {
    throw new Error('RED did not establish the required real assertion failure.');
  }
  if (!red && exitCode !== 0) process.exitCode = 1;
} else if (stage === 'index') {
  const excluded = new Set([evidence('content-index.json')]);
  const entries = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const file = path.relative(root, full);
        if (excluded.has(file)) continue;
        const bytes = fs.readFileSync(full);
        const raw = /\.(?:snapshot|raw)$/.test(file);
        entries.push({ path: file, representation: raw ? 'raw' : 'canonical-lf',
          bytes: (raw ? bytes : canonical(bytes)).length, sha256: sha(raw ? bytes : canonical(bytes)) });
      } else throw new Error(`Unsupported owned file type: ${full}`);
    }
  };
  visit(root);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  json(evidence('content-index.json'), {
    cardId: 'A-S060', capturedAtUtc: new Date().toISOString(), files: entries,
    excludes: ['evidence\\content-index.json (self-reference)'],
    ordinaryVerificationWrites: false,
  });
  console.log(`Indexed ${entries.length} owned files.`);
} else {
  throw new Error(`Unsupported capture stage: ${stage}`);
}
