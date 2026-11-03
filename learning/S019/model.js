'use strict';

(function expose(root) {
  const tenants = ['alpha', 'beta'];
  const conditions = ['healthy', 'unready', 'wrong-state', 'unknown'];
  const commands = ['select', 'create', 'observe', 'sync', 'sourceWrite', 'transfer', 'route', 'fence', 'journey'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const other = (tenant) => tenants.find((name) => name !== tenant);
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const shape = (value, keys) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
  const journal = (value) => Array.isArray(value) && value.length <= 14
    && value.every((write, index) => write === index + 1);
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const invalid = (message) => { throw new TypeError(`Invalid ${message}`); };
  const requireState = (condition) => { if (!condition) invalid('state: inconsistent bounded handoff record'); };

  function validate(state) {
    requireState(shape(state, ['version', 'run', 'tenant', 'targetCreated', 'observation',
      'owners', 'routes', 'expected', 'cells', 'trace', 'journeys']));
    requireState(state.version === 1 && integer(state.run, 1, 9999) && tenants.includes(state.tenant)
      && typeof state.targetCreated === 'boolean' && conditions.includes(state.observation));
    requireState(shape(state.owners, tenants) && shape(state.routes, tenants)
      && shape(state.expected, tenants) && shape(state.cells, ['A', 'B'])
      && shape(state.cells.A, tenants) && shape(state.cells.B, tenants));
    for (const tenant of tenants) {
      const owner = state.owners[tenant];
      requireState(shape(owner, ['cell', 'epoch']) && ['A', 'B'].includes(owner.cell)
        && owner.epoch === (owner.cell === 'A' ? 1 : 2)
        && ['A', 'B'].includes(state.routes[tenant]));
      requireState(journal(state.expected[tenant]) && journal(state.cells.A[tenant]) && journal(state.cells.B[tenant]));
      requireState(state.expected[tenant].length >= (tenant === 'alpha' ? 2 : 1)
        && state.cells.A[tenant].length >= (tenant === 'alpha' ? 2 : 1)
        && state.cells.A[tenant].length <= state.expected[tenant].length
        && state.cells.B[tenant].length <= state.expected[tenant].length
        && same(state.cells[owner.cell][tenant], state.expected[tenant]));
      if (tenant !== state.tenant) {
        requireState(owner.cell === 'A' && state.routes[tenant] === 'A' && state.cells.B[tenant].length === 0);
      }
      if (!state.targetCreated) {
        requireState(owner.cell === 'A' && state.routes[tenant] === 'A' && state.cells.B[tenant].length === 0);
      }
      if (state.routes[tenant] === 'B') requireState(owner.cell === 'B');
    }
    if (!state.targetCreated) requireState(state.observation === 'healthy');
    requireState(Array.isArray(state.trace) && state.trace.length <= 48);
    state.trace.forEach((event, index) => {
      requireState(shape(event, ['step', 'action', 'status', 'detail'])
        && event.step === index + 1 && commands.includes(event.action)
        && ['applied', 'blocked'].includes(event.status)
        && typeof event.detail === 'string' && event.detail.length > 0 && event.detail.length <= 240);
    });
    const applied = (type) => state.trace.filter((event) => event.action === type && event.status === 'applied').length;
    requireState(applied('create') === Number(state.targetCreated)
      && applied('transfer') === Number(state.owners[state.tenant].cell === 'B')
      && applied('route') === Number(state.routes[state.tenant] === 'B'));
    requireState(Array.isArray(state.journeys) && state.journeys.length <= 16
      && state.journeys.length % 2 === 0 && applied('journey') * 2 === state.journeys.length);
    state.journeys.forEach((row, index) => {
      requireState(shape(row, ['batch', 'tenant', 'route', 'owner', 'epoch', 'classification',
        'httpStatus', 'expectedRevision', 'observedRevision', 'acknowledgedWrite']));
      requireState(row.batch === Math.floor(index / 2) + 1
        && row.tenant === (index % 2 === 0 ? state.tenant : other(state.tenant))
        && ['A', 'B'].includes(row.route) && ['A', 'B'].includes(row.owner)
        && row.epoch === (row.route === 'A' ? 1 : 2)
        && ['success', 'failure', 'unknown'].includes(row.classification)
        && integer(row.expectedRevision, 1, 14)
        && (row.observedRevision === null || integer(row.observedRevision, 0, 14)));
      if (row.classification === 'success') {
        requireState(row.httpStatus === 200 && row.route === row.owner
          && row.observedRevision === row.expectedRevision && row.acknowledgedWrite === row.expectedRevision);
      } else {
        requireState(row.acknowledgedWrite === null);
        if (row.classification === 'unknown') requireState(row.httpStatus === null && row.observedRevision === null);
        else requireState([200, 409, 503].includes(row.httpStatus));
      }
    });
    return state;
  }

  function createRun(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(options))
        || Reflect.ownKeys(options).some((key) => !['tenant', 'run'].includes(key))) invalid('configuration');
    const { tenant = 'alpha', run = 1 } = options;
    if (!tenants.includes(tenant) || !integer(run, 1, 9999)) invalid('configuration');
    return freeze(validate({
      version: 1, run, tenant, targetCreated: false, observation: 'healthy',
      owners: { alpha: { cell: 'A', epoch: 1 }, beta: { cell: 'A', epoch: 1 } },
      routes: { alpha: 'A', beta: 'A' },
      expected: { alpha: [1, 2], beta: [1] },
      cells: { A: { alpha: [1, 2], beta: [1] }, B: { alpha: [], beta: [] } },
      trace: [], journeys: []
    }));
  }

  function commitWrite(state, tenant, cell, epoch) {
    const owner = state.owners[tenant];
    if (owner.cell !== cell || owner.epoch !== epoch) return null;
    if (state.expected[tenant].length >= 14) throw new RangeError('Limit: 14 acknowledged writes per tenant; archive and reset.');
    const revision = state.expected[tenant].length + 1;
    state.expected[tenant].push(revision);
    state.cells[cell][tenant].push(revision);
    return revision;
  }

  function journey(state, tenant, batch) {
    const route = state.routes[tenant];
    const owner = state.owners[tenant].cell;
    const row = {
      batch, tenant, route, owner, epoch: route === 'A' ? 1 : 2,
      classification: 'failure', httpStatus: 409,
      expectedRevision: state.expected[tenant].length,
      observedRevision: state.cells[route][tenant].length, acknowledgedWrite: null
    };
    if (route !== owner) return row;
    if (route === 'B' && state.observation !== 'healthy') {
      row.observedRevision = null;
      if (state.observation === 'unknown') {
        row.classification = 'unknown';
        row.httpStatus = null;
      } else if (state.observation === 'unready') {
        row.httpStatus = 503;
      } else {
        row.httpStatus = 200;
        row.observedRevision = row.expectedRevision - 1;
      }
      return row;
    }
    const revision = commitWrite(state, tenant, route, row.epoch);
    if (revision !== null) {
      row.classification = 'success';
      row.httpStatus = 200;
      row.expectedRevision = revision;
      row.observedRevision = revision;
      row.acknowledgedWrite = revision;
    }
    return row;
  }

  function act(state, action) {
    validate(state);
    if (!action || !commands.includes(action.type)) invalid('action');
    const keys = action.type === 'select' ? ['type', 'tenant']
      : action.type === 'observe' ? ['type', 'value'] : ['type'];
    if (!shape(action, keys)) invalid('action fields');
    if (action.type === 'select' && !tenants.includes(action.tenant)) invalid('tenant selection');
    if (action.type === 'observe' && !conditions.includes(action.value)) invalid('observation');
    if (state.trace.length >= 48) throw new RangeError('Limit: 48 actions per run; archive and reset.');
    if (action.type === 'journey' && state.journeys.length >= 16) {
      throw new RangeError('Limit: 8 journey batches per run; archive and reset.');
    }
    const next = clone(state);
    const tenant = next.tenant;
    const owner = next.owners[tenant];
    const synchronized = () => same(next.cells.B[tenant], next.expected[tenant]);
    let status = 'applied';
    let detail = '';
    const block = (reason) => { status = 'blocked'; detail = reason; };
    switch (action.type) {
      case 'select':
        if (next.trace.length > 0) block('Tenant selection is locked after the first action; archive and reset.');
        else {
          next.tenant = action.tenant;
          return freeze(validate(next));
        }
        break;
      case 'create':
        if (next.targetCreated) block('Cell B already exists; no duplicate capacity was added.');
        else {
          next.targetCreated = true;
          detail = 'Created isolated cell B: workers B-1/B-2, empty data store, 100 synthetic rps.';
        }
        break;
      case 'observe':
        if (!next.targetCreated) block('Create cell B before setting its observation condition.');
        else {
          next.observation = action.value;
          detail = `Cell B observation changed to ${action.value}; earlier journey evidence is retained.`;
        }
        break;
      case 'sync':
        if (!next.targetCreated || next.observation !== 'healthy') block('Synchronization requires created, healthy cell B with known observations.');
        else if (owner.cell !== 'A') block('A is fenced; a stale source copy must not overwrite the new owner.');
        else {
          next.cells.B[tenant] = [...next.expected[tenant]];
          detail = `Synchronized ${tenant} through acknowledged write ${next.expected[tenant].length}; routing is unchanged.`;
        }
        break;
      case 'sourceWrite': {
        const revision = commitWrite(next, tenant, 'A', 1);
        if (revision === null) block('Source writer epoch 1 is fenced; no acknowledged write was added.');
        else detail = `A acknowledged ${tenant} write ${revision}; any older B snapshot is now stale.`;
        break;
      }
      case 'transfer':
        if (!next.targetCreated || next.observation !== 'healthy' || !synchronized()) {
          block('Ownership blocked: synchronize every acknowledged write into healthy cell B first.');
        } else if (owner.cell !== 'A') block('Exclusive ownership already belongs to B at epoch 2.');
        else {
          next.owners[tenant] = { cell: 'B', epoch: 2 };
          detail = `Atomically fenced A epoch 1 and assigned exclusive ${tenant} ownership to B epoch 2; route still names A.`;
        }
        break;
      case 'route':
        if (!next.targetCreated || next.observation !== 'healthy' || owner.cell !== 'B' || !synchronized()) {
          block('Route blocked: synchronized healthy capacity and exclusive B epoch-2 ownership are required.');
        } else if (next.routes[tenant] === 'B') block('The selected tenant already routes to B; the other tenant remains in A.');
        else {
          next.routes[tenant] = 'B';
          detail = `Routed only ${tenant} to its exclusive owner B; ${other(tenant)} remains in A.`;
        }
        break;
      case 'fence':
        if (owner.cell !== 'B') block('Transfer exclusive ownership before exercising the old writer.');
        else {
          const revision = commitWrite(next, tenant, 'A', 1);
          if (revision !== null) throw new Error('Safety invariant: the old writer was not fenced.');
          detail = 'Old source writer epoch 1 rejected (HTTP 409); no acknowledged write was added.';
        }
        break;
      case 'journey': {
        const batch = next.journeys.length / 2 + 1;
        next.journeys.push(journey(next, tenant, batch), journey(next, other(tenant), batch));
        detail = `Batch ${batch}: read/append journeys for ${tenant} and unaffected ${other(tenant)}; all observations retained.`;
        break;
      }
    }
    next.trace.push({ step: next.trace.length + 1, action: action.type, status, detail });
    return freeze(validate(next));
  }

  function inspect(state) {
    validate(state);
    const count = (classification) => state.journeys.filter((row) => row.classification === classification).length;
    const failed = count('failure');
    const unknown = count('unknown');
    const fenceChecks = state.trace.filter((event) => event.action === 'fence' && event.status === 'applied').length;
    let completedBatches = 0;
    for (let index = 0; index < state.journeys.length; index += 2) {
      const [moved, unaffected] = state.journeys.slice(index, index + 2);
      if (moved.route === 'B' && moved.classification === 'success'
          && unaffected.route === 'A' && unaffected.classification === 'success') completedBatches += 1;
    }
    const synchronized = state.targetCreated && same(state.cells.B[state.tenant], state.expected[state.tenant]);
    const qualified = state.routes[state.tenant] === 'B' && synchronized
      && state.observation === 'healthy' && completedBatches > 0 && fenceChecks > 0;
    return freeze({
      verdict: failed > 0 ? 'failure' : unknown > 0 || !qualified ? 'unknown' : 'success',
      reason: failed > 0 ? 'A measured user failure remains cumulative, even after recovery.'
        : unknown > 0 ? 'Missing observations remain unknown, even after recovery.'
          : qualified ? 'Selected tenant moved with every write, an old-writer rejection, and usable unaffected service.'
            : 'Not demonstrated: complete synchronization, exclusive handoff, routing, old-writer check and both journeys.',
      successful: count('success'), failed, unknown, attempts: state.journeys.length,
      blocked: state.trace.filter((event) => event.status === 'blocked').length,
      fenceChecks, completedBatches, synchronized,
      phase: !state.targetCreated ? 'source-only' : state.owners[state.tenant].cell === 'A'
        ? synchronized ? 'synchronized' : 'copy-needed'
        : state.routes[state.tenant] === 'A' ? 'owner-only' : 'routed',
      capacity: {
        allocatedRps: state.targetCreated ? 200 : 100,
        readyRps: state.targetCreated && state.observation === 'unknown' ? null
          : state.targetCreated && state.observation === 'healthy' ? 200 : 100,
        workers: state.targetCreated ? ['A-1', 'A-2', 'B-1', 'B-2'] : ['A-1', 'A-2']
      }
    });
  }

  const api = Object.freeze({ createRun, act, inspect });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.S019Lesson = api;
}(typeof globalThis === 'undefined' ? this : globalThis));
