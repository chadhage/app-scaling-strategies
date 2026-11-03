'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stamp = () => new Date().toISOString();
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name));
function write(name, data) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data, { flag: 'wx' });
}
function writeJson(name, data) { write(name, `${JSON.stringify(data, null, 2)}\n`); }
function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo });
  if (result.status !== 0) throw new Error(`Git read failed: ${result.stderr}`);
  return result.stdout;
}
function run(label, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.NODE_TEST_CONTEXT;
  if (!Object.hasOwn(extraEnv, 'CAPTURE_BROWSER_EVIDENCE')) delete env.CAPTURE_BROWSER_EVIDENCE;
  const result = spawnSync(process.execPath, args, { cwd: repo, env, timeout: 120000 });
  write(`evidence/raw/${label}.stdout.txt`, result.stdout || Buffer.alloc(0));
  write(`evidence/raw/${label}.stderr.txt`, result.stderr || Buffer.alloc(0));
  const record = {
    capturedAtUtc: stamp(), runtime: process.version, args, status: result.status,
    signal: result.signal, error: result.error ? result.error.message : null,
    stdoutSha256: hash(result.stdout || Buffer.alloc(0)),
    stderrSha256: hash(result.stderr || Buffer.alloc(0))
  };
  writeJson(`evidence/${label}.json`, record);
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return record;
}
function allFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? allFiles(file) : [file];
  }).sort();
}

