'use strict';

// The lease store: the ONLY place that decides who owns a target and the only place the state changes. Every function takes the subject of the
// verified token first and can reach nothing that subject does not own: a lease of another owner, an ended or expired lease and an id that
// exists nowhere are the same `null` to everything above this file, so no answer, count or timing can tell them apart. Reads are pure. A
// mutation is applied to a private draft of the state (reaped of expired leases) and kept only when it succeeds, so a refusal, a conflict
// or an over-quota creation has no effect; mutations are linearized by the caller, and every one of them resolves its targets again here.
const { randomBytes } = require('node:crypto');
const contract = require('./contract.js');

const KIND_FOLDERS = Object.freeze(Object.fromEntries(Object.entries(contract.folders).map(([folder, kind]) => [kind, folder])));
const ok = (value) => ({ ok: true, value });
const refusal = (code) => Object.freeze({ ok: false, code });
const MISSING = refusal('TARGET_NOT_FOUND');
const CONFLICT = refusal('STATE_CONFLICT');
const FULL = refusal('OWNER_QUOTA_FULL');

const counts = (lease) => ({ runs: lease.runs.length, scratches: lease.scratches.length, exports: lease.exports.length });
const leaseView = (lease) => ({ id: lease.id, name: lease.name, expiresAtMs: lease.expiresAtMs, counts: counts(lease), revision: lease.revision });
const operatorView = (lease) => ({ id: lease.id, owner: lease.owner, expiresAtMs: lease.expiresAtMs, counts: counts(lease) });
const VIEWS = Object.freeze({
  run: (run) => ({ id: run.id, kind: 'run', name: run.name, units: run.units, state: run.state, revision: run.revision }),
  scratch: (scratch) => ({ id: scratch.id, kind: 'scratch', name: scratch.name, revision: scratch.revision }),
  export: (item) => ({ id: item.id, kind: 'export', name: item.name, runId: item.runId, revision: item.revision })
});
const byName = (first, second) => (first.name < second.name ? -1 : first.name > second.name ? 1 : first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
const EXTRA = Object.freeze({ run: (input) => ({ units: input.units, state: 'running' }), scratch: () => ({}), export: (input, run) => ({ runId: run.id }) });
const holdings = (data, subject) => data.leases.filter((lease) => lease.owner === subject)
  .reduce((sum, lease) => sum + 1 + lease.runs.length + lease.scratches.length + lease.exports.length, 0);

// The page of a list: the caller's own items only (the caller passes nothing else), filtered, ordered and cut. The total counts the same items.
function page(items, { limit, offset, sort, q }, view) {
  const found = q === null ? items : items.filter((item) => item.name.includes(q));
  const ordered = sort === 'name' ? [...found].sort(byName) : found;
  return { total: ordered.length, offset, limit, items: ordered.slice(offset, offset + limit).map(view) };
}

function createStore({ now = Date.now, newId = (kind) => `${kind}-${randomBytes(8).toString('hex')}`, ownerEntries, owners }) {
  let state = { leases: [] };
  let visited = 1;
  const live = (lease) => now() < lease.expiresAtMs;
  // A full pass and no early exit: finding a target and not finding it cost the same work (counted in `visited`, asserted by the tests).
  const pick = (list, test) => {
    let found = null;
    for (const item of list) {
      visited += 1;
      if (test(item)) found = item;
    }
    return found;
  };
  const owned = (data, subject, leaseId) => {
    const lease = pick(data.leases, (entry) => entry.id === leaseId);
    return lease !== null && lease.owner === subject && live(lease) ? lease : null;
  };
  const locate = (data, subject, leaseId, kind, id) => {
    const lease = owned(data, subject, leaseId);
    const resource = lease === null ? null : pick(lease[KIND_FOLDERS[kind]], (entry) => entry.id === id);
    return resource === null ? null : { lease, resource };
  };
  const taken = (draft, id) => draft.leases.some((lease) => lease.id === id || [...lease.runs, ...lease.scratches, ...lease.exports].some((item) => item.id === id));
  function mint(draft, kind) {
    const id = newId(kind);
    if (!contract.isId(kind, id) || taken(draft, id)) throw Object.assign(new Error('The id generator returned an invalid or a used id'), { code: 'ID_GENERATOR_INVALID' });
    return id;
  }

  const OPS = {
    createLease(draft, subject, { name, ttlMs }) {
      const lease = { id: mint(draft, 'lease'), owner: subject, name, createdAtMs: now(), expiresAtMs: now() + ttlMs, revision: 0, runs: [], scratches: [], exports: [] };
      draft.leases.push(lease);
      return holdings(draft, subject) > ownerEntries ? FULL : ok({ lease: leaseView(lease) });
    },
    endLease(draft, subject, { lease: leaseId }) {
      const lease = owned(draft, subject, leaseId);
      if (lease === null) return MISSING;
      draft.leases.splice(draft.leases.indexOf(lease), 1);
      return ok({ ended: true });
    },
    createResource(draft, subject, { lease: leaseId, kind, input }) {
      const lease = owned(draft, subject, leaseId);
      if (lease === null) return MISSING;
      // The reference resolves inside this lease only: a run of another lease, own or foreign, is as absent as one that never existed.
      const run = kind === 'export' ? pick(lease.runs, (entry) => entry.id === input.runId) : null;
      if (kind === 'export' && run === null) return MISSING;
      const resource = { id: mint(draft, kind), name: input.name, revision: 0, ...EXTRA[kind](input, run) };
      lease[KIND_FOLDERS[kind]].push(resource);
      lease.revision += 1;
      return holdings(draft, subject) > ownerEntries ? FULL : ok({ resource: VIEWS[kind](resource) });
    },
    updateResource(draft, subject, { lease: leaseId, kind, id, patch }) {
      const found = locate(draft, subject, leaseId, kind, id);
      if (found === null) return MISSING;
      if (kind === 'run' && found.resource.state !== 'running') return CONFLICT;
      Object.assign(found.resource, patch);
      found.resource.revision += 1;
      found.lease.revision += 1;
      return ok({ resource: VIEWS[kind](found.resource) });
    },
    deleteResource(draft, subject, { lease: leaseId, kind, id }) {
      const found = locate(draft, subject, leaseId, kind, id);
      if (found === null) return MISSING;
      const list = found.lease[KIND_FOLDERS[kind]];
      list.splice(list.indexOf(found.resource), 1);
      if (kind === 'run') found.lease.exports = found.lease.exports.filter((item) => item.runId !== id);
      found.lease.revision += 1;
      return ok({ deleted: true });
    },
    cancelRun(draft, subject, { lease: leaseId, id }) {
      const found = locate(draft, subject, leaseId, 'run', id);
      if (found === null) return MISSING;
      if (found.resource.state !== 'running') return CONFLICT;
      found.resource.state = 'cancelled';
      found.resource.revision += 1;
      found.lease.revision += 1;
      return ok({ resource: VIEWS.run(found.resource) });
    }
  };
  const BATCH = Object.freeze({ delete: OPS.deleteResource, cancel: OPS.cancelRun, update: OPS.updateResource });

  // The one place the state changes: a private draft without the expired leases, kept only when the change succeeds.
  function commit(change) {
    const draft = structuredClone(state);
    draft.leases = draft.leases.filter(live);
    const outcome = change(draft);
    if (outcome.ok) state = draft;
    return outcome;
  }

  return Object.freeze({
    readLease: (subject, leaseId) => { const lease = owned(state, subject, leaseId); return lease === null ? MISSING : ok({ lease: leaseView(lease) }); },
    listLeases: (subject, query) => ok(page(state.leases.filter((lease) => lease.owner === subject && live(lease)), query, leaseView)),
    readResource(subject, leaseId, kind, id) {
      const found = locate(state, subject, leaseId, kind, id);
      return found === null ? MISSING : ok({ resource: VIEWS[kind](found.resource) });
    },
    listResources(subject, leaseId, kind, query) {
      const lease = owned(state, subject, leaseId);
      return lease === null ? MISSING : ok(page(lease[KIND_FOLDERS[kind]], query, VIEWS[kind]));
    },
    operatorLeases: (query) => ok(page(state.leases.filter(live), query, operatorView)),
    // The decision before the effect (no change): does this subject own a live lease, or a resource of kind and id inside it?
    has: (subject, { lease, kind, id }) => (kind === undefined ? owned(state, subject, lease) !== null : locate(state, subject, lease, kind, id) !== null),
    apply: (subject, name, input) => commit((draft) => OPS[name](draft, subject, input)),
    batch: (subject, ops) => commit((draft) => {
      for (const operation of ops) {
        const outcome = BATCH[operation.op](draft, subject, operation);
        if (!outcome.ok) return outcome;
      }
      return ok({ applied: ops.length });
    }),
    // Internal, never routed: the only way an owner changes, so that the tests can move a lease while a request waits.
    transfer(leaseId, subject) {
      if (!owners.includes(subject)) throw new RangeError('Unknown owner');
      const draft = structuredClone(state);
      const lease = draft.leases.find((entry) => entry.id === leaseId);
      if (lease === undefined) return false;
      lease.owner = subject;
      state = draft;
      return true;
    },
    snapshot: () => structuredClone(state),
    stats: () => ({ visited })
  });
}

module.exports = Object.freeze({ createStore });
