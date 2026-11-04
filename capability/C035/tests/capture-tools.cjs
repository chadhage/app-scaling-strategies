'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = require('..\\source.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) throw new Error('Exact one-time browser-tool pin capture only.');
const gates = JSON.parse(execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, 'read-tools.ps1')], {
  cwd: source.repository, timeout: 45000, maxBuffer: 32768, windowsHide: true
}).toString('utf8'));
const accepted = Object.fromEntries(gates.cards.map((card) => [card.id, card.publication]));
const dependencies = [];
for (const [card, name] of [['C033', 'signed-edge.ps1'], ['C036', 'owned-browser.ps1']]) {
  const file = path.join('capability', card, 'tests', name);
  const raw = source.readRegular(file);
  const git = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${file.replaceAll('\\', '/')}`], {
    cwd: source.repository, timeout: 15000, maxBuffer: 262144, windowsHide: true
  });
  assert.ok(raw.equals(git) || source.lf(raw).equals(git));
  dependencies.push({ card, path: file, rawSha256: source.hash(raw),
    crlfToLfSha256: source.hash(source.lf(raw)), acceptedGitSha256: source.hash(git) });
}
fs.writeFileSync(path.join(__dirname, '..', 'browser-tools.json'), `${JSON.stringify({
  schema: 'C035-read-only-accepted-browser-tools/1', capturedAtUtc: new Date().toISOString(),
  accepted, dependencies, gateObservation: gates,
  helperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  toolAuthority: 'Read-only existing signature and exact caller-owned browser/profile inspection only; no lifecycle or cancellation authority.'
}, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ acceptedBrowserToolsPinned: dependencies.length, sourceWrites: 0 }));
