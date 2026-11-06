'use strict';

// RED STUB (retained evidence, never production): the NAIVE implementation the card text warns about. It authenticates with the accepted C009
// token registry and checks the ROLE of the caller, but it never compares the owner of a lease with the caller: every conductor (and the
// operator) reaches every lease by its id, a foreign and an absent id are told apart by the answer, lists show everything, the whole state is
// public, a body may set the owner, a batch applies as far as it gets, an export may name any run, and nothing is checked again at commit.
// It keeps C009's refusal path (http-io.cjs) so that the behavioral RED is about ownership, not about connection handling.
const http = require('node:http');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const c009 = path.join(__dirname, '..', '..', '..', '..', 'C009');
const { AuthError, createTokenRegistry, parseBearer } = require(path.join(c009, 'authz.cjs'));
const { createLanes, createResponder, hasBody, readBody } = require(path.join(c009, 'http-io.cjs'));
const { createQueue } = require(path.join(c009, 'queue.cjs'));

const KINDS = { runs: 'run', scratches: 'scratch', exports: 'export' };
const MATCHERS = {
  me: /^\/v1\/me$/, leases: /^\/v1\/leases$/, lease: /^\/v1\/leases\/([^/]+)$/, list: /^\/v1\/leases\/([^/]+)\/(runs|scratches|exports)$/,
  item: /^\/v1\/leases\/([^/]+)\/(runs|scratches|exports)\/([^/]+)$/, cancel: /^\/v1\/leases\/([^/]+)\/runs\/([^/]+)\/cancel$/,
  batch: /^\/v1\/batch$/, operatorLeases: /^\/v1\/operator\/leases$/, operatorAudit: /^\/v1\/operator\/audit$/, state: /^\/v1\/state$/, scope: /^\/scope\.json$/
};

