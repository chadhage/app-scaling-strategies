(function (root) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_ACTIONS = 12;
  const SELECTORS = {
    'build-1-only': { app: 'profile-lesson', build: 'build-1' },
    'build-2-only': { app: 'profile-lesson', build: 'build-2' },
    'app-only': { app: 'profile-lesson' },
    'no-match': { app: 'no-such-lesson' },
  };
  const FIXTURES = {
    compatible: 'Compatible, authorized, complete',
    'private-preview-leak': 'Private preview callback admits GA',
    'contract-break': 'Correct build, incompatible API contract',
    'state-loss': 'HTTP 200, lost cart state',
    'slow-200': 'HTTP 200, original budget exceeded',
    'incomplete-journey': 'Route and HTTP 200, completion unknown',
    'unobserved-route': 'Desired route, destination unknown',
    'authorization-unknown': 'One private-path authorization unknown',
    'wrong-backend': 'Observed preview destination is the GA build',
  };
  const ROUTING = ['cohort-gateway', 'deployments-only', 'unverified-gateway'];
  const PRIVATE_PATHS = ['preview-gateway', 'preview-service', 'preview-navigation', 'preview-callback'];
  const DEPLOYMENTS = [
    { id: 'fictional-ga-deployment', audience: 'GA', softwareVersion: 'build-1', apiContract: 'profile-v1' },
    { id: 'fictional-preview-deployment', audience: 'preview', softwareVersion: 'build-2', apiContract: 'profile-v1' },
  ];
  const PODS = DEPLOYMENTS.flatMap((deployment) => ['a', 'b'].map((suffix) => ({
    id: `fictional-${deployment.audience}-pod-${suffix}`, deploymentId: deployment.id,
    audience: deployment.audience, softwareVersion: deployment.softwareVersion,
    apiContract: deployment.apiContract, labels: { app: 'profile-lesson', build: deployment.softwareVersion },
  })));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function error(code, message) {
    const failure = new TypeError(message);
    failure.code = code;
    throw failure;
  }
  // Validate descriptors before reading values: getters must never run as input.
  function dataCopy(value, code, depth = 0, seen = new Set(), budget = { count: 0 }) {
    if (++budget.count > 20000 || depth > 18) error(code, 'DATA structure exceeds the bounded envelope.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string' && value.length <= 2048) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') error(code, 'Only finite plain DATA values are accepted.');
    if (seen.has(value)) error(code, 'Cyclic DATA is not accepted.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
      error(code, 'Only ordinary objects and arrays are accepted.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) error(code, 'Symbol fields are not accepted.');
    if (array && (value.length > 200 || keys.length !== value.length + 1
        || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) {
      error(code, 'Sparse or extended arrays are not accepted.');
    }
    seen.add(value);
    const copy = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        error(code, 'Accessors and hidden fields are not accepted.');
      }
      Object.defineProperty(copy, key, {
        value: dataCopy(descriptor.value, code, depth + 1, seen, budget),
        enumerable: true, writable: true, configurable: true,
      });
    }
    seen.delete(value);
    return copy;
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  function commandData(command, code = 'ERR_INPUT') {
    const copy = dataCopy(command, code);
    const fields = ['action', 'gaSelector', 'previewSelector', 'routing', 'fixture'];
    if (!copy || Array.isArray(copy) || typeof copy !== 'object'
        || stable(Object.keys(copy).sort()) !== stable(fields.sort())) error(code, 'Exact command fields are required.');
    for (const field of fields) if (typeof copy[field] !== 'string') error(code, `${field} must be an exact string token.`);
    if (!['inspect', 'route', 'verify'].includes(copy.action)
        || !Object.hasOwn(SELECTORS, copy.gaSelector) || !Object.hasOwn(SELECTORS, copy.previewSelector)
        || !ROUTING.includes(copy.routing) || !Object.hasOwn(FIXTURES, copy.fixture)) {
      error(code, 'Choose only the listed fictional action, selector, routing and fixture tokens.');
    }
    return copy;
  }
  function choiceOf(command) {
    const { gaSelector, previewSelector, routing, fixture } = command;
    return { gaSelector, previewSelector, routing, fixture };
  }
  function grade(statuses) {
    return statuses.includes('failed') ? 'failed' : statuses.includes('unknown') ? 'unknown' : 'passed';
  }
  function unknown(section) {
    return { status: 'unknown', note: `${section} has not been independently observed.` };
  }
  function baseline() {
    return {
      schemaVersion: 1, choice: null, topology: { ...unknown('Selectors'), services: [], capability: unknown('Routing capability') },
      traffic: { ...unknown('Destinations'), receipts: [] },
      journeys: { ...unknown('Complete journeys'), items: [] },
      authorization: { ...unknown('Private-preview access'), probes: [], routeLeak: null },
      history: [],
    };
  }
  function topologyFor(choice) {
    const services = ['GA', 'preview'].map((audience) => {
      const selectorId = audience === 'GA' ? choice.gaSelector : choice.previewSelector;
      const expectedBuild = audience === 'GA' ? 'build-1' : 'build-2';
      const matches = PODS.filter((pod) => Object.entries(SELECTORS[selectorId])
        .every(([key, value]) => pod.labels[key] === value));
      const builds = [...new Set(matches.map((pod) => pod.softwareVersion))];
      const status = matches.length > 0 && matches.every((pod) => pod.softwareVersion === expectedBuild
        && pod.audience === audience) ? 'passed' : 'failed';
      return {
        id: `fictional-${audience}-service`, audience, selectorId, selectorData: SELECTORS[selectorId],
        expectedBuild, matchedPods: matches.map((pod) => pod.id), matchedBuilds: builds, status,
        note: !matches.length ? 'Empty endpoint set cannot pass.'
          : builds.length > 1 ? 'App-only selector mixes GA and private preview builds.'
            : status === 'failed' ? 'Selector chooses the wrong audience/build.' : 'Version-separated endpoint DATA.',
      };
    });
    const capabilityStatus = choice.routing === 'cohort-gateway' ? 'passed'
      : choice.routing === 'deployments-only' ? 'failed' : 'unknown';
    const capability = {
      status: capabilityStatus, source: choice.routing,
      note: choice.routing === 'deployments-only'
        ? 'Deployment objects alone do not supply weighted user routing.'
        : choice.routing === 'unverified-gateway' ? 'Gateway capability is unverified, not assumed.'
          : 'Fixed fictional capable-gateway DATA, not installed or configured routing.',
    };
    return { status: grade([...services.map((service) => service.status), capability.status]), services, capability,
      note: 'Selectors choose endpoint DATA. Labels are not preview authorization or API contracts.' };
  }
  function trafficFor(state) {
    const { choice } = state;
    const receipts = state.topology.services.map((service) => {
      const missing = choice.routing !== 'cohort-gateway'
        || (choice.fixture === 'unobserved-route' && service.audience === 'preview');
      let pod = PODS.find((item) => item.id === service.matchedPods.at(-1));
      if (choice.fixture === 'wrong-backend' && service.audience === 'preview' && !missing) pod = PODS[0];
      const observedPod = missing ? null : pod?.id ?? null;
      const observedSoftwareVersion = missing ? null : pod?.softwareVersion ?? null;
      const observedService = missing || !pod ? null
        : choice.fixture === 'wrong-backend' && service.audience === 'preview' ? 'fictional-GA-service' : service.id;
      const httpStatus = missing ? null : pod ? 200 : 503;
      const status = missing ? 'unknown' : pod && observedSoftwareVersion === service.expectedBuild
        && observedService === service.id ? 'passed' : 'failed';
      return {
        id: `fictional-${service.audience}-route`, audience: service.audience,
        desiredService: service.id, expectedSoftwareVersion: service.expectedBuild,
        observedService, observedPod, observedSoftwareVersion, httpStatus, status,
        note: missing ? 'Actual fictional destination unavailable; desired routing is not evidence.'
          : status === 'failed' ? 'Observed destination does not preserve this cohort.' : 'Observed finite destination DATA only.',
      };
    });
    return { status: grade(receipts.map((receipt) => receipt.status)), receipts,
      note: 'Two fixed receipts are not statistical weight validation or authorized complete journeys.' };
  }
  function checkEqual(actual, expected) { return actual === null ? 'unknown' : actual === expected ? 'passed' : 'failed'; }
  function journeysFor(state) {
    const items = state.traffic.receipts.map((receipt) => {
      const preview = receipt.audience === 'preview';
      const fixture = state.choice.fixture;
      const missing = receipt.httpStatus === null;
      const unavailable = receipt.httpStatus === 503;
      const incomplete = preview && fixture === 'incomplete-journey';
      const observed = (value) => missing || unavailable ? null : value;
      const principalBefore = `fictional-${receipt.audience}-learner`;
      const sessionBefore = `fictional-${receipt.audience}-session-7`;
      const responseApiContract = observed(preview && fixture === 'contract-break' ? 'profile-v2-breaking' : 'profile-v1');
      const stateAfter = observed(incomplete ? null : preview && fixture === 'state-loss' ? 'cart:0' : 'cart:3');
      const elapsedMs = observed(incomplete ? null : preview && fixture === 'slow-200' ? 450 : preview ? 210 : 180);
      const completed = missing ? null : unavailable ? false : incomplete ? null : true;
      const authorized = observed(!(receipt.audience === 'GA' && receipt.observedSoftwareVersion === 'build-2'));
      const cartItems = stateAfter === null ? null : stateAfter === 'cart:3' ? 3 : 0;
      const incompatiblePayload = preview && fixture === 'contract-break' && !missing && !unavailable;
      const payload = incompatiblePayload ? { fullName: 'Fictional Learner', cartItems }
        : { displayName: observed('Fictional Learner'), cartItems };
      const steps = ['login', 'callback', 'navigation', 'profile', 'cart'].map((step) => ({
        step, status: missing ? 'unknown' : unavailable ? 'failed'
          : step === 'profile' ? grade([checkEqual(responseApiContract, 'profile-v1'),
            checkEqual(payload.displayName, 'Fictional Learner')])
            : step === 'cart' ? checkEqual(stateAfter, 'cart:3') : 'passed',
      }));
      const principalAfter = observed(principalBefore);
      const sessionAfter = observed(sessionBefore);
      const effectCount = observed(incomplete ? null : 1);
      const status = grade([
        checkEqual(receipt.observedSoftwareVersion, receipt.expectedSoftwareVersion),
        checkEqual(receipt.httpStatus, 200), checkEqual(responseApiContract, 'profile-v1'),
        checkEqual(authorized, true), checkEqual(principalAfter, principalBefore),
        checkEqual(sessionAfter, sessionBefore), checkEqual(stateAfter, 'cart:3'),
        checkEqual(payload.displayName, 'Fictional Learner'), checkEqual(payload.cartItems, 3),
        checkEqual(completed, true), checkEqual(effectCount, 1),
        elapsedMs === null ? 'unknown' : elapsedMs <= 400 ? 'passed' : 'failed',
        ...steps.map((step) => step.status),
      ]);
      return {
        id: `fictional-${receipt.audience}-journey`, audience: receipt.audience,
        expectedSoftwareVersion: receipt.expectedSoftwareVersion, observedSoftwareVersion: receipt.observedSoftwareVersion,
        requestApiContract: 'profile-v1', responseApiContract, httpStatus: receipt.httpStatus,
        authorized, principalBefore, principalAfter, sessionBefore, sessionAfter,
        stateBefore: 'cart:3', stateAfter, payload, steps, completed, effectCount, elapsedMs, originalBudgetMs: 400, status,
      };
    });
    return { status: grade(items.map((item) => item.status)), items,
      note: 'Login, callback, navigation, compatible payload, cart, one effect and original budget are independent checks.' };
  }
  function authorizationFor(state) {
    const probes = PRIVATE_PATHS.flatMap((entryPath) => ['GA', 'preview'].map((audience) => {
      const denied = audience === 'GA';
      const target = denied && entryPath === 'preview-callback';
      const missing = target && state.choice.fixture === 'authorization-unknown';
      const leaked = target && state.choice.fixture === 'private-preview-leak';
      const observedHttpStatus = missing ? null : denied && !leaked ? 403 : 200;
      const candidateReached = missing ? null : !denied || leaked;
      return {
        id: `fictional-${entryPath}-${audience}`, entryPath, audience, targetSoftwareVersion: 'build-2',
        expectedPermission: denied ? 'denied' : 'allowed', observedHttpStatus, candidateReached,
        status: grade([checkEqual(observedHttpStatus, denied ? 403 : 200), checkEqual(candidateReached, !denied)]),
      };
    }));
    const gaRoute = state.traffic.receipts.find((receipt) => receipt.audience === 'GA');
    const routeLeak = gaRoute.httpStatus === null ? null
      : gaRoute.httpStatus === 200 && gaRoute.observedSoftwareVersion === 'build-2';
    return {
      status: grade([...probes.map((probe) => probe.status), checkEqual(routeLeak, false)]), probes, routeLeak,
      note: 'Every declared private path needs allow/deny observations. Zero GA selection to preview is not access control.',
    };
  }
  function apply(state, command) {
    let next = dataCopy(state, 'ERR_STATE');
    const choice = choiceOf(command);
    let held = false;
    let note;
    if (command.action === 'inspect') {
      next = { ...baseline(), history: next.history, choice };
      next.topology = topologyFor(choice);
      note = 'Inspected selected endpoint and capability DATA; prior route/journey/access observations cleared.';
    } else if (stable(choice) !== stable(next.choice) || !next.topology.services.length
        || (command.action === 'verify' && !next.traffic.receipts.length)) {
      held = true;
      note = 'Failed hold: inspect these exact controls first, then observe routes before verifying journeys and access.';
    } else if (command.action === 'route') {
      next.traffic = trafficFor(next);
      next.journeys = { ...unknown('Complete journeys'), items: [] };
      next.authorization = { ...unknown('Private-preview access'), probes: [], routeLeak: null };
      note = 'Recorded destinations independently; complete journeys and authorization still require verification.';
    } else {
      next.journeys = journeysFor(next);
      next.authorization = authorizationFor(next);
      note = 'Recorded both attempted complete journeys and all eight private-path permission probes.';
    }
    const stageStatus = held ? 'failed' : command.action === 'inspect' ? next.topology.status
      : command.action === 'route' ? next.traffic.status : grade([next.journeys.status, next.authorization.status]);
    next.history.push({
      sequence: next.history.length + 1, command, held, stageStatus, note,
      measured: { topology: next.topology.status, traffic: next.traffic.status,
        journeys: next.journeys.status, authorization: next.authorization.status },
    });
    return next;
  }
  function stateData(state) {
    const copy = dataCopy(state, 'ERR_STATE');
    if (!copy || copy.schemaVersion !== 1 || !Array.isArray(copy.history) || copy.history.length > MAX_ACTIONS) {
      error('ERR_STATE', 'A bounded version-1 rehearsal state is required.');
    }
    let replay = baseline();
    for (const event of copy.history) {
      if (!event || typeof event !== 'object' || !Object.hasOwn(event, 'command')) error('ERR_STATE', 'Malformed history.');
      replay = apply(replay, commandData(event.command, 'ERR_STATE'));
    }
    if (stable(copy) !== stable(replay)) error('ERR_STATE', 'State or retained evidence differs from deterministic history replay.');
    return replay;
  }
  function createState() { return freeze(baseline()); }
  function transition(state, command) {
    const replay = stateData(state);
    const typed = commandData(command);
    if (replay.history.length === MAX_ACTIONS) error('ERR_LIMIT', 'Twelve actions retained. Reset explicitly to start another rehearsal.');
    return freeze(apply(replay, typed));
  }
  function summarize(state) {
    const replay = stateData(state);
    const held = replay.history.at(-1)?.held === true;
    const status = held ? 'failed' : grade([replay.topology.status, replay.traffic.status,
      replay.journeys.status, replay.authorization.status]);
    const items = replay.journeys.items;
    return freeze({
      status, attempts: items.length, passed: items.filter((item) => item.status === 'passed').length,
      failed: items.filter((item) => item.status === 'failed').length,
      unknown: items.filter((item) => item.status === 'unknown').length,
      actions: replay.history.length,
      note: held ? replay.history.at(-1).note : status === 'passed'
        ? 'Only this finite fictional rehearsal passes; no native Azure, source-parent or five-nines claim.'
        : 'Any failed or missing selector, destination, authorization or complete-journey observation prevents a pass.',
    });
  }
  const api = freeze({ BANNER, MAX_ACTIONS, DATA: { SELECTORS, FIXTURES, ROUTING, PRIVATE_PATHS, DEPLOYMENTS, PODS },
    createState, transition, summarize });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S128Lesson = api;
}(globalThis));
