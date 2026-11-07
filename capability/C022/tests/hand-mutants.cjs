'use strict';

// Test tooling, not production code: the HAND LIST of isolation-guard mutants that the systematic generator (mutate-gen.cjs) cannot make: it mutates
// conditions, comparisons, logical operators, negations, simple statements and return values, but NOT the iterable of a `for ... of`, NOT a call
// argument and NOT a scoped accessor replaced by its unscoped sibling (found by the independent review of the first publication: revokeUser ended
// the sessions of EVERY tenant's user and nothing noticed). Every entry replaces ONE text of ONE production file by another (an entry may carry two
// edits when one guard is written in two places); each find text occurs exactly once in its file. mutate-run.cjs --hand runs every entry alone in a
// private copy and requires that a NAMED failing test kills it; a timeout is UNDECIDED, never a kill.
// Groups: I identity (state machine and its scopes), S store (the tenant namespace, ETags, cursors, audit, counters, quotas), V service (the decision
// and the effect), W server (listeners, lanes, limits, claims, credentials), C contract (tables).
const m = (id, file, why, ...edits) => ({ id, file, why, edits });

const MUTANTS = [
  // identity.cjs
  m('I01', 'identity.cjs', 'live(scope) returns the sessions of every tenant', ['.filter((record) => scopeOf(record) === scope);', '.filter(() => true);']),
  m('I02', 'identity.cjs', 'room() counts and evicts across every tenant', ['const records = live(scope);', 'const records = [...sessions.values()];']),
  m('I03', 'identity.cjs', 'revokeUser selects the sessions of EVERY tenant (review M1)', ['for (const record of live(tenant)) {', 'for (const record of sessions.values()) {']),
  m('I04', 'identity.cjs', 'revokeUser takes membership from a fixed tenant', ['if (!roles.get(tenant).has(user)) return refuse(\'RESOURCE_NOT_FOUND\');', 'if (!roles.get(\'tenant-alder\').has(user)) return refuse(\'RESOURCE_NOT_FOUND\');']),
  m('I05', 'identity.cjs', 'revokeUser ends the sessions of every user of the tenant', ['if (record.user === user && effective(record) === \'active\') {', 'if (effective(record) === \'active\') {']),
  m('I06', 'identity.cjs', 'revokeSession accepts a session id of another tenant', ['|| record.tenant !== tenant) return refuse(\'RESOURCE_NOT_FOUND\');', ') return refuse(\'RESOURCE_NOT_FOUND\');']),
  m('I07', 'identity.cjs', 'setRole works on the first tenant\'s team', ['const team = roles.get(tenant);', 'const team = roles.get([...roles.keys()][0]);']),
  m('I08', 'identity.cjs', 'the last admin is counted over every tenant', ['[...team.values()].filter((value) => value === \'admin\').length === 1', '[...roles.values()].flatMap((members) => [...members.values()]).filter((value) => value === \'admin\').length === 1']),
  m('I09', 'identity.cjs', 'setRole accepts a user of any tenant (and adds the user to this one)', ['if (!team.has(user)) return refuse(\'RESOURCE_NOT_FOUND\');', 'if (![...roles.values()].some((members) => members.has(user))) return refuse(\'RESOURCE_NOT_FOUND\');']),
  m('I10', 'identity.cjs', 'the session list holds every tenant\'s sessions', ['const sessionsOf = (tenant) => Object.freeze(live(tenant).sort(', 'const sessionsOf = (tenant) => Object.freeze([...sessions.values()].sort(']),
  m('I11', 'identity.cjs', 'a session shows the role of a fixed tenant', ['role: record.kind === \'tenant\' ? roles.get(record.tenant).get(record.user) : null', 'role: record.kind === \'tenant\' ? roles.get(\'tenant-alder\').get(record.user) : null']),
  m('I12', 'identity.cjs', 'login accepts a member of ANY tenant for this tenant', ['if (!roles.get(entry.tenant).has(entry.user)) return refuse(\'NOT_A_MEMBER\');', 'if (![...roles.values()].some((members) => members.has(entry.user))) return refuse(\'NOT_A_MEMBER\');']),
  m('I13', 'identity.cjs', 'the session quota of a login is counted in the anonymous scope', ['room(entry.tenant, limits.sessionsPerTenant', 'room(\'\', limits.sessionsPerTenant']),
  m('I14', 'identity.cjs', 'a login creates its session in a fixed tenant', ['create(\'tenant\', entry.tenant, entry.user, limits.ttlMs)', 'create(\'tenant\', \'tenant-alder\', entry.user, limits.ttlMs)']),
  m('I15', 'identity.cjs', 'the anonymous quota is counted in a tenant\'s scope', ['room(\'\', limits.anonymousSessions, limits.anonymousRecords)', 'room(\'tenant-alder\', limits.anonymousSessions, limits.anonymousRecords)']),
  m('I16', 'identity.cjs', 'ended sessions count as active in the quota', ['if (records.filter((record) => effective(record) === \'active\').length >= activeLimit) return false;', 'if (records.length >= activeLimit) return false;']),
  m('I17', 'identity.cjs', 'anonymous sessions belong to a tenant\'s scope', ['(record.kind === \'tenant\' ? record.tenant : \'\')', '(record.kind === \'tenant\' ? record.tenant : \'tenant-alder\')']),
  m('I18', 'identity.cjs', 'a token is accepted with any prefix', ['const TOKEN_SHAPE = /^c022_[A-Za-z0-9_-]{43}$/;', 'const TOKEN_SHAPE = /c022_[A-Za-z0-9_-]{43}$/;']),
  m('I20', 'identity.cjs', 'an anonymous session lives as long as a tenant session', ['create(\'anonymous\', null, null, limits.anonymousTtlMs)', 'create(\'anonymous\', null, null, limits.ttlMs)']),
  m('I21', 'identity.cjs', 'every token has the same digest', ['const digest = (value) => createHash(\'sha256\').update(value).digest(\'hex\');', 'const digest = (value) => createHash(\'sha256\').update(\'x\').digest(\'hex\');']),
  m('I22', 'identity.cjs', 'a login never finds the anonymous session it replaces', ['anonymous = sessions.get(digest(anonymousToken));', 'anonymous = sessions.get(digest(\'\'));']),
  m('I23', 'identity.cjs', 'an evicted record stays reachable by its public session id', ['bySid.delete(oldest.sid);', '']),
  // store.cjs
  m('S01', 'store.cjs', 'every scope opens the first tenant\'s namespace', ['const state = tenants.get(tenant);', 'const state = tenants.get([...tenants.keys()][0]);']),
  m('S02', 'store.cjs', 'every tenant serves the first tenant\'s profiles', ['profiles: new Set(profileIds[tenant])', 'profiles: new Set(profileIds[\'tenant-alder\'])']),
  m('S03', 'store.cjs', 'the id counter is shared by every tenant', ['state.counter += 1;', 'for (const other of tenants.values()) other.counter += 1;']),
  m('S04', 'store.cjs', 'the project quota is counted over every tenant', ['if (state.projects.size >= limits.projectsPerTenant) return null;', 'if ([...tenants.values()].reduce((sum, other) => sum + other.projects.size, 0) >= limits.projectsPerTenant) return null;']),
  m('S05', 'store.cjs', 'a delete removes the id in every tenant', ['remove: (id) => state.projects.delete(id),', 'remove: (id) => [...tenants.values()].map((other) => other.projects.delete(id)).some(Boolean),']),
  m('S06', 'store.cjs', 'ETags are not keyed by the tenant', ['mac(\'etag\', tenant, project.id, project.version)', 'mac(\'etag\', \'\', project.id, project.version)']),
  m('S07', 'store.cjs', 'cursors are not keyed by the tenant (minted and verified)', ['.${mac(\'cursor\', tenant, query, after)}', '.${mac(\'cursor\', \'\', query, after)}'], ['Buffer.from(mac(\'cursor\', tenant, query, after))', 'Buffer.from(mac(\'cursor\', \'\', query, after))']),
  m('S08', 'store.cjs', 'the audit ring is one per tenant, not one per user', ['state.rings.set(user, [...(state.rings.get(user) || []), stored].slice(-limits.auditPerUser));', 'state.rings.set(\'\', [...(state.rings.get(\'\') || []), stored].slice(-limits.auditPerUser));']),
  m('S09', 'store.cjs', 'a read finds the id in any tenant', ['get: (id) => (state.projects.has(id) ? freezeCopy(state.projects.get(id)) : null),', 'get: (id) => { const hit = [...tenants.values()].find((other) => other.projects.has(id)); return hit ? freezeCopy(hit.projects.get(id)) : null; },']),
  m('S10', 'store.cjs', 'a profile id of any tenant is a profile here', ['hasProfile: (id) => state.profiles.has(id),', 'hasProfile: (id) => [...tenants.values()].some((other) => other.profiles.has(id)),']),
  m('S11', 'store.cjs', 'the audit log holds every tenant\'s entries', ['auditLog: () => [...state.rings.values()].flat().sort(', 'auditLog: () => [...tenants.values()].flatMap((other) => [...other.rings.values()]).flat().sort(']),
  m('S12', 'store.cjs', 'the anonymous audit ring is bounded by the per-user bound', ['anonymousRing = [...anonymousRing, stored].slice(-limits.anonymousAudit);', 'anonymousRing = [...anonymousRing, stored].slice(-limits.auditPerUser);']),
  m('S13', 'store.cjs', 'a list counts the projects of every tenant', ['count: sorted(q).length,', 'count: [...tenants.values()].reduce((sum, other) => sum + other.projects.size, 0),']),
  m('S14', 'store.cjs', 'a created project is owned by a fixed user', ['const project = { id: idOf(state.counter), n: state.counter, name, units, owner, version: 1 };', 'const project = { id: idOf(state.counter), n: state.counter, name, units, owner: \'ada\', version: 1 };']),
  // service.cjs
  m('V01', 'service.cjs', 'an audit entry of a tenant session lands in a fixed tenant', ['store.scope(principal.session.tenant).record(principal.session.user, entry);', 'store.scope(\'tenant-alder\').record(principal.session.user, entry);']),
  m('V02', 'service.cjs', 'every handler runs in a fixed tenant\'s scope', ['store.scope(principal.session.tenant) : null;', 'store.scope(\'tenant-alder\') : null;']),
  m('V03', 'service.cjs', 'the session list is the first tenant\'s', ['identity.sessionsOf(principal.session.tenant)', 'identity.sessionsOf(\'tenant-alder\')']),
  m('V04', 'service.cjs', 'a revoke names a fixed tenant', ['const { tenant } = principal.session;', 'const tenant = \'tenant-alder\';']),
  m('V05', 'service.cjs', 'a role change names a fixed tenant', ['identity.setRole(principal.session.tenant, input.value.user, input.value.role)', 'identity.setRole(\'tenant-alder\', input.value.user, input.value.role)']),
  m('V06', 'service.cjs', 'the audit entry of a login lands in a fixed tenant', ['store.scope(result.session.tenant).record(', 'store.scope(\'tenant-alder\').record(']),
  m('V07', 'service.cjs', 'any profile id is readable', ['(scope.hasProfile(input.id) ? ok(200', '(true ? ok(200']),
  m('V08', 'service.cjs', 'the profile list is the first tenant\'s', ['const profiles = scope.profiles().map(', 'const profiles = store.scope(\'tenant-alder\').profiles().map(']),
  m('V09', 'service.cjs', 'a login ignores the anonymous session it replaces', ['identity.login(ticket, token)', 'identity.login(ticket, null)']),
  m('V10', 'service.cjs', 'an anonymous caller on a tenant route is not refused LOGIN_REQUIRED', ['if (principal.kind === \'anonymous\') return refusal(null, op, \'LOGIN_REQUIRED\');', '']),
  m('V11', 'service.cjs', 'a created project is owned by a fixed user', ['scope.create(input.value, principal.session.user)', 'scope.create(input.value, \'ada\')']),
  // server.cjs
  m('W01', 'server.cjs', 'the Vary header is dropped from every answer', ['{ Vary: \'Authorization\', ...headers }', '{ ...headers }']),
  m('W02', 'server.cjs', 'the depth of a lane is unbounded', ['createLanes({ depth: limits.pipelined })', 'createLanes({ depth: 1000000 })']),
  m('W03', 'server.cjs', 'no lanes: every request runs at once', ['requireHostHeader: false }, (request, response) => admit(request, response, route));', 'requireHostHeader: false }, (request, response) => route(request, response));']),
  m('W04', 'server.cjs', 'the 100-continue listener is missing', ['server.on(\'checkContinue\', (request, response) => admit(request, response, route));', '']),
  m('W05', 'server.cjs', 'the client error listener is missing', ['server.on(\'clientError\', (error, socket) => admit.refuse(socket, clientErrorCode(error)));', '']),
  m('W06', 'server.cjs', 'the CONNECT listener is missing', ['server.on(\'connect\', (request, socket) => admit.refuse(socket, \'METHOD_NOT_ALLOWED\'));', '']),
  m('W07', 'server.cjs', 'no request timeout', ['server.requestTimeout = limits.headerMs;', 'server.requestTimeout = 0;']),
  m('W08', 'server.cjs', 'no headers timeout', ['server.headersTimeout = limits.headerMs;', 'server.headersTimeout = 0;']),
  m('W09', 'server.cjs', 'no connection cap', ['server.maxConnections = limits.connections;', '']),
  m('W10', 'server.cjs', 'a tenant claim in the query is never seen', ['claimsTenant(request.rawHeaders, url)', 'claimsTenant(request.rawHeaders, new URL(\'http://x/\'))']),
  m('W11', 'server.cjs', 'the login ignores the credential of the anonymous session', ['service.login(bearer.token, input.value.ticket)', 'service.login(null, input.value.ticket)']),
  m('W12', 'server.cjs', 'the route that creates an anonymous session reads a credential', ['candidate.auth === \'none\' ? { token: null } : bearerOf(request.rawHeaders)', 'bearerOf(request.rawHeaders)']),
  m('W13', 'server.cjs', 'If-Match is never read', ['ifMatch: request.headers[\'if-match\'] ?? null', 'ifMatch: null']),
  // contract.js
  m('C01', 'contract.js', 'any role may revoke a session', ['\'admin.revoke\': { method: \'POST\', roles: [\'admin\'] }', '\'admin.revoke\': { method: \'POST\', roles: ALL }']),
  m('C02', 'contract.js', 'any role may change a role', ['\'admin.role\': { method: \'POST\', roles: [\'admin\'] }', '\'admin.role\': { method: \'POST\', roles: ALL }']),
  m('C03', 'contract.js', 'any role may list the sessions', ['\'admin.sessions\': { method: \'GET\', roles: [\'admin\'] }', '\'admin.sessions\': { method: \'GET\', roles: ALL }']),
  m('C04', 'contract.js', 'any role may read the audit trail', ['\'admin.audit\': { method: \'GET\', roles: [\'admin\'] }', '\'admin.audit\': { method: \'GET\', roles: ALL }']),
  m('C05', 'contract.js', 'a viewer may create a project', ['\'project.create\': { method: \'POST\', roles: [\'member\', \'admin\'] }', '\'project.create\': { method: \'POST\', roles: ALL }']),
  m('C06', 'contract.js', 'a viewer may update a project', ['\'project.update\': { method: \'PUT\', roles: [\'member\', \'admin\'] }', '\'project.update\': { method: \'PUT\', roles: ALL }']),
  m('C07', 'contract.js', 'a viewer may delete a project', ['\'project.delete\': { method: \'DELETE\', roles: [\'member\', \'admin\'] }', '\'project.delete\': { method: \'DELETE\', roles: ALL }']),
  m('C08', 'contract.js', 'a workspace claim is not a tenant claim', ['tenant|organi[sz]ation|workspace|account|orgid', 'tenant|organi[sz]ation|account|orgid']),
  m('C09', 'contract.js', 'a profile read needs no role (any authenticated principal)', ['\'profile.read\': { method: \'GET\', roles: ALL }', '\'profile.read\': { method: \'GET\', roles: null }']),
  m('C10', 'contract.js', 'a project list needs no role (any authenticated principal)', ['\'project.list\': { method: \'GET\', roles: ALL }', '\'project.list\': { method: \'GET\', roles: null }'])
];

// Entries that no test can kill because they change nothing observable, each with its proof. They are not run; the evidence test checks that the
// replaced text still occurs once in the shipped file.
const EQUIVALENT = [
  { id: 'E01', file: 'identity.cjs', why: 'a ticket is accepted with any suffix (the ticket shape loses its end anchor)', edits: [['const TICKET_SHAPE = /^t022_[A-Za-z0-9_-]{43}$/;', 'const TICKET_SHAPE = /^t022_[A-Za-z0-9_-]{43}/;']],
    proof: 'TICKET_SHAPE only filters the lookup tickets.get(digest(ticket)); every issued ticket has the anchored shape, so a longer string is no key of the table (barring a SHA-256 collision) and both versions answer TICKET_INVALID' }
];

module.exports = Object.freeze({ MUTANTS, EQUIVALENT });