function createApp(options = {}) {
  const registry = createTokenRegistry({ now: options.now, randomBytes: options.randomBytes });
  const queue = createQueue();
  const routeName = (method, pathname) => {
    if (method === 'POST' && MATCHERS.leases.test(pathname)) return 'lease.create';
    if (method === 'DELETE' && MATCHERS.lease.test(pathname)) return 'lease.end';
    if (method === 'POST' && MATCHERS.list.test(pathname)) return 'resource.create';
    if (method === 'PATCH' && MATCHERS.item.test(pathname)) return 'resource.update';
    if (method === 'DELETE' && MATCHERS.item.test(pathname)) return 'resource.delete';
    if (method === 'POST' && MATCHERS.cancel.test(pathname)) return 'run.cancel';
    if (method === 'POST' && MATCHERS.batch.test(pathname)) return 'batch';
    return null;
  };
  const newId = options.newId || ((kind) => `${kind}-${randomBytes(8).toString('hex')}`);
  const leases = [];
  const view = (lease) => ({ id: lease.id, name: lease.name, expiresAtMs: lease.expiresAtMs, counts: { runs: lease.runs.length, scratches: lease.scratches.length, exports: lease.exports.length }, revision: lease.revision });
  const find = (id) => leases.find((lease) => lease.id === id);
  const findRun = (id) => leases.flatMap((lease) => lease.runs).find((run) => run.id === id);
  const page = (items, query) => {
    const offset = Number(query.get('offset') || 0);
    const limit = Number(query.get('limit') || 20);
    return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
  };

  async function route(request, response) {
    const out = createResponder(response);
    const send = (status, value) => out.json(status, { outcome: status < 400 ? 'ok' : 'REFUSED', ...value, ignoredClaims: [] });
    const url = new URL(request.url, 'http://127.0.0.1');
    let identity = null;
    try {
      const token = parseBearer(request.rawHeaders);
      identity = token === null ? null : registry.verify(token);
    } catch (error) {
      if (error instanceof AuthError) return send(401, { error: { code: error.code } });
      throw error;
    }
    const match = (name) => MATCHERS[name].exec(url.pathname);
    if (match('scope')) return send(200, { scope: { cardId: 'C010-naive-stub' } });
    if (match('state')) return send(200, { leases: structuredClone(leases) });
    if (identity === null) return send(401, { error: { code: 'AUTHENTICATION_REQUIRED' } });
    const mutating = request.method !== 'GET';
    if (mutating && identity.role === 'visitor') return send(403, { error: { code: 'ROLE_FORBIDDEN' } });
    if (match('me')) return send(200, { subject: identity.subject, role: identity.role });
    const name = routeName(request.method, url.pathname);
    const work = async () => {
    const body = mutating && hasBody(request) ? await readBody(request, 4096) : { buffer: Buffer.alloc(0) };
    let input = {};
    try { input = body.buffer.length ? JSON.parse(body.buffer.toString('utf8')) : {}; } catch { return send(400, { error: { code: 'BAD_JSON' } }); }
    let found;
    if (match('leases')) {
      if (request.method === 'GET') return send(200, page(leases.map(view), url.searchParams));
      const lease = { id: newId('lease'), owner: identity.subject, name: 'x', expiresAtMs: 0, ...input, revision: 0, runs: [], scratches: [], exports: [] };
      leases.push(lease);
      return send(200, { lease: view(lease) });
    }
    if ((found = match('lease'))) {
      const lease = find(found[1]);
      if (!lease) return send(404, { error: { code: 'NOT_FOUND' } });
      if (request.method === 'DELETE') { leases.splice(leases.indexOf(lease), 1); return send(200, { ended: true }); }
      return send(200, { lease: view(lease) });
    }
    if ((found = match('list'))) {
      const lease = find(found[1]);
      if (!lease) return send(404, { error: { code: 'NOT_FOUND' } });
      const list = lease[found[2]];
      if (request.method === 'GET') return send(200, page(list, url.searchParams));
      const resource = { id: newId(KINDS[found[2]]), revision: 0, ...input, ...(found[2] === 'runs' ? { state: 'running' } : {}) };
      if (found[2] === 'exports' && !findRun(input.runId)) return send(404, { error: { code: 'NOT_FOUND' } });
      list.push(resource);
      return send(200, { resource });
    }
    if ((found = match('item'))) {
      const lease = find(found[1]);
      const resource = lease && lease[found[2]].find((entry) => entry.id === found[3]);
      if (!resource) return send(404, { error: { code: 'NOT_FOUND' } });
      if (request.method === 'DELETE') { lease[found[2]].splice(lease[found[2]].indexOf(resource), 1); return send(200, { deleted: true }); }
      if (request.method === 'PATCH') Object.assign(resource, input);
      return send(200, { resource });
    }
    if ((found = match('cancel'))) {
      const lease = find(found[1]);
      const run = lease && lease.runs.find((entry) => entry.id === found[2]);
      if (!run) return send(404, { error: { code: 'NOT_FOUND' } });
      run.state = 'cancelled';
      return send(200, { resource: run });
    }
    if (match('batch')) {
      let applied = 0;
      for (const operation of input.ops || []) {
        const lease = find(operation.lease);
        const list = lease && lease[`${operation.kind}s`];
        const resource = list && list.find((entry) => entry.id === operation.id);
        if (!resource) return send(404, { error: { code: 'NOT_FOUND' }, applied });
        if (operation.op === 'delete') list.splice(list.indexOf(resource), 1);
        else if (operation.op === 'cancel') resource.state = 'cancelled';
        else Object.assign(resource, operation.patch || {});
        applied += 1;
      }
      return send(200, { applied });
    }
    if (match('operatorLeases')) return send(200, { total: leases.length, items: structuredClone(leases) });
    if (match('operatorAudit')) return send(200, { total: 0, items: [] });
    return send(404, { error: { code: 'NOT_FOUND' } });
    };
    if (!name) return work();
    return queue.run(async () => { await options.hooks?.beforeCommit?.({ route: name, subject: identity.subject }); return work(); });
  }

  const admit = createLanes({ depth: 4 });
  const server = http.createServer({ requireHostHeader: false }, (request, response) => admit(request, response, route));
  server.on('checkContinue', (request, response) => admit(request, response, route));
  return {
    server, health: () => ({ ok: true, reason: null }), issueToken: (identity, tokenOptions) => registry.issue(identity, tokenOptions), queued: queue.size,
    snapshot: () => ({ leases: structuredClone(leases) }), auditLog: () => [],
    transfer(id, owner) { const lease = find(id); if (lease) lease.owner = owner; },
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); })
  };
}

module.exports = Object.freeze({ createApp });
