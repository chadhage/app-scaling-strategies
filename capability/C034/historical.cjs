'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pinsApi = require('./pins.cjs');
const trace = require('./trace.js');
const { restore } = require('..\\C015\\store.cjs');
const { canonical, makeState } = require('..\\C015\\contract.cjs');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function extract(html, id) {
  const matches = [...html.matchAll(new RegExp(`<pre id="${id}"(?: [^>]*)?>([\\s\\S]*?)<\\/pre>`, 'g'))];
  if (matches.length !== 1) fail('EXACT_SAVED_DOM_REQUIRED');
  return trace.parseJson(matches[0][1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
function readHistorical() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const imports = pinsApi.checkImports();
  const report = trace.parseJson(pinsApi.readPinned(pinsApi.historicalPin('report')).toString('utf8'));
  if (report.cardId !== 'C033' || report.outcome !== 'passed' || report.browserVersion !== '156.0.4314.50' ||
      report.playwrightVersion !== '1.56.1' || report.actualSignedEdge.authenticodeStatus !== 'Valid' ||
      report.helperRawSha256 !== pinsApi.pins.browserHelperRawSha256 ||
      !Object.values(report.cleanup).every((value) => value === true)) fail('HISTORICAL_REPORT_SCOPE');
  const observations = ['closed-history', 'held-snapshot'].map((id) => {
    const pin = pinsApi.historicalPin(id);
    const html = pinsApi.readPinned(pin).toString('utf8');
    const snapshot = extract(html, 'state');
    if (trace.canonical(snapshot.events) !== trace.canonical(extract(html, 'events')) ||
        trace.canonical(snapshot.history) !== trace.canonical(extract(html, 'history'))) fail('SAVED_DOM_PANELS_DIFFER');
    const checked = trace.validateSnapshot(snapshot);
    if (!checked.valid) fail(checked.code);
    return { id, pin: { path: pin.path, rawSha256: pin.raw, acceptedGitSha256: pin.git }, snapshot };
  });
  return {
    imports, observations,
    source: {
      kind: 'exact-source-pinned-historical-C033-DOM',
      acceptedC033: pinsApi.pins.accepted.C033,
      report: { path: pinsApi.historicalPin('report').path, rawSha256: pinsApi.historicalPin('report').raw },
      historicalStartedAtUtc: report.startedAtUtc, historicalCompletedAtUtc: report.completedAtUtc,
      historicalBrowserPid: report.actualSignedEdge.actualOwnedBrowserPid,
      historicalBrowserVersion: report.browserVersion, historicalNodeVersion: report.testRuntime,
      helperRawSha256: report.helperRawSha256,
      clock: 'saved C033 performance.now; not this inspection clock',
      missingObservationFields: ['requestToken', 'per-response headers', 'lease/user/run/epoch correlation'],
      newLiveRunAttested: false, authenticatedIdentityAttested: false, migrationAttested: false
    },
    replacementSummary: structuredClone(report.checks[8].observed)
  };
}
function readAcceptedGates() {
  if (arguments.length) fail('NO_GATE_OVERRIDES');
  const result = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'read-gates.ps1')],
  { timeout: 10000, windowsHide: true, maxBuffer: 32768, stdio: ['ignore', 'pipe', 'pipe'] });
  const gates = JSON.parse(result.toString('utf8'));
  if (gates.cards.length !== 3) fail('ACCEPTED_GATES_REQUIRED');
  for (const card of gates.cards) {
    const expected = pinsApi.pins.accepted[card.id];
    if (!expected || card.state !== 'Done' || canonical(card.publication) !== canonical(expected) ||
        card.reviewCommit !== expected.commit || card.reviewTag !== expected.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((field) => card[field] !== true)) {
      fail('EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED');
    }
  }
  return gates;
}
async function readContext() {
  if (arguments.length) fail('NO_CONTEXT_OVERRIDES');
  const gates = readAcceptedGates();
  const startedAtUtc = new Date().toISOString();
  const receipt = await restore('synthetic-restart-v1', 'synthetic-run-001');
  if (receipt.restored !== true || receipt.writesPerformed !== 0 ||
      canonical(receipt.state) !== canonical(makeState(receipt.state.runId, receipt.state.epoch))) fail('ACTUAL_KNOWN_CONTEXT_REQUIRED');
  return {
    association: 'declared-fixture-association-only-not-client-run-correlation',
    readStartedAtUtc: startedAtUtc, readCompletedAtUtc: new Date().toISOString(),
    gatesObserved: gates, receipt
  };
}
async function buildBundle() {
  if (arguments.length) fail('NO_CAPTURE_INPUT_OVERRIDES');
  const historical = readHistorical();
  const context = await readContext();
  return {
    bundleVersion: 1, cardId: 'C034',
    traces: historical.observations.map(({ id, pin, snapshot }) => ({
      traceFormat: 'C034-saved-client-trace/1', id,
      source: { ...historical.source, savedDom: pin },
      context, snapshot, replacementSummary: historical.replacementSummary
    }))
  };
}
module.exports = Object.freeze({ readHistorical, readAcceptedGates, readContext, buildBundle });
