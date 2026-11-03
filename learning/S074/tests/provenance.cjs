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
  const run = spawnSync('git', args, { cwd: repo, input, encoding: null });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return run.stdout;
}
function acceptance(readme, backlog, kanban) {
  function row(text, id) {
    const rows = text.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    if (rows.length !== 1) throw new Error(`Unique exact source row required: ${id}`);
    return rows[0];
  }
  function section(text, begin, end) {
    const start = text.indexOf(begin);
    const stop = text.indexOf(end, start + begin.length);
    if (start < 0 || stop < 0) throw new Error(`Source section required: ${begin}`);
    return text.slice(start, stop).replace(/\r\n/g, '\n').trimEnd();
  }
  const packet = kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packet || !packet.includes('every other A/B card belongs to SC-Snnn')) throw new Error('Packet contract required');
  return {
    readmeS074: row(readme, 'S074'), backlogDS074: row(backlog, 'D-S074'),
    cardAS074: row(kanban, 'A-S074'), siblingBS074: row(kanban, 'B-S074'),
    dependencyS031: row(readme, 'S031'), dependencyDS031: row(backlog, 'D-S031'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packet, outcomePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
module.exports = { root, repo, sha, lf, read, git, acceptance };
