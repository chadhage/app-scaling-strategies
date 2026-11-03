'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
function git(args, input) {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function acceptance(readme, backlog, kanban) {
  function row(text, id) {
    const matches = text.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    if (matches.length !== 1) throw new Error(`Unique source row required: ${id}`);
    return matches[0];
  }
  function section(text, start, end) {
    const begin = text.indexOf(start);
    const stop = text.indexOf(end, begin + start.length);
    if (begin < 0 || stop < 0) throw new Error(`Missing exact source section: ${start}`);
    return text.slice(begin, stop).replace(/\r\n/g, '\n').trimEnd();
  }
  const packet = kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packet || !packet.includes('every other A/B card belongs to SC-Snnn')) throw new Error('Missing packet contract.');
  return {
    readmeS075: row(readme, 'S075'), backlogDS075: row(backlog, 'D-S075'),
    cardAS075: row(kanban, 'A-S075'), siblingBS075: row(kanban, 'B-S075'), packet,
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    outcomePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
module.exports = { root, repo, read, sha, lf, git, acceptance };
