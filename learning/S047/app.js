(function () {
  'use strict';

  const { createLesson, DEFAULTS } = globalThis.GrpcLesson;
  const lesson = createLesson();
  const element = (id) => document.getElementById(id);
  const form = element('stream-controls');
  const fields = ['acknowledged', 'continuation', 'native-evidence', 'proxy-evidence', 'resume-delay', 'budget'];
  const error = element('error-message');

  function integer(id) {
    const raw = element(id).value;
    if (!/^(0|[1-9]\d{0,3})$/.test(raw)) {
      const invalid = new Error(`${element(id).labels[0].textContent.trim()}: enter a whole decimal number, not an empty, fractional, or exponent value.`);
      invalid.code = 'INVALID_INPUT';
      throw invalid;
    }
    return Number(raw);
  }

  function readConfig() {
    return {
      acknowledged: integer('acknowledged'),
      continuation: element('continuation').value,
      nativeEvidence: element('native-evidence').value,
      proxyEvidence: element('proxy-evidence').value,
      resumeDelayMs: integer('resume-delay'),
      budgetMs: integer('budget'),
    };
  }

  function accounting(metrics) {
    if (metrics.observed === null) return `Observed unknown/8; dropped unknown; duplicate count unknown; unknown outcomes ${metrics.unknown}. Missing receipts are not zero losses.`;
    return `Observed ${metrics.observed}/${metrics.expected}; delivered exactly once ${metrics.deliveredOnce}; dropped ${metrics.missingCount} [${metrics.missingSequences.join(', ')}]; duplicate count ${metrics.duplicateCount} [${metrics.duplicateSequences.join(', ')}]; ordered ${metrics.orderOk ? 'yes' : 'no'}; unknown ${metrics.unknown}.`;
  }

  function render() {
    const state = lesson.snapshot();
    fields.forEach((id) => { element(id).disabled = state.phase !== 'ready'; });
    element('start-stream').disabled = state.phase !== 'ready';
    element('cutover-stream').disabled = state.phase !== 'streaming';
    element('resume-stream').disabled = state.phase !== 'cutover';
    element('check-result').disabled = state.phase !== 'resumed';
    element('phase').textContent = `Phase: ${state.phase}. ${state.runId === null ? 'No active attempt.' : `Synthetic attempt ${state.runId}; original clock ${state.elapsedMs} ms.`}`;
    const result = state.result;
    element('overall-result').textContent = result ? `${result.verdict} — synthetic assertions only. ${result.impact}` : 'Not checked. Complete the ordered actions; no success is implied.';
    element('overall-result').className = result ? result.verdict.toLowerCase() : '';
    element('native-result').textContent = result
      ? `Native-shaped receipt: ${result.native.verdict}; transport ${result.native.transport ?? 'unknown'}; media type ${result.native.contentType ?? 'unknown'}; HTTP status ${result.native.httpStatus ?? 'unknown'}; grpc-status ${result.native.grpcStatus ?? 'unknown'}; requested result ${result.native.resumeFrom ?? 'none'}; original stream survived: ${result.native.originalStreamSurvived === null ? 'unknown' : 'no'}.`
      : 'Native-shaped receipt: not checked. Native protocol proof is never supplied by this page.';
    element('proxy-result').textContent = result
      ? `Browser-proxy observation: ${result.proxy.verdict}; HTTP status ${result.proxy.httpStatus ?? 'unknown'}. Proxy success is not native gRPC proof.`
      : 'Browser-proxy observation: not checked independently.';
    element('native-metrics').textContent = result ? accounting(result.native.metrics) : 'Not checked.';
    element('proxy-metrics').textContent = result ? accounting(result.proxy.metrics) : 'Not checked.';
    element('deadline-result').textContent = result ? `${result.elapsedMs} ms / ${result.budgetMs} ms inclusive original budget — ${result.elapsedMs <= result.budgetMs ? 'PASS' : 'FAIL'}.` : 'Not checked; the clock will not restart at cutover.';
    element('receipt').textContent = result ? JSON.stringify(result, null, 2) : 'No checked result. Reset preserves unfinished attempts as UNKNOWN.';
    element('trace').replaceChildren(...state.trace.map((event) => {
      const item = document.createElement('li');
      item.textContent = `${event.atMs} ms — ${event.action}: ${JSON.stringify(event)}`;
      return item;
    }));
    element('history-count').textContent = `${state.history.length}/8 retained outcomes.`;
    element('history').replaceChildren(...[...state.history].reverse().map((entry) => {
      const item = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const receipt = document.createElement('pre');
      summary.textContent = `Attempt ${entry.runId}: ${entry.verdict} — ${entry.reason || entry.impact}`;
      receipt.textContent = JSON.stringify(entry, null, 2);
      details.append(summary, receipt);
      item.append(details);
      return item;
    }));
  }

  function perform(action, nextFocus) {
    error.textContent = '';
    try {
      action();
      render();
      element(nextFocus).focus();
    } catch (failure) {
      render();
      error.textContent = `${failure.code || 'LESSON_ERROR'}: ${failure.message}`;
      error.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform(() => lesson.start(readConfig()), 'cutover-stream');
  });
  element('cutover-stream').addEventListener('click', () => perform(() => lesson.cutover(), 'resume-stream'));
  element('resume-stream').addEventListener('click', () => perform(() => lesson.resume(), 'check-result'));
  element('check-result').addEventListener('click', () => perform(() => lesson.verify(), 'reset-lesson'));
  element('reset-lesson').addEventListener('click', () => perform(() => {
    lesson.reset();
    HTMLFormElement.prototype.reset.call(form);
    if (Number(element('acknowledged').value) !== DEFAULTS.acknowledged) throw new Error('Default acknowledgement was not restored.');
  }, 'acknowledged'));
  render();
}());
