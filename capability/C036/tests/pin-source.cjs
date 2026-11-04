'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, normalize, readRegular } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('One-time explicit own dependency capture requires exact CAPTURE_BROWSER_EVIDENCE=1.');
const accepted = {
  C015: { commit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f', tag: 'kanban/C015/78341b3370d7' },
  C034: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' }
};
const files = {
  C015: ['store.cjs', 'contract.cjs', 'consent.cjs', 'consent-current.ps1', 'paths.cjs',
    'fixtures\\synthetic-restart-v1\\synthetic-run-001\\epoch-001.json',
    'fixtures\\synthetic-restart-v1\\synthetic-run-001\\epoch-002.json',
    'fixtures\\synthetic-restart-v1\\synthetic-run-001\\epoch-003.json'],
  C034: ['historical.cjs', 'trace.js', 'saved.cjs', 'pins.cjs', 'imports.json', 'read-gates.ps1',
    'evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.json',
    'evidence\\raw\\trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\\bundle.js']
};
const dependencies = Object.entries(files).flatMap(([card, names]) => names.map((name) => {
  const relative = path.join('capability', card, name);
  const raw = readRegular(relative);
  const blob = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`], {
    cwd: repository, timeout: 10000, maxBuffer: 262144, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  return { card, path: relative, rawSha256: hash(raw), crlfToLfSha256: hash(normalize(raw)), acceptedGitSha256: hash(blob) };
}));
require('..\\..\\C034\\pins.cjs').checkImports();
const pins = {
  accepted, dependencies,
  browserHelperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  historicalInitialPublisherSha256: 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22',
  policy: 'Unchanged accepted C015 restore and source-pinned C034. Raw, CRLF-to-LF and Git bytes are distinct. Historical pins are not current parent publication or identity/lease authority.'
};
fs.writeFileSync(path.join(root, 'imports.json'), `${JSON.stringify(pins, null, 2)}\n`, { flag: 'wx' });
console.log(`One-time own import capture: ${dependencies.length} direct dependencies; unchanged C034 underlying pins; no dependency writes.`);
