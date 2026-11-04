'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function readRegular(relative, maximum = 2097152) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[:\0]/.test(relative)) fail('CLOSED_SOURCE_PATH_REQUIRED');
  const file = path.resolve(repository, relative);
  if (!file.startsWith(`${repository}${path.sep}`)) fail('SOURCE_PATH_SCOPE');
  let current = repository;
  for (const piece of path.relative(repository, file).split(path.sep)) {
    current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) fail('SOURCE_LINK_FORBIDDEN');
  }
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > maximum) fail('BOUNDED_REGULAR_SOURCE_REQUIRED');
  const fd = fs.openSync(file, fs.constants.O_RDONLY);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev) fail('SOURCE_CHANGED');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('SOURCE_CHANGED');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function imports() {
  return JSON.parse(readRegular(path.join('capability', 'C035', 'imports.json')).toString('utf8'));
}
function readGates() {
  if (arguments.length) fail('NO_GATE_OR_AUTHORITY_OVERRIDES');
  return JSON.parse(execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'read-gates.ps1')], {
    cwd: repository, timeout: 45000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  }).toString('utf8'));
}
function checkGates(gates, expected = imports().accepted) {
  if (gates.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
      gates.stateMutex !== 'Local\\AppScalingStrategies_KanbanState_v1' ||
      gates.readHandlesClosedBeforeRelease !== true || gates.C001LocalConsent !== true ||
      gates.C015FixtureApproval !== true || gates.exactOriginalKanbanRowPresent !== true ||
      !Array.isArray(gates.cards) || gates.cards.length !== 4) fail('CURRENT_LITERAL_CONSENT_AND_DONE_GATES_REQUIRED');
  const seen = new Set();
  for (const card of gates.cards) {
    const pin = expected[card.id];
    if (!pin || seen.has(card.id) || card.state !== 'Done' || card.publication?.commit !== pin.commit ||
        card.publication?.tag !== pin.tag || card.reviewCommit !== pin.commit || card.reviewTag !== pin.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => card[key] !== true)) {
      fail('INDEPENDENT_ACCEPTED_SOURCE_REQUIRED');
    }
    seen.add(card.id);
  }
  return { independentAcceptedIds: [...seen], literalConsent: true, readHandlesClosedBeforeRelease: true };
}
function checkImports() {
  if (arguments.length) fail('NO_DEPENDENCY_OVERRIDES');
  const pins = imports();
  const raw = pins.dependencies.map((entry) => {
    if (!['C001', 'C002', 'C015', 'C029'].includes(entry.card) ||
        !entry.path.startsWith(`capability\\${entry.card}\\`)) fail('CLOSED_DEPENDENCY_SCOPE');
    const bytes = readRegular(entry.path);
    if (hash(bytes) !== entry.rawSha256 || hash(lf(bytes)) !== entry.crlfToLfSha256) fail('DEPENDENCY_RAW_OR_LF_MISMATCH');
    return bytes;
  });
  const input = pins.dependencies.map((entry) =>
    `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, timeout: 15000, maxBuffer: 4194304,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const direct = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (!match || end < offset) fail('ACCEPTED_GIT_BLOB_REQUIRED');
    const length = Number(match[1]);
    const blob = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (blob.length !== length || batch[offset - 1] !== 10 || hash(blob) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_PIN_MISMATCH');
    return { path: entry.path, rawSha256: hash(raw[index]), crlfToLfSha256: hash(lf(raw[index])), acceptedGitSha256: hash(blob) };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB_REQUIRED');
  const unchangedC029 = require('..\\C029\\source.cjs');
  const underlying = unchangedC029.checkHistorical();
  unchangedC029.readGates();
  const helper = readRegular(path.join('testing', 'browser', 'isolated.cjs'));
  if (hash(helper) !== pins.browserHelperRawSha256) fail('APPROVED_HELPER_MISMATCH');
  return { direct, unchangedC029Underlying: underlying.imports, helperRawSha256: hash(helper) };
}
module.exports = Object.freeze({ repository, hash, lf, readRegular, imports, readGates, checkGates, checkImports });
