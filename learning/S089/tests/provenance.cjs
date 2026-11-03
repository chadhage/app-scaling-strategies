'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const git = (args, input) => execFileSync('git', args, {
  cwd: repo, input, windowsHide: true, maxBuffer: 12 * 1024 * 1024,
});
const gitPath = (file) => file.replace(/\\/g, '/');
const helperPath = 'testing\\browser\\isolated.cjs';
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const behaviorFiles = [
  'outage.feature', 'fixtures.js', 'model.js', 'app.js', 'index.html', 'styles.css',
  'manifest.json', 'tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\browser.test.cjs',
];
const testedHashes = () => Object.fromEntries(behaviorFiles
  .filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => [file, sha(lf(read(file)))]));

function oneRow(text, prefix) {
  const rows = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.startsWith(prefix));
  if (rows.length !== 1) throw new Error(`Expected exactly one source row: ${prefix}`);
  return rows[0];
}

function acceptance(readme, backlog, kanban) {
  const source = kanban.replace(/\r\n/g, '\n');
  const start = source.indexOf('## Atomic card contract\n');
  const end = source.indexOf('## Concurrent pull and one-piece flow\n', start);
  if (start < 0 || end < 0) throw new Error('Atomic/portable contract is absent');
  return {
    scenario: oneRow(readme, '| S089 |'),
    parent: oneRow(backlog, '| D-S089 |'),
    lesson: oneRow(kanban, '| A-S089 |'),
    nativeSibling: oneRow(kanban, '| B-S089 |'),
    atomicAndPortableContract: source.slice(start, end).trimEnd(),
    packetRule: oneRow(kanban, 'Packet membership is fixed before admission.'),
  };
}

function ownedFiles() {
  const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(file) : [path.relative(root, file)];
    });
  return visit(root).sort();
}

function tree() {
  const files = ownedFiles().map((file) => [file, sha(read(file))]);
  return { files: files.length, sha256: sha(Buffer.from(JSON.stringify(files))) };
}

module.exports = {
  fs, path, root, repo, read, sha, lf, git, gitPath, acceptance, helperPath,
  helperSha256, behaviorFiles, testedHashes, ownedFiles, tree,
};
