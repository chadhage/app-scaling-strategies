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
  cwd: repo, input, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
});
const row = (text, prefix) => {
  const rows = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.startsWith(prefix));
  if (rows.length !== 1) throw new Error(`Expected exactly one source row: ${prefix}`);
  return rows[0];
};
function acceptance(readme, backlog, kanban) {
  const normalized = kanban.replace(/\r\n/g, '\n');
  const start = normalized.indexOf('## Atomic card contract\n');
  const end = normalized.indexOf('## Concurrent pull and one-piece flow\n', start);
  if (start < 0 || end < 0) throw new Error('Atomic and portable source contract missing');
  return {
    scenario: row(readme, '| S085 |'),
    parent: row(backlog, '| D-S085 |'),
    lesson: row(kanban, '| A-S085 |'),
    nativeSibling: row(kanban, '| B-S085 |'),
    atomicAndPortableContract: normalized.slice(start, end).trimEnd(),
  };
}
const helperPath = 'testing\\browser\\isolated.cjs';
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const testedFiles = ['model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'promotion.feature'];
const testedHashes = () => Object.fromEntries(testedFiles.map((file) => [file, sha(lf(read(file)))]));
module.exports = { fs, path, root, repo, read, sha, lf, git, acceptance, helperPath, helperSha256, testedFiles, testedHashes };
