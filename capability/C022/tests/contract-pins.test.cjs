'use strict';

// The declared world and bounds of the contract, pinned literally (found by the systematic mutants: raising a seed unit or a bound by one
// survived the whole suite). A bound or a seed is part of the contract that the page and the tests share, so changing one is a visible
// change of THIS file too; the HTTP behavior of the bounds is tested where they bite (quotas, pages, body size, timeouts).
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const contract = require('../contract.js');
const { SEED, startApp } = require('./helpers.cjs');

test('the limits of the contract are exactly the declared bounds', () => {
  assert.deepEqual({ ...contract.limits }, {
    bodyBytes: 4096, ttlMs: 600000, anonymousTtlMs: 300000, ticketTtlMs: 120000, ticketMaxTtlMs: 600000, tickets: 256,
    sessionsPerTenant: 8, recordsPerTenant: 32, anonymousSessions: 16, anonymousRecords: 32,
    projectsPerTenant: 12, pageDefault: 5, pageMax: 10, auditPerUser: 200, anonymousAudit: 50,
    idleMs: 8000, connections: 256, pipelined: 4, headerMs: 5000, checkMs: 1000
  });
});

test('the idle timeout stays above the request timeout plus its check interval: a stalled request is answered with the typed 408, never cut without a word', () => {
  const { idleMs, headerMs, checkMs } = contract.limits;
  assert.ok(idleMs > headerMs + checkMs, `${idleMs} must exceed ${headerMs} + ${checkMs}`);
});

test('the declared seeds, members and profiles of the three tenants', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(contract.seedProjects)), SEED);
  assert.deepEqual(JSON.parse(JSON.stringify(contract.members)), {
    'tenant-alder': { ada: 'admin', alf: 'member', ana: 'viewer', dana: 'member' },
    'tenant-birch': { bea: 'admin', ben: 'member', bo: 'viewer', dana: 'viewer' },
    'tenant-cedar': { cai: 'admin', cy: 'member' }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(contract.profileIds)), { 'tenant-alder': ['synthetic-001'], 'tenant-birch': ['synthetic-002'], 'tenant-cedar': [] });
});

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

test('every tenant serves exactly its seeded projects: ids, names, units, owners and versions', async () => {
  for (const [tenant, admin] of [['tenant-alder', 'ada'], ['tenant-birch', 'bea'], ['tenant-cedar', 'cai']]) {
    const { token } = await ctx.session(admin, tenant);
    const listed = await ctx.call('GET', '/v1/projects?limit=10', { token });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.json.items.map((project) => [project.name, project.units, project.owner]), SEED[tenant], tenant);
    assert.deepEqual(listed.json.items.map((project) => [project.id, project.version]), SEED[tenant].map((_, index) => [`proj-${String(index + 1).padStart(4, '0')}`, 1]), tenant);
    assert.equal(listed.json.count, SEED[tenant].length);
  }
});
