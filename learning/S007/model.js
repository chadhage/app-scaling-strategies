(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SessionBoundary = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const actions = Object.freeze([
    'check-green', 'set-weight', 'switch-new', 'admit-new', 'read-pinned',
    'finish-old', 'finish-session', 'reconnect-pinned', 'finish-work', 'tick',
    'retire', 'rollback', 'force-retire'
  ]);
  const limits = Object.freeze({ sessions: 30, requests: 120, events: 200, clock: 10000 });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const validId = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(value);

  function makeSession(id, cohort, version, subject, item, status = 'active', pinned = false) {
    return {
      id, cohort, version, status, pinned,
      expected: { subject, cart: [item] },
      state: { schema: 1, subject, cart: [item], revision: 1, receipt: null }
    };
  }

  function start() {
    return {
      schemaVersion: 1, mode: 'synthetic', nativeProof: false,
      clock: 0, nominalGreenPercent: 0, newSessionTarget: 'blue',
      blue: { alive: true }, green: { alive: true, ready: false, assessment: 'unassessed' },
      cutoverAt: null, retentionUntil: null, retirement: null,
      sessions: [
        makeSession('old-journey', 'admitted-blue', 'blue', 'learner-old', 'item-A'),
        makeSession('old-pinned', 'pinned-blue', 'blue', 'learner-pinned', 'item-P', 'idle', true)
      ],
      work: { id: 'old-work', version: 'blue', status: 'pending', effects: 0, output: null },
      damage: { interruptedSessions: [], lostWork: [] },
      requests: [], events: [],
      lastOutcome: { ok: true, code: 'ready', message: 'Fixture loaded. No requests observed yet.' }
    };
  }

  function validJourney(value, session) {
    return record(value) && value.schema === 1
      && value.subject === session.expected.subject && same(value.cart, session.expected.cart)
      && ((value.revision === 1 && value.receipt === null)
        || (value.revision === 2 && value.receipt === `receipt-${session.id}`));
  }

  function assertState(state) {
    const fail = () => { throw new TypeError('Invalid rehearsal state: Reset before drawing any safety conclusion.'); };
    if (!record(state) || state.schemaVersion !== 1 || state.mode !== 'synthetic' || state.nativeProof !== false
      || !integer(state.clock, 0, limits.clock) || !integer(state.nominalGreenPercent, 0, 100)
      || !['blue', 'green'].includes(state.newSessionTarget)
      || !record(state.blue) || typeof state.blue.alive !== 'boolean'
      || !record(state.green) || typeof state.green.alive !== 'boolean' || typeof state.green.ready !== 'boolean'
      || !['unassessed', 'compatible', 'cold', 'incompatible'].includes(state.green.assessment)
      || state.green.ready !== (state.green.assessment === 'compatible' && state.green.alive)
      || ![null, 'guarded', 'forced'].includes(state.retirement)
      || state.blue.alive !== (state.retirement === null)) fail();
    if (state.cutoverAt === null) {
      if (state.retentionUntil !== null || state.newSessionTarget !== 'blue') fail();
    } else if (!integer(state.cutoverAt, 0, state.clock)
      || state.retentionUntil !== state.cutoverAt + 10 || state.newSessionTarget !== 'green') fail();
    if (!Array.isArray(state.sessions) || state.sessions.length < 2 || state.sessions.length > limits.sessions) fail();
    const ids = new Set();
    for (const session of state.sessions) {
      if (!record(session) || !validId(session.id) || ids.has(session.id)
        || !['admitted-blue', 'pinned-blue', 'new-blue', 'new-green', 'reconnected'].includes(session.cohort)
        || !['blue', 'green'].includes(session.version)
        || !['active', 'idle', 'complete', 'closed', 'interrupted'].includes(session.status)
        || typeof session.pinned !== 'boolean' || !record(session.expected)) fail();
      ids.add(session.id);
      const fixture = session.id === 'old-journey' ? ['learner-old', 'item-A']
        : ['old-pinned', 'reconnected-pinned'].includes(session.id) ? ['learner-pinned', 'item-P']
          : [`learner-${session.id}`, 'item-N'];
      const cohort = session.id === 'old-journey' ? 'admitted-blue'
        : session.id === 'old-pinned' ? 'pinned-blue'
          : session.id === 'reconnected-pinned' ? 'reconnected' : `new-${session.version}`;
      const version = ['admitted-blue', 'pinned-blue', 'new-blue'].includes(cohort) ? 'blue' : 'green';
      const statuses = session.id === 'old-pinned' ? ['idle', 'closed', 'interrupted'] : ['active', 'complete', 'interrupted'];
      if (session.expected.subject !== fixture[0] || !same(session.expected.cart, [fixture[1]])
        || session.cohort !== cohort || session.version !== version
        || !statuses.includes(session.status)
        || (session.id === 'old-pinned' && session.pinned !== (session.status !== 'closed'))
        || !validJourney(session.state, session)
        || (session.status === 'complete') !== (session.state.revision === 2)
        || (session.pinned && (session.id !== 'old-pinned' || !['idle', 'interrupted'].includes(session.status)))) fail();
    }
    if (!ids.has('old-journey') || !ids.has('old-pinned')) fail();
    if ((state.sessions.find((session) => session.id === 'old-pinned').status === 'closed') !== ids.has('reconnected-pinned')) fail();
    const work = state.work;
    if (!record(work) || work.id !== 'old-work' || work.version !== 'blue'
      || !['pending', 'complete', 'lost'].includes(work.status)
      || work.effects !== (work.status === 'complete' ? 1 : 0)
      || work.output !== (work.status === 'complete' ? 'effect-old-work' : null)) fail();
    if (!record(state.damage) || !Array.isArray(state.damage.interruptedSessions) || !Array.isArray(state.damage.lostWork)
      || new Set(state.damage.interruptedSessions).size !== state.damage.interruptedSessions.length
      || !state.damage.interruptedSessions.every((id) => ids.has(id)
        && state.sessions.find((session) => session.id === id).status === 'interrupted')
      || !same(state.damage.lostWork, work.status === 'lost' ? ['old-work'] : [])
      || state.sessions.some((session) => (session.status === 'interrupted') !== state.damage.interruptedSessions.includes(session.id))) fail();
    if (!Array.isArray(state.requests) || state.requests.length > limits.requests
      || !Array.isArray(state.events) || state.events.length > limits.events) fail();
    for (const [index, request] of state.requests.entries()) {
      const session = record(request) && state.sessions.find((item) => item.id === request.sessionId);
      if (!session || request.sequence !== index + 1 || request.version !== session.version
        || request.cohort !== session.cohort || !['start', 'read', 'finish', 'reconnect'].includes(request.operation)
        || !['ok', 'unavailable'].includes(request.status) || request.stateValid !== (request.status === 'ok')
        || !validJourney(request.before, session) || !validJourney(request.after, session)) fail();
      if (request.status === 'ok' && request.operation === 'finish') {
        if (request.before.revision !== 1 || request.after.revision !== 2) fail();
      } else if (!same(request.before, request.after)) fail();
    }
    if (!state.events.every((event, index) => record(event) && event.sequence === index + 1
      && typeof event.action === 'string' && typeof event.code === 'string' && typeof event.detail === 'string'
      && integer(event.clock, 0, state.clock))
      || !record(state.lastOutcome) || typeof state.lastOutcome.ok !== 'boolean'
      || typeof state.lastOutcome.code !== 'string' || typeof state.lastOutcome.message !== 'string') fail();
  }

  function summarize(state) {
    assertState(state);
    const counts = {
      blueRequests: state.requests.filter((request) => request.version === 'blue').length,
      greenRequests: state.requests.filter((request) => request.version === 'green').length,
      failedRequests: state.requests.filter((request) => request.status !== 'ok').length,
      activeBlue: state.sessions.filter((session) => session.version === 'blue' && session.status === 'active').length,
      unresolvedPinned: state.sessions.filter((session) => session.version === 'blue' && session.pinned).length,
      pendingBlueWork: Number(state.work.status === 'pending'),
      interruptedSessions: state.damage.interruptedSessions.length,
      lostWork: state.damage.lostWork.length
    };
    const drainBlockers = [];
    if (counts.activeBlue) drainBlockers.push(`${counts.activeBlue} admitted blue journey/journeys still active.`);
    if (counts.unresolvedPinned) drainBlockers.push(`${counts.unresolvedPinned} unresolved old/pinned client(s).`);
    if (counts.pendingBlueWork) drainBlockers.push(`${counts.pendingBlueWork} pending blue work item(s).`);
    if (counts.interruptedSessions || counts.lostWork) drainBlockers.push('Interrupted clients or lost work cannot be drained retroactively.');
    const started = state.retentionUntil !== null;
    const elapsed = started && state.clock >= state.retentionUntil;
    const remaining = started ? Math.max(0, state.retentionUntil - state.clock) : null;
    const blockers = [];
    if (!state.blue.alive) blockers.push('Blue has already been retired.');
    if (state.newSessionTarget !== 'green') blockers.push('New-session admission does not target green.');
    if (!state.green.ready || !state.green.alive) blockers.push('Green readiness is not valid.');
    blockers.push(...drainBlockers);
    if (!started) blockers.push('Rollback retention has not started.');
    else if (!elapsed) blockers.push(`Rollback retention has ${remaining} synthetic minutes remaining.`);
    const damaged = counts.interruptedSessions || counts.lostWork || counts.failedRequests || state.retirement === 'forced';
    return {
      counts, admission: state.newSessionTarget, blueAlive: state.blue.alive, greenReady: state.green.ready,
      drain: { complete: drainBlockers.length === 0, blockers: drainBlockers },
      retention: { started, elapsed, remaining, until: state.retentionUntil },
      retire: { allowed: blockers.length === 0, blockers },
      verdict: damaged ? 'FAIL — premature synthetic retirement or failed requests.'
        : state.retirement === 'guarded' ? 'PASS — modeled retirement gates satisfied.'
          : 'PENDING — retirement and observation incomplete.',
      impact: damaged
        ? `${counts.interruptedSessions} interrupted session(s); ${counts.lostWork} lost work item(s); ${counts.failedRequests} failed observed request(s). This is not a successful migration.`
        : state.retirement === 'guarded'
          ? 'No interrupted fixture sessions or lost work observed. Finite synthetic evidence only.'
          : 'No modeled loss observed so far; migration is not complete.'
    };
  }

  function apply(previous, command) {
    assertState(previous);
    const state = clone(previous);
    const type = record(command) && actions.includes(command.type) ? command.type : 'invalid-input';
    function done(ok, code, message) {
      state.lastOutcome = { ok, code, message };
      if (state.events.length < limits.events) state.events.push({
        sequence: state.events.length + 1, clock: state.clock, action: type, code, detail: message
      });
      assertState(state);
      return state;
    }
    const invalid = (message) => done(false, 'invalid-input', message);
    const blocked = (message) => done(false, 'blocked', message);
    const find = (id) => state.sessions.find((session) => session.id === id);
    function capacity(newSession = false) {
      return state.requests.length < limits.requests && (!newSession || state.sessions.length < limits.sessions);
    }
    function observe(session, operation, before) {
      const snapshot = clone(before);
      const available = state[session.version].alive;
      if (!available) {
        session.status = 'interrupted';
        if (!state.damage.interruptedSessions.includes(session.id)) state.damage.interruptedSessions.push(session.id);
      } else if (operation === 'finish') {
        session.state.revision = 2;
        session.state.receipt = `receipt-${session.id}`;
        session.status = 'complete';
      }
      state.requests.push({
        sequence: state.requests.length + 1, sessionId: session.id, cohort: session.cohort,
        version: session.version, operation, status: available ? 'ok' : 'unavailable',
        stateValid: available, before: snapshot, after: clone(session.state)
      });
      return available;
    }
    if (state.events.length >= limits.events) {
      state.lastOutcome = { ok: false, code: 'limit', message: 'The 200-action trace limit is reached. Reset for a new rehearsal.' };
      return state;
    }
    if (type === 'invalid-input') return invalid('Unknown or malformed action. No requests or domain state changed.');

    switch (type) {
      case 'check-green': {
        if (!['compatible', 'cold', 'incompatible'].includes(command.condition)) return invalid('Readiness evidence is unrecognized.');
        state.green.assessment = command.condition;
        state.green.ready = command.condition === 'compatible' && state.green.alive;
        return state.green.ready
          ? done(true, 'green-ready', 'Green passed the synthetic warm/compatible-state check. Admission has not moved.')
          : done(false, 'not-ready', `Green is ${command.condition}: new green admission is not ready.`);
      }
      case 'set-weight':
        if (!integer(command.percent, 0, 100)) return invalid('Nominal weight must be a finite integer from 0 to 100.');
        state.nominalGreenPercent = command.percent;
        return done(true, 'weight-recorded', `${command.percent}% is advisory only. Session bindings and admission have not changed.`);
      case 'switch-new':
        if (!state.green.ready || !state.green.alive) return blocked('Green must be warm and state-compatible before new admission moves.');
        if (!state.blue.alive || state.newSessionTarget === 'green') return blocked('Blue is unavailable or admission already targets green; retention is not silently restarted.');
        if (state.clock + 10 > limits.clock) return blocked('Insufficient synthetic clock range for retention. Reset the rehearsal.');
        state.newSessionTarget = 'green';
        state.cutoverAt = state.clock;
        state.retentionUntil = state.clock + 10;
        return done(true, 'admission-switched', 'Only NEW sessions now target green. Admitted blue journeys, pinned clients, and blue work remain on blue; ten-minute retention begins.');
      case 'admit-new': {
        if (!validId(command.sessionId) || find(command.sessionId) || command.sessionId === 'reconnected-pinned') {
          return invalid('Use a unique session ID: 1–32 lowercase letters/digits/hyphens, beginning with a letter; reconnect identity is reserved.');
        }
        const version = state.newSessionTarget;
        if (!state[version].alive || (version === 'green' && !state.green.ready)) return blocked('The new-admission target is unavailable or not ready. No session was admitted.');
        if (!capacity(true)) return blocked('Session/request observation limit reached. Reset before admitting more fixtures.');
        const session = makeSession(command.sessionId, version === 'green' ? 'new-green' : 'new-blue',
          version, `learner-${command.sessionId}`, 'item-N');
        state.sessions.push(session);
        observe(session, 'start', session.state);
        return done(true, 'admitted', `${session.id} admitted to ${version}; the start request and valid state were observed, not inferred from weight.`);
      }
      case 'read-pinned': {
        const session = find('old-pinned');
        if (!session.pinned) return blocked('The old pinned binding was explicitly closed. Use the reconnected green journey instead.');
        if (!capacity()) return blocked('Request observation limit reached. Reset the rehearsal.');
        const available = observe(session, 'read', session.state);
        return done(available, available ? 'observed' : 'unavailable', available
          ? 'The old pinned read still reached BLUE with its original valid state. A nominal green weight does not remove this dependency.'
          : 'The old pinned request reached retired BLUE: unavailable. There is no valid completion evidence.');
      }
      case 'finish-old':
      case 'finish-session': {
        const id = type === 'finish-old' ? 'old-journey' : command.sessionId;
        if (!validId(id) || !find(id)) return invalid('A known session ID is required to finish a journey.');
        const session = find(id);
        if (!['active', 'interrupted'].includes(session.status) || session.pinned) return blocked('This session has no finishable admitted journey. Completed receipts are not replayed.');
        if (!capacity()) return blocked('Request observation limit reached. Reset the rehearsal.');
        const available = observe(session, 'finish', session.state);
        return done(available, available ? 'finished' : 'unavailable', available
          ? `${id} finished on its admitted ${session.version} binding: same subject/cart, schema 1, revision 2, one receipt.`
          : `${id} could not finish on retired ${session.version}; its state is not evidence of successful completion.`);
      }
      case 'reconnect-pinned': {
        const old = find('old-pinned');
        if (!old.pinned || old.status !== 'idle' || !state.blue.alive
          || state.newSessionTarget !== 'green' || !state.green.ready || !state.green.alive) {
          return blocked('Reconnect requires the idle old binding still available and ready green new admission. An interrupted client cannot be repaired retroactively.');
        }
        if (!capacity(true)) return blocked('Session/request observation limit reached. Reset the rehearsal.');
        const session = makeSession('reconnected-pinned', 'reconnected', 'green', old.state.subject, old.state.cart[0]);
        session.state = clone(old.state);
        old.status = 'closed';
        old.pinned = false;
        state.sessions.push(session);
        observe(session, 'reconnect', session.state);
        return done(true, 'reconnected', 'The old idle binding closed explicitly. A NEW green session preserved its synthetic subject/cart; no admitted blue work was teleported.');
      }
      case 'finish-work':
        if (state.work.status !== 'pending' || !state.blue.alive) return blocked('No pending executable blue work remains; lost work is not silently replayed.');
        state.work.status = 'complete';
        state.work.effects = 1;
        state.work.output = 'effect-old-work';
        return done(true, 'work-finished', 'Blue work completed its one expected effect. This work event is not counted as an HTTP request.');
      case 'tick':
        if (!integer(command.minutes, 1, 120) || state.clock + command.minutes > limits.clock) {
          return invalid('Advance a finite whole number of synthetic minutes from 1 to 120, within the clock limit.');
        }
        state.clock += command.minutes;
        return done(true, 'clock-advanced', `Advanced ${command.minutes} SYNTHETIC minutes. No wall-clock observation or automatic drain was implied.`);
      case 'rollback':
        if (!state.blue.alive || state.newSessionTarget !== 'green' || state.retentionUntil === null || state.clock >= state.retentionUntil) {
          return blocked('Rollback is offered only while retained blue is available within the declared retention window.');
        }
        state.newSessionTarget = 'blue';
        state.cutoverAt = null;
        state.retentionUntil = null;
        return done(true, 'rolled-back', 'NEW admission returned to retained blue. Already admitted green sessions stay on green and can finish; neither service was retired.');
      case 'retire': {
        const gate = summarize(state).retire;
        if (!gate.allowed) return blocked(`Guarded retirement rejected: ${gate.blockers.join(' ')}`);
        state.blue.alive = false;
        state.retirement = 'guarded';
        return done(true, 'retired', 'Blue retired only after observed old completion, explicit pinned resolution, one work effect, and separate rollback-retention expiry.');
      }
      case 'force-retire':
        if (!state.blue.alive) return blocked('Blue is already retired; this does not restore lost work.');
        if (summarize(state).retire.allowed) return blocked('All modeled gates are satisfied. Use guarded retirement instead of the unsafe counterexample.');
        // This is the explicitly unsafe teaching branch, never an implementation recommendation.
        state.blue.alive = false;
        state.retirement = 'forced';
        for (const session of state.sessions) {
          if (session.version === 'blue' && (session.status === 'active' || session.pinned)) {
            session.status = 'interrupted';
            state.damage.interruptedSessions.push(session.id);
          }
        }
        if (state.work.status === 'pending') {
          state.work.status = 'lost';
          state.damage.lostWork.push(state.work.id);
        }
        return done(false, 'forced-retirement', 'UNSAFE: retirement gates were bypassed. Inspect interrupted clients/lost work, then try the pinned request. This is not a successful migration.');
      default:
        return invalid('Unknown action.');
    }
  }

  return Object.freeze({ start, apply, summarize, actions, limits });
}));
