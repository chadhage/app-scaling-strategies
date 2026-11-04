'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
assert.equal(process.argv.length, 2);
const accepted = {
  C020: { commit: '2dc471daab3ffa202d83aba2df443e280cad3656', tag: 'kanban/C020/2dc471daab3f' },
  C023: { commit: '68be1c61cd83f177b45cbef4f4577c80c57d690e', tag: 'kanban/C023/68be1c61cd83' },
  C033: { commit: 'dd0870986cfcdd6b5069e5b1da9ff74e9ad3819c', tag: 'kanban/C033/dd0870986cfc' },
  C034: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' }
};
const gates = JSON.parse(execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(root, 'read-gates.ps1')], { timeout: 40000, maxBuffer: 32768, windowsHide: true }));
for (const card of gates.cards) {
  assert.equal(card.state, 'Done');
  assert.deepEqual(card.publication, accepted[card.id]);
  assert.equal(card.reviewCommit, accepted[card.id].commit);
  assert.equal(card.reviewTag, accepted[card.id].tag);
  for (const field of ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified']) assert.equal(card[field], true);
}
const capture = 'browser-0a54fabc-0ef0-4632-9241-95a196bc4461';
const bundle = 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116';
const entries = [
  ['C020', 'profiles.cjs'], ['C020', 'contract.js'], ['C020', 'inspector.js'],
  ['C023', 'ledger.js'],
  ...['journey.js', 'page.js', 'server.cjs', 'tests\\browser.cjs', 'tests\\signed-edge.ps1']
    .map((name) => ['C033', name]),
  ...['summary.json', 'before-first-read.html', 'between-reads.html', 'budget-miss.html',
    'failed-reply.html', 'stop-unknown.html', 'reset-history.html']
    .map((name) => ['C033', path.join('evidence', 'raw', capture, name)]),
  ...['trace.js', 'saved.cjs', 'pins.cjs', 'imports.json',
    path.join('evidence', 'raw', bundle, 'bundle.json'),
    path.join('evidence', 'raw', bundle, 'bundle.js')].map((name) => ['C034', name])
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dependencies = entries.map(([card, name]) => {
  const relative = path.join('capability', card, name);
  const target = path.join(repository, relative);
  assert.equal(fs.realpathSync(target), target);
  const stat = fs.lstatSync(target);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.nlink, 1);
  assert.ok(stat.size < 1048576);
  const raw = fs.readFileSync(target);
  const git = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`],
    { cwd: repository, timeout: 10000, maxBuffer: 1048576, windowsHide: true });
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
  assert.ok(raw.equals(git) || lf.equals(git), `Unchanged accepted source required: ${relative}`);
  return { card, path: relative, rawSha256: hash(raw), crlfToLfSha256: hash(lf), acceptedGitSha256: hash(git) };
});
const result = {
  schema: 'C029-source-pins/1', accepted, capturedAtUtc: new Date().toISOString(),
  gateObservation: gates,
  historicalCapture: capture, acceptedDecoderBundle: bundle,
  browserHelperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  dependencies,
  policy: 'Immutable historical source proof only; separate raw/CRLF-to-LF/Git baselines. No live publisher, approval, client mutation or reliability authority.'
};
fs.writeFileSync(path.join(root, 'imports.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(`Pinned ${dependencies.length} unchanged accepted source files; no copied or recaptured C033 trace.`);
