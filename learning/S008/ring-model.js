'use strict';

(function expose(root) {
  const TIER_NAMES = ['frontend', 'api', 'worker'];
  const OBSERVATION_SECONDS = 120;
  const JOURNEY_BUDGET_MS = 800;
  const OBSERVATIONS = ['healthy', 'unknown', 'stale-route', 'tier-drift', 'interrupted', 'too-short'];
  const tiers = (version) => ({ frontend: version, api: version, worker: version });

  function createRehearsal() {
    return {
      rings: ['internal', 'pilot', 'limited', 'remaining'].map((id, index) => ({
        id,
        members: [`${id}-01`, `${id}-02`],
        tiers: tiers(index === 0 ? 'v2' : 'v1'),
        status: index === 0 ? 'promoted' : 'pending',
        observation: index === 0 ? { status: 'healthy', seconds: OBSERVATION_SECONDS, samples: 2 } : null,
        lastAttempt: null
      })),
      attempts: 0,
      cumulativeImpact: { completed: 0, interrupted: 0, unknown: 0 }
    };
  }

  function nextRing(state) {
    return state.rings.find((ring) => ring.status !== 'promoted')?.id ?? null;
  }

  function attemptPromotion(state, choices = {}) {
    const updated = structuredClone(state);
    updated.attempts += 1;
    const desired = {
      ring: choices.ring ?? '(unspecified)',
      tiers: { ...choices.tiers },
      contract: choices.contract ?? '(unspecified)'
    };
    const target = updated.rings.find((ring) => ring.id === desired.ring);
    const expectedRing = nextRing(updated);
    const result = {
      state: updated,
      verdict: 'BLOCKED',
      phase: 'preflight',
      desired,
      actual: [],
      unaffected: [],
      assertions: [],
      reasons: [],
      trace: [
        `Request: ${desired.ring}; next eligible ring: ${expectedRing ?? 'none'}.`,
        `Desired frontend/API/worker: ${TIER_NAMES.map((tier) => desired.tiers[tier] ?? 'unknown').join(' / ')}.`
      ],
      userImpact: { completed: 0, interrupted: 0, unknown: 0 },
      cleanup: {
        resourcesCreated: 0,
        summary: 'No cloud resources, network requests, credentials, or persistent browser storage used. Reset clears only this in-memory rehearsal.'
      },
      scope: 'synthetic-only',
      nativeProof: false,
      parentComplete: false
    };

    function record(id, label, status, expected, observed) {
      result.assertions.push({ id, label, status, expected, observed });
      if (status === 'fail' || status === 'unknown') result.reasons.push(`${label}: ${observed}`);
    }

    const index = updated.rings.indexOf(target);
    const predecessorsHealthy = index > 0 && updated.rings.slice(0, index).every((ring) =>
      ring.status === 'promoted' &&
      ring.observation?.status === 'healthy' &&
      ring.observation.seconds >= OBSERVATION_SECONDS &&
      ring.observation.samples >= 2 &&
      TIER_NAMES.every((tier) => ring.tiers[tier] === 'v2'));
    const ordered = Boolean(target && target.id === expectedRing && predecessorsHealthy);
    record('ring-order', 'Ring order and predecessor observations', ordered ? 'pass' : 'fail',
      'Promote only the next ring after healthy predecessor windows.',
      ordered ? `${target.id} follows healthy observed predecessors.` :
        `Next eligible ring is ${expectedRing ?? 'none'}; ${desired.ring} is not eligible or a predecessor observation is not healthy.`);

    record('promotion-window', 'Promotion window', choices.window === 'open' ? 'pass' : 'fail',
      'The configured promotion window must be open.',
      choices.window === 'open' ? 'Window is open (synthetic choice).' : 'Window is closed or unspecified.');

    const requestedMatch = TIER_NAMES.every((tier) => desired.tiers[tier] === 'v2');
    record('tier-affinity', 'Requested tier affinity', requestedMatch ? 'pass' : 'fail',
      'Frontend v2 + API v2 + worker v2; this fixture declares mixed versions incompatible.',
      requestedMatch ? 'All three requested tiers are v2.' : 'Incompatible mixed, unchanged, or missing target tier versions rejected.');

    const legacyConsumers = updated.rings.filter((ring) =>
      TIER_NAMES.some((tier) => ring.tiers[tier] === 'v1')).map((ring) => ring.id);
    const knownContract = ['dual', 'v2-only'].includes(choices.contract);
    const compatible = choices.contract === 'dual' ||
      (choices.contract === 'v2-only' && legacyConsumers.length === 0);
    record('shared-contract', 'Shared-contract compatibility', !knownContract ? 'unknown' : compatible ? 'pass' : 'fail',
      'The shared dependency must accept every current consumer and the candidate throughout coexistence.',
      !knownContract ? 'Unrecognized shared contract; compatibility is unknown.' :
        compatible ? 'Dual contract accepts current v1/v2 and candidate v2 consumers.' :
          `v2-only rejects active v1 consumers: ${legacyConsumers.join(', ')}. Stop before expansion.`);

    const knownObservation = OBSERVATIONS.includes(choices.observation);
    record('observation-input', 'Declared observation fixture', knownObservation ? 'pass' : 'unknown',
      'Use a named synthetic fixture, never an assumed successful observation.',
      knownObservation ? `Fixture: ${choices.observation}.` : 'Unrecognized observation; no user outcome can be invented.');

    const failedPreflight = result.assertions.some((item) => item.status === 'fail');
    const unknownPreflight = result.assertions.some((item) => item.status === 'unknown');
    if (failedPreflight || unknownPreflight) {
      result.verdict = failedPreflight ? 'BLOCKED' : 'UNKNOWN';
      for (const [id, label] of [
        ['observation-window', 'Bounded observation window'],
        ['actual-affinity', 'Actual member tier affinity'],
        ['journey-outcomes', 'Actual user completion'],
        ['unaffected-members', 'Other ring membership and outcomes']
      ]) record(id, label, 'not-run', 'Requires safe preflight.', 'Not run; no candidate routing or user observation occurred.');
      if (target) target.lastAttempt = `${result.verdict} before expansion`;
      result.trace.push(...result.reasons, 'STOP: verified ring routing is unchanged; candidate observations were not run.');
      return result;
    }

    result.phase = 'observation';
    const seconds = choices.observation === 'too-short' ? 30 : OBSERVATION_SECONDS;
    result.actual = target.members.map((member, memberIndex) => {
      const row = {
        ring: target.id,
        member,
        tiers: { ...desired.tiers },
        outcome: 'completed',
        latencyMs: 210 + memberIndex * 35
      };
      if (choices.observation === 'unknown') {
        row.tiers.worker = null;
        row.outcome = 'unknown';
        row.latencyMs = null;
      } else if (choices.observation === 'stale-route') {
        row.tiers = tiers('v1');
      } else if (choices.observation === 'tier-drift') {
        row.tiers.api = 'v1';
        row.outcome = 'interrupted';
        row.latencyMs = 950;
      } else if (choices.observation === 'interrupted' && memberIndex === 1) {
        row.outcome = 'interrupted';
        row.latencyMs = 950;
      }
      return row;
    });
    result.unaffected = updated.rings.filter((ring) => ring.id !== target.id).flatMap((ring) =>
      ring.members.map((member) => ({
        ring: ring.id,
        member,
        tiers: { ...ring.tiers },
        outcome: 'completed',
        latencyMs: 180
      })));
    result.observation = { seconds, samples: result.actual.length, status: 'healthy' };
    record('observation-window', 'Bounded observation window',
      seconds >= OBSERVATION_SECONDS && result.actual.length >= 2 ? 'pass' : 'fail',
      'At least 120 fixture seconds and two target-member journeys.',
      `${seconds} fixture seconds; ${result.actual.length} samples. This is not a wall-clock wait.`);

    const unknownTier = result.actual.some((row) => TIER_NAMES.some((tier) => row.tiers[tier] === null));
    const actualMatch = result.actual.every((row) =>
      TIER_NAMES.every((tier) => row.tiers[tier] === desired.tiers[tier]));
    record('actual-affinity', 'Actual member tier affinity', unknownTier ? 'unknown' : actualMatch ? 'pass' : 'fail',
      'Each target member must actually traverse frontend v2, API v2, and worker v2.',
      unknownTier ? 'Actual worker version is unknown; requested routing is not evidence.' :
        actualMatch ? 'Both observed target-member paths are all-v2.' :
          'Observed tiers do not match all-v2 intent; stale or incompatible mixed routing is rejected.');

    for (const row of result.actual) result.userImpact[row.outcome] += 1;
    const knownFailure = result.actual.some((row) => row.outcome === 'interrupted' ||
      (row.latencyMs !== null && row.latencyMs > JOURNEY_BUDGET_MS));
    record('journey-outcomes', 'Actual user completion',
      knownFailure ? 'fail' : result.userImpact.unknown > 0 ? 'unknown' : 'pass',
      'Both target journeys complete correctly within the 800 ms fixture budget.',
      `${result.userImpact.completed} completed; ${result.userImpact.interrupted} interrupted; ${result.userImpact.unknown} unknown.`);
    record('unaffected-members', 'Other ring membership and outcomes', 'pass',
      'Other rings retain their members and verified tiers, with completed fixture journeys.',
      `${result.unaffected.length} other-member fixture journeys completed on unchanged tiers.`);

    const hasFailure = result.assertions.some((item) => item.status === 'fail');
    const hasUnknown = result.assertions.some((item) => item.status === 'unknown');
    result.verdict = hasFailure ? 'BLOCKED' : hasUnknown ? 'UNKNOWN' : 'PASS';
    result.observation.status = result.verdict === 'PASS' ? 'healthy' : result.verdict === 'UNKNOWN' ? 'unknown' : 'failed';
    target.observation = { ...result.observation };
    target.lastAttempt = `${result.verdict} after synthetic observation`;
    target.status = result.verdict === 'PASS' ? 'promoted' : result.verdict === 'UNKNOWN' ? 'unknown' : 'failed';
    if (result.verdict === 'PASS') target.tiers = { ...desired.tiers };
    for (const outcome of ['completed', 'interrupted', 'unknown']) {
      updated.cumulativeImpact[outcome] += result.userImpact[outcome];
    }

    result.trace.push(
      `Preflight passed before candidate observation. Members: ${target.members.join(', ')}.`,
      `Observe ${seconds} fixture seconds and ${result.actual.length} target journeys; no real timer or network.`,
      ...result.actual.map((row) =>
        `ACTUAL synthetic ${row.member}: frontend=${row.tiers.frontend}, API=${row.tiers.api}, worker=${row.tiers.worker ?? 'unknown'}; ${row.outcome}; ${row.latencyMs === null ? 'latency unknown' : `${row.latencyMs} ms`}.`),
      result.verdict === 'PASS' ?
        `PASS (rehearsal only): ${target.id} advances; next eligible ring: ${nextRing(updated) ?? 'none'}.` :
        `${result.verdict}: no expansion; prior verified routing retained. Any observed interruptions or unknowns remain in user-impact totals.`
    );
    return result;
  }

  const api = { createRehearsal, nextRing, attemptPromotion, OBSERVATION_SECONDS, JOURNEY_BUDGET_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReleaseRings = api;
})(globalThis);
