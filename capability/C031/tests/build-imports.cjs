'use strict';

// Writes imports.json: raw, CRLF-to-LF and accepted-Git-blob SHA-256 of every unchanged accepted file this namespace reads.
// Read-only toward the other namespaces; run once after saved.js is generated. Refuses to overwrite unless --force.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const accepted = {
  C020: { commit: '2dc471daab3ffa202d83aba2df443e280cad3656', tag: 'kanban/C020/2dc471daab3f' },
  C033: { commit: 'dd0870986cfcdd6b5069e5b1da9ff74e9ad3819c', tag: 'kanban/C033/dd0870986cfc' },
  C034: { commit: '01cc2dceb8ea078cd44198765b0feef0ec6ea9e0', tag: 'kanban/C034/01cc2dceb8ea' }
};
const bundle = 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116';
const files = [
  ['C020', 'capability\\C020\\contract.js'], ['C020', 'capability\\C020\\inspector.js'], ['C033', 'capability\\C033\\journey.js'],
  ['C034', 'capability\\C034\\trace.js'], ['C034', 'capability\\C034\\saved.cjs'], ['C034', 'capability\\C034\\pins.cjs'],
  ['C034', 'capability\\C034\\imports.json'],
  ['C034', `capability\\C034\\evidence\\raw\\${bundle}\\bundle.json`], ['C034', `capability\\C034\\evidence\\raw\\${bundle}\\bundle.js`]
];
const target = path.join(root, 'imports.json');
if (fs.existsSync(target) && process.argv[2] !== '--force') throw new Error('imports.json exists; pass --force to rebuild');
const dependencies = files.map(([card, relative]) => {
  const bytes = fs.readFileSync(path.join(repository, relative));
  const blob = execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`],
    { cwd: repository, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return { card, path: relative, rawSha256: hash(bytes), crlfToLfSha256: hash(normalize(bytes)), acceptedGitSha256: hash(blob) };
});
const own = [{ path: 'capability\\C031\\saved.js', rawSha256: hash(fs.readFileSync(path.join(root, 'saved.js'))), generatedBy: 'tests\\build-saved.cjs' }];
const pins = { schema: 'C031-source-pins/1', accepted, acceptedDecoderBundle: bundle, dependencies, own };
fs.writeFileSync(target, `${JSON.stringify(pins, null, 2)}\n`);
console.log(`wrote ${dependencies.length} dependency pins and ${own.length} own pin`);
