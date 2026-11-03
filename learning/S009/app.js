(function () {
  'use strict';

  const model = globalThis.ShadowProfile;
  const byId = (id) => document.getElementById(id);
  const form = byId('shadow-controls');
  let state = model.createState();
  const scenarioHelp = {
    safe: 'The safe shadow sink suppresses candidate writes and notifications.',
    discrepant: 'The candidate changes membership tier and points. Its writes and notifications remain suppressed.',
    'unsafe-duplicate': 'UNSAFE fixture: candidate writes and notifications are recorded twice overall, only in synthetic counters. A response match is not safety.',
    unknown: 'The candidate response is unavailable after a suppressed effect attempt. Missing evidence is UNKNOWN, not a match.'
  };

  function text(id, value) {
    byId(id).textContent = String(value);
  }

  function row(values) {
    const result = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      result.append(cell);
    }
    return result;
  }

  function emptyRow(columns, message) {
    const result = row([message]);
    result.firstElementChild.colSpan = columns;
    return result;
  }

  function updateIntent() {
    const version = byId('production-version').value;
    const known = ['v1', 'v2'].includes(version);
    text('next-intent', known
      ? `Next replay intent: ${version} answers callers; ${version === 'v1' ? 'v2' : 'v1'} is the separate shadow candidate. Choices do not alter recorded responses.`
      : 'Unknown production intent: replay will be rejected.');
    text('scenario-help', scenarioHelp[byId('scenario').value] || 'Unknown scenario: replay will be rejected.');
  }

  function describeResponse(version, response) {
    if (!response) return `${version} · UNKNOWN response unavailable`;
    return `${version} · ${response.status} · ${response.body.displayName} · ${response.body.membershipTier} · ${response.body.loyaltyPoints} points`;
  }

  function render() {
    const totals = model.summarize(state);
    const last = state.lastResult;
    text('verdict', last.verdict);
    byId('verdict').dataset.verdict = last.verdict;
    text('verdict-detail', last.message);
    text('live-status', `${last.verdict}: ${last.message} Cumulative extra writes: ${totals.duplicateWrites}; extra notifications: ${totals.duplicateNotifications}.`);
    const counters = {
      'request-total': totals.requests, 'match-total': totals.matchedResponses,
      'discrepant-total': totals.discrepantResponses, 'unknown-total': totals.unknownResponses,
      'expected-writes': totals.requests, 'expected-notifications': totals.requests,
      'production-writes': totals.productionWrites, 'production-notifications': totals.productionNotifications,
      'shadow-writes': totals.shadowWrites, 'shadow-notifications': totals.shadowNotifications,
      'suppressed-writes': totals.suppressedWrites, 'suppressed-notifications': totals.suppressedNotifications,
      'total-writes': totals.totalWrites, 'total-notifications': totals.totalNotifications,
      'duplicate-writes': totals.duplicateWrites, 'duplicate-notifications': totals.duplicateNotifications
    };
    for (const [id, value] of Object.entries(counters)) text(id, value);
    const damaged = totals.duplicateWrites > 0 || totals.duplicateNotifications > 0;
    text('cumulative-warning', damaged
      ? `UNSAFE history retained: ${totals.duplicateWrites} extra synthetic writes and ${totals.duplicateNotifications} extra synthetic notifications. A later safe batch does not undo these effects.`
      : totals.requests ? 'Zero extra synthetic writes or notifications recorded. This is not live safety evidence.' : 'No synthetic effects recorded.');
    byId('cumulative-warning').classList.toggle('damage', damaged);

    const batch = state.batches.at(-1);
    const differences = byId('difference-rows');
    differences.replaceChildren();
    if (batch) {
      const first = batch.records[0];
      text('last-executed', `Last executed batch ${batch.number}: ${batch.input.requestCount} synthetic request(s), intended production ${batch.input.productionVersion}, scenario ${batch.input.scenario}.${last.kind === 'invalid' ? ' Retained from before the INVALID attempt; that attempt replayed nothing.' : ''}`);
      text('production-version-observed', `${first.production.version} answered the caller; candidate responses never replace this response.`);
      text('candidate-version-observed', `${first.candidate.version} is a separate shadow observation.`);
      text('production-response', JSON.stringify(first.production.response, null, 2));
      text('candidate-response', first.candidate.response
        ? JSON.stringify(first.candidate.response, null, 2)
        : 'UNKNOWN — response unavailable. No candidate body is invented.');
      text('comparison', `Business response comparison: ${batch.responseComparison}. Shadow effects: ${batch.effectSafety}. ${first.comparison.reason}`);
      for (const item of batch.records) {
        for (const difference of item.comparison.differences) {
          differences.append(row([item.id, difference.field, JSON.stringify(difference.production), JSON.stringify(difference.candidate)]));
        }
      }
      if (!differences.children.length) {
        differences.append(emptyRow(4, batch.responseComparison === 'UNKNOWN'
          ? 'UNKNOWN: candidate response missing; no comparison possible.'
          : 'No business response differences. Check the effect counters separately.'));
      }
    } else {
      text('last-executed', 'No executed batch.');
      text('production-version-observed', 'No caller response.');
      text('candidate-version-observed', 'No candidate response.');
      text('production-response', 'Not run.');
      text('candidate-response', 'Not run.');
      text('comparison', 'Business response comparison: NOT RUN.');
      differences.append(emptyRow(4, 'Not run.'));
    }

    const history = byId('request-rows');
    history.replaceChildren();
    for (const entry of state.batches) {
      for (const item of entry.records) {
        history.append(row([
          `${entry.number} / ${item.id}`,
          describeResponse(item.production.version, item.production.response),
          describeResponse(item.candidate.version, item.candidate.response),
          `${item.comparison.status} / ${entry.verdict}`,
          `W ${item.production.effects.writes}, N ${item.production.effects.notifications}`,
          `Recorded W ${item.candidate.effects.writes}, N ${item.candidate.effects.notifications}; suppressed W ${item.candidate.effects.suppressedWrites}, N ${item.candidate.effects.suppressedNotifications}`
        ]));
      }
    }
    if (!history.children.length) history.append(emptyRow(6, 'No requests.'));
  }

  form.addEventListener('change', updateIntent);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      state = model.run(state, {
        productionVersion: byId('production-version').value,
        profileId: byId('profile-id').value,
        scenario: byId('scenario').value,
        requestCount: byId('request-count').value
      });
      render();
    } catch (error) {
      text('verdict', 'INVALID');
      byId('verdict').dataset.verdict = 'INVALID';
      text('verdict-detail', 'Rehearsal state could not be verified. No safety conclusion is available; Reset to recover.');
      text('live-status', 'INVALID state. Reset before drawing any safety conclusion.');
    }
  });
  byId('reset-lesson').addEventListener('click', () => {
    form.reset();
    state = model.createState();
    updateIntent();
    render();
    text('live-status', 'Reset complete. All observations and effect counters cleared; default synthetic inputs restored. No requests have run.');
  });

  updateIntent();
  render();
}());
