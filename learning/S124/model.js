(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S124 = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_ACTIONS = 24;
  const STRATEGIES = ['shared-slots', 'separate-plans'];
  const FIXTURES = {
    healthy: { label: 'Healthy overlap with two in-flight journeys', blueDemand: 12, warmDemand: 8, initialized: true },
    overlap: { label: 'Overlap exceeds one shared compute pool', blueDemand: 18, warmDemand: 10, initialized: true },
    'warmup-only': { label: 'HTTP 200 without meaningful initialization', blueDemand: 12, warmDemand: 8, initialized: false },
    'session-loss': { label: 'Green HTTP 200 loses one session', blueDemand: 12, warmDemand: 8, initialized: true },
    'missing-receipt': { label: 'One actual destination receipt is missing', blueDemand: 12, warmDemand: 8, initialized: true },
    'pinned-client': { label: 'One successful client remains pinned to blue', blueDemand: 12, warmDemand: 8, initialized: true },
    'dependency-outage': { label: 'Both plans share a failed dependency', blueDemand: 12, warmDemand: 8, initialized: true },
    'platform-restart': { label: 'A host restart abandons existing blue work', blueDemand: 12, warmDemand: 8, initialized: true },
    'drain-pending': { label: 'Old work has no completed drain receipt', blueDemand: 12, warmDemand: 8, initialized: true },
  };
  const DATA = {
    unitsPerPlan: 24, workersPerPlan: 2, journeyBudgetMs: 500, existingWork: 2,
    dependency: 'DATA-DEPENDENCY-COMMON', expectedState: 'DATA-PROFILE-7',
    blueEndpoint: 'DATA-ENDPOINT-BLUE', greenEndpoint: 'DATA-ENDPOINT-GREEN',
    sharedPlans: ['DATA-PLAN-SHARED'], separatePlans: ['DATA-PLAN-BLUE', 'DATA-PLAN-GREEN'],
    sharedSlots: ['DATA-SLOT-BLUE', 'DATA-SLOT-GREEN'],
    extraPlacement: 'DATA-EXTRA-SLOT-OR-CONTENT', retentionTick: 1,
  };

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(STRATEGIES);
  freeze(FIXTURES);
  freeze(DATA);

  function closedObject(value, keys, name) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${name} must be a plain, closed object.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)
      || !Object.hasOwn(descriptors[key], 'value'))) {
      throw new TypeError(`${name} contains missing, extra, symbolic or accessor fields.`);
    }
  }

  function validateCommand(command) {
    if (!command || typeof command !== 'object') throw new TypeError('A typed command is required.');
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    const type = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
    const keys = type === 'compare' ? ['type', 'strategy', 'fixture']
      : type === 'route' ? ['type', 'percent'] : ['type'];
    closedObject(command, keys, 'Command');
    if (!['compare', 'add-placement', 'warm', 'route', 'drain', 'retain', 'retire'].includes(type)) {
      throw new TypeError('Unknown rehearsal action.');
    }
    if (type === 'compare' && (!STRATEGIES.includes(command.strategy)
      || typeof command.fixture !== 'string' || !Object.hasOwn(FIXTURES, command.fixture))) {
      throw new TypeError('Choose an exact fixed strategy and observation fixture.');
    }
    if (type === 'route' && command.percent !== 100) {
      throw new TypeError('New-admission percent must be the typed number 100.');
    }
    return { ...command };
  }

  function parsePercent(text) {
    if (typeof text !== 'string' || text !== '100') {
      throw new TypeError('Enter exactly 100; spaces, fractions, signs and other values are not supported.');
    }
    return 100;
  }

  function initialView() {
    return {
      phase: 'awaiting-compare', strategy: null, fixture: null, planLabels: [], slotLabels: [],
      planCount: 0, workers: 0, totalComputeUnits: 0, fictionalCostUnits: 0, placements: 0,
      extraPlacement: false, computeIsolated: false, independentDependencies: false,
      independentFaultDomains: 'unverified', sharedDependency: DATA.dependency,
      lifecycleControl: 'Compare fixed DATA before conducting the lifecycle.',
      warmUp: 'unobserved', requestedPercent: 0, effectivePercent: 0,
      outstandingWork: DATA.existingWork, pinnedSessions: 0, drainComplete: false,
      retentionObserved: false, attempted: 0, passed: 0, failed: 0, unknown: 0, safeAborts: 0,
      classification: 'neutral', userOutcome: 'Not started',
      message: 'Choose one fixed placement and condition. No actual resource or configuration exists.',
      latestData: {}, receipts: [], history: [],
    };
  }

  function requirePhase(view, phase, message) {
    if (view.phase !== phase) throw new RangeError(message);
  }

  function result(view, classification, userOutcome, message) {
    Object.assign(view, { classification, userOutcome, message });
  }

  function receipt(id, kind, latencyMs) {
    const endpoint = kind === 'new-admission' ? DATA.greenEndpoint : DATA.blueEndpoint;
    return {
      id, kind, observed: true, expectedEndpoint: endpoint, observedEndpoint: endpoint,
      httpStatus: 200, latencyMs, sessionPreserved: true, businessState: DATA.expectedState,
      effectCount: 1, completed: true, dependencyAvailable: true,
    };
  }

  function recordReceipts(view, receipts, reason) {
    for (const item of receipts) {
      let classification;
      if (!item.observed || item.observedEndpoint === null) classification = 'unknown';
      else if (item.httpStatus !== 200 || item.latencyMs > DATA.journeyBudgetMs
        || !item.sessionPreserved || item.businessState !== DATA.expectedState
        || item.effectCount !== 1 || !item.completed || !item.dependencyAvailable) classification = 'negative';
      else if (item.observedEndpoint !== item.expectedEndpoint) classification = 'unknown';
      else classification = 'positive';
      view.attempted++;
      view[classification === 'positive' ? 'passed' : classification === 'negative' ? 'failed' : 'unknown']++;
      view.receipts.push({ ...item, classification, reason });
    }
  }

  function apply(view, command) {
    const fixture = view.fixture ? FIXTURES[view.fixture] : null;
    switch (command.type) {
      case 'compare': {
        requirePhase(view, 'awaiting-compare', 'Reset before changing the fixed strategy or condition.');
        const separate = command.strategy === 'separate-plans';
        Object.assign(view, {
          phase: 'compared', strategy: command.strategy, fixture: command.fixture,
          planLabels: [...(separate ? DATA.separatePlans : DATA.sharedPlans)],
          slotLabels: separate ? [] : [...DATA.sharedSlots],
          planCount: separate ? 2 : 1, workers: separate ? 4 : 2,
          totalComputeUnits: separate ? 48 : 24, fictionalCostUnits: separate ? 4 : 2,
          placements: 2, computeIsolated: separate,
          lifecycleControl: separate
            ? 'External routing: stop new admissions, observe drain, retain, then retire separately. Host restarts remain possible.'
            : 'Native slot swap: former-production workers can recycle. Keeping old slot content does not control their drain.',
          latestData: {
            source: 'Fixed placement DATA ONLY', planLabels: separate ? DATA.separatePlans : DATA.sharedPlans,
            unitsPerPlan: DATA.unitsPerPlan, workersPerPlan: DATA.workersPerPlan,
            costBasis: '1 fictional cost unit per worker per rehearsal interval; not a price; router/dependency costs excluded',
            dependency: DATA.dependency, independentFaultDomains: 'unverified',
          },
        });
        result(view, 'neutral', 'No transition attempted',
          separate
            ? 'Two independent compute pools; shared dependency and wider fault domains are not independently qualified.'
            : 'Both slots share the same compute pool. Additional slot content is not capacity scaling.');
        break;
      }
      case 'add-placement':
        requirePhase(view, 'compared', 'Add the fixed extra placement only before warm-up.');
        if (view.extraPlacement) throw new RangeError('Only one fixed extra placement is available.');
        view.extraPlacement = true;
        view.placements = 3;
        if (view.strategy === 'shared-slots') view.slotLabels.push(DATA.extraPlacement);
        view.latestData = {
          source: 'Fixed extra slot/content DATA ONLY', placement: DATA.extraPlacement,
          placementWithin: view.planLabels[0], addedWorkers: 0, addedComputeUnits: 0, addedPlanCostUnits: 0,
        };
        result(view, 'positive', 'No transition attempted',
          'Extra slot/content stays in an existing plan: placements increased, but compute, workers and plan cost did not.');
        break;
      case 'warm': {
        requirePhase(view, 'compared', 'Warm only after comparing a fixed placement.');
        const fits = view.computeIsolated
          ? fixture.blueDemand <= DATA.unitsPerPlan && fixture.warmDemand <= DATA.unitsPerPlan
          : fixture.blueDemand + fixture.warmDemand <= DATA.unitsPerPlan;
        view.latestData = {
          source: 'Fixed warm-up DATA ONLY', httpStatus: 200, initialized: fixture.initialized,
          compatibleSessionProbe: true, dependencyProbe: true,
          blueDemandUnits: fixture.blueDemand, candidateWarmDemandUnits: fixture.warmDemand,
          unitsPerPool: DATA.unitsPerPlan, separatePools: view.computeIsolated,
        };
        if (!fits || !fixture.initialized) {
          view.phase = 'held';
          view.warmUp = 'failed';
          view.safeAborts++;
          result(view, 'negative', 'Safe abort before exposure',
            !fits ? 'Shared overlap demand 28 exceeds 24 compute units. Extra slots/content add no compute.'
              : 'HTTP 200 did not prove completed initialization. Ordinary user admissions remain blue.');
        } else {
          view.phase = 'ready';
          view.warmUp = 'passed';
          result(view, 'positive', 'Ready, no transition attempted',
            'Fixed meaningful warm-up and overlap checks passed. Subsequent client outcomes still require receipts.');
        }
        break;
      }
      case 'route': {
        requirePhase(view, 'ready', 'Verified meaningful warm-up is required before new admissions.');
        view.requestedPercent = 100;
        view.effectivePercent = view.fixture === 'missing-receipt' ? null : 100;
        view.pinnedSessions = view.fixture === 'pinned-client' ? 1 : 0;
        const newReceipts = [receipt('DATA-NEW-1', 'new-admission', 180), receipt('DATA-NEW-2', 'new-admission', 220)];
        if (view.fixture === 'session-loss') newReceipts[1].sessionPreserved = false;
        if (view.fixture === 'missing-receipt') {
          Object.assign(newReceipts[1], {
            observed: false, observedEndpoint: null, httpStatus: null, latencyMs: null,
            sessionPreserved: null, businessState: null, effectCount: null, completed: null, dependencyAvailable: null,
          });
        }
        if (view.fixture === 'pinned-client') newReceipts[1].observedEndpoint = DATA.blueEndpoint;
        if (view.fixture === 'dependency-outage') {
          newReceipts.forEach((item) => Object.assign(item, { httpStatus: 503, effectCount: 0, dependencyAvailable: false }));
        }
        recordReceipts(view, newReceipts, 'Fixed client transition observation, not a traffic-weight guarantee.');
        const oldWorkLost = view.strategy === 'shared-slots'
          || ['platform-restart', 'dependency-outage'].includes(view.fixture);
        if (oldWorkLost) {
          const oldReceipts = [receipt('DATA-OLD-1', 'existing-work', 350), receipt('DATA-OLD-2', 'existing-work', 420)];
          oldReceipts.forEach((item) => Object.assign(item, {
            httpStatus: 503, completed: false, effectCount: 0,
            dependencyAvailable: view.fixture !== 'dependency-outage',
          }));
          const reason = view.fixture === 'dependency-outage'
            ? 'Both placements depend on the same failed DATA dependency.'
            : view.strategy === 'shared-slots'
              ? 'Native swap recycling abandoned existing work despite retained slot content.'
              : 'A platform restart abandoned old work despite separate external routing.';
          recordReceipts(view, oldReceipts, reason);
          view.outstandingWork = 0;
        }
        view.latestData = {
          source: 'Fixed routing and client DATA ONLY', requestedNewAdmissions: 100,
          observedNewAdmissions: view.effectivePercent, pinnedBlueSessions: view.pinnedSessions,
          nativeSwapRecycling: view.strategy === 'shared-slots',
          platformRestart: view.fixture === 'platform-restart',
          sharedDependencyOutage: view.fixture === 'dependency-outage',
          journeyBudgetMs: DATA.journeyBudgetMs, newReceipts,
        };
        if (view.failed) {
          view.phase = 'exposed-held';
          const reason = view.fixture === 'dependency-outage' ? 'Shared dependency failure defeats both compute pools.'
            : view.fixture === 'platform-restart' ? 'External routing cannot prevent a platform restart.'
              : view.strategy === 'shared-slots' ? 'Native recycling is not application-controlled drain; retaining old slots cannot repair lost work.'
                : 'HTTP 200 did not preserve a required session.';
          result(view, 'negative', 'Interrupted synthetic transition', `${view.failed} interrupted journeys retained. ${reason}`);
        } else if (view.unknown) {
          view.phase = 'exposed-held';
          result(view, 'unknown', 'Unverified synthetic transition',
            view.pinnedSessions ? 'A blue success is not green migration evidence. A pinned session remains; retirement is blocked.'
              : 'One destination receipt is missing. Requested 100% is not observed migration; retirement is blocked.');
        } else {
          view.phase = 'exposed';
          result(view, 'positive', 'In progress: old work remains',
            'Two actual fixed green receipts passed. Two existing blue journeys continue; do not retire them yet.');
        }
        break;
      }
      case 'drain':
        if (view.strategy !== 'separate-plans') {
          throw new RangeError('Native swap recycling is not an application-controlled drain. Retaining a slot does not prevent recycling.');
        }
        requirePhase(view, 'exposed', 'Drain requires verified green admissions without failed or unknown transitions.');
        view.latestData = {
          source: 'Fixed drain DATA ONLY', oldNewAdmissions: 0,
          remainingWork: view.fixture === 'drain-pending' ? 2 : 0, remainingPinnedSessions: 0,
          completionObserved: view.fixture !== 'drain-pending',
        };
        if (view.fixture === 'drain-pending') {
          result(view, 'unknown', 'Incomplete synthetic drain', 'Two old journeys remain without completion receipts. Retention and retirement are blocked.');
        } else {
          recordReceipts(view, [receipt('DATA-OLD-1', 'existing-work', 350), receipt('DATA-OLD-2', 'existing-work', 420)],
            'Existing blue work completed within the original 500 ms fictional journey budget.');
          view.outstandingWork = 0;
          view.drainComplete = true;
          view.phase = 'retained';
          result(view, 'positive', 'Drain verified; rollback retention pending',
            'Four complete synthetic journeys passed. Retain the old deployment until its fixed rollback-window receipt is observed.');
        }
        break;
      case 'retain':
        requirePhase(view, 'retained', 'A positively completed drain is required before rollback-window verification.');
        if (view.retentionObserved) throw new RangeError('The fixed rollback-window receipt is already observed.');
        view.retentionObserved = true;
        view.latestData = { source: 'Fixed rollback-retention DATA ONLY', observedTick: DATA.retentionTick, realTimeWaited: false };
        result(view, 'positive', 'Retirement gates observed',
          'The fixed rollback-retention receipt passed. No real timer, resource retention or platform action occurred.');
        break;
      case 'retire':
        requirePhase(view, 'retained', 'Observe completed drain and rollback retention before retirement.');
        if (!view.drainComplete || !view.retentionObserved || view.outstandingWork !== 0
          || view.pinnedSessions !== 0 || view.effectivePercent !== 100 || view.failed || view.unknown) {
          throw new RangeError('Retirement requires observed zero work/sessions, routing, drain and rollback-retention gates.');
        }
        view.phase = 'retired';
        view.latestData = { source: 'Fixed retirement DATA ONLY', outstandingWork: 0, pinnedSessions: 0, oldNewAdmissions: 0 };
        result(view, 'positive', 'Uninterrupted synthetic transition',
          '4/4 complete synthetic journeys passed. Compute isolation and lifecycle control do not certify native or independent fault-domain behavior.');
        break;
    }
    view.history.push({
      step: view.history.length + 1, command: { ...command }, phase: view.phase,
      classification: view.classification, userOutcome: view.userOutcome, message: view.message,
      attempted: view.attempted, passed: view.passed, failed: view.failed, unknown: view.unknown,
      observation: view.latestData,
    });
    return view;
  }

  function replay(state) {
    closedObject(state, ['schemaVersion', 'commands'], 'State');
    if (state.schemaVersion !== 1 || !Array.isArray(state.commands)
      || Object.getPrototypeOf(state.commands) !== Array.prototype || state.commands.length > MAX_ACTIONS) {
      throw new TypeError('State requires schemaVersion 1 and at most 24 typed commands.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(state.commands);
    if (Reflect.ownKeys(descriptors).length !== state.commands.length + 1) {
      throw new TypeError('Command history cannot contain holes, extra or symbolic fields.');
    }
    const view = initialView();
    for (let index = 0; index < state.commands.length; index++) {
      if (!descriptors[index] || !Object.hasOwn(descriptors[index], 'value')) {
        throw new TypeError('Command history must contain ordinary values without accessors.');
      }
      apply(view, validateCommand(descriptors[index].value));
    }
    return view;
  }

  function initialState() {
    return freeze({ schemaVersion: 1, commands: [] });
  }

  function transition(state, input) {
    const view = replay(state);
    if (state.commands.length === MAX_ACTIONS) throw new RangeError('24-action limit reached; explicitly reset the rehearsal.');
    const command = validateCommand(input);
    apply(view, command);
    return freeze({ schemaVersion: 1, commands: [...state.commands.map((item) => ({ ...item })), command] });
  }

  return freeze({
    BANNER, MAX_ACTIONS, STRATEGIES, FIXTURES, DATA, parsePercent, initialState, transition,
    project: (state) => freeze(replay(state)),
  });
}));
