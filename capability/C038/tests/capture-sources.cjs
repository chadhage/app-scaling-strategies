'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const { readRegular, checkImports } = require('..\\..\\C036\\pins.cjs');
const accepted = Object.freeze({
  C015: { commit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f', tag: 'kanban/C015/78341b3370d7' },
  C020: { commit: '2dc471daab3ffa202d83aba2df443e280cad3656', tag: 'kanban/C020/2dc471daab3f' },
  C021: { commit: 'c43069466970696d5433f5282e04e3148433986b', tag: 'kanban/C021/c43069466970' },
  C024: { commit: '1c700208f4615b6b0d459810777df07bd603c678', tag: 'kanban/C024/1c700208f461' },
  C034: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' },
  C036: { commit: 'df7a4e1f4f07d834f17edd8f816bb2b5d166ae6e', tag: 'kanban/C036/df7a4e1f4f07' }
});
const files = [
  ['C036', 'attribution.js'], ['C036', 'current.cjs'], ['C036', 'pins.cjs'],
  ['C036', 'imports.json'], ['C036', 'read-gates.ps1'], ['C036', 'captured.js'],
  ['C020', 'contract.js'], ['C021', 'compatibility.js'], ['C024', 'upload.js'], ['C024', 'manifest.json']
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
checkImports();
const dependencies = files.map(([card, name]) => {
  const relative = path.join('capability', card, name);
  const raw = readRegular(relative);
  const git = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`],
    { cwd: repository, encoding: null, timeout: 15000, maxBuffer: 1048576, windowsHide: true });
  return { card, path: relative, rawSha256: hash(raw),
    crlfToLfSha256: hash(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))),
    acceptedGitSha256: hash(git) };
});
const result = { schemaVersion: 1, accepted, dependencies,
  browserHelperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  policy: 'Unchanged accepted sources. Raw working, normalized LF and actual accepted Git blobs are independently measured. Historical pins are not current publisher, native freshness, inventory or identity authority.' };
if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
  const directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
  if (path.dirname(directory) !== path.join(root, 'evidence', 'raw') ||
      !/^sources-[0-9a-f-]{36}$/.test(path.basename(directory)) || fs.realpathSync(directory) !== directory) throw new Error('Unique recorder-owned source capture required.');
  fs.writeFileSync(path.join(directory, 'sources.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
}
console.log(JSON.stringify(result));
