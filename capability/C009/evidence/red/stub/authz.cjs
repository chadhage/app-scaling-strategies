'use strict';
// Naive RED subject: every decision is "allowed" and every credential is accepted.
class AuthError extends Error {
  constructor(code) { super(code); this.code = code; this.status = 401; this.challenge = ''; }
}
module.exports = {
  AuthError,
  decide: () => ({ allowed: true, status: 200, code: 'ok', requiredRoles: [] }),
  parseBearer: (raw) => { const index = raw.findIndex((item) => String(item).toLowerCase() === 'authorization'); return index < 0 ? null : raw[index + 1]; },
  createTokenRegistry: () => ({ issue: (name) => name, verify: (token) => ({ subject: token, role: 'operator', expiresAtMs: Infinity }) }),
  authenticate: () => ({ subject: 'anonymous', role: 'operator' }),
  claimedHeaders: () => []
};
