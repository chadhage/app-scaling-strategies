'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..', '..');
const owned = path.resolve(__dirname, '..');
const stage = process.argv[2];
const label = process.argv[3] || stage;
const commands = {
  red: ['--test', 'learning\\S040\\tests\\model.test.cjs'],
  'red-replay': ['--test', 'learning\\S040\\evidence\\red\\replay.cjs'],
  green: ['--test', 'learning\\S040\\tests\\model.test.cjs', 'learning\\S040\\tests\\page.test.cjs'],
  syntax: ['learning\\S040\\tests\\syntax.cjs'],
  browser: ['learning\\S040\\tests\\browser.cjs'],
};
assert.equal(process.env.CAPTURE_TEST_EVIDENCE, '1', 'Deliberate capture requires CAPTURE_TEST_EVIDENCE=1');
assert.ok(Object.hasOwn(commands, stage), 'Choose a named evidence stage');
assert.ok(/^[a-z][a-z0-9-]{0,60}$/.test(label) && (label === stage || label.startsWith(`${stage}-`)), 'Evidence label must remain within its named stage');
const destination = path.join(owned, 'evidence', `${label}.json`);
const readable = path.join(owned, 'evidence', `${label}.txt`);
assert.ok(!fs.existsSync(destination) && !fs.existsSync(readable), 'Historical evidence is never overwritten');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesRecord = (bytes) => ({
  length: bytes.length, sha256: digest(bytes), base64: bytes.toString('base64'),
});
const sourceNames = [
  'README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md',
  'learning\\S040\\cookie-less.feature', 'learning\\S040\\model.js',
  'learning\\S040\\tests\\model.test.cjs', 'learning\\S040\\tests\\capture.cjs',
  ...[
    'index.html', 'app.js', 'styles.css', 'manifest.json',
    'tests\\page.test.cjs', 'tests\\syntax.cjs', 'tests\\browser.cjs', 'tests\\integrity.cjs',
  ].filter((name) => fs.existsSync(path.join(owned, name))).map((name) => `learning\\S040\\${name}`),
];
const sources = Object.fromEntries(sourceNames.map((name) => [name, digest(fs.readFileSync(path.join(root, name)))]));
if (stage === 'red') {
  fs.writeFileSync(path.join(owned, 'evidence', 'red', 'model.stub.snapshot'), fs.readFileSync(path.join(owned, 'model.js')), { flag: 'wx' });
  fs.writeFileSync(path.join(owned, 'evidence', 'red', 'assertion.source.snapshot'), fs.readFileSync(path.join(__dirname, 'model.test.cjs')), { flag: 'wx' });
  const sourceProof = {
    cardId: 'A-S040', parentId: 'D-S040', packet: 'SC-S040', kano: 'S', kanoUnit: 'A-S040',
    gate: 'SOURCE', owner: 'worker-A-S040', readBeforeBehaviorDesign: true,
    sourceRows: {
      readme: '| S040 | **Cookie-less clients:** Preserve mobile and API-client continuity without assuming browser slot-routing cookies exist. |',
      backlog: '| D-S040 | P1 | Add authenticated cookie-less API/mobile drivers controlled from the web console. | Actual API clients move correctly without browser affinity assumptions; identity, state, and budgets are preserved. | none |',
      card: '| A-S040 | D-S040 | S | Remove browser cookies from an API-client trace; choose identity/routing rules that still work. | SOURCE |',
      portable: 'An A card delivers a standalone, browser-openable lesson bundle with a small interactive exercise: choose an action or condition, inspect a synthetic trace, and check the expected outcome.',
    },
    packetContract: 'SC-S040 groups this source strategy; A-S040 is one independent S lesson. B-S040 and the original source-parent gates remain unfulfilled. No delighter or separate test/plumbing credit.',
    references: sources,
    sequence: ['Exact sources and registered card read', 'BDD feature', 'Loadable stub', 'Behavioral assertion RED'],
  };
  for (const [key, row] of Object.entries(sourceProof.sourceRows)) {
    const file = key === 'readme' ? 'README.md' : key === 'backlog' ? '.docs\\wiki\\backlog.md' : '.docs\\wiki\\kanban.md';
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes(row), `Exact ${key} source must match`);
  }
  fs.writeFileSync(path.join(owned, 'evidence', 'source-contract.json'), `${JSON.stringify(sourceProof, null, 2)}\n`, { flag: 'wx' });
}
const startedAt = new Date().toISOString();
const run = spawnSync(process.execPath, commands[stage], {
  cwd: root, env: process.env, encoding: null, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
if (run.error) throw run.error;
const expectedExit = stage.startsWith('red') ? 1 : 0;
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
if (stage.startsWith('red')) {
  assert.match(stdout.toString(), /ERR_ASSERTION/);
  assert.match(stdout.toString(), /unknown/);
  assert.match(stdout.toString(), /success/);
  assert.doesNotMatch(`${stdout}${stderr}`, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
}
const proof = {
  cardId: 'A-S040', mode: 'synthetic', stage, startedAt, finishedAt: new Date().toISOString(),
  command: [process.execPath, ...commands[stage]], cwd: root, nodeVersion: process.version,
  exitCode: run.status, expectedExitCode: expectedExit, signal: run.signal,
  sources, stdout: bytesRecord(stdout), stderr: bytesRecord(stderr),
};
fs.writeFileSync(destination, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
const display = `${stdout.toString()}${stderr.toString()}`.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n');
fs.writeFileSync(readable, display, { flag: 'wx' });
if (stage === 'browser') {
  const observation = JSON.parse(stdout.toString());
  console.log(`Browser ${label}: ${observation.checks.length} checks, passed=${observation.passed}, sessionClosed=${observation.sessionClosed}`);
  if (observation.failure) console.error(observation.failure.message);
} else if (stage === 'green') {
  console.log(display.split('\n').filter((line) => /^# (tests|pass|fail|skipped|duration_ms) /.test(line)).join('\n'));
} else {
  process.stdout.write(display);
}
assert.equal(run.status, expectedExit, `Unexpected ${stage} status; raw result preserved`);
console.log(`Captured ${stage}: exit ${run.status}, raw streams retained without normalization.`);
