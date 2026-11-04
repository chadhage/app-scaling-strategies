'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name));
const stage = process.argv[2];
assert.ok(['source', 'red', 'iac', 'green', 'final'].includes(stage), 'Explicit one-time recording stage required.');

function write(name, bytes) {
  const target = path.join(evidence, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
function report(name, value) {
  write(name, `${JSON.stringify(value, null, 2)}\n`);
}
function raw(name, bytes, extra = {}) {
  const file = path.join('raw', `${name}.raw.gz`);
  write(file, gzipSync(bytes));
  return {
    file, sha256: hash(bytes), bytes: bytes.length,
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length, ...extra,
  };
}
function git(args) {
  return execFileSync('git', args, { cwd: repo, timeout: 30000 });
}
const identity = { cardId: 'A-S114', workerId: 'worker-A-S114', packet: 'SC-S114', kano: 'S', kanoUnit: 'A-S114' };
const exact = {
  readme: '| S114 | **Unplanned regional failure:** Validate detection, alternate capacity, data availability, and client recovery against the agreed interruption budget. |',
  backlog: '| D-S114 | P2 | Add unplanned owned-origin/dependency isolation and regional recovery orchestration. | Detection, surviving capacity, transaction outcomes, and client recovery meet the declared budget where evidenced; full-region claims are not fabricated. | P006, D-S066 |',
  kanban: '| A-S114 | D-S114 | S | Fail owned regional origins/dependencies; distinguish proxy observations from full-region guarantees. | SOURCE |',
};

if (stage === 'source') {
  assert.match(read('.gitattributes').toString(), /^evidence\/raw\/\*\* -text$/m);
  const head = git(['rev-parse', 'HEAD']).toString().trim();
  const entries = [
    ['readme', 'README.md', head],
    ['backlog', '.docs/wiki/backlog.md', head],
    ['kanban', '.docs/wiki/kanban.md', head],
    ['helper', 'testing/browser/isolated.cjs', '53c0c0d82cc1db6780a87ac2b1085734af6d5c60'],
  ].map(([name, source, canonicalCommit]) => {
    const working = fs.readFileSync(path.join(repo, ...source.split('/')));
    const canonical = git(['show', `${canonicalCommit}:${source}`]);
    if (exact[name]) {
      for (const bytes of [working, canonical]) {
        assert.ok(bytes.toString('utf8').split(/\r?\n/).includes(exact[name]));
      }
    }
    if (name === 'kanban') {
      for (const bytes of [working, canonical]) {
        const text = bytes.toString('utf8');
        assert.ok(text.includes('every other A/B card belongs to SC-Snnn'));
        assert.ok(text.includes('### Portable A-card lesson contract'));
      }
    }
    if (name === 'helper') {
      assert.equal(hash(working), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
      assert.equal(hash(canonical), '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
    }
    const normalized = Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      name, source, canonicalCommit,
      working: raw(path.join('source', `${name}.working`), working),
      canonicalGit: raw(path.join('source', `${name}.canonical`), canonical),
      workingLfSha256: hash(normalized),
      workingLfEqualsCanonical: normalized.equals(canonical),
      workingEqualsCanonicalBytes: working.equals(canonical),
    };
  });
  report('source.json', {
    ...identity, capturedAtUtc: new Date().toISOString(), sourceReadBeforeDesign: true,
    exact, card: { id: 'A-S114', parents: ['D-S114'], deliver: 'Fail owned regional origins/dependencies; distinguish proxy observations from full-region guarantees.', technicalEntryGate: 'SOURCE', packet: 'SC-S114', kano: 'S', kanoUnit: 'A-S114' },
    nativeSibling: { id: 'B-S114', packet: 'SC-S114', complete: false },
    entries,
  });
  console.log('Exact source, portable contract, packet and published helper bytes preserved.');
}

if (stage === 'red') {
  json('evidence\\source.json');
  const startedAtUtc = new Date().toISOString();
  const names = ['.gitattributes', 'lesson.feature', 'model.js', 'tests\\model.test.cjs', 'tools\\record-stages.cjs'];
  const snapshots = names.map((source) => raw(path.join('red', source.replace(/[\\/.]/g, '_')), read(source), { source }));
  const precheckCommand = [
    "const assert=require('node:assert/strict')",
    "const api=require('.\\\\learning\\\\S114\\\\model.js')",
    "assert.equal(typeof api.createState,'function')",
    "assert.equal(typeof api.applyAction,'function')",
    "assert.ok(Array.isArray(api.fixtures))",
    "assert.ok(api.createState())",
    "console.log('Loadable stub API: exports and execution succeed')",
  ].join(';');
  const precheck = spawnSync(process.execPath, ['-e', precheckCommand], { cwd: repo, timeout: 10000 });
  assert.equal(precheck.status, 0);
  const command = ['--test', 'learning\\S114\\tests\\model.test.cjs'];
  const red = spawnSync(process.execPath, command, { cwd: repo, timeout: 10000 });
  const text = red.stdout.toString('utf8');
  assert.equal(red.status, 1, 'The behavioral assertion must actually fail.');
  assert.equal(red.signal, null);
  assert.equal(red.error, undefined);
  assert.match(text, /ERR_ASSERTION/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|SyntaxError/);
  report('red.json', {
    ...identity, stage: 'behavioral RED', startedAtUtc, finishedAtUtc: new Date().toISOString(),
    nodeVersion: process.version, command: [process.execPath, ...command], status: red.status,
    signal: red.signal, error: null, acceptedBehavioralRed: true, snapshots,
    precheck: {
      status: precheck.status,
      stdout: raw(path.join('red', 'precheck-stdout'), precheck.stdout),
      stderr: raw(path.join('red', 'precheck-stderr'), precheck.stderr),
    },
    stdout: raw(path.join('red', 'stdout'), red.stdout),
    stderr: raw(path.join('red', 'stderr'), red.stderr),
  });
  process.stdout.write(red.stdout);
  console.log('Accepted genuine assertion RED; not a tooling or module-load failure.');
}

if (stage === 'iac') {
  const red = json('evidence\\red.json');
  assert.equal(hash(read('model.js')), red.snapshots.find((entry) => entry.source === 'model.js').sha256);
  report('iac-na.json', {
    ...identity, stage: 'IaC N/A', recordedAtUtc: new Date().toISOString(),
    previousStageSha256: hash(read('evidence\\red.json')), stubUnchangedAtThisStage: true,
    reason: 'Resource-free standalone browser lesson. Every regional origin, dependency, fault, probe, recovery and journey is fixed fictional teaching DATA ONLY. No cloud, infrastructure, identity, deployment, spend or real failure is authorized or required.',
    generatedInfrastructureFiles: [], nativeSiblingComplete: false, sourceParentComplete: false,
  });
  console.log('IaC explicitly N/A, recorded after RED and before implementation.');
}

if (stage === 'green' || stage === 'final') {
  assert.notEqual(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Verification commands must not recapture browser proof.');
  assert.ok(!fs.existsSync(path.join(evidence, `${stage}.json`)), 'Historical successful verification is not overwritten.');
  const startedAtUtc = new Date().toISOString();
  let attempt = 1;
  while (fs.existsSync(path.join(evidence, 'raw', `${stage}-${attempt}`))) attempt++;
  const prefix = `${stage}-${attempt}`;
  const files = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? (entry.name === 'evidence' ? [] : files(file)) : [path.relative(root, file)];
  });
  const snapshots = files(root).sort().map((source) => raw(path.join(prefix, source.replace(/[\\/.]/g, '_')), read(source), { source }));
  const commands = [
    ['learning\\S114\\tools\\syntax.cjs'],
    ['--test', 'learning\\S114\\tests\\model.test.cjs', 'learning\\S114\\tests\\integrity.test.cjs',
      ...(stage === 'final' ? ['learning\\S114\\tests\\browser-proof.test.cjs'] : [])],
    ...(stage === 'final' ? [['learning\\S114\\tools\\browser.cjs']] : []),
  ].map((args, index) => {
    const result = spawnSync(process.execPath, args, { cwd: repo, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    return {
      args, status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
      stdout: raw(path.join(prefix, `command-${index}-stdout`), result.stdout),
      stderr: raw(path.join(prefix, `command-${index}-stderr`), result.stderr),
    };
  });
  const passed = commands.every((command) => command.status === 0 && command.signal === null && command.error === null);
  report(passed ? `${stage}.json` : `${stage}-failed-${attempt}.json`, {
    ...identity, stage: stage === 'green' ? 'focused GREEN + syntax/integrity' : 'final read-only verification',
    startedAtUtc, finishedAtUtc: new Date().toISOString(), status: passed ? 'passed' : 'failed',
    nodeVersion: process.version, commands, snapshots, additionalKanoCredits: 0,
  });
  for (const command of commands) console.log(`${command.status === 0 ? 'PASS' : 'FAIL'} node ${command.args.join(' ')}`);
  if (!passed) {
    const { gunzipSync } = require('node:zlib');
    for (const command of commands.filter((item) => item.status !== 0)) {
      process.stdout.write(gunzipSync(fs.readFileSync(path.join(evidence, command.stdout.file))));
      process.stderr.write(gunzipSync(fs.readFileSync(path.join(evidence, command.stderr.file))));
    }
    process.exitCode = 1;
  }
}
