'use strict';

(function attach(root) {
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_ACTIONS = 24;
  const PERCENTS = [25, 50, 100];
  const zeroJourneys = () => ({ attempted: 0, passed: 0, failed: 0, unknown: 0 });

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function cohort(percent) {
    const start = PERCENTS.indexOf(percent) * 2 + 1;
    return {
      effectivePercent: percent,
      observedDestination: 'Amber',
      journeys: [start, start + 1].map((n) => ({
        id: `journey-${n}`,
        expectedIdentity: `learner-${n}`,
        observedIdentity: `learner-${n}`,
        expectedSession: `session-${n}`,
        observedSession: `session-${n}`,
        expectedState: `cart-${n}-v4`,
        observedState: `cart-${n}-v4`,
        effectId: `committed-order-${n}`,
        expectedEffectCount: 1,
        observedEffectCount: 1,
        committedEffectVisible: true,
        usedRecoveredRegion: true,
        latencyMs: 160 + n * 20,
        budgetMs: 400,
      })),
    };
  }

  function fixture(label) {
    return {
      label,
      regions: { recovered: 'Amber', servingBeforeReturn: 'Cobalt', restored: true },
      capacity: { availableUnits: 20, dependencyReadiness: 'ready' },
      synchronization: {
        servingCommittedSequence: 240,
        recoveredCommittedSequence: 240,
        servingStateContract: 'contract-v4',
        recoveredStateContract: 'contract-v4',
      },
      ownership: {
        expectedEpoch: 8,
        observedEpoch: 8,
        soleWriter: true,
        observedWriter: 'Amber',
        oldCobaltWriterFenced: true,
      },
      stages: Object.fromEntries(PERCENTS.map((percent) => [percent, cohort(percent)])),
    };
  }

  const fixtures = {
    aligned: fixture('Aligned restoration, synchronization and sole writer'),
    'restore-unknown': fixture('Restore observation missing'),
    'lagging-state': fixture('Recovered state is eight commits behind'),
    'sync-unknown': fixture('Recovered synchronization watermark missing'),
    'unfenced-writer': fixture('Old writer unfenced: conflicting ownership'),
    'ownership-unknown': fixture('Writer epoch and fence observation missing'),
    'capacity-shortfall': fixture('Recovered capacity 3 units; canary requires 5'),
    'continuity-break': fixture('25% passes; duplicate effect and lost state at 50%'),
    'latency-breach': fixture('25% passes; original latency budget breached at 50%'),
    'routing-mismatch': fixture('25% requested but effective route remains Cobalt'),
    'routing-unknown': fixture('Requested return has no effective-route evidence'),
    'journey-unknown': fixture('Identity observation missing during the 25% cohort'),
  };
  fixtures['restore-unknown'].regions.restored = null;
  fixtures['lagging-state'].synchronization.recoveredCommittedSequence = 232;
  fixtures['sync-unknown'].synchronization.recoveredCommittedSequence = null;
  Object.assign(fixtures['unfenced-writer'].ownership, {
    soleWriter: false, observedWriter: 'Amber + Cobalt', oldCobaltWriterFenced: false,
  });
  Object.assign(fixtures['ownership-unknown'].ownership, {
    observedEpoch: null, observedWriter: null, oldCobaltWriterFenced: null,
  });
  fixtures['capacity-shortfall'].capacity.availableUnits = 3;
  Object.assign(fixtures['continuity-break'].stages[50].journeys[0], {
    observedEffectCount: 2, observedState: 'empty-cart', observedSession: 'new-session',
  });
  fixtures['latency-breach'].stages[50].journeys[0].latencyMs = 620;
  Object.assign(fixtures['routing-mismatch'].stages[25], {
    effectivePercent: 0, observedDestination: 'Cobalt',
  });
  fixtures['routing-mismatch'].stages[25].journeys.forEach((j) => { j.usedRecoveredRegion = false; });
  Object.assign(fixtures['routing-unknown'].stages[25], {
    effectivePercent: null, observedDestination: null,
  });
  fixtures['journey-unknown'].stages[25].journeys[0].observedIdentity = null;
  const FIXTURES = freeze(fixtures);

  function fault(code, message, Constructor = TypeError) {
    const error = new Constructor(message);
    error.code = code;
    return error;
  }

  function record(value) {
    return value !== null && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).every((key) => typeof key === 'string'
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function keys(value, expected) {
    return record(value) && Reflect.ownKeys(value).length === expected.length
      && expected.every((key) => Object.hasOwn(value, key));
  }

  function equal(actual, expected) {
    if (Object.is(actual, expected)) return true;
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && Object.getPrototypeOf(actual) === Array.prototype
        && actual.length === expected.length
        && Reflect.ownKeys(actual).length === expected.length + 1
        && expected.every((value, i) => {
          const descriptor = Object.getOwnPropertyDescriptor(actual, i);
          return descriptor && Object.hasOwn(descriptor, 'value') && equal(descriptor.value, value);
        });
    }
    if (record(expected)) {
      return keys(actual, Object.keys(expected))
        && Object.keys(expected).every((key) => equal(actual[key], expected[key]));
    }
    return false;
  }

  function command(input) {
    let valid = record(input) && typeof input.type === 'string';
    if (valid) {
      switch (input.type) {
        case 'restore':
          valid = keys(input, ['type', 'fixture']) && typeof input.fixture === 'string'
            && Object.hasOwn(FIXTURES, input.fixture);
          break;
        case 'synchronize':
        case 'ownership':
          valid = keys(input, ['type']);
          break;
        case 'return':
          valid = keys(input, ['type', 'percent']) && typeof input.percent === 'number'
            && Number.isInteger(input.percent) && PERCENTS.includes(input.percent);
          break;
        default:
          valid = false;
      }
    }
    if (!valid) throw fault('ERR_S119_INPUT', 'Invalid command: choose a fixed fixture and an exact numeric cohort of 25, 50, or 100. Extra keys and type coercion are rejected.');
    return { ...input };
  }

  function blank() {
    return {
      version: 1,
      fixture: null,
      phase: 'awaiting-restore',
      restoration: 'unchecked',
      synchronization: 'unchecked',
      ownership: 'unchecked',
      requestedPercent: 0,
      effectivePercent: 0,
      history: [],
    };
  }

  function observationOutcome(checks) {
    if (checks.includes(false)) return 'negative';
    if (checks.includes(null)) return 'unknown';
    return 'positive';
  }

  const compare = (observed, expected) => observed === null ? null : observed === expected;

  function run(state, input) {
    const next = { ...state };
    const data = FIXTURES[state.fixture];
    const entry = {
      sequence: state.history.length + 1,
      command: input,
      result: {
        outcome: 'negative',
        kind: input.type,
        message: '',
        blockedBeforeExposure: input.type === 'return',
        journeys: zeroJourneys(),
        observations: {},
      },
    };
    const result = entry.result;
    const reject = (message, outcome = 'negative', observations = {}) => {
      result.message = message;
      result.outcome = outcome;
      result.observations = observations;
    };

    if (input.type === 'restore') {
      if (state.fixture !== null) {
        reject('Reset before choosing another fixed restoration fixture. No region was changed.');
      } else {
        const selected = FIXTURES[input.fixture];
        const outcome = observationOutcome([compare(selected.regions.restored, true)]);
        Object.assign(next, {
          fixture: input.fixture, restoration: outcome, phase: outcome === 'positive' ? 'restored' : 'held',
        });
        Object.assign(result, {
          outcome,
          message: `Restore DATA is ${outcome}. Capacity and state still need gates; no user has returned.`,
          observations: { regions: selected.regions, capacity: selected.capacity },
        });
      }
    } else if (input.type === 'synchronize') {
      if (state.restoration !== 'positive' || state.requestedPercent > 0) {
        reject('Synchronization DATA requires a positively observed restore and no prior exposure.',
          state.restoration === 'unknown' ? 'unknown' : 'negative');
      } else {
        const sync = data.synchronization;
        const outcome = observationOutcome([
          sync.recoveredCommittedSequence === null || sync.servingCommittedSequence === null
            ? null : sync.recoveredCommittedSequence === sync.servingCommittedSequence,
          compare(sync.servingStateContract, 'contract-v4'),
          compare(sync.recoveredStateContract, 'contract-v4'),
        ]);
        Object.assign(next, { synchronization: outcome, ownership: 'unchecked', phase: outcome === 'positive' ? 'synchronized' : 'held' });
        Object.assign(result, {
          outcome,
          message: `Synchronization DATA is ${outcome}: serving ${sync.servingCommittedSequence}, recovered ${sync.recoveredCommittedSequence === null ? 'unobserved' : sync.recoveredCommittedSequence}. No synchronization operation occurred.`,
          observations: { synchronization: sync },
        });
      }
    } else if (input.type === 'ownership') {
      if (state.synchronization !== 'positive' || state.requestedPercent > 0) {
        reject('Ownership DATA can pass only after synchronization and before any return.',
          state.synchronization === 'unknown' ? 'unknown' : 'negative');
      } else {
        const ownership = data.ownership;
        const outcome = observationOutcome([
          compare(ownership.observedEpoch, ownership.expectedEpoch),
          compare(ownership.observedWriter, 'Amber'),
          compare(ownership.soleWriter, true),
          compare(ownership.oldCobaltWriterFenced, true),
        ]);
        Object.assign(next, { ownership: outcome, phase: outcome === 'positive' ? 'eligible' : 'held' });
        Object.assign(result, {
          outcome,
          message: `Sole-writer/epoch/fence DATA is ${outcome}. This checks fictional ownership, never transfers or fences a real writer.`,
          observations: { ownership },
        });
      }
    } else {
      const gates = [state.restoration, state.synchronization, state.ownership];
      if (gates.some((gate) => gate !== 'positive')) {
        reject('Return rejected before exposure: restore, synchronized state, sole writer, current epoch and old-writer fence checks must all pass.',
          gates.includes('unknown') ? 'unknown' : 'negative',
          { gates: { restoration: state.restoration, synchronization: state.synchronization, ownership: state.ownership } });
      } else if (state.phase === 'held' || state.phase === 'complete') {
        reject(state.phase === 'complete'
          ? 'Return is already complete. Repeated commands do not add migrated journeys.'
          : 'Return is held after a failed or unverified attempted cohort. Retain the evidence and reset to start a different fixture.');
      } else {
        const expected = state.effectivePercent === 0 ? 25 : state.effectivePercent === 25 ? 50 : 100;
        if (input.percent !== expected) {
          reject(`Return rejected before exposure: the next bounded cohort is ${expected}%, not ${input.percent}%.`,
            'negative', { nextPercent: expected });
        } else {
          const capacity = {
            availableUnits: data.capacity.availableUnits,
            requiredUnits: input.percent / 5,
            dependencyReadiness: data.capacity.dependencyReadiness,
          };
          const capacityOutcome = observationOutcome([
            capacity.availableUnits === null ? null : capacity.availableUnits >= capacity.requiredUnits,
            compare(capacity.dependencyReadiness, 'ready'),
          ]);
          if (capacityOutcome !== 'positive') {
            next.phase = 'held';
            reject(`Return capacity DATA is ${capacityOutcome}; no cohort was exposed.`, capacityOutcome, { capacity });
          } else {
            const stage = data.stages[input.percent];
            const routing = {
              requestedPercent: input.percent,
              effectivePercent: stage.effectivePercent,
              expectedDestination: 'Amber',
              observedDestination: stage.observedDestination,
            };
            const routeChecks = [
              compare(stage.effectivePercent, input.percent),
              compare(stage.observedDestination, 'Amber'),
            ];
            const outcomes = stage.journeys.map((journey) => observationOutcome([
              ...routeChecks,
              compare(journey.observedIdentity, journey.expectedIdentity),
              compare(journey.observedSession, journey.expectedSession),
              compare(journey.observedState, journey.expectedState),
              compare(journey.observedEffectCount, journey.expectedEffectCount),
              compare(journey.committedEffectVisible, true),
              compare(journey.usedRecoveredRegion, true),
              journey.latencyMs === null ? null : journey.latencyMs <= journey.budgetMs,
            ]));
            const outcome = outcomes.includes('negative') ? 'negative'
              : outcomes.includes('unknown') ? 'unknown' : 'positive';
            const measured = {
              attempted: outcomes.length,
              passed: outcomes.filter((o) => o === 'positive').length,
              failed: outcomes.filter((o) => o === 'negative').length,
              unknown: outcomes.filter((o) => o === 'unknown').length,
            };
            Object.assign(next, {
              requestedPercent: input.percent,
              effectivePercent: stage.effectivePercent,
              phase: outcome !== 'positive' ? 'held' : input.percent === 100 ? 'complete' : 'returning',
            });
            Object.assign(result, {
              outcome, blockedBeforeExposure: false, journeys: measured,
              message: `${input.percent}% return DATA is ${outcome}: ${measured.passed}/${measured.attempted} journeys passed, ${measured.failed} failed, ${measured.unknown} unknown. ${outcome === 'positive' ? 'Only this synthetic cohort is certified.' : 'Further return is held; attempted journeys remain in the denominator.'}`,
              observations: { capacity, routing, journeys: stage.journeys, journeyOutcomes: outcomes },
            });
          }
        }
      }
    }
    next.history = [...state.history, entry];
    return next;
  }

  function validateState(state) {
    const invalid = () => fault('ERR_S119_STATE', 'Invalid or stale exercise state: it must exactly match replay of its bounded retained evidence. Reset is required.');
    if (!keys(state, Object.keys(blank())) || !Array.isArray(state.history)
        || Object.getPrototypeOf(state.history) !== Array.prototype || state.history.length > MAX_ACTIONS
        || Reflect.ownKeys(state.history).length !== state.history.length + 1) throw invalid();
    let replayed = blank();
    for (let i = 0; i < state.history.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(state.history, i);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !record(descriptor.value)) throw invalid();
      const item = descriptor.value;
      if (!keys(item, ['sequence', 'command', 'result'])) throw invalid();
      let parsed;
      try { parsed = command(item.command); } catch { throw invalid(); }
      replayed = run(replayed, parsed);
      if (!equal(item, replayed.history[i])) throw invalid();
    }
    if (!equal(state, replayed)) throw invalid();
    return replayed;
  }

  function transition(state, input) {
    const parsed = command(input);
    const verified = validateState(state);
    if (verified.history.length >= MAX_ACTIONS) {
      throw fault('ERR_S119_LIMIT', 'The 24-action bound is reached. History is retained; reset before another exercise.', RangeError);
    }
    return freeze(run(verified, parsed));
  }

  function summarize(state) {
    const verified = validateState(state);
    const journeys = zeroJourneys();
    let safeAborts = 0;
    for (const { result } of verified.history) {
      Object.keys(journeys).forEach((key) => { journeys[key] += result.journeys[key]; });
      if (result.blockedBeforeExposure) safeAborts += 1;
    }
    return freeze({
      journeys, safeAborts, completed: verified.phase === 'complete',
      lastResult: verified.history.length ? verified.history.at(-1).result : null,
    });
  }

  const api = freeze({ BANNER, MAX_ACTIONS, FIXTURES, initialState: () => freeze(blank()), transition, summarize });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S119 = api;
}(typeof globalThis === 'object' ? globalThis : this));
