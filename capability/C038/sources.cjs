'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const trace = require('..\\C034\\trace.js');
const unchanged = require('..\\C036\\pins.cjs');
const repository = path.resolve(__dirname, '..', '..');
const manifestPath = path.join('capability', 'C038', 'evidence', 'raw',
  'sources-73a9a5e4-91ff-44ea-a019-f1d0099bd5a9', 'sources.json');
const manifestSha256 = 'e1a6042f0bec3eb3abde4676ca77af7ea600b3a6a9a822d2910d4ef0a3e9ee5d';
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function imports() {
  if (arguments.length) fail('NO_SOURCE_PIN_OVERRIDES');
  const bytes = unchanged.readRegular(manifestPath);
  if (unchanged.hash(bytes) !== manifestSha256) fail('SOURCE_MANIFEST_CHANGED');
  return freeze(trace.parseJson(bytes.toString('utf8')));
}
function checkImports() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const pins = imports();
  const input = pins.dependencies.map((entry) => {
    if (!Object.hasOwn(pins.accepted, entry.card) ||
        !entry.path.startsWith(`capability\\${entry.card}\\`)) fail('CLOSED_SOURCE_SCOPE');
    const raw = unchanged.readRegular(entry.path);
    if (unchanged.hash(raw) !== entry.rawSha256 ||
        unchanged.hash(unchanged.normalize(raw)) !== entry.crlfToLfSha256) fail('UNCHANGED_ACCEPTED_RAW_SOURCE_REQUIRED');
    return `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`;
  }).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, encoding: null, timeout: 15000,
    maxBuffer: 2097152, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  for (const entry of pins.dependencies) {
    const end = batch.indexOf(10, offset);
    const match = end >= offset && /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (!match) fail('EXACT_ACCEPTED_GIT_BLOB_REQUIRED');
    const size = Number(match[1]);
    const bytes = batch.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    if (bytes.length !== size || batch[offset - 1] !== 10 || unchanged.hash(bytes) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_SOURCE_CHANGED');
  }
  if (offset !== batch.length) fail('EXACT_ACCEPTED_GIT_BLOB_REQUIRED');
  const underlying = unchanged.checkImports();
  return freeze({ directAcceptedSources: pins.dependencies.length,
    unchangedC036Sources: underlying.direct.length,
    unchangedC034UnderlyingSources: underlying.unchangedC034Underlying.length,
    workingAndGitMeasuredIndependently: true });
}
function readGates() {
  if (arguments.length) fail('NO_AUTHORITY_OVERRIDES');
  const bytes = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'read-gates.ps1')], {
    timeout: 45000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  return freeze(trace.parseJson(bytes.toString('utf8')));
}
function assertGates(snapshot) {
  const expected = imports().accepted;
  const card = snapshot.card;
  if (snapshot.schemaVersion !== 1 || snapshot.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
      snapshot.C001LocalConsent !== true || snapshot.C015FixtureApproval !== true ||
      card?.id !== 'C038' || card.kano !== 'S' || card.kanoUnit !== 'C038' || card.priority !== 'P0' ||
      card.packet !== 'LP-REPLAY' || card.technicalEntryGate !== 'C036' ||
      card.deliver !== 'Inspect instance/dependency readiness and freshness; verify one successful probe does not imply pool readiness.' ||
      !trace.canonical(card.parents) || !trace.canonical(snapshot.ownedPaths) ||
      trace.canonical(card.parents) !== '["H007"]' ||
      trace.canonical(snapshot.ownedPaths) !== '["capability\\\\C038"]' ||
      card.authorization !== 'local-evidence-inspection-and-classification-only' ||
      card.localScope !== 'Bounded usable local original-card evaluator/inspector over unchanged accepted sources. Fictional controls, actual historical observations and real current C015 context remain distinct; no authenticated/current cross-tier linkage, native effects, routing, cancellation or pool readiness is fabricated.' ||
      !Array.isArray(snapshot.prerequisites) || snapshot.prerequisites.length !== 6) fail('CURRENT_ORIGINAL_SCOPE_AND_CONSENT_REQUIRED');
  const seen = new Set();
  for (const entry of snapshot.prerequisites) {
    const pin = expected[entry.id];
    if (!pin || seen.has(entry.id) || entry.state !== 'Done' ||
        entry.publication?.commit !== pin.commit || entry.publication?.tag !== pin.tag ||
        entry.reviewCommit !== pin.commit || entry.reviewTag !== pin.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => entry[key] !== true)) fail('INDEPENDENT_ACCEPTED_SOURCE_GATES_REQUIRED');
    seen.add(entry.id);
  }
  return true;
}
async function assertInputs() {
  if (arguments.length) fail('NO_INPUT_OVERRIDES');
  const sources = checkImports();
  const snapshot = readGates();
  assertGates(snapshot);
  return freeze({ ...sources, currentGateRevision: snapshot.ledgerRevision,
    actualSourceReadOnly: true, publisherAuthorityIsSeparate: true });
}
module.exports = Object.freeze({ imports, checkImports, readGates, assertGates, assertInputs,
  hash: unchanged.hash, readRegular: unchanged.readRegular, manifestPath, manifestSha256 });
