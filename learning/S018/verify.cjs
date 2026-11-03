'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(__dirname, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (name) => sha(fs.readFileSync(path.join(__dirname, name)));
const filesBelow = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory()
    ? filesBelow(path.join(directory, entry.name), path.join(prefix, entry.name))
    : [path.join(prefix, entry.name)]);
const proofHashes = () => Object.fromEntries([
  ...filesBelow(evidence).map((name) => path.join('evidence', name)),
  ...['evidence.json', 'result.json'].filter((name) => fs.existsSync(path.join(__dirname, name)))
].sort().map((name) => [name, fileHash(name)]));
const sourceHashes = () => Object.fromEntries(fs.readdirSync(__dirname).filter((name) =>
  fs.statSync(path.join(__dirname, name)).isFile() && !['evidence.json', 'result.json'].includes(name))
  .sort().map((name) => [name, fileHash(name)]));
const write = (name, data) => fs.writeFileSync(path.join(evidence, name), data, { flag: 'wx' });
const json = (name, data) => write(name, `${JSON.stringify(data, null, 2)}\n`);
const stage = process.argv[2] || 'all';
assert.equal(process.version, 'v22.23.4', 'Only the installed Node22 test-tooling lane is qualified');
assert.ok(['red', 'all', 'green', 'syntax', 'browser', 'integrity'].includes(stage), 'Unknown verification stage');
fs.mkdirSync(evidence, { recursive: true });
const before = proofHashes();
let redStem = 'red';

if (stage === 'red') {
  assert.equal(capture, true, 'RED provenance capture must be deliberate');
  if (fs.existsSync(path.join(evidence, 'red.json'))) {
    let number = 2;
    while (fs.existsSync(path.join(evidence, `red-${number}.json`))) number += 1;
    redStem = `red-${number}`;
  }
  for (const [source, snapshot] of [
    ['model.js', `${redStem}-model-snapshot.txt`],
    ['model.test.cjs', `${redStem}-spec-snapshot.txt`],
    ['independent-tier-scaling.feature', `${redStem}-bdd-snapshot.txt`]
  ]) write(snapshot, fs.readFileSync(path.join(__dirname, source)));
  const rows = [
    ['README.md', '| S018 |'],
    [path.join('.docs', 'wiki', 'backlog.md'), '| D-S018 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), '| A-S018 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), '| B-S018 |']
  ].map(([source, prefix]) => {
    const row = fs.readFileSync(path.join(root, source), 'utf8').split(/\r?\n/)
      .find((line) => line.startsWith(prefix));
    assert.ok(row, `Missing exact source row ${prefix}`);
    return { source, row, sha256: sha(row) };
  });
  if (!fs.existsSync(path.join(evidence, 'source-contract.json'))) json('source-contract.json', {
    cardId: 'A-S018', workerId: 'worker-A-S018', kano: 'S', kanoUnit: 'A-S018', packet: 'SC-S018',
    readBeforeBehaviorDesign: true, rows,
    contract: 'Portable standalone browser-openable synthetic exercise; choose an action, inspect a trace and check assertions. No cloud calls, credentials, framework or parent-completion claim.',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    originalParentPrerequisites: ['D-S062'],
    refinement: 'Keep one bounded independent-tier exercise. Native B-S018 remains gated by CORE, DATA, AKS, C076 and native authorization; parent D-S018 remains incomplete.'
  });
}

const stages = stage === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [stage];
let failed = false;
for (const current of stages) {
  const startedAtUtc = new Date().toISOString();
  const argsList = current === 'syntax'
    ? fs.readdirSync(__dirname).filter((name) => /\.(?:js|cjs)$/.test(name)).sort()
      .map((name) => ['--check', path.join(__dirname, name)])
    : [['--test', '--test-reporter=tap', path.join(__dirname,
      `${['red', 'green'].includes(current) ? 'model' : current}.test.cjs`)]];
  const results = argsList.map((args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: root, windowsHide: true, timeout: current === 'browser' ? 210000 : 60000,
      env: process.env, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024
    });
    return {
      command: [process.execPath, ...args], exitCode: result.status, signal: result.signal,
      error: result.error?.message || null, stdout: result.stdout || Buffer.alloc(0),
      stderr: result.stderr || Buffer.alloc(0)
    };
  });
  const stdout = Buffer.concat(results.map((result) => result.stdout));
  const stderr = Buffer.concat(results.map((result) => result.stderr));
  const text = `${stdout.toString('utf8')}\n${stderr.toString('utf8')}`;
  const assertionFailures = (text.match(/code: 'ERR_ASSERTION'/g) || []).length;
  const missingCodeOrToolFailure =
    /MODULE_NOT_FOUND|Cannot find module|SyntaxError:|TypeError:|ENOENT|name: '(?:TypeError|SyntaxError)'/.test(text);
  const failedTests = Number(text.match(/^# fail (\d+)$/m)?.[1] || 0);
  const passed = current === 'red'
    ? results.every((result) => result.exitCode === 1 && !result.error)
      && assertionFailures > 0 && assertionFailures === failedTests && !missingCodeOrToolFailure
    : results.every((result) => result.exitCode === 0 && !result.error);
  if (capture) {
    let stem = current === 'red' ? redStem : current;
    if (current !== 'red') {
      let number = 1;
      while (fs.existsSync(path.join(evidence, `${current}-${number}.json`))) number += 1;
      stem = `${current}-${number}`;
    }
    write(`${stem}.stdout.txt`, stdout);
    write(`${stem}.stderr.txt`, stderr);
    json(`${stem}.json`, {
      cardId: 'A-S018', workerId: 'worker-A-S018', kano: 'S', kanoUnit: 'A-S018', packet: 'SC-S018',
      stage: current, startedAtUtc, finishedAtUtc: new Date().toISOString(),
      node: process.version, captureWasExplicit: true, passed, assertionFailures, failedTests, missingCodeOrToolFailure,
      commands: results.map(({ stdout: ignoredOut, stderr: ignoredErr, ...result }) => result),
      sourceHashes: sourceHashes(),
      raw: {
        stdout: `${stem}.stdout.txt`, stdoutSha256: sha(stdout), stdoutBytes: stdout.length,
        stderr: `${stem}.stderr.txt`, stderrSha256: sha(stderr), stderrBytes: stderr.length
      },
      ...(current === 'red' ? {
        snapshots: Object.fromEntries([`${redStem}-model-snapshot.txt`, `${redStem}-spec-snapshot.txt`, `${redStem}-bdd-snapshot.txt`]
          .map((name) => [name, sha(fs.readFileSync(path.join(evidence, name)))])),
        semantics: 'Loadable no-op model; genuine behavioral ERR_ASSERTION failures, not missing code, tools or syntax.'
      } : {})
    });
    console.log(`Captured ${current}: evidence\\${stem}.json; raw bytes retained.`);
  }
  console.log(`${current}: ${passed ? 'PASS' : 'FAIL'}${current === 'red' ? ' (expected assertion failures)' : ''}`);
  const counts = text.split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|cancelled) /.test(line));
  if (counts.length) console.log(counts.join('\n'));
  if (!passed) {
    console.error(text);
    for (const result of results) if (result.error) console.error(result.error);
    failed = true;
    break;
  }
}
if (!capture) {
  assert.deepEqual(proofHashes(), before, 'Ordinary verification must not modify historical proof');
  console.log('Historical proof byte hashes unchanged (read-only verification).');
}
process.exitCode = failed ? 1 : 0;
