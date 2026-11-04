'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, normalize, readRegular } = require('..\\pins.cjs');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Explicit capture only.');
const repository = path.resolve(__dirname, '..', '..', '..');
const root = path.resolve(__dirname, '..');
const raw = path.join(root, 'evidence', 'raw');
const directory = path.resolve(process.env.C037_CAPTURE_DIR || '');
if (path.dirname(directory) !== raw || !/^pins-[0-9a-f-]{36}$/.test(path.basename(directory)) ||
    fs.readdirSync(directory).length !== 0 || fs.realpathSync(directory) !== directory) throw new Error('New exact own pin capture required.');
const accepted = {
  C036: { commit: 'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e', tag: 'kanban/C036/df7a4e1f4f07' },
  C034: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' },
  C033: { commit: 'dd0870986cfcdd6b5069e5b1da9ff74e9ad3819c', tag: 'kanban/C033/dd0870986cfc' },
  C020: { commit: '2dc471daab3ffa202d83aba2df443e280cad3656', tag: 'kanban/C020/2dc471daab3f' },
  C015: { commit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f', tag: 'kanban/C015/78341b3370d7' }
};
const files = {
  C036: ['attribution.js', 'current.cjs', 'pins.cjs', 'imports.json', 'read-gates.ps1', 'captured.js', 'tests\\owned-browser.ps1'],
  C034: ['trace.js', 'saved.cjs', 'historical.cjs', 'pins.cjs', 'imports.json',
    'evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.json',
    'evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.js'],
  C033: ['journey.js', 'tests\\signed-edge.ps1'],
  C020: ['contract.js', 'inspector.js', 'profiles.cjs', 'server.cjs'],
  C015: ['store.cjs', 'contract.cjs']
};
const dependencies = [];
for (const [card, paths] of Object.entries(files)) for (const relative of paths) {
  const file = path.join('capability', card, relative);
  const rawBytes = readRegular(file);
  const blob = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${file.replaceAll('\\', '/')}`],
    { cwd: repository, encoding: null, timeout: 10000, maxBuffer: 1048576, windowsHide: true });
  dependencies.push({ card, path: file, commit: accepted[card].commit, rawSha256: hash(rawBytes),
    crlfToLfSha256: hash(normalize(rawBytes)), acceptedGitSha256: hash(blob), rawEqualsGit: rawBytes.equals(blob) });
}
const helperPath = path.join('testing', 'browser', 'isolated.cjs');
const helper = readRegular(helperPath);
const helperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
if (hash(helper) !== helperSha) throw new Error('Unchanged approved browser helper required.');
const helperCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
const helperBlob = execFileSync('git', ['show', `${helperCommit}:${helperPath.replaceAll('\\', '/')}`], { cwd: repository, encoding: null });
dependencies.push({ card: 'approved-offline-helper', path: helperPath, commit: helperCommit,
  rawSha256: hash(helper), crlfToLfSha256: hash(normalize(helper)), acceptedGitSha256: hash(helperBlob), rawEqualsGit: helper.equals(helperBlob) });
const value = {
  schemaVersion: 1, cardId: 'C037', accepted, browserHelperRawSha256: helperSha,
  sourcePolicy: 'Unchanged accepted sources; disk raw and Git-canonical bytes are separately pinned, never substituted.',
  historicalPublisherSha256: '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea',
  initialApprovedPublisherSha256: '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811',
  dependencies
};
fs.writeFileSync(path.join(root, 'imports.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'pin-capture.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
console.log(`Pinned ${dependencies.length} direct sources, separately preserving ${dependencies.filter((entry) => !entry.rawEqualsGit).length} raw/Git differences.`);