const stage = process.argv[2];
if (stage === 'source') {
  const revision = git(['rev-parse', 'HEAD']).toString().trim();
  const baseline = 'a1411c1fd7b081e7772db0ac96eb61d697452c86';
  const source = git(['show', `${baseline}:README.md`]);
  const backlog = git(['show', `${revision}:.docs/wiki/backlog.md`]);
  const kanban = git(['show', `${revision}:.docs/wiki/kanban.md`]);
  const line = (bytes, prefix) => bytes.toString().split(/\r?\n/).find((value) => value.startsWith(prefix));
  const selected = {
    source: line(source, '| S102 |'),
    parent: line(backlog, '| D-S102 |'),
    card: line(kanban, '| A-S102 |'),
    sibling: line(kanban, '| B-S102 |')
  };
  const expected = {
    source: '| S102 | **DNS-cache persistence:** Keep cached destinations usable for the required overlap period; do not assume immediate DNS convergence. |',
    parent: '| D-S102 | P1 | Add owned test-DNS updates with fresh/cached resolver-driver observations. | Old cached destinations remain usable for the declared overlap; resolver emulation is labeled and not claimed as universal DNS convergence. | P006 |',
    card: '| A-S102 | D-S102 | S | Compare fresh/cached DNS answers; identify why immediate convergence cannot be assumed. | SOURCE |',
    sibling: '| B-S102 | D-S102 | S | Conduct one owned DNS change; verify resolver-specific observations and retained cached destinations. | CORE, DATA, HOST, C091 |'
  };
  if (JSON.stringify(selected) !== JSON.stringify(expected)) throw new Error('Exact source acceptance changed; no inferred substitute');
  const contracts = kanban.toString().split(/\r?\n/);
  const section = (first, last) => `${contracts.slice(contracts.indexOf(first), contracts.indexOf(last)).join('\r\n')}\r\n`;
  const atomic = section('## Atomic card contract', '## Concurrent pull and one-piece flow');
  const packet = contracts.find((value) => value.startsWith('Packet membership is fixed before admission.'));
  if (!atomic.includes('### Portable A-card lesson contract') || !packet.includes('SC-Snnn')) throw new Error('Portable contract or packet missing');
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const admitted = inventory.cards.find((card) => card.id === 'A-S102');
  if (!admitted || admitted.packet !== 'SC-S102' || admitted.kano !== 'S' || admitted.kanoUnit !== 'A-S102') throw new Error('Frozen packet/card mismatch');
  write('evidence/source/atomic-portable.snapshot', Buffer.from(atomic));
  write('evidence/source/selected-rows.snapshot', Buffer.from(`${Object.values(selected).join('\r\n')}\r\n${packet}\r\n`));
  const files = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md', 'testing\\browser\\isolated.cjs'];
  writeJson('evidence/source-contract.json', {
    capturedAtUtc: stamp(), baseline, contractRevision: revision, selected, packetRule: packet,
    cardId: 'A-S102', workerId: 'worker-A-S102', kano: 'S', kanoUnit: 'A-S102', packet: 'SC-S102',
    atomicPortableSha256: hash(Buffer.from(atomic)),
    sourceCanonicalSha256: hash(source), backlogCanonicalSha256: hash(backlog), kanbanCanonicalSha256: hash(kanban),
    rawWorkingFiles: Object.fromEntries(files.map((name) => [name, {
      sha256: hash(fs.readFileSync(path.join(repo, name))),
      crlfCount: (fs.readFileSync(path.join(repo, name)).toString().match(/\r\n/g) || []).length
    }])),
    helper: {
      publishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
      rawSha256: hash(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))),
      canonicalGitSha256: hash(git(['show', '53c0c0d82cc1db6780a87ac2b1085734af6d5c60:testing/browser/isolated.cjs']))
    },
    sourceDirectoryNote: 'S102 is the exact row in the immutable source README, not a standalone source directory.',
    nativeAndParentAcceptance: 'not completed', authorization: 'local-synthetic-only'
  });
} else if (stage === 'bdd') {
  const source = json('evidence/source-contract.json');
  writeJson('evidence/bdd.json', {
    capturedAtUtc: stamp(), sourceContractSha256: hash(read('evidence/source-contract.json')),
    featureSha256: hash(read('dns-cache.feature')), cardId: source.cardId, order: 'source -> BDD -> loadable stub -> assertion RED'
  });
} else if (stage === 'red') {
  const bdd = json('evidence/bdd.json');
  if (bdd.featureSha256 !== hash(read('dns-cache.feature'))) throw new Error('BDD changed before RED');
  for (const name of ['model.js', 'tests/model.test.cjs', 'dns-cache.feature']) {
    write(`evidence/red/${path.basename(name)}.snapshot`, read(name));
  }
  const record = run('red', ['--test', '--test-concurrency=1', '.\\learning\\S102\\tests\\model.test.cjs']);
  if (record.status !== 1 || record.error || !read('evidence/raw/red.stdout.txt').toString().includes('ERR_ASSERTION')) {
    throw new Error('RED is not a genuine assertion failure');
  }
} else if (stage === 'iac') {
  const red = json('evidence/red.json');
  if (red.status !== 1 || red.error) throw new Error('Behavioral RED is a prerequisite');
  writeJson('evidence/iac-decision.json', {
    capturedAtUtc: stamp(), decision: 'N/A', reason: 'Resource-free standalone fixed-data browser lesson.',
    afterRedSha256: hash(read('evidence/red.json')),
    forbidden: ['DNS queries or changes', 'host files', 'resolver or system settings', 'real endpoints', 'resources',
      'cloud', 'IaC generation', 'identity', 'credentials', 'scaffold', 'deploy', 'spend', 'packages', 'frameworks', 'downloads'],
    beforeImplementation: true
  });
} else if (stage === 'green') {
  const record = run('green', ['--test', '--test-concurrency=1',
    '.\\learning\\S102\\tests\\model.test.cjs', '.\\learning\\S102\\tests\\surface.test.cjs']);
  if (record.status !== 0 || record.error) throw new Error('Focused green failed');
} else if (stage === 'syntax' || stage === 'syntax-final' || stage === 'syntax-qualified') {
  const files = allFiles().filter((name) => /\.(?:js|cjs)$/.test(name));
  const checks = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: repo });
    checks.push({ file: path.relative(root, file), sha256: hash(fs.readFileSync(file)), status: result.status, stderr: result.stderr.toString() });
  }
  writeJson(`evidence/${stage}.json`, { capturedAtUtc: stamp(), runtime: process.version, checks });
  if (checks.some((check) => check.status !== 0)) throw new Error('Syntax check failed');
} else if (stage === 'browser' || stage === 'browser-final') {
  const record = run(`${stage}-run`, ['--test', '--test-concurrency=1', '.\\learning\\S102\\tests\\browser.test.cjs'],
    { CAPTURE_BROWSER_EVIDENCE: '1' });
  if (record.status !== 0 || record.error) throw new Error('Actual browser check failed');
} else if (stage === 'seal') {
  const files = allFiles();
  writeJson('evidence/index.json', {
    capturedAtUtc: stamp(), algorithm: 'SHA-256', excludesOnly: 'evidence\\index.json',
    files: Object.fromEntries(files.map((file) => [path.relative(root, file), hash(fs.readFileSync(file))]))
  });
} else {
  throw new Error('Explicit stage required: source, bdd, red, iac, green, syntax, syntax-final, syntax-qualified, browser, browser-final, seal');
}
