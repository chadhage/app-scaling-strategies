'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Read-only git failed: ${result.error || result.stderr}`);
  return result.stdout;
}
function acceptance(readme, backlog, kanban) {
  const line = (text, prefix) => {
    const entries = text.replace(/\r\n/g, '\n').split('\n').filter((entry) => entry.startsWith(prefix));
    if (entries.length !== 1) throw new Error(`Expected exactly one authoritative row ${prefix}`);
    return entries[0];
  };
  const section = (text, first, last) => {
    const normalized = text.replace(/\r\n/g, '\n');
    const start = normalized.indexOf(first);
    const end = normalized.indexOf(last, start);
    if (start < 0 || end < 0) throw new Error(`Missing authoritative contract ${first}`);
    return normalized.slice(start, end).trim();
  };
  return {
    source: line(readme, '| S084 |'),
    parent: line(backlog, '| D-S084 |'),
    portable: line(kanban, '| A-S084 |'),
    native: line(kanban, '| B-S084 |'),
    lessonContract: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull'),
    deliveryOrder: line(kanban, 'Implementation order is BDD'),
    packetRule: line(kanban, 'Packet membership is fixed before admission.'),
    parentCompletion: section(kanban, '## Parent completion and traceability', '## Operating checks'),
    evidencePolicy: section(backlog, '## Completion and evidence policy', 'For zero failures'),
  };
}
function inventory(directory = root, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(file, result);
    else result.push(path.relative(root, file));
  }
  return result.sort();
}
const exactRaw = (file) => file.startsWith('evidence\\raw\\')
  || /^evidence\\red\\.*(?:\.snapshot|\.raw\.gz)$/.test(file)
  || /^evidence\\verification\\.*\.raw\.gz$/.test(file)
  || /^evidence\\browser-.*\.png$/.test(file);
module.exports = { root, repo, read, sha, lf, git, acceptance, inventory, exactRaw };
