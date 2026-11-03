'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const HELPER_SHA = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
function git(args, input) {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr.toString());
  return result.stdout;
}
function acceptance(readme, backlog, kanban) {
  const row = (text, id) => {
    const matches = text.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    if (matches.length !== 1) throw new Error(`Expected one exact source row: ${id}`);
    return matches[0];
  };
  const section = (text, start, end) => {
    text = text.replace(/\r\n/g, '\n');
    const first = text.indexOf(start);
    const last = text.indexOf(end, first + start.length);
    if (first < 0 || last < 0) throw new Error(`Missing exact source section: ${start}`);
    return text.slice(first, last).trimEnd();
  };
  const packet = kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packet || !packet.includes('every other A/B card belongs to SC-Snnn')) throw new Error('Missing default packet rule');
  return {
    readmeS092: row(readme, 'S092'),
    backlogDS092: row(backlog, 'D-S092'),
    cardAS092: row(kanban, 'A-S092'),
    siblingBS092: row(kanban, 'B-S092'),
    prerequisiteS003: row(readme, 'S003'),
    prerequisiteDS003: row(backlog, 'D-S003'),
    sourceGate: row(kanban, 'SOURCE'),
    packet,
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    interruptions: section(readme, '### Definition of an interruption', '### Statistical evidence'),
  };
}
function filesBelow(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(full) : [path.relative(root, full)];
  }).sort();
}
module.exports = { root, repo, read, sha, lf, git, acceptance, filesBelow, HELPER_SHA };
