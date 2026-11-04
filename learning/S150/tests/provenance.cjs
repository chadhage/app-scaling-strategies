'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const SOURCE_COMMIT = 'ebd7433ac143242ab633b52aff864bb2923dac2c';
const HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const SOURCES = [
  { key: 'readme', file: 'README.md', gitPath: 'README.md' },
  { key: 'backlog', file: '.docs\\wiki\\backlog.md', gitPath: '.docs/wiki/backlog.md' },
  { key: 'kanban', file: '.docs\\wiki\\kanban.md', gitPath: '.docs/wiki/kanban.md' },
];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input, encoding: null });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function liveSources() {
  const script = `
    $ErrorActionPreference='Stop'
    $m=[Threading.Mutex]::new($false,'Local\\AppScalingStrategies_KanbanState_v1')
    $held=$false
    try {
      $held=$m.WaitOne([TimeSpan]::FromSeconds(30))
      if(-not $held){throw 'State mutex timeout; no unlocked fallback'}
      $result=[ordered]@{}
      foreach($file in @('README.md','.docs\\wiki\\backlog.md','.docs\\wiki\\kanban.md','.git\\kanban-orchestrator\\inventory.json')){
        $result[$file]=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) $file)))
      }
      $result | ConvertTo-Json -Compress
    } finally {
      if($held){$m.ReleaseMutex()}
      $m.Dispose()
    }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Locked source read failed: ${result.stderr}`);
  const bytes = JSON.parse(result.stdout);
  return Object.fromEntries(Object.entries(bytes).map(([file, base64]) => [file, Buffer.from(base64, 'base64')]));
}
function acceptance(source) {
  const readme = source.readme.toString('utf8').replace(/\r\n/g, '\n');
  const backlog = source.backlog.toString('utf8').replace(/\r\n/g, '\n');
  const kanban = source.kanban.toString('utf8').replace(/\r\n/g, '\n');
  const row = (text, id) => {
    const matches = text.split('\n').filter((line) => line.startsWith(`| ${id} |`));
    if (matches.length !== 1) throw new Error(`Expected one exact source acceptance row for ${id}`);
    return matches[0];
  };
  const section = (text, from, to) => {
    const first = text.indexOf(from);
    const last = text.indexOf(to, first + from.length);
    if (first < 0 || last < 0) throw new Error(`Missing exact source section ${from}`);
    return text.slice(first, last).trimEnd();
  };
  const packet = kanban.split('\n').find((line) => line.startsWith('Packet membership is fixed before admission.'));
  if (!packet) throw new Error('Missing original packet rule');
  return {
    scenario: row(readme, 'S150'), sourceDependency: row(readme, 'S090'),
    parent: row(backlog, 'D-S150'), parentDependency: row(backlog, 'D-S090'),
    priorJourneyDependency: row(backlog, 'D-S007'),
    portableCard: row(kanban, 'A-S150'), nativeCard: row(kanban, 'B-S150'),
    sourceGate: row(kanban, 'SOURCE'), coreGate: row(kanban, 'CORE'),
    dataGate: row(kanban, 'DATA'), hostGate: row(kanban, 'HOST'), packet,
    originalJourney: section(readme, '### Scenario 1: Warm, overlapping blue-green handoff', '### Scenario 2: Progressive cohort or A/B routing'),
    lifecycle: section(readme, '## Lifecycle and safety gates', '## Acceptance and evidence'),
    outcomes: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
    sharedDone: section(backlog, '## Shared definition of done', '## Priorities and dependencies'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
  };
}
function inventoryCards(sources) {
  const inventory = JSON.parse(sources['.git\\kanban-orchestrator\\inventory.json'].toString('utf8'));
  return inventory.cards.filter((card) => ['A-S150', 'B-S150'].includes(card.id));
}
function ownedFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
      else throw new Error('Owned evidence must contain regular files only.');
    }
  };
  walk(root);
  return files.sort();
}
function ownedHashes() {
  return Object.fromEntries(ownedFiles().map((file) => [file, sha(read(file))]));
}
function testedSourceHashes() {
  return Object.fromEntries(ownedFiles()
    .filter((file) => !file.startsWith(`evidence${path.sep}`))
    .map((file) => [file, sha(canonical(read(file)))]));
}
function blobHash(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function gitAttributePath(file) {
  // Git's --path clean-filter argument is a logical Git path, not a Windows filesystem path.
  return path.posix.join('learning', 'S150', file.split(path.sep).join('/'));
}
module.exports = {
  root, repo, SOURCE_COMMIT, HELPER_SHA256, SOURCES, sha, canonical, read,
  git, liveSources, acceptance, inventoryCards, ownedFiles, ownedHashes, testedSourceHashes, blobHash, gitAttributePath,
};
