'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function git(args, input) {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function acceptance(readme, backlog, kanban) {
  const row = (text, id) => {
    const found = text.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    if (found.length !== 1) throw new Error(`Expected one exact source row: ${id}`);
    return found[0];
  };
  const section = (text, start, end) => {
    const first = text.indexOf(start);
    const last = text.indexOf(end, first + start.length);
    if (first < 0 || last < 0) throw new Error(`Missing source contract: ${start}`);
    return text.slice(first, last).replace(/\r\n/g, '\n').trimEnd();
  };
  const packet = kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packet || !packet.includes('every other A/B card belongs to SC-Snnn')) throw new Error('Missing packet contract.');
  return {
    readmeS090: row(readme, 'S090'), backlogDS090: row(backlog, 'D-S090'),
    dependencyDS007: row(backlog, 'D-S007'), cardAS090: row(kanban, 'A-S090'),
    siblingBS090: row(kanban, 'B-S090'), packet,
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    lifecycle: section(readme, '## Lifecycle and safety gates', '## Acceptance and evidence'),
    outcomes: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
module.exports = { root, repo, read, sha, canonical, git, acceptance };
