'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
function once(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const json = (file, value) => once(file, `${JSON.stringify(value, null, 2)}\n`);
function git(args) {
  const run = spawnSync('git', args, { cwd: repo, windowsHide: true });
  if (run.status !== 0) throw new Error(`git failed: ${run.stderr}`);
  return run.stdout;
}
function slices(name, raw) {
  const text = raw.toString('utf8').replace(/\r\n/g, '\n');
  const line = (pattern) => {
    const matches = text.split('\n').filter((s) => pattern.test(s));
    if (matches.length !== 1) throw new Error(`Expected one ${pattern} in ${name}`);
    return matches[0];
  };
  const section = (start, end) => {
    const from = text.indexOf(start);
    const to = end ? text.indexOf(end, from + start.length) : text.length;
    if (from < 0 || to < from) throw new Error(`Missing section ${start}`);
    return text.slice(from, to).trimEnd();
  };
  if (name === 'README.md') return { S086: line(/^\| S086 \|/) };
  if (name.endsWith('backlog.md')) return {
    D_S086: line(/^\| D-S086 \|/),
    completion: section('## Completion and evidence policy'),
  };
  return {
    A_S086: line(/^\| A-S086 \|/),
    B_S086: line(/^\| B-S086 \|/),
    sourceGate: line(/^\| SOURCE \|/),
    atomic: section('## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section('### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packet: line(/^Packet membership is fixed before admission\./),
  };
}
function captureSource() {
  const baseline = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const observations = ['README.md', '.docs/wiki/backlog.md', '.docs/wiki/kanban.md'].map((source, i) => {
    const working = fs.readFileSync(path.join(repo, ...source.split('/')));
    const canonical = git(['show', `${baseline}:${source}`]);
    const prefix = `evidence/raw/source/${i + 1}`;
    once(`${prefix}-working.gz`, zlib.gzipSync(working));
    once(`${prefix}-git.gz`, zlib.gzipSync(canonical));
    const authoritative = slices(source, working);
    if (JSON.stringify(authoritative) !== JSON.stringify(slices(source, canonical))) {
      throw new Error(`Selected source contract differs from baseline: ${source}`);
    }
    return {
      path: source, baseline, workingSnapshot: `${prefix}-working.gz`,
      gitSnapshot: `${prefix}-git.gz`, workingSHA256: sha(working), gitSHA256: sha(canonical),
      workingCRLF: (working.toString('utf8').match(/\r\n/g) || []).length,
      canonicalGitLF: true, exactSlices: authoritative,
    };
  });
  json('evidence/source-contract.json', {
    cardId: 'A-S086', parentId: 'D-S086', nativeSiblingId: 'B-S086',
    packet: 'SC-S086', kano: 'S', baseline, capturedAtUtc: new Date().toISOString(),
    qualification: 'Working CRLF bytes preserved separately from canonical Git LF; only exact authoritative slices are compared across concurrent unrelated source updates.',
    observations,
  });
}
function captureRun(label, args, expected) {
  const startedAtUtc = new Date().toISOString();
  const run = spawnSync(process.execPath, args, {
    cwd: repo, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  const prefix = `evidence/raw/${label}`;
  once(`${prefix}.stdout`, run.stdout);
  once(`${prefix}.stderr`, run.stderr);
  const text = run.stdout.toString('utf8');
  const assertions = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const summary = Object.fromEntries([...text.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)]
    .map((m) => [m[1], Number(m[2])]));
  json(`evidence/${label}.json`, {
    label, command: [process.execPath, ...args], cwd: repo, startedAtUtc,
    finishedAtUtc: new Date().toISOString(), exitCode: run.status, signal: run.signal,
    stdout: `${prefix}.stdout`, stderr: `${prefix}.stderr`,
    stdoutSHA256: sha(run.stdout), stderrSHA256: sha(run.stderr), summary,
    genuineAssertionFailures: assertions,
  });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (run.status !== expected) throw new Error(`Expected exit ${expected}, got ${run.status}`);
  if (label === 'red' && (!assertions || assertions !== summary.fail || run.stderr.length)) {
    throw new Error('RED must consist of actual assertions, not missing code, tooling or stderr');
  }
}
function allFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? allFiles(file) : [file];
  }).sort();
}
function canonical(file, bytes) {
  return /^(evidence\/raw\/|evidence\/red\/)/.test(file) || file.endsWith('.png')
    ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}
