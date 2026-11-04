'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = require('..\\source.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) throw new Error('Exact one-time pin capture only.');
const root = path.resolve(__dirname, '..');
const gates = source.readGates();
const accepted = Object.fromEntries(gates.cards.map((card) => [card.id, card.publication]));
source.checkGates(gates, accepted);
const foreignPath = 'capability\\C048\\evidence\\red\\replay.cjs.txt';
const gitRead = (...args) => execFileSync('git', ['--no-pager', ...args], {
  cwd: source.repository, timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
}).toString('utf8');
const foreign = {
  path: foreignPath, observedAtUtc: new Date().toISOString(),
  stagedChange: gitRead('diff', '--cached', '--name-status', '--', foreignPath),
  entries: gitRead('ls-files', '--stage', '--', foreignPath),
  flags: gitRead('ls-files', '-v', '--', foreignPath),
  debug: gitRead('ls-files', '--debug', '--', foreignPath)
};
assert.match(foreign.stagedChange, /^M\tcapability\/C048\/evidence\/red\/replay\.cjs\.txt\r?\n$/);
assert.match(foreign.entries, /^100644 [0-9a-f]{40} 0\t/);
assert.match(foreign.flags, /^H /);
assert.match(foreign.debug, /flags: 0\r?\n$/);
fs.writeFileSync(path.join(root, 'foreign-index-initial.json'), `${JSON.stringify(foreign, null, 2)}\n`, { flag: 'wx' });
const files = {
  C001: ['approved-contract.js', 'contract-guard.js'],
  C002: ['synthetic-fixture.js', 'run-envelope-contract.js', 'validator.js', 'json-input.js'],
  C015: ['store.cjs', 'contract.cjs', 'consent.cjs', 'consent-current.ps1', 'paths.cjs', 'observed-snapshot.js',
    ...['001', '002', '003'].map((epoch) => `fixtures\\synthetic-restart-v1\\synthetic-run-001\\epoch-${epoch}.json`),
    ...['001', '002'].map((epoch) => `fixtures\\synthetic-restart-v1\\synthetic-run-002\\epoch-${epoch}.json`)],
  C029: ['evaluator.js', 'source.cjs', 'imports.json', 'read-gates.ps1']
};
const dependencies = [];
for (const [card, names] of Object.entries(files)) {
  for (const name of names) {
    const relative = path.join('capability', card, name);
    const raw = source.readRegular(relative);
    const git = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`], {
      cwd: source.repository, timeout: 15000, maxBuffer: 2097152, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    assert.ok(source.hash(raw) === source.hash(git) || source.hash(source.lf(raw)) === source.hash(git),
      'Working bytes must be the exact accepted raw or CRLF-to-LF form.');
    dependencies.push({ card, path: relative, rawSha256: source.hash(raw),
      crlfToLfSha256: source.hash(source.lf(raw)), acceptedGitSha256: source.hash(git) });
  }
}
const pins = {
  schema: 'C035-source-pins/1', accepted, dependencies,
  capturedAtUtc: new Date().toISOString(),
  gateObservation: { ledgerRevision: gates.ledgerRevision, observedAtUtc: gates.observedAtUtc,
    cards: gates.cards, currentLocalConsent: true, readHandlesClosedBeforeRelease: true },
  browserHelperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  historicalSourcePolicy: 'Unchanged accepted C029 source.cjs rechecks its original raw/LF/Git source pins. Historical hashes are not current publisher authority.',
  currentAuthorityPolicy: 'Always read top localPublisherAuthorization under State and close before Publisher; recheck exact actual private bytes under Publisher.'
};
fs.writeFileSync(path.join(root, 'imports.json'), `${JSON.stringify(pins, null, 2)}\n`, { flag: 'wx' });
const dependenciesVerified = source.checkImports();
console.log(JSON.stringify({ direct: dependenciesVerified.direct.length,
  unchangedC029Underlying: dependenciesVerified.unchangedC029Underlying.length,
  accepted: Object.keys(accepted), helperSha256: dependenciesVerified.helperRawSha256 }));
