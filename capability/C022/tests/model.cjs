'use strict';

// Test tooling, not production code: an INDEPENDENT reference model of tenants, memberships, sessions, tickets and projects, written
// from the specification (the feature), not from the implementation. step(op) returns what the specification says must happen
// ({ok, code, data}) and applies the effect to the model only when the operation is allowed. It is the oracle of the property test.
const contract = require('../contract.js');

const TTL = 600000;
const ANON_TTL = 300000;
const TICKET_TTL = 120000;
const NAME_UNITS = (name, units) => typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(name) && Number.isInteger(units) && units >= 1 && units <= 100;
const ALLOW = {
  'project.list': 'vma', 'project.read': 'vma', 'project.create': 'ma', 'project.update': 'ma', 'project.delete': 'ma', 'profile.read': 'vma', 'profile.list': 'vma',
  'admin.sessions': 'a', 'admin.audit': 'a', 'admin.revoke': 'a', 'admin.role': 'a', 'session.switch': 'vma'
};
const LETTER = { viewer: 'v', member: 'm', admin: 'a' };

function createModel(clock) {
  const roles = JSON.parse(JSON.stringify(contract.members));
  const projects = {};
  const counters = {};
  for (const tenant of contract.tenants) {
    projects[tenant] = new Map(contract.seedProjects[tenant].map(([name, units, owner], index) => [`proj-${String(index + 1).padStart(4, '0')}`, { name, units, owner, version: 1 }]));
    counters[tenant] = contract.seedProjects[tenant].length;
  }
  const profiles = JSON.parse(JSON.stringify(contract.profileIds));
  const sessions = new Map();
  const tickets = new Map();
  const byToken = new Map();
  const eff = (s) => (s.state === 'active' && clock.now() >= s.expiresAt ? 'expired' : s.state);
  const ENDED = { expired: 'SESSION_EXPIRED', logged_out: 'SESSION_LOGGED_OUT', revoked: 'SESSION_REVOKED', superseded: 'SESSION_SUPERSEDED' };
  const no = (code) => ({ ok: false, code });

  function auth(token) {
    if (token === null) return no('AUTHENTICATION_REQUIRED');
    if (!/^c022_[A-Za-z0-9_-]{43}$/.test(token)) return no('TOKEN_MALFORMED');
    const session = byToken.get(token);
    if (!session) return no('TOKEN_UNKNOWN');
    const state = eff(session);
    return state === 'active' ? { ok: true, session } : no(ENDED[state]);
  }

  const listOf = (tenant, q) => [...projects[tenant]].filter(([, p]) => q === '' || p.name.includes(q)).map(([id, p]) => ({ id, ...p }));

  return {
    roles, projects, sessions, tickets,
    registerTicket(ticket, user, tenant) { tickets.set(ticket, { user, tenant, used: false, expiresAt: clock.now() + TICKET_TTL }); },
    register(token, session) { byToken.set(token, session); sessions.set(session.sid, session); },
    liveTokens: () => [...byToken.keys()],
    tenantOf: (token) => (byToken.has(token) ? byToken.get(token).tenant : null),
    userOf: (token) => (byToken.has(token) ? byToken.get(token).user : null),
    step(op) {
      if (op.kind === 'anonymous') {
        const session = { sid: null, kind: 'anonymous', tenant: null, user: null, state: 'active', expiresAt: clock.now() + ANON_TTL };
        return { ok: true, code: 'ok', create: session };
      }
      if (op.kind === 'login') {
        let anon = null;
        if (op.token !== null) {
          const presented = auth(op.token);
          if (!presented.ok) return presented;
          if (presented.session.kind !== 'anonymous') return no('ALREADY_AUTHENTICATED');
          anon = presented.session;
        }
        const ticket = tickets.get(op.ticket);
        if (!ticket || ticket.used || clock.now() >= ticket.expiresAt) return no('TICKET_INVALID');
        if (!Object.hasOwn(roles[ticket.tenant], ticket.user)) return no('NOT_A_MEMBER');
        ticket.used = true;
        if (anon) anon.state = 'superseded';
        return { ok: true, code: 'ok', create: { kind: 'tenant', tenant: ticket.tenant, user: ticket.user, state: 'active', expiresAt: clock.now() + TTL } };
      }
      const principal = auth(op.token);
      if (!principal.ok) return principal;
      const { session } = principal;
      if (op.kind === 'session.logout') { session.state = 'logged_out'; return { ok: true, code: 'ok' }; }
      if (op.kind === 'session.whoami') return { ok: true, code: 'ok', data: { tenant: session.tenant, user: session.user, role: session.kind === 'tenant' ? roles[session.tenant][session.user] : null } };
      if (session.kind === 'anonymous') return no('LOGIN_REQUIRED');
      const { tenant, user } = session;
      const role = roles[tenant][user];
      if (!ALLOW[op.kind].includes(LETTER[role])) return no('ROLE_FORBIDDEN');
      const own = projects[tenant];
      switch (op.kind) {
        case 'session.switch': return no('TENANT_SWITCH_REQUIRES_LOGIN');
        case 'project.list': return { ok: true, code: 'ok', data: { items: listOf(tenant, op.q).slice(0, 10), count: listOf(tenant, op.q).length } };
        case 'project.read': return own.has(op.id) ? { ok: true, code: 'ok', data: { id: op.id, ...own.get(op.id) } } : no('RESOURCE_NOT_FOUND');
        case 'project.create': {
          counters[tenant] += 1;
          const id = `proj-${String(counters[tenant]).padStart(4, '0')}`;
          own.set(id, { name: op.name, units: op.units, owner: user, version: 1 });
          return { ok: true, code: 'ok', data: { id } };
        }
        case 'project.update': {
          if (!own.has(op.id)) return no('RESOURCE_NOT_FOUND');
          const project = own.get(op.id);
          Object.assign(project, { name: op.name, units: op.units, version: project.version + 1 });
          return { ok: true, code: 'ok', data: { id: op.id } };
        }
        case 'project.delete': return own.delete(op.id) ? { ok: true, code: 'ok' } : no('RESOURCE_NOT_FOUND');
        case 'profile.read': return profiles[tenant].includes(op.id) ? { ok: true, code: 'ok' } : no('RESOURCE_NOT_FOUND');
        case 'profile.list': return { ok: true, code: 'ok', data: { count: profiles[tenant].length } };
        case 'admin.sessions': case 'admin.audit': return { ok: true, code: 'ok' };
        case 'admin.role': {
          if (!Object.hasOwn(roles[tenant], op.user)) return no('RESOURCE_NOT_FOUND');
          if (roles[tenant][op.user] === op.role) return { ok: true, code: 'ok', data: { changed: false } };
          if (roles[tenant][op.user] === 'admin' && Object.values(roles[tenant]).filter((r) => r === 'admin').length === 1) return no('LAST_ADMIN');
          roles[tenant][op.user] = op.role;
          return { ok: true, code: 'ok', data: { changed: true } };
        }
        case 'admin.revoke': {
          if (op.sid !== undefined) {
            const target = sessions.get(op.sid);
            if (!target || target.kind !== 'tenant' || target.tenant !== tenant) return no('RESOURCE_NOT_FOUND');
            if (eff(target) !== 'active') return no('SESSION_NOT_ACTIVE');
            target.state = 'revoked';
            return { ok: true, code: 'ok', data: { revoked: 1 } };
          }
          if (!Object.hasOwn(roles[tenant], op.user)) return no('RESOURCE_NOT_FOUND');
          let revoked = 0;
          for (const target of sessions.values()) {
            if (target.kind === 'tenant' && target.tenant === tenant && target.user === op.user && eff(target) === 'active') { target.state = 'revoked'; revoked += 1; }
          }
          return { ok: true, code: 'ok', data: { revoked } };
        }
        default: throw new Error(`unknown model op ${op.kind}`);
      }
    }
  };
}

module.exports = Object.freeze({ NAME_UNITS, TTL, createModel });
