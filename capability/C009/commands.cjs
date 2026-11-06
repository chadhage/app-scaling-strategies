'use strict';

const contract = require('./contract.js');
const { AuthError, claimedHeaders, decide, parseBearer } = require('./authz.cjs');
const { CommandError } = require('./handlers.cjs');
const { CODES } = require('./codes.cjs');
const { isFinished, readBody } = require('./http-io.cjs');

const JSON_TYPE = /^application\/json\s*(;.*)?$/i;

// The mutation pipeline. Order is the security argument: authenticate, name, permission table (before any input is read),
// then media type, body, validation, and finally a linearized commit that re-verifies the token and the permission. A request whose
// connection was refused (http-io.cjs) while it waited is dropped without an answer, an audit record or an effect: the mark of its socket
// is tested after the one await that reads the body and again right before the commit.
function createCommandPipeline({ registry, table, handlers, hooks, validate, ledger, queue }) {
  return async function handleCommand(request, out, url, rawName) {
    const claims = claimedHeaders(request.rawHeaders);
    const unauthenticated = (error) => {
      const entry = ledger.record({ outcome: 'unauthenticated', code: error.code, command: null, subject: null, role: null });
      out.fail(error.code, { auditSeq: entry.seq }, { 'WWW-Authenticate': error.challenge });
    };
    const refuse = (code, who, command, extra = {}) => {
      const entry = ledger.record({ outcome: code === 'ROLE_FORBIDDEN' ? 'denied' : 'rejected', code, command, subject: who.subject, role: who.role });
      out.fail(code, { role: who.role, ...(command && { command }), ...extra, auditSeq: entry.seq, ignoredClaims: claims });
    };

    let token;
    let identity;
    try {
      token = parseBearer(request.rawHeaders);
      if (token === null) throw new AuthError('AUTHENTICATION_REQUIRED');
      identity = registry.verify(token);
    } catch (error) {
      if (error instanceof AuthError) return unauthenticated(error);
      throw error;
    }

    let name = null;
    try { name = decodeURIComponent(rawName); } catch { /* a broken percent escape is not a command name */ }
    if (!contract.isCommandName(name)) return refuse('COMMAND_NAME_INVALID', identity, null);

    const decision = decide(table, name, identity.role);
    if (!decision.allowed) {
      const known = decision.code !== 'COMMAND_UNKNOWN';
      return refuse(decision.code, identity, known ? name : null, known ? { requiredRoles: decision.requiredRoles } : {});
    }

    if (url.search !== '') return refuse('QUERY_NOT_ALLOWED', identity, name);
    if (!JSON_TYPE.test(request.headers['content-type'] || '')) return refuse('MEDIA_TYPE_UNSUPPORTED', identity, name);
    out.proceed();
    const body = await readBody(request, contract.limits.bodyBytes);
    if (isFinished(request.socket)) return undefined;
    if (body.tooLarge) return refuse('BODY_TOO_LARGE', identity, name);
    let parsed;
    try { parsed = JSON.parse(body.buffer.toString('utf8')); } catch { return refuse('BODY_INVALID_JSON', identity, name); }
    const checked = validate(name, parsed);
    if (!checked.ok) return refuse(checked.code, identity, name, checked.code === 'INPUT_UNKNOWN_FIELD' ? {} : { field: checked.field });

    return queue.run(async () => {
      try {
        await hooks.beforeCommit?.({ command: name, subject: identity.subject, role: identity.role });
        const current = registry.verify(token);
        const again = decide(table, name, current.role);
        if (!again.allowed) return refuse(again.code, current, name, { requiredRoles: again.requiredRoles });
        if (!Object.hasOwn(handlers, name)) return refuse('COMMAND_NOT_IMPLEMENTED', current, name);
        if (isFinished(request.socket)) return undefined;
        const actor = { subject: current.subject, role: current.role };
        const { revision, result } = ledger.commit(handlers[name], { actor, input: checked.value });
        const entry = ledger.record({ outcome: 'applied', code: 'ok', command: name, subject: actor.subject, role: actor.role });
        return out.json(200, { outcome: 'ok', command: name, revision, actor, result, auditSeq: entry.seq, ignoredClaims: claims });
      } catch (error) {
        if (error instanceof AuthError) return unauthenticated(error);
        if (error instanceof CommandError && Object.hasOwn(CODES, error.code)) return refuse(error.code, identity, name);
        const entry = ledger.record({ outcome: 'failed', code: 'COMMAND_FAILED', command: name, subject: identity.subject, role: identity.role });
        return out.fail('COMMAND_FAILED', { command: name, auditSeq: entry.seq });
      }
    });
  };
}

module.exports = Object.freeze({ createCommandPipeline });
