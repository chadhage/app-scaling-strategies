'use strict';

(async () => {
  const evaluator = require('./evaluator.js');
  const [action, id, ...extra] = process.argv.slice(2);
  const known = [...evaluator.savedIds, ...evaluator.controlIds, ...evaluator.modelIds];
  if (extra.length || !((action === 'evaluate' && known.includes(id)) ||
      (action === 'compare' && id === undefined))) {
    throw Object.assign(new Error('Use evaluate <closed saved/control/model ID> or compare. No files, URLs, budgets, identities, approvals, hashes or verdict overrides.'), {
      code: 'CLOSED_CLI_ARGUMENTS'
    });
  }
  const source = require('./source.cjs');
  const historical = source.checkHistorical();
  const gates = source.readGates();
  const report = action === 'compare' ? await evaluator.compareRetry() :
    evaluator.savedIds.includes(id) ? evaluator.evaluateSaved(id) :
      evaluator.controlIds.includes(id) ? await evaluator.evaluateControl(id) : evaluator.evaluateModel(id);
  console.log(JSON.stringify({
    ...report,
    separateReadOnlyNodePreflight: {
      exactPinnedSourceFiles: historical.imports.length, actualGateReaderPid: gates.readerPid,
      currentIndependentGates: gates.cards.map((card) => ({ id: card.id, state: card.state })),
      interpretation: 'Source/gate read only, not a browser disk read, live journey, effect, run or identity correlation.'
    }
  }, null, 2));
  const decision = report.after?.decision || report.decision;
  process.exitCode = !report.valid ? 3 : decision === 'FAIL' ? 1 : decision === 'HOLD' ? 2 : 0;
})().catch((error) => {
  console.error(JSON.stringify({
    cardId: 'C029', valid: false, decision: 'HOLD', code: error.code || 'EVALUATION_UNAVAILABLE',
    message: error.message, eligibleForLiveRun: false, userJourneySuccess: false
  }));
  process.exitCode = 3;
});
