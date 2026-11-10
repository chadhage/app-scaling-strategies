'use strict';

// Tenant-scoped resources and audit trails. The ONLY way to reach a tenant's data is scope(tenant): every method of the handle it returns
// closes over that tenant's own namespace, so a request that is authenticated into tenant A has no way to name, find or count anything of
// tenant B, and the answer for "someone else's id" is the answer for "no such id" because both are a lookup in A's namespace. Cursors and
// ETags are keyed MACs over the tenant, so a value minted in one tenant verifies in no other. `observe(tenant)` is a test tripwire: it is
// called with every tenant whose scope is opened.
const { createHmac, randomBytes: nodeRandomBytes, timingSafeEqual } = require('node:crypto');
const contract = require('./contract.js');

const freezeCopy = (project) => Object.freeze({ id: project.id, name: project.name, units: project.units, owner: project.owner, version: project.version });
const idOf = (counter) => `proj-${String(counter).padStart(4, '0')}`;
const byNumber = (first, second) => first.n - second.n;

function createStore({ limits = contract.limits, seeds = contract.seedProjects, profileIds = contract.profileIds, randomBytes = nodeRandomBytes, observe } = {}) {
  const secret = randomBytes(32);
  const mac = (...parts) => createHmac('sha256', secret).update(parts.join('\u0000')).digest('base64url').slice(0, 22);
  const tenants = new Map(Object.keys(seeds).map((tenant) => {
    const projects = new Map();
    seeds[tenant].forEach(([name, units, owner], index) => projects.set(idOf(index + 1), { id: idOf(index + 1), n: index + 1, name, units, owner, version: 1 }));
    return [tenant, { projects, counter: seeds[tenant].length, profiles: new Set(profileIds[tenant]), rings: new Map(), sequence: 0 }];
  }));
  let anonymousRing = [];
  let anonymousSequence = 0;

  function scope(tenant) {
    if (observe) observe(tenant);
    const state = tenants.get(tenant);
    const sorted = (query) => [...state.projects.values()].filter((project) => query === '' || project.name.includes(query)).sort(byNumber);
    return Object.freeze({
      list({ limit, after, q }) {
        const matching = sorted(q).filter((project) => after === null || project.n > Number(after.slice('proj-'.length)));
        const page = matching.slice(0, limit);
        return { items: page.map(freezeCopy), count: sorted(q).length, next: matching.length > limit ? page.at(-1).id : null };
      },
      get: (id) => (state.projects.has(id) ? freezeCopy(state.projects.get(id)) : null),
      create({ name, units }, owner) {
        if (state.projects.size >= limits.projectsPerTenant) return null;
        state.counter += 1;
        const project = { id: idOf(state.counter), n: state.counter, name, units, owner, version: 1 };
        state.projects.set(project.id, project);
        return freezeCopy(project);
      },
      update(id, { name, units }) {
        const project = state.projects.get(id);
        project.name = name;
        project.units = units;
        project.version += 1;
        return freezeCopy(project);
      },
      remove: (id) => state.projects.delete(id),
      etag: (project) => `"${mac('etag', tenant, project.id, project.version)}"`,
      mintCursor(query, after) {
        return `${Buffer.from(after).toString('base64url')}.${mac('cursor', tenant, query, after)}`;
      },
      readCursor(query, cursor) {
        const [encoded, signature, extra] = cursor.split('.');
        if (extra !== undefined || !signature) return null;
        const after = Buffer.from(encoded, 'base64url').toString('utf8');
        const expected = Buffer.from(mac('cursor', tenant, query, after));
        const given = Buffer.from(signature);
        return given.length === expected.length && timingSafeEqual(given, expected) ? after : null;
      },
      profiles: () => [...state.profiles],
      hasProfile: (id) => state.profiles.has(id),
      // One ring per user of the tenant: a user's denials can never evict the record of another user.
      record(user, entry) {
        state.sequence += 1;
        const stored = Object.freeze({ seq: state.sequence, ...entry, user });
        state.rings.set(user, [...(state.rings.get(user) || []), stored].slice(-limits.auditPerUser));
        return stored;
      },
      auditLog: () => [...state.rings.values()].flat().sort((first, second) => first.seq - second.seq)
    });
  }

  // Refusals of an unauthenticated or anonymous caller belong to no tenant: one separate bounded ring.
  function recordAnonymous(entry) {
    anonymousSequence += 1;
    const stored = Object.freeze({ seq: anonymousSequence, ...entry, user: null });
    anonymousRing = [...anonymousRing, stored].slice(-limits.anonymousAudit);
    return stored;
  }

  // Resources and counters as plain data (audit excluded: it is a log of decisions, not of state), and the size of every ring.
  const snapshot = () => ({
    tenants: Object.fromEntries([...tenants].map(([tenant, state]) => [tenant, { counter: state.counter, projects: [...state.projects.values()].sort(byNumber).map(freezeCopy) }])),
    audit: Object.fromEntries([...tenants].map(([tenant, state]) => [tenant, [...state.rings].map(([user, ring]) => [user, ring.length])])),
    anonymousAudit: anonymousRing.length
  });

  return Object.freeze({ scope, recordAnonymous, anonymousLog: () => anonymousRing.slice(), snapshot });
}

module.exports = Object.freeze({ createStore });
