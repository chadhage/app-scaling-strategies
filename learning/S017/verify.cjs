'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const directory = __dirname;
const root = path.resolve(directory, '..', '..');
const evidence = path.join(directory, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function hashes() {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true })
    .filter((name) => fs.statSync(path.join(directory, name)).isFile() && name !== 'result.json')
    .sort().map((name) => [name, sha(fs.readFileSync(path.join(directory, name)))]));
}
const before = hashes();
const requested = process.argv[2] || 'all';
const stages = requested === 'all' ? ['green', 'syntax', 'browser', 'integrity'] : [requested];
assert.match(process.version, /^v22\./, 'Only the approved Node22 test-tooling lane is claimed');
assert.ok(stages.every((name) => ['stub', 'red', 'green', 'syntax', 'browser', 'integrity'].includes(name)));
if (stages.some((name) => ['stub', 'red'].includes(name))) {
  assert.ok(capture, 'Historical development-stage capture must be deliberate');
}
let failed = false;
for (const stage of stages) {
  const startedAtUtc = new Date().toISOString();
  const sourceHashes = Object.fromEntries(fs.readdirSync(directory).sort()
    .filter((name) => fs.statSync(path.join(directory, name)).isFile()
      && !['evidence.json', 'result.json'].includes(name))
    .map((name) => [name, sha(fs.readFileSync(path.join(directory, name)))]));
  const syntaxFiles = stage === 'syntax'
    ? fs.readdirSync(directory).filter((name) => /\.(?:js|cjs)$/.test(name)).sort() : [];
  const commands = stage === 'syntax'
    ? syntaxFiles.map((name) => ['--check', path.join(directory, name)])
    : stage === 'stub'
      ? [['-e', `const a=require('node:assert/strict');const m=require(${JSON.stringify(path.join(directory, 'model.js'))});for(const n of ['initial','reduce','summarize'])a.equal(typeof m[n],'function');const s=m.initial();a.equal(s.phase,'IDLE');a.equal(m.reduce(s,{type:'prepare'}).phase,'IDLE');a.equal(m.summarize(s).verification,'NOT_RUN');console.log('Loadable no-op stub: exports, initial state and invocation verified before RED.');`]]
      : [['--test', '--test-reporter=tap', path.join(directory,
        `${['red', 'green'].includes(stage) ? 'model' : stage}.test.cjs`)]];
  const results = commands.map((args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: root, encoding: 'utf8', windowsHide: true, env: process.env,
      timeout: stage === 'browser' ? 240000 : 60000
    });
    return { command: [process.execPath, ...args], exitCode: result.status,
      signal: result.signal, error: result.error?.message || null,
      stdout: result.stdout || '', stderr: result.stderr || '' };
  });
  const stdout = results.map((entry) => stage === 'syntax'
    ? `${entry.command.join(' ')}\nexit ${entry.exitCode}\n${entry.stdout}` : entry.stdout).join('\n');
  const stderr = results.map((entry) => entry.stderr).join('\n');
  const expectedExitCode = stage === 'red' ? 1 : 0;
  const genuineRed = stage !== 'red' || (/ERR_ASSERTION/.test(stdout)
    && !/MODULE_NOT_FOUND|SyntaxError|TypeError:|ReferenceError:/.test(stdout + stderr));
  const passed = genuineRed && results.every((entry) => entry.exitCode === expectedExitCode && !entry.error);
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped']
    .map((name) => [name, Number(stdout.match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] || 0)]));
  if (capture) {
    fs.mkdirSync(evidence, { recursive: true });
    let number = 1;
    while (fs.existsSync(path.join(evidence, `${stage}-${number}.json`))) number += 1;
    const stem = `${stage}-${number}`;
    const snapshots = {};
    if (['stub', 'red'].includes(stage)) {
      fs.mkdirSync(path.join(evidence, 'red'), { recursive: true });
      for (const name of ['model.js', 'model.test.cjs', 'vertical-replacement.feature']) {
        const relative = path.join('red', `${stem}.${name}.txt`);
        const bytes = fs.readFileSync(path.join(directory, name));
        fs.writeFileSync(path.join(evidence, relative), bytes, { flag: 'wx' });
        snapshots[name] = { path: relative, sha256: sha(bytes) };
      }
    }
    for (const [kind, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
      fs.writeFileSync(path.join(evidence, `${stem}.${kind}.txt`), bytes, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(evidence, `${stem}.json`), `${JSON.stringify({
      cardId: 'A-S017', workerId: 'worker-A-S017', kano: 'S', kanoUnit: 'A-S017',
      packet: 'SC-S017', stage, node: process.version, startedAtUtc,
      finishedAtUtc: new Date().toISOString(), expectedExitCode,
      outcome: passed ? stage === 'red' ? 'EXPECTED_BEHAVIORAL_RED' : 'PASS' : 'FAIL',
      passed, captureWasExplicit: true, sourceHashes, snapshots, syntaxFiles, counts,
      commands: results.map(({ stdout: ignoredOut, stderr: ignoredErr, ...entry }) => entry),
      raw: {
        stdout: { path: `${stem}.stdout.txt`, sha256: sha(stdout) },
        stderr: { path: `${stem}.stderr.txt`, sha256: sha(stderr) }
      }
    }, null, 2)}\n`, { flag: 'wx' });
    console.log(`Captured evidence\\${stem}.json without replacing earlier proof.`);
  }
  console.log(`${stage}: ${passed ? 'PASS' : 'FAIL'}${stage === 'red' ? ' (expected actual assertion exit 1)' : ''}`);
  if (counts.tests) console.log(`# tests ${counts.tests}\n# pass ${counts.pass}\n# fail ${counts.fail}\n# cancelled ${counts.cancelled}\n# skipped ${counts.skipped}`);
  if (!passed) {
    console.error(stdout);
    console.error(stderr);
    for (const result of results) if (result.error) console.error(result.error);
    failed = true;
    break;
  }
}
if (!capture) {
  assert.deepEqual(hashes(), before, 'Ordinary verification must preserve every historical bundle/evidence byte');
  console.log('Historical bundle/evidence byte hashes unchanged (read-only verification).');
}
process.exitCode = failed ? 1 : 0;
