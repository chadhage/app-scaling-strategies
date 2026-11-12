'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs'), { inventory, sha } = require('./ast.cjs');
const metadata = process.env.C047_METADATA, output = process.env.C047_CAPTURE_DIR;
assert.ok(metadata && output, 'EXPLICIT_OWN_CLOSURE_METADATA_AND_CAPTURE');
const captureRoot = path.join(metadata, 'captures');
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(captureRoot, ...parts)));
const file = (...parts) => path.join(captureRoot, ...parts);
const source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8'), current = inventory(source), captured = read('mutations-03', 'inventory.json');
for (const label of ['mutations-03', 'scoped-01', 'scoped-local-01', 'scoped-local-02', 'scoped-local-03', 'resources-01', 'browser-01']) {
  const result = read(label, 'result.json');
  assert.equal(result.exitCode, 0, 'ACTUAL_QUALIFYING_CAPTURE_MUST_PASS:' + label);
  assert.equal(result.infrastructureFailure, null, 'NO_INFRASTRUCTURE_FAILURE_AS_QUALIFYING_PROOF:' + label);
  const input = read(label, 'inputs.json').sources.find(row => row.path === 'server.cjs');
  assert.equal(input.sha256, current.sourceSha256, 'EVERY_QUALIFYING_PHASE_EXECUTED_THE_CURRENT_FINAL_PRODUCTION_BYTES:' + label);
}
assert.deepEqual(JSON.parse(JSON.stringify(current)), captured, 'INDEPENDENT_RECOMPUTED_COMPLETE_AST_JSON_DOMAIN_AND_EXACT_VARIANTS');
const campaign = read('mutations-03', 'campaign.json'), real = read('mutations-03', 'controls.json');
assert.equal(campaign.actualExecuted, current.counts.eligibleChangedCompiled, 'EVERY_ELIGIBLE_CHANGED_COMPILED_POSITION_ACTUALLY_EXECUTED');
assert.deepEqual(campaign.unexecuted, [], 'NO_UNEXECUTED_POSITION_EXEMPTION');
assert.equal(real.pristine.status, 'SURVIVED_UNCLOSED', 'ACTUAL_PRISTINE_CONTROL_PASSES');
assert.equal(real.runtimeFault.status, 'NON_KILL_RUNTIME_OR_MODULE_FAULT', 'RUNTIME_FAULT_NEGATIVE_CONTROL_IS_NON_KILL');
assert.ok(real.runtimeFault.newRuntimeExceptions.length, 'ACTUAL_INDEPENDENT_CAUGHT_EXCEPTION_OBSERVER_CONTROL');
assert.equal(real.originalPrivateRed.status, 'KILLED_NAMED_SPECIFIED_ASSERTION', 'ACTUAL_ORIGINAL_BEHAVIORAL_RED_CONTROL');
const selected = verifySelection(), sourceInputs = JSON.parse(fs.readFileSync(file('mutations-03', 'inputs.json'))).sources;
const namedKillInputs = ['server.cjs', 'imports.json', 'tests\\kit.cjs', ...selected.suites.map(name => 'tests\\' + name)];
for (const relative of namedKillInputs) {
  const row = sourceInputs.find(row => row.path === relative);
  assert.ok(row, 'NAMED_KILL_EXECUTED_SOURCE_INPUT_ENUMERATED:' + relative);
  assert.equal(sha(fs.readFileSync(path.join(root, relative))), row.sha256, 'NAMED_KILL_REUSE_REQUIRES_EVERY_ACTUAL_EXECUTED_SOURCE_TEST_AND_IMPORT_BYTE_UNCHANGED:' + relative);
}
const closed = new Map(), wholeRows = [], statusCounts = {};
function close(id, role, evidence) {
  assert.equal(closed.has(id), false, 'NO_DUPLICATED_POSITION_CREDIT:' + id);
  closed.set(id, { id, role, evidence });
}
for (const definition of current.definitions.filter(row => row.compiled && !row.identity)) {
  const label = 'mutant-' + String(definition.id).padStart(4, '0'), result = read('mutations-03', 'runs', label, 'result.json');
  const bytes = fs.readFileSync(file('mutations-03', 'runs', label, 'executed-server.source.txt'));
  const stdout = fs.readFileSync(file('mutations-03', 'runs', label, 'stdout.raw')), stderr = fs.readFileSync(file('mutations-03', 'runs', label, 'stderr.raw'));
  assert.deepEqual(result.definition, JSON.parse(JSON.stringify(definition)), 'EXACT_COMPILED_DOMAIN_ROW:' + definition.id);
  assert.equal(sha(bytes), definition.mutantSha256, 'ACTUAL_EXECUTED_CHANGED_SOURCE_HASH:' + definition.id);
  assert.equal(bytes.toString(), source.slice(0, definition.start) + definition.replacement + source.slice(definition.end), 'ACTUAL_EXECUTED_SINGLE_SOURCE_CHANGE:' + definition.id);
  assert.equal(result.stdoutSha256, sha(stdout), 'ACTUAL_RAW_MUTANT_STDOUT_BINDING:' + definition.id);
  assert.equal(result.stderrSha256, sha(stderr), 'ACTUAL_RAW_MUTANT_STDERR_BINDING:' + definition.id);
  assert.equal(typeof result.identityBeforeWork.birthFileTime, 'string', 'ACTUAL_PROCESS_STRING_FILETIME_BEFORE_WORK');
  assert.match(result.identityBeforeWork.birthUtc7, /\.\d{7}Z$/, 'ACTUAL_PROCESS_UTC7_BEFORE_WORK');
  assert.equal(result.ownChildFullyReaped, true, 'NO_OWN_MUTATION_CHILD_REMAINS');
  assert.equal(result.futureKillAuthority, false, 'REAPED_CHILD_IS_NOT_FUTURE_KILL_AUTHORITY');
  statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  if (result.status === 'KILLED_NAMED_SPECIFIED_ASSERTION') {
    assert.equal(result.timedOut, false, 'TIMEOUT_NEVER_A_KILL');
    assert.notEqual(result.exitCode, 0, 'NAMED_KILL_HAS_ACTUAL_NONZERO_EXIT');
    assert.deepEqual(result.faults, [], 'NO_MODULE_OR_RUNTIME_FAULT_AS_KILL');
    assert.deepEqual(result.newRuntimeExceptions, [], 'NO_CAUGHT_RUNTIME_FAULT_AS_KILL');
    assert.equal(result.cancelled, false, 'CANCELLED_TEST_NEVER_A_KILL');
    assert.equal(result.runtimeText, false, 'PRINTED_RUNTIME_FAULT_NEVER_A_KILL');
    const events = stdout.toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const named = events.filter(event => event.type === 'test:fail' && typeof event.name === 'string').filter(event => {
      let error = event.details?.error; while (error?.cause) error = error.cause;
      return error?.code === 'ERR_ASSERTION';
    });
    assert.ok(named.length, 'ACTUAL_NAMED_SPECIFIED_ASSERTION_EVENT_REQUIRED');
    close(definition.id, 'actual named specified-behavior assertion kill', { capture: 'mutations-03', label, testNames: named.map(row => row.name),
      resultSha256: sha(fs.readFileSync(file('mutations-03', 'runs', label, 'result.json'))) });
  }
  wholeRows.push({ id: definition.id, wholeMutantStatus: result.status, sourceSha256: result.sourceSha256,
    faults: result.faults.length, caughtRuntimeExceptions: result.newRuntimeExceptions.length, timeout: result.timedOut });
}
assert.deepEqual(statusCounts, campaign.counts, 'ALL_WHOLE_MUTANT_COUNTS_RECOMPUTED_NOT_RELABELED');
const debug = read('scoped-01', 'scoped.json');
for (const witness of debug.witnesses) {
  const definition = current.definitions.find(row => row.id === witness.id);
  assert.ok(definition && definition.compiled && !definition.identity, 'SCOPED_POSITION_BELONGS_TO_COMPLETE_ELIGIBLE_DOMAIN');
  assert.equal(witness.sourceSha256, current.sourceSha256, 'SCOPED_ORIGINAL_SOURCE_BINDING');
  assert.equal(witness.fullMutantSourceSha256, definition.mutantSha256, 'SCOPED_EXACT_FULL_MUTANT_BINDING');
  assert.equal(witness.qualifiedLocalContrast, true, 'ACTUAL_LOCAL_CONTRAST_QUALIFIES');
  assert.equal(witness.wholeMutantKillClaimed, false, 'SCOPED_CONTRAST_NOT_A_WHOLE_MUTANT_KILL');
  assert.equal(witness.globalEquivalenceClaimed, false, 'SCOPED_CONTRAST_NOT_GLOBAL_EQUIVALENCE');
  assert.equal(witness.objectIdentityUsedAsDifference, false, 'OBJECT_IDENTITY_NEVER_A_SEMANTIC_CONTRAST');
  const manual = witness.recipe.startsWith('exact-sanctioned') || witness.recipe.startsWith('exact-published-module');
  const prefix = manual ? 'manual-' : 'scoped-';
  assert.equal(sha(fs.readFileSync(file('scoped-01', prefix + witness.id + '-original.source.txt'))), witness.exactOriginalProgramSha256, 'ACTUAL_ORIGINAL_RUNNABLE_LOCAL_PROGRAM');
  assert.equal(sha(fs.readFileSync(file('scoped-01', prefix + witness.id + '-mutant.source.txt'))), witness.exactMutantProgramSha256, 'ACTUAL_CHANGED_RUNNABLE_LOCAL_PROGRAM');
  const before = witness.before?.observation || witness.before, after = witness.after?.observation || witness.after;
  assert.ok(before !== null && after !== null, 'NONEMPTY_ACTUAL_LOCAL_OUTCOMES');
  assert.equal(before?.exception || before?.protocolError || after?.exception || after?.protocolError || false, false, 'LOCAL_FAULTS_NEVER_A_CONTRAST');
  assert.notDeepEqual(before, after, 'ACTUAL_SOURCE_BOUND_LOCAL_VALUE_OR_CONTROL_DIFFERENCE');
  close(witness.id, 'actual real-frame or exact accepted-import runnable local contrast', { capture: 'scoped-01', recipe: witness.recipe,
    scenario: witness.actualBddScenario, originalProgramSha256: witness.exactOriginalProgramSha256, changedProgramSha256: witness.exactMutantProgramSha256 });
}
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value === 'string') return value.replace(/http:\/\/127\.0\.0\.1:\d+/g, '<actual-owned-loopback-origin>');
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['actualProgramSha256', 'clientTransportErrorNotUsedAsContrast'].includes(key)).map(([key, child]) => [key, comparable(child)]));
}
for (const capture of ['scoped-local-01', 'scoped-local-02', 'scoped-local-03']) {
  const report = read(capture, 'local.json');
  assert.equal(report.sourceSha256, current.sourceSha256, 'EXACT_ADDITIONAL_LOCAL_SOURCE');
  for (const id of report.locallyContrastedIds) {
    const row = read(capture, 'local-' + String(id).padStart(4, '0') + '.json'), definition = current.definitions.find(row => row.id === id);
    assert.equal(row.sourceSha256, current.sourceSha256); assert.equal(row.fullMutantSourceSha256, definition.mutantSha256);
    assert.equal(row.exactOriginal, definition.original, 'EXACT_ORIGINAL_SOURCE_RANGE_RUN');
    assert.equal(row.exactReplacement, definition.replacement, 'EXACT_CHANGED_SOURCE_RANGE_RUN');
    assert.equal(row.qualifiedLocalContrast, true); assert.equal(row.negativeControlIdentical, true);
    assert.deepEqual(comparable(row.original), comparable(row.negativeControl), 'ACTUAL_UNCHANGED_NEGATIVE_CONTROL_IDENTICAL');
    assert.notDeepEqual(comparable(row.original), comparable(row.mutant), 'ACTUAL_NONFAULT_SPECIFIC_LOCAL_DIFFERENCE');
    assert.equal(row.nonKillLocalFault, undefined, 'NO_SCOPED_RUNTIME_FAULT_AS_CLOSURE');
    const original = fs.readFileSync(file(capture, 'local-' + id + '-original.source.txt')), mutant = fs.readFileSync(file(capture, 'local-' + id + '-mutant.source.txt'));
    close(id, 'actual real-authority or owned-handle precise runnable local contrast with unchanged negative control', {
      capture, originalProgramSha256: sha(original), changedProgramSha256: sha(mutant), actualResultSha256: sha(fs.readFileSync(file(capture, 'local-' + String(id).padStart(4, '0') + '.json'))) });
  }
}
const eligible = current.definitions.filter(row => row.compiled && !row.identity), unresolved = eligible.filter(row => !closed.has(row.id));
const resources = read('resources-01', 'resources.json'), resourceRows = resources.groupIds.map(id => read('resources-01', 'resource-group-' + String(id).padStart(2, '0') + '.json'));
assert.equal(resources.sourceSha256, current.sourceSha256, 'RESOURCE_FINAL_PRODUCTION_SOURCE');
assert.equal(resources.totalGroupsAttempted, 64); assert.equal(resources.totalGroupsComplete, 64); assert.equal(resources.totalGroupsFailed, 0);
assert.equal(resources.observedMaximumActiveGroups, 8); assert.equal(resources.firstBatchActualListeningBarrier, 8);
assert.deepEqual([...resources.groupIds].sort((a, b) => a - b), Array.from({ length: 64 }, (_, n) => n + 1), 'EXACT64_TOTAL_COMPLETE_GROUPS_NOT64_TIMES8');
assert.equal(resourceRows.every(row => row.complete && row.cleanup.confirmed && row.cleanup.ownConnections === 0 && row.cleanup.ownQueuedEffects === 0), true);
for (const row of resourceRows) for (const step of row.steps.filter(step => step.noEffect)) assert.equal(step.worldBeforeSha256, step.worldAfterSha256, 'RESOURCE_POST_OPERATION_NO_BUSINESS_OR_SESSION_EFFECT:' + row.id + ':' + step.label);
assert.equal(resources.totalActualOperationsWithPostOperationInvariants, resourceRows.reduce((n, row) => n + row.steps.length, 0), 'ACTUAL_POST_OPERATION_INVARIANT_DENOMINATOR');
const browser = read('browser-01', 'browser.json');
assert.equal(browser.sourceSha256, current.sourceSha256, 'NATIVE_FINAL_PRODUCTION_SOURCE');
assert.equal(browser.launches, 2); assert.equal(browser.maximumConcurrentOwnBrowsers, 1); assert.equal(browser.activeOwnBrowsersAfter, 0);
assert.equal(browser.successCleanupConfirmed, true); assert.equal(browser.injectedFailureCleanupConfirmed, true);
assert.equal(browser.qualification.ok, true); assert.equal(browser.qualification.version, '157.0.4341.42');
assert.equal(browser.qualification.sha256, 'd258e512aa24947cfbef0c0033d8c3cd56ecb40f7b2ad59802fa75c4e4f3324d');
assert.equal(browser.qualification.signature.publisher, 'Microsoft Corporation'); assert.equal(browser.playwrightVersion, '1.56.1');
assert.ok(browser.actualAllowedObservations > 0 && browser.actualDeniedObservations > 0, 'NON_VACUOUS_ACTUAL_ALLOWED_AND_DENIED_BROWSER_OBSERVATIONS');
for (const row of browser.attempts) {
  assert.equal(row.cleanup.confirmed, true); assert.equal(row.ownListenerClosed, true);
  assert.equal(typeof row.cleanup.root.birthFileTime, 'string'); assert.match(row.cleanup.root.birthUtc7, /\.\d{7}Z$/);
}
const report = { schema: 'C047-independent-complete-source-and-evidence-closure/1', sourceSha256: current.sourceSha256,
  completeNewProductionExecutables: selected.production, allActualTestFiles: selected.suites, ast: current.counts,
  namedWholeKills: campaign.namedKilled, originalWholeMutantStatusCounts: statusCounts, localContrasts: closed.size - campaign.namedKilled,
  totalClosedChangedCompiledPositions: closed.size, eligibleChangedCompiledPositions: eligible.length, stillSemanticUnresolved: unresolved, stillSemanticUnresolvedCount: unresolved.length,
  exactPositionClosures: [...closed.values()].sort((a, b) => a.id - b.id), originalWholeOutcomesRemainVisible: wholeRows,
  noFaultTimeoutSyntaxIdentityAsKill: true, globalEquivalencesClaimed: 0, noBlanketDefaultPairs: true,
  resources: { groups: 64, complete: 64, actualConcurrency: 8, actualPostOperationInvariants: resources.totalActualOperationsWithPostOperationInvariants, ownCleanupConfirmed: 64 },
  browser: { sourceSha256: browser.sourceSha256, campaigns: 1, launches: 2, maximumOwnConcurrency: 1, allowed: browser.actualAllowedObservations, denied: browser.actualDeniedObservations,
    successAndInjectedFailureCleanupConfirmed: true, edge: browser.qualification.version, playwright: browser.playwrightVersion },
  originalFirstPreflightFullRawMissing: true, cannotReconstructOriginalRawChronology: true, parentAcceptancePublicationCreditClaimed: false };
saveReport();
function saveReport() {
  fs.writeFileSync(path.join(output, 'closure.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ completeProductionFiles: 1, eligible: eligible.length, namedWholeKills: campaign.namedKilled, actualLocalContrasts: report.localContrasts,
    closed: closed.size, semanticUnresolved: unresolved.length, resourceGroups: 64, resourceConcurrency: 8, browserAllowed: browser.actualAllowedObservations,
    browserDenied: browser.actualDeniedObservations, originalPreflightRawLimitationRetained: true }));
}
assert.equal(unresolved.length, 0, 'EVERY_ELIGIBLE_CHANGED_COMPILED_POSITION_REQUIRES_ACTUAL_NAMED_ASSERTION_OR_PRECISE_RUNNABLE_LOCAL_CONTRAST');
