'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const proof = require('./tests/proof.cjs');

if (process.versions.node.split('.')[0] !== '22') throw new Error('Use the approved Node.js 22 test-tooling runtime.');
const lane = process.argv[2] || 'all';
const relative = (name) => path.relative(proof.repo, path.join(__dirname, name));
const runTest = (label, file, expected = 0) => proof.command(label, [
  '--test', '--test-reporter=tap', relative(file),
], expected);

function captureSource() {
  if (!proof.capture) throw new Error('Source capture is deliberate: set CAPTURE_BROWSER_EVIDENCE=1.');
  const read = (file) => fs.readFileSync(path.join(proof.repo, file), 'utf8');
  const source = read('README.md');
  const backlog = read(path.join('.docs', 'wiki', 'backlog.md'));
  const kanban = read(path.join('.docs', 'wiki', 'kanban.md'));
  const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
  const head = spawnSync('git', ['--no-pager', 'rev-parse', 'HEAD'], { cwd: proof.repo, encoding: 'utf8' });
  if (head.status !== 0) throw new Error(head.stderr);
  const name = proof.writeRecord('source-contract', {
    schemaVersion: 1, cardId: 'A-S028', workerId: 'worker-A-S028', recordedAtUtc: new Date().toISOString(),
    sourceReadBeforeBehaviorDesign: true, sourceReadTranscript: 'Worker read exact README S028, D-S028, A-S028 and portable/atomic/packet rules before writing BDD.',
    sourceHead: head.stdout.trim(), source: row(source, 'S028'), parent: row(backlog, 'D-S028'),
    card: row(kanban, 'A-S028'), nativeSibling: row(kanban, 'B-S028'),
    atomicAndPortableContract: kanban.split('## Atomic card contract')[1].split('## Concurrent pull')[0].trim(),
    packetPolicy: kanban.split('Packet membership is fixed before admission.')[1].split('## Parent completion')[0].trim(),
    packet: 'SC-S028', kano: 'S', kanoUnit: 'A-S028', authorizedScope: 'learning\\S028\\**',
    sourceFileSha256: {
      'README.md': proof.hash(Buffer.from(source)),
      '.docs\\wiki\\backlog.md': proof.hash(Buffer.from(backlog)),
      '.docs\\wiki\\kanban.md': proof.hash(Buffer.from(kanban)),
    },
    approvals: 'Local synthetic lesson only; no cloud, IaC, scaffold, identity, deployment, expenditure, package or shared-root changes.',
  });
  console.log(`Captured ${name}`);
}

function red() {
  if (proof.capture) {
    fs.mkdirSync(proof.evidence, { recursive: true });
    for (const [source, target] of [
      ['warm-up-timeout.feature', 'red-feature.snapshot.txt'],
      ['warmup.js', 'red-warmup.js.snapshot.txt'],
      [path.join('tests', 'model.test.cjs'), 'red-model.test.cjs.snapshot.txt'],
    ]) fs.copyFileSync(path.join(__dirname, source), path.join(proof.evidence, target), fs.constants.COPYFILE_EXCL);
  }
  runTest('red', path.join('tests', 'model.test.cjs'), 1);
}

try {
  if (lane === 'source') captureSource();
  else if (lane === 'red') red();
  else {
    const lanes = {
      green: () => runTest('green', path.join('tests', 'model.test.cjs')),
      syntax: () => runTest('syntax', path.join('tests', 'syntax.test.cjs')),
      browser: () => runTest('browser', path.join('tests', 'browser.test.cjs')),
      integrity: () => runTest('integrity', path.join('tests', 'integrity.test.cjs')),
    };
    if (lane === 'all') for (const run of Object.values(lanes)) run();
    else if (lanes[lane]) lanes[lane]();
    else throw new Error(`Unknown lane: ${lane}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