function captureIndex(final = false) {
  const target = final ? 'evidence/content-index-final.json' : 'evidence/content-index.json';
  const files = allFiles().filter((file) => path.relative(root, file).replaceAll('\\', '/') !== target).map((file) => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const bytes = fs.readFileSync(file);
    const clean = canonical(relative, bytes);
    const gitHash = spawnSync('git', ['hash-object', `--path=learning/S086/${relative}`, '--stdin'], {
      cwd: repo, input: bytes, windowsHide: true,
    });
    if (gitHash.status) throw new Error(`Read-only Git clean hash failed: ${relative}`);
    return {
      path: relative, representation: clean === bytes ? 'byte-exact' : 'canonical-LF',
      sha256: sha(clean), gitCleanObject: gitHash.stdout.toString('utf8').trim(),
    };
  });
  json(target, {
    schemaVersion: 1, cardId: 'A-S086', createdAtUtc: new Date().toISOString(),
    policy: 'Every owned file except this self-index. Git text is canonical LF; explicit raw/red evidence and images are byte-exact. hash-object has no -w and writes no objects.',
    ...(final ? {
      supersedes: {
        path: 'evidence/content-index.json', sha256: sha(read('evidence/content-index.json')),
        reason: 'Narrow raw-evidence whitespace attributes; original index, raw proof and preflight source bytes remain preserved and independently verified.',
      },
    } : {}),
    files,
  });
}
function captureTooling() {
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const command = "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe';$s=Get-AuthenticodeSignature -LiteralPath $p;[ordered]@{executable=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=[string]$s.Status;signer=$s.SignerCertificate.Subject;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json";
  const signature = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: repo, windowsHide: true });
  if (signature.status !== 0) throw new Error(`Edge signature observation failed: ${signature.stderr}`);
  once('evidence/raw/tooling.stdout', signature.stdout);
  once('evidence/raw/tooling.stderr', signature.stderr);
  const edge = JSON.parse(signature.stdout.toString('utf8'));
  if (edge.signatureStatus !== 'Valid' || edge.version !== '156.0.4314.50') throw new Error('Unapproved installed browser');
  json('evidence/tooling.json', {
    capturedAtUtc: new Date().toISOString(), node: process.version,
    playwright: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    helper: 'testing\\browser\\isolated.cjs', helperCommit: '53c0c0d', helperSHA256: sha(fs.readFileSync(helper)),
    edge, rawCommand: ['pwsh', '-NoProfile', '-NonInteractive', '-Command', command],
    stdoutSHA256: sha(signature.stdout), stderrSHA256: sha(signature.stderr),
    qualification: 'Already-installed offline test tooling only; no packages, downloads, unsafe flags, foreground lease, production24 validation or lifecycle-prototype qualification.',
  });
}
function captureSyntax(label = 'syntax') {
  const files = allFiles().filter((file) => /\.(js|cjs)$/.test(file));
  const checks = [];
  const stdout = [];
  const stderr = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: repo, windowsHide: true });
    checks.push({ file: path.relative(root, file), command: [process.execPath, '--check', file], exitCode: result.status });
    stdout.push(result.stdout);
    stderr.push(result.stderr);
    if (result.status !== 0) throw new Error(`Syntax failure: ${file}: ${result.stderr}`);
  }
  once(`evidence/raw/${label}.stdout`, Buffer.concat(stdout));
  once(`evidence/raw/${label}.stderr`, Buffer.concat(stderr));
  json(`evidence/${label}.json`, { recordedAtUtc: new Date().toISOString(), checks, allPassed: true });
}
if (require.main === module) {
  const command = process.argv[2];
  if (command === 'source') captureSource();
  else if (command === 'red') {
    for (const file of ['readiness.feature', 'fixtures.js', 'model.js', 'tests/model.test.cjs']) {
      once(`evidence/red/${file.replaceAll('/', '-')}.snapshot`, read(file));
    }
    captureRun('red', ['--test', 'learning\\S086\\tests\\model.test.cjs'], 1);
  } else if (command === 'iac') {
    const red = JSON.parse(read('evidence/red.json'));
    if (!red.genuineAssertionFailures || fs.existsSync(path.join(root, 'evidence/iac-decision.json'))) {
      throw new Error('IaC decision requires genuine RED and is append-only');
    }
    json('evidence/iac-decision.json', {
      decision: 'N/A', recordedAtUtc: new Date().toISOString(), afterRed: red.finishedAtUtc,
      reason: 'Resource-free, static, synthetic browser lesson; no cloud, IaC, scaffold, identity, credentials, deployment or expenditure is authorized.',
    });
  } else if (command === 'green') {
    captureRun('green', ['--test', '--test-concurrency=1',
      'learning\\S086\\tests\\model.test.cjs', 'learning\\S086\\tests\\surface.test.cjs',
      'learning\\S086\\tests\\browser.test.cjs'], 0);
  } else if (command === 'tooling') captureTooling();
  else if (command === 'syntax') captureSyntax();
  else if (command === 'syntax-final') captureSyntax('syntax-final');
  else if (command === 'index') captureIndex();
  else if (command === 'index-final') captureIndex(true);
  else throw new Error('Explicit capture only: source, red, iac, tooling, green, syntax[-final], index[-final]');
}

module.exports = { slices, sha, allFiles, canonical };
