(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'SlotCookieLesson', { value: api });
}(globalThis, function () {
  'use strict';
  const limits = Object.freeze({ clients: 4, maxActions: 24, maxArchives: 3, maxRuns: 1000 });
  const pinnedIds = ['pinned-a', 'pinned-b'];
  function invalid(message) { throw new Error(`Invalid lesson input/state: ${message}`); }
  function record(value, label) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      invalid(`${label} must be a plain record.`);
    }
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value')) {
        invalid(`${label} must contain only enumerable data fields.`);
      }
    }
  }
  function fields(value, expected, label) {
    record(value, label);
    const actual = Object.keys(value).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
      invalid(`${label} has missing or extra fields.`);
    }
  }
  function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) {
      invalid(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
  }
  function list(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
        || Reflect.ownKeys(value).length !== value.length + 1) invalid(`${label} is not a bounded dense array.`);
    for (let index = 0; index < value.length; index += 1) {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) {
        invalid(`${label} must not contain holes or accessors.`);
      }
    }
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const copyAction = (action) => ({ ...action });
  function actionSchema(action) {
    record(action, 'action');
    switch (action.type) {
      case 'weight':
        fields(action, ['type', 'greenPercent'], 'weight action');
        integer(action.greenPercent, 0, 100, 'Nominal green percent');
        break;
      case 'replay':
      case 'retire':
        fields(action, ['type'], `${action.type} action`);
        break;
      case 'reassign':
        fields(action, ['type', 'clientId', 'result'], 'reassignment action');
        if (!pinnedIds.includes(action.clientId)) invalid('Select an originally blue-pinned client.');
        if (!['complete', 'interrupted', 'unknown'].includes(action.result)) invalid('Select a supported reply outcome.');
        break;
      default:
        invalid('Unsupported action.');
    }
  }
  function fixture() {
    return {
      greenPercent: 100, epoch: 1, inspected: false, blueRetired: false,
      clients: [
        { id: 'pinned-a', originalSlot: 'blue', cookie: 'blue', bucket: null, latest: null },
        { id: 'pinned-b', originalSlot: 'blue', cookie: 'blue', bucket: null, latest: null },
        { id: 'green-c', originalSlot: 'green', cookie: 'green', bucket: null, latest: null },
        { id: 'new-d', originalSlot: null, cookie: null, bucket: 75, latest: null }
      ],
      requests: [], timeline: []
    };
  }
  function freshGreen(client, core) {
    return client.latest !== null && client.latest.epoch === core.epoch
      && client.latest.result === 'complete' && client.latest.observed === 'green';
  }
  function migrated(core) {
    return core.clients.filter((client) => client.originalSlot === 'blue'
      && client.cookie === 'green' && freshGreen(client, core)).length;
  }
  function retirement(core) {
    if (core.blueRetired) return { state: 'retired', blockers: [] };
    const blockers = [];
    if (!core.inspected) blockers.push('Replay the cohort in the current routing epoch.');
    if (core.greenPercent !== 100) {
      blockers.push('Nominal green allocation must be 100% so new unpinned requests cannot reach blue.');
    }
    for (const client of core.clients) {
      if (client.cookie === 'blue') blockers.push(`${client.id} is still pinned to blue.`);
      if (!client.latest || client.latest.epoch !== core.epoch) {
        blockers.push(`${client.id} lacks fresh destination evidence.`);
      } else if (client.latest.result !== 'complete') {
        blockers.push(`${client.id} has an ${client.latest.result} reply.`);
      } else if (client.latest.observed !== 'green') {
        blockers.push(`${client.id} still reaches blue.`);
      }
    }
    return { state: blockers.length ? 'blocked' : 'ready', blockers };
  }
  function metrics(core) {
    const interrupted = core.requests.filter((request) => request.result === 'interrupted').length;
    const unknown = core.requests.filter((request) => request.result === 'unknown').length;
    const gate = retirement(core);
    return {
      attempted: core.requests.length,
      completed: core.requests.filter((request) => request.result === 'complete').length,
      interrupted, unknown, migrated: migrated(core),
      verdict: interrupted ? 'failure' : unknown || gate.state === 'blocked' ? 'unknown' : 'success'
    };
  }
  function observe(core, client, result, step, cookieBefore = client.cookie) {
    const requested = client.cookie || (client.bucket < core.greenPercent ? 'green' : 'blue');
    const request = {
      number: core.requests.length + 1, step, epoch: core.epoch, clientId: client.id,
      cookieBefore, cookieAfter: client.cookie, requested,
      observed: result === 'unknown' ? null : requested, result,
      status: result === 'complete' ? 200 : result === 'interrupted' ? 503 : null
    };
    core.requests.push(request);
    client.latest = request;
  }
  function replayEvents(events) {
    list(events, limits.maxActions, 'events');
    const core = fixture();
    events.forEach((action, index) => {
      actionSchema(action);
      if (core.blueRetired) invalid('Blue is retired; archive and reset before another action.');
      const step = index + 1;
      let outcome;
      let note;
      switch (action.type) {
        case 'weight':
          core.greenPercent = action.greenPercent;
          core.epoch += 1;
          core.inspected = false;
          outcome = 'configured';
          note = `Nominal green ${action.greenPercent}%; slot pins unchanged. Earlier observations are stale.`;
          break;
        case 'replay':
          core.clients.forEach((client) => observe(core, client, 'complete', step));
          core.inspected = true;
          outcome = 'observed';
          note = 'Four deterministic client requests completed. Cookie destinations override nominal allocation.';
          break;
        case 'reassign': {
          if (!core.inspected) invalid('Replay the cohort in this routing epoch before reassignment.');
          const client = core.clients.find((entry) => entry.id === action.clientId);
          const previousCookie = client.cookie;
          client.cookie = 'green';
          observe(core, client, action.result, step, previousCookie);
          outcome = action.result;
          note = `${client.id}: synthetic slot pin set to green; reply ${action.result}. No real cookie changed.`;
          break;
        }
        case 'retire': {
          const gate = retirement(core);
          core.blueRetired = gate.state === 'ready';
          outcome = core.blueRetired ? 'retired' : 'blocked';
          note = core.blueRetired ? 'All four clients have fresh completed green evidence. Synthetic blue retired.'
            : `Blue retained: ${gate.blockers.join(' ')}`;
          break;
        }
      }
      core.timeline.push({ step, action: copyAction(action), outcome, note, ...metrics(core) });
    });
    return core;
  }
  function validate(state) {
    fields(state, ['schemaVersion', 'run', 'events', 'archives', 'evicted'], 'state');
    if (state.schemaVersion !== 1) invalid('Unsupported state version.');
    integer(state.run, 1, limits.maxRuns, 'Run number');
    integer(state.evicted, 0, limits.maxRuns - 1, 'Evicted run count');
    list(state.archives, limits.maxArchives, 'archives');
    if (state.archives.length !== Math.min(state.run - 1, limits.maxArchives)
        || state.evicted !== Math.max(0, state.run - 1 - limits.maxArchives)) {
      invalid('Run/archive/eviction accounting does not match.');
    }
    const archived = state.archives.map((archive, index) => {
      fields(archive, ['run', 'events'], 'archived run');
      if (archive.run !== state.evicted + index + 1) invalid('Archived run order does not match.');
      const core = replayEvents(archive.events);
      if (archive.events.length === 0) invalid('Empty runs are not archived.');
      return core;
    });
    return { current: replayEvents(state.events), archived };
  }
  function copyState(state) {
    return {
      schemaVersion: 1, run: state.run, events: state.events.map(copyAction),
      archives: state.archives.map((archive) => ({ run: archive.run, events: archive.events.map(copyAction) })),
      evicted: state.evicted
    };
  }
  function create() {
    return freeze({ schemaVersion: 1, run: 1, events: [], archives: [], evicted: 0 });
  }
  function apply(state, action) {
    validate(state);
    actionSchema(action);
    if (state.events.length === limits.maxActions) invalid('24-action limit reached; archive and reset.');
    const next = copyState(state);
    next.events.push(copyAction(action));
    replayEvents(next.events);
    return freeze(next);
  }
  function reset(state) {
    validate(state);
    const next = copyState(state);
    if (next.events.length === 0) return freeze(next);
    if (next.run === limits.maxRuns) invalid('1000-run lifetime limit reached; reload for a new in-memory lesson.');
    next.archives.push({ run: next.run, events: next.events });
    if (next.archives.length > limits.maxArchives) {
      next.archives.shift();
      next.evicted += 1;
    }
    next.run += 1;
    next.events = [];
    return freeze(next);
  }
  function clientView(core) {
    return core.clients.map((client) => ({
      id: client.id, originalSlot: client.originalSlot, cookie: client.cookie, bucket: client.bucket,
      requested: client.latest?.requested ?? null, observed: client.latest?.observed ?? null,
      result: client.latest?.result ?? 'unobserved', status: client.latest?.status ?? null,
      fresh: client.latest !== null && client.latest.epoch === core.epoch,
      migrated: client.originalSlot === 'blue' && client.cookie === 'green' && freshGreen(client, core)
    }));
  }
  function inspect(state) {
    const { current, archived } = validate(state);
    return freeze({
      run: state.run, greenPercent: current.greenPercent, epoch: current.epoch,
      inspected: current.inspected, blueRetired: current.blueRetired,
      ...metrics(current), retirement: retirement(current), clients: clientView(current),
      requests: current.requests, timeline: current.timeline,
      actionsRemaining: limits.maxActions - state.events.length, evicted: state.evicted,
      archives: state.archives.map((archive, index) => ({
        run: archive.run, events: archive.events.map(copyAction),
        summary: metrics(archived[index]), retirement: retirement(archived[index]),
        clients: clientView(archived[index]), requests: archived[index].requests,
        timeline: archived[index].timeline
      }))
    });
  }
  return Object.freeze({ limits, create, apply, reset, inspect });
}));
