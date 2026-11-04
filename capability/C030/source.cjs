'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const pins = freeze(JSON.parse(fs.readFileSync(path.join(__dirname, 'imports.json'), 'utf8')));
function read(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || !/^capability\\C\d{3}\\/.test(relative) ||
      relative.split('\\').some((part) => !part || ['.', '..'].includes(part)) || /[:/\0]/.test(relative)) fail('CLOSED_SOURCE_SCOPE');
  const target = path.resolve(repository, relative);
  let current = repository;
  for (const piece of path.relative(repository, target).split(path.sep)) {
    current = path.join(current, piece);
    if (fs.lstatSync(current).isSymbolicLink() || fs.realpathSync(current) !== current) fail('LINKED_SOURCE');
  }
  const before = fs.lstatSync(target);
  if (!before.isFile() || before.nlink !== 1 || before.size > 1048576) fail('BOUNDED_SOURCE_FILE');
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev ||
        opened.size !== before.size) fail('SOURCE_CHANGED');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.size !== before.size ||
        fs.realpathSync(target) !== target) fail('SOURCE_CHANGED');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function checkImports() {
  if (arguments.length) fail('NO_PIN_OVERRIDES');
  const working = pins.dependencies.map((entry) => {
    const bytes = read(entry.path);
    if (hash(bytes) !== entry.rawWorkingSha256 || hash(normalize(bytes)) !== entry.crlfToLfSha256) fail('SOURCE_PIN_MISMATCH');
    return bytes;
  });
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    input: pins.dependencies.map((entry) => `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const checked = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const match = end >= offset && /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (!match) fail('ACCEPTED_GIT_BLOB');
    const size = Number(match[1]);
    const bytes = batch.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    if (batch[offset - 1] !== 10 || bytes.length !== size || hash(bytes) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_PIN');
    return { path: entry.path, rawWorkingSha256: hash(working[index]), crlfToLfSha256: hash(normalize(working[index])),
      acceptedGitSha256: hash(bytes), rawWorkingEqualsGitCanonical: working[index].equals(bytes) };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB');
  return freeze(checked);
}
function readGates() {
  if (arguments.length) fail('NO_GATE_OVERRIDES');
  const raw = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'read-gates.ps1')], {
    cwd: repository, windowsHide: true, timeout: 40000, maxBuffer: 32768, stdio: ['ignore', 'pipe', 'pipe']
  });
  const gates = JSON.parse(raw.toString('utf8'));
  if (gates.literalLocalConsent !== true || gates.exactOriginalRow !== true ||
      gates.readHandlesClosedBeforeRelease !== true || gates.mutex !== 'Local\\AppScalingStrategies_KanbanState_v1' ||
      gates.cards.length !== 2) fail('CURRENT_GATE_READ');
  for (const gate of gates.cards) {
    const accepted = pins.accepted[gate.id];
    if (!accepted || gate.state !== 'Done' || gate.publication.commit !== accepted.commit ||
        gate.publication.tag !== accepted.tag || gate.reviewCommit !== accepted.commit || gate.reviewTag !== accepted.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => gate[key] !== true)) fail('INDEPENDENT_DONE_REQUIRED');
  }
  if (new Set(gates.cards.map((gate) => gate.id)).size !== 2) fail('INDEPENDENT_DONE_REQUIRED');
  return freeze(gates);
}
function preflight() {
  if (arguments.length) fail('NO_PREFLIGHT_OVERRIDES');
  const imports = checkImports();
  const gates = readGates();
  const historical = require('..\\C029\\source.cjs').checkHistorical();
  return freeze({
    imports, gates, upstreamHistoricalPinnedFiles: historical.imports.length,
    meaning: 'Node read-only source/gate preflight, not browser disk access or current client/effect association.'
  });
}
module.exports = Object.freeze({ pins, hash, normalize, read, checkImports, readGates, preflight });
