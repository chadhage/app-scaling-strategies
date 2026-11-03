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

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: null, maxBuffer: 4 * 1024 * 1024 });
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
    if (first < 0 || last < 0) throw new Error(`Missing source section: ${start}`);
    return text.slice(first, last).trimEnd();
  };
  const packetRule = kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packetRule) throw new Error('Missing fixed packet rule');
  return {
    source: row(readme, 'S098'),
    backlog: row(backlog, 'D-S098'),
    card: row(kanban, 'A-S098'),
    sibling: row(kanban, 'B-S098'),
    prerequisite: row(backlog, 'D-S060'),
    sourceGate: row(kanban, 'SOURCE'),
    packet: row(kanban, 'LP-COMPARE'),
    packetRule,
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
  };
}

function filesBelow(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(full) : [path.relative(root, full)];
  }).sort();
}

function rawProtected(relative) {
  return relative.startsWith('evidence\\raw\\') || relative.startsWith('evidence\\red\\');
}

module.exports = { root, repo, read, sha, lf, git, acceptance, filesBelow, rawProtected, HELPER_SHA };
