'use strict';

(function runLesson() {
  const { createRehearsal, nextRing, attemptPromotion } = globalThis.ReleaseRings;
  let state = createRehearsal();
  const byId = (id) => document.getElementById(id);
  const versionPath = (versions) => ['frontend', 'api', 'worker'].map((tier) => versions[tier] ?? 'unknown').join(' / ');

  function cell(text) {
    const element = document.createElement('td');
    element.textContent = text;
    return element;
  }

  function row(values) {
    const element = document.createElement('tr');
    for (const value of values) element.append(cell(value));
    return element;
  }

  function renderRings() {
    const lifecycle = state.deployment?.lifecycle ?? 'unknown';
    byId('deployment-lifecycle').dataset.lifecycle = lifecycle;
    byId('deployment-lifecycle').textContent = `Deployment lifecycle: ${lifecycle} (synthetic fixture). Artifact deployment is separate from ring rollout approval; a completed deployment does not promote rings.`;
    byId('rings').replaceChildren(...state.rings.map((ring) => {
      const element = row([
        ring.id,
        ring.members.join(', '),
        versionPath(ring.tiers),
        ring.status,
        ring.observation ? `${ring.observation.status}; ${ring.observation.seconds} fixture seconds; ${ring.observation.samples} samples` : 'not observed',
        ring.lastAttempt ?? 'none'
      ]);
      element.dataset.ring = ring.id;
      return element;
    }));
    byId('next-ring').textContent = `Next eligible ring: ${nextRing(state) ?? 'none — all rings passed their synthetic gates'}. Attempts: ${state.attempts}.`;
  }

  function renderAttempt(result) {
    renderRings();
    byId('verdict').textContent = `${result.verdict}${result.verdict === 'PASS' ? ' (rehearsal only)' : ''}`;
    byId('verdict').dataset.verdict = result.verdict.toLowerCase();
    byId('verdict-detail').textContent = result.verdict === 'PASS' ?
      `Synthetic assertions passed for ${result.desired.ring}. This is not native proof or parent completion.` :
      `${result.phase === 'preflight' ? 'Stopped BEFORE expansion.' : 'Observation did not authorize expansion.'} ${result.reasons.join(' ')}`;
    byId('desired').textContent = `${result.desired.ring}: frontend / API / worker = ${versionPath(result.desired.tiers)}; shared contract = ${result.desired.contract}. These are requested values, not actual observations.`;

    const rows = [...result.actual.map((item) => ({ ...item, scope: 'target' })),
      ...result.unaffected.map((item) => ({ ...item, scope: 'other' }))];
    byId('actual').replaceChildren(...(rows.length ? rows.map((item) => {
      const element = row([
        `${item.scope} / ${item.ring}`,
        item.member,
        item.tiers.frontend ?? 'unknown',
        item.tiers.api ?? 'unknown',
        item.tiers.worker ?? 'unknown',
        item.outcome,
        item.latencyMs === null ? 'unknown' : `${item.latencyMs} ms`
      ]);
      element.dataset.scope = item.scope;
      element.dataset.member = item.member;
      return element;
    }) : [row(['Not observed — unsafe preflight stopped before any candidate journey.', '—', '—', '—', '—', 'not run', '—'])]));

    byId('assertions').replaceChildren(...result.assertions.map((item) => {
      const element = row([item.label, item.expected, item.observed, item.status.toUpperCase()]);
      element.dataset.assertion = item.id;
      element.dataset.status = item.status;
      return element;
    }));
    byId('trace').replaceChildren(...result.trace.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
    const { completed, interrupted, unknown } = result.userImpact;
    byId('impact-latest').textContent = result.phase === 'preflight' ?
      'Latest attempt: target journeys NOT OBSERVED; preflight stopped. No user-success claim is available.' :
      `Latest target fixture: ${completed} completed; ${interrupted} interrupted; ${unknown} unknown. Other rings: ${result.unaffected.length} completed scripted journeys on unchanged tiers.`;
    const cumulative = state.cumulativeImpact;
    byId('impact-cumulative').textContent = `Cumulative target observations: ${cumulative.completed} completed; ${cumulative.interrupted} interrupted; ${cumulative.unknown} unknown. Retries do not erase earlier outcomes.`;
    byId('cleanup-result').textContent = `Resources created: ${result.cleanup.resourcesCreated}. ${result.cleanup.summary}`;
    byId('live-status').textContent = `${result.verdict}: ${result.desired.ring}. ${result.phase === 'preflight' ? 'Stopped before expansion; no candidate observations.' : `${completed} completed, ${interrupted} interrupted, ${unknown} unknown synthetic target journeys.`} Next eligible ring: ${nextRing(state) ?? 'none'}.`;
  }

  byId('promote').addEventListener('click', () => {
    const result = attemptPromotion(state, {
      ring: byId('ring').value,
      tiers: { frontend: byId('frontend').value, api: byId('api').value, worker: byId('worker').value },
      contract: byId('contract').value,
      window: byId('window').value,
      observation: byId('observation').value
    });
    state = result.state;
    renderAttempt(result);
  });

  byId('reset').addEventListener('click', () => {
    state = createRehearsal();
    for (const [id, value] of Object.entries({
      ring: 'pilot', frontend: 'v2', api: 'v2', worker: 'v2',
      contract: 'dual', window: 'open', observation: 'healthy'
    })) byId(id).value = value;
    renderRings();
    byId('verdict').textContent = 'NOT RUN';
    delete byId('verdict').dataset.verdict;
    byId('verdict-detail').textContent = 'No verification result yet. A requested route alone is not a successful migration.';
    byId('desired').textContent = 'No candidate route requested.';
    byId('actual').replaceChildren(row(['Not run.', '—', '—', '—', '—', '—', '—']));
    byId('assertions').replaceChildren(row(['Run an attempt to check the gates.', '—', '—', '—']));
    const item = document.createElement('li');
    item.textContent = 'No attempt yet.';
    byId('trace').replaceChildren(item);
    byId('impact-latest').textContent = 'No target-member journeys observed.';
    byId('impact-cumulative').textContent = 'Cumulative target observations: 0 completed; 0 interrupted; 0 unknown.';
    byId('cleanup-result').textContent = 'Reset complete. No Azure resource or persistent browser storage was created. Prior interruptions are not retroactively made successful.';
    byId('live-status').textContent = 'Reset complete. Pilot is next. Only local fictional state and counters were cleared.';
  });

  renderRings();
})();
