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
function readRegular(relative, maximum = 262144) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[:\0]/.test(relative)) fail('OWNED_SOURCE_PATH_REQUIRED');
  const file = path.resolve(repository, relative);
  if (!file.startsWith(`${repository}${path.sep}`)) fail('SOURCE_PATH_SCOPE');
  let current = repository;
  for (const piece of path.relative(repository, file).split(path.sep)) {
    current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) fail('UNSAFE_SOURCE_PATH');
  }
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > maximum) fail('UNSAFE_SOURCE_FILE');
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
  return freeze(JSON.parse(readRegular(path.join('capability', 'C036', 'imports.json')).toString('utf8')));
}
function checkImports() {
  if (arguments.length) fail('NO_SOURCE_PIN_OVERRIDES');
  const pins = imports();
  const raws = pins.dependencies.map((entry) => {
    if (!['C015', 'C034'].includes(entry.card) ||
        !entry.path.startsWith(`capability\\${entry.card}\\`)) fail('CLOSED_IMPORT_SCOPE');
    const bytes = readRegular(entry.path);
    if (hash(bytes) !== entry.rawSha256 || hash(normalize(bytes)) !== entry.crlfToLfSha256) fail('DEPENDENCY_RAW_OR_LF_MISMATCH');
    return bytes;
  });
  const input = pins.dependencies.map((entry) =>
    `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, timeout: 15000, maxBuffer: 2097152, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const checked = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (end < offset || !match) fail('ACCEPTED_GIT_BLOB_REQUIRED');
    const length = Number(match[1]);
    const blob = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (blob.length !== length || batch[offset - 1] !== 10 || hash(blob) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_BLOB_MISMATCH');
    return { path: entry.path, rawSha256: hash(raws[index]), acceptedGitSha256: hash(blob), crlfToLfSha256: hash(normalize(raws[index])) };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB_REQUIRED');
  const underlying = require('..\\C034\\pins.cjs').checkImports();
  return freeze({ direct: checked, unchangedC034Underlying: underlying });
}
function readGates() {
  if (arguments.length) fail('NO_GATE_OVERRIDES');
  const result = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'read-gates.ps1')], {
    timeout: 40000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const gates = JSON.parse(result.toString('utf8'));
  const expected = imports().accepted;
  if (gates.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
      gates.C001LocalConsent !== true || gates.C015FixtureApproval !== true ||
      !Array.isArray(gates.cards) || gates.cards.length !== 2) fail('CURRENT_LOCAL_CONSENT_AND_ACCEPTANCE_REQUIRED');
  const seen = new Set();
  for (const card of gates.cards) {
    const pin = expected[card.id];
    if (!pin || seen.has(card.id) || card.state !== 'Done' ||
        card.publication.commit !== pin.commit || card.publication.tag !== pin.tag ||
        card.reviewCommit !== pin.commit || card.reviewTag !== pin.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => card[key] !== true)) {
      fail('INDEPENDENT_C015_C034_DONE_REQUIRED');
    }
    seen.add(card.id);
  }
  return freeze(gates);
}
function publisherAuthorized(actualSha256, gates) {
  const approval = gates?.currentParentPublisherAuthorization;
  const revision = approval?.budgetAndGoalRevision;
  return Boolean(gates?.controllerId === '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' &&
    typeof actualSha256 === 'string' && /^[0-9a-f]{64}$/.test(actualSha256) &&
    approval?.approvedBy === 'parent-controller' && approval.publisherSha256 === actualSha256 &&
    approval.exactAddedClasses?.C036 === 'D' && approval.mainMustEqualRemoteBeforeStaging === true &&
    approval.namespaceAndFrozenClassGuardsUnchanged === true && approval.cloudAuthorityExpanded === false &&
    Number.isSafeInteger(approval.focusedGuardChecksPassed) && approval.focusedGuardChecksPassed >= 41 &&
    approval.correlationGuardRevision?.approvedBy === 'parent-controller' &&
    approval.correlationGuardRevision.exactAddedClasses?.C036 === 'D' &&
    approval.correlationGuardRevision.namespaceFrozenClassAdminHeadWhitespaceAndCloudPermissionsUnchanged === true &&
    (!revision || (revision.approvedBy === 'parent-controller' &&
      revision.publisherSha256 === actualSha256 && revision.exactAddedClasses?.C029 === 'D' &&
      revision.exactAddedClasses?.X003 === 'L' && revision.onlyTwoExactClassTokensChanged === true &&
      revision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained === true &&
      revision.cloudIdentityOrInfrastructureAuthorityExpanded === false &&
      revision.focusedGuardChecksPassed === 51 && revision.extraCredits === 0 &&
      approval.focusedGuardChecksPassed >= 51)));
}
function checkPublisher() {
  if (arguments.length) fail('NO_PUBLISHER_OVERRIDES');
  const gates = readGates();
  const file = path.join('.git', 'kanban-orchestrator', 'publish.ps1');
  const actualSha256 = hash(readRegular(file));
  if (!publisherAuthorized(actualSha256, gates)) fail('CURRENT_PARENT_PUBLISHER_AUTHORIZATION_REQUIRED');
  const revision = gates.currentParentPublisherAuthorization.budgetAndGoalRevision;
  if (revision) {
    const stripped = readRegular(file).toString('utf8').replace("; C029='D'", '').replace("; X003='L'", '');
    if (hash(Buffer.from(stripped, 'utf8')) !== revision.previousPublisherSha256) fail('ONLY_PARENT_AUTHORIZED_CLASS_TOKEN_CHANGE_REQUIRED');
  }
  return freeze({
    actualSha256, currentAuthorizationSource: '.docs\\wiki\\flow-state.json.localPublisherAuthorization',
    currentParentAuthorization: gates.currentParentPublisherAuthorization,
    controllerId: gates.controllerId, ledgerRevision: gates.ledgerRevision,
    observedAtUtc: gates.observedAtUtc, readerPid: gates.readerPid,
    historicalInitialSha256: imports().historicalInitialPublisherSha256,
    historicalDigestIsNotCurrentAuthority: true
  });
}
module.exports = Object.freeze({ hash, normalize, imports, readRegular, checkImports, readGates, checkPublisher, publisherAuthorized });
