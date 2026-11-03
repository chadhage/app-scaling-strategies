'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const evidence = path.join(folder, 'evidence');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const identity = { cardId: 'A-S064', parentId: 'D-S064', sourceId: 'S064', workerId: 'worker-A-S064', kano: 'S', kanoUnit: 'A-S064', packet: 'SC-S064' };
function writeNew(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}
function jsonNew(file, value) {
  writeNew(file, `${JSON.stringify(value, null, 2)}\n`);
}
function relative(file) {
  return path.relative(folder, file).split(path.sep).join('/');
}
function sourceCapture() {
  const sources = [
    ['README.md', 'source-readme.snapshot', (text) => exactLine(text, '| S064 |')],
    ['.docs\\wiki\\backlog.md', 'source-backlog.snapshot', (text) => exactLine(text, '| D-S064 |')],
    ['.docs\\wiki\\backlog.md', 'source-dependency.snapshot', (text) => exactLine(text, '| D-S054 |')],
    ['.docs\\wiki\\kanban.md', 'source-card.snapshot', (text) => exactLine(text, '| A-S064 |')],
    ['.docs\\wiki\\kanban.md', 'source-native.snapshot', (text) => exactLine(text, '| B-S064 |')],
    ['.docs\\wiki\\kanban.md', 'source-atomic-contract.snapshot', (text) => block(text, '## Atomic card contract', '### Portable A-card lesson contract')],
    ['.docs\\wiki\\kanban.md', 'source-portable-contract.snapshot', (text) => block(text, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow')],
    ['.docs\\wiki\\kanban.md', 'source-packet-rule.snapshot', (text) => exactLine(text, 'Packet membership is fixed before admission.')],
    ['.docs\\wiki\\kanban.md', 'source-parent-rule.snapshot', (text) => block(text, '## Parent completion and traceability', '## Operating checks')],
  ];
  const records = sources.map(([source, name, extract]) => {
    const bytes = fs.readFileSync(path.join(repo, source));
    const excerpt = Buffer.from(extract(bytes.toString('utf8')));
    const output = path.join(evidence, 'raw', 'source', name);
    writeNew(output, excerpt);
    return {
      source, snapshot: relative(output), bytes: excerpt.length, sha256: sha256(excerpt),
      canonicalSha256: sha256(canonical(excerpt)),
      sourceRawSha256AtRead: sha256(bytes), sourceCanonicalSha256AtRead: sha256(canonical(bytes)),
      crlfPairs: (excerpt.toString('utf8').match(/\r\n/g) || []).length,
    };
  });
  jsonNew(path.join(evidence, 'source-contract.json'), {
    ...identity, readAtUtc: new Date().toISOString(), headAtRead: git('rev-parse', 'HEAD'),
    location: 'The supplied source is the exact S064 row in repository README.md; there is no separate source S064/README in this tree.',
    objective: 'Assign a new shard before/after synchronization; reject ambiguous writer ownership.',
    sourceAcceptance: 'Copy and synchronize data before changing routing, with unambiguous write ownership.',
    parentAcceptance: 'Committed data is copied/synchronized before handoff; fencing prevents missing or duplicate writes.',
    dependency: 'D-S054 remains a parent release prerequisite, not a dependency for this resource-free portable model.',
    refinement: 'One coherent copy/synchronize/assign rehearsal; no split or additional test, plumbing, or refinement unit. B-S064 and D-S064 remain incomplete.',
    rawPolicy: 'Owned .gitattributes keeps evidence/** byte-exact, including CRLF source excerpts; code integrity uses canonical LF and real Git filters.',
    sources: records,
  });
  console.log('Exact S064 source, backlog, dependency, A/B rows, atomic/portable contract, packet and parent rules retained.');
}
function exactLine(text, prefix) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`Expected exactly one source line: ${prefix}`);
  return matches[0];
}
function block(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a < 0 || b <= a) throw new Error(`Missing exact source block: ${start}`);
  return text.slice(a, b);
}
function redSnapshots() {
  for (const name of ['model.js', 'tests\\model.test.cjs', 'shard-handoff.feature']) {
    writeNew(path.join(evidence, 'red', `${path.basename(name)}.snapshot`), fs.readFileSync(path.join(folder, name)));
  }
  console.log('Loadable stub, assertion test and BDD snapshots retained under non-auto-discovered .snapshot names.');
}
function tooling() {
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperSha256 = sha256(fs.readFileSync(helper));
  if (helperSha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') throw new Error('Unapproved helper bytes');
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  if (playwrightVersion !== '1.56.1') throw new Error('Unapproved Playwright version');
  const script = [
    "$ErrorActionPreference='Stop'",
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -LiteralPath $p',
    "if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Edge signature not valid Microsoft'}",
    "[ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress",
  ].join('; ');
  const signature = JSON.parse(execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: repo, encoding: 'utf8' }));
  if (!signature.version.startsWith('156.')) throw new Error('Unapproved Edge major');
  jsonNew(path.join(evidence, 'raw', 'edge-signature.json'), signature);
  jsonNew(path.join(evidence, 'tooling.json'), {
    ...identity, capturedAtUtc: new Date().toISOString(), node: process.version, playwrightVersion,
    helper: 'testing/browser/isolated.cjs', helperSha256,
    helperPublication: git('log', '-1', '--format=%H', '--', 'testing\\browser\\isolated.cjs'),
    edgeSignature: 'evidence/raw/edge-signature.json',
    qualification: 'Existing offline Playwright 1.56.1 / signed Edge 156 / Node 22 test tooling only; not production Node 24, native Azure or unattended lifecycle certification.',
    lifecycle: 'Published helper only; openIsolatedLesson with awaited close in finally. Archived lifecycle prototype is unqualified.',
    installed: false, downloaded: false, unsafeFlags: [],
  });
  console.log(`Verified ${process.version}, offline Playwright ${playwrightVersion}, signed Edge ${signature.version}, published helper ${helperSha256}.`);
}
function iac() {
  const red = JSON.parse(fs.readFileSync(path.join(evidence, 'raw', 'red', 'run.json'), 'utf8'));
  const output = fs.readFileSync(path.join(folder, red.stdout.file), 'utf8');
  if (red.exitCode !== 1 || red.expectedExitCode !== 1 || !output.includes('ERR_ASSERTION') || !output.includes("actual: 'unknown'")) {
    throw new Error('A genuine retained loadable-stub assertion RED is required before the IaC step.');
  }
  jsonNew(path.join(evidence, 'iac-stage.json'), {
    ...identity, recordedAtUtc: new Date().toISOString(), status: 'N/A',
    sequence: 'After retained behavioral assertion RED and before implementing the model.',
    redReceipt: 'evidence/raw/red/run.json',
    reason: 'Resource-free portable synthetic lesson. No cloud, IaC, scaffolding, identity registration, deployment or spending is authorized or performed.',
  });
  console.log('IaC stage N/A recorded after genuine assertion RED; no resources or infrastructure files created.');
}
function record(args) {
  const [label, expectedText, command, ...commandArgs] = args;
  if (!/^[a-z][a-z0-9-]*$/.test(label || '') || !/^[01]$/.test(expectedText || '') || !command) throw new Error('Usage: record <label> <expected-exit:0|1> <command> [args]');
  const directory = path.join(evidence, 'raw', label);
  if (fs.existsSync(directory)) throw new Error(`Retained proof will not be overwritten: ${label}`);
  const headAtStart = git('rev-parse', 'HEAD');
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(command, commandArgs, { cwd: repo, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const finishedAtUtc = new Date().toISOString();
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  writeNew(path.join(directory, 'stdout.txt'), stdout);
  writeNew(path.join(directory, 'stderr.txt'), stderr);
  const stream = (name, bytes) => ({ file: `evidence/raw/${label}/${name}.txt`, bytes: bytes.length, sha256: sha256(bytes) });
  jsonNew(path.join(directory, 'run.json'), {
    ...identity, label, command: [command, ...commandArgs], cwd: repo, startedAtUtc, finishedAtUtc,
    node: process.version, headAtStart, headAtReceipt: git('rev-parse', 'HEAD'), expectedExitCode: Number(expectedText),
    exitCode: result.status, signal: result.signal, processError: result.error ? String(result.error) : null,
    browserCaptureAuthorized: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
    recorderCanonicalSha256: sha256(canonical(fs.readFileSync(__filename))),
    stdout: stream('stdout', stdout), stderr: stream('stderr', stderr),
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (result.error || result.status !== Number(expectedText)) process.exitCode = 1;
}

if (require.main === module) {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'source') sourceCapture();
  else if (action === 'red-snapshots') redSnapshots();
  else if (action === 'tooling') tooling();
  else if (action === 'iac') iac();
  else if (action === 'record') record(args);
  else throw new Error('Explicit source, red-snapshots, tooling, iac or record action required; ordinary tests never capture proof.');
}
