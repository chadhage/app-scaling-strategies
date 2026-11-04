(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C033Journey', { value: factory() });
}(globalThis, function () {
  'use strict';

  const boundaries = Object.freeze(['before-first-read', 'between-reads']);
  const drafts = Object.freeze(['synthetic-draft-A', 'synthetic-draft-B']);
  const profiles = Object.freeze(['synthetic-001', 'synthetic-002', 'synthetic-999']);
  const budgets = Object.freeze([1000, 6000, 12000]);
  const ATTEMPT_TTL_MS = 45000;
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  function invalid(code) { return Object.assign(new Error(code), { code }); }
  function validateConfig(config) {
    if (!exactKeys(config, ['profileId', 'draft', 'boundary', 'budgetMs']) ||
        Object.values(Object.getOwnPropertyDescriptors(config)).some((field) => !Object.hasOwn(field, 'value')) ||
        !profiles.includes(config.profileId) || !drafts.includes(config.draft) ||
        !boundaries.includes(config.boundary) || !budgets.includes(config.budgetMs)) throw invalid('EXPLICIT_CLOSED_SYNTHETIC_CONFIG_REQUIRED');
    return freeze(clone(config));
  }
  function validReply(reply, request) {
    if (!reply || reply.requestToken !== request.requestToken || reply.implementation !== request.implementation) {
      throw invalid('OUT_OF_ORDER_REPLY');
    }
    if (!Number.isInteger(reply.status) || reply.status < 100 || reply.status > 599) throw invalid('UNKNOWN_REPLY_STATUS');
    if (reply.status !== 200) return false;
    const value = reply.value;
    const profile = value?.profile;
    const stamp = value?.stamp;
    const expectedStamp = {
      tier: 'getProfile', implementation: request.implementation,
      implementationVersion: request.implementation === 'v1' ? '1.0.0' : '2.0.0',
      deploymentStamp: `C020-loopback-${request.implementation}-r1`,
      deploymentKind: 'local-fixture-label-not-cloud', fixtureRevision: 'C020-r1',
      profileCatalogVersion: 'synthetic-profiles/1', dataKind: 'synthetic'
    };
    if (!exactKeys(value, ['apiContract', 'profile', 'stamp']) || value.apiContract !== 'getProfile/1' ||
        canonical(stamp) !== canonical(expectedStamp) || reply.headerVersion !== stamp.implementationVersion ||
        reply.headerDeployment !== stamp.deploymentStamp) throw invalid('UNKNOWN_CONTRACT_OR_STAMP_REPLY');
    if (!exactKeys(profile, ['id', 'displayName', 'email', 'preferences']) || profile.id !== request.profileId ||
        typeof profile.displayName !== 'string' || !profile.displayName ||
        typeof profile.email !== 'string' || !profile.email.endsWith('@example.invalid') ||
        !exactKeys(profile.preferences, ['locale', 'theme', 'topics']) ||
        typeof profile.preferences.locale !== 'string' || !['dark', 'light'].includes(profile.preferences.theme) ||
        !Array.isArray(profile.preferences.topics) || profile.preferences.topics.some((topic) => typeof topic !== 'string')) {
      throw invalid('UNKNOWN_PROFILE_REPLY');
    }
    return true;
  }

  class Journey {
    constructor({ read, clock, onChange = () => {} } = {}) {
      if (typeof read !== 'function' || typeof clock !== 'function' || typeof onChange !== 'function') {
        throw invalid('EXPLICIT_DRIVER_AND_MONOTONIC_CLOCK_REQUIRED');
      }
      this.read = read;
      this.clock = clock;
      this.onChange = onChange;
      this.current = null;
      this.history = [];
      this.events = [];
      this.sequence = 0;
      this.lastClock = 0;
      this.running = Promise.resolve();
    }
    now() {
      const value = this.clock();
      if (!Number.isFinite(value) || value < this.lastClock || value < 0) throw invalid('MONOTONIC_CLOCK_INVALID');
      this.lastClock = value;
      return value;
    }
    active(attempt = this.current) {
      return attempt === this.current && !!attempt && ['running', 'paused'].includes(attempt.phase);
    }
    event(attempt, code, detail = {}, time = this.lastClock) {
      this.events.push(freeze({ attemptId: attempt.attemptId, code, at: time, elapsedMs: time - attempt.startedAt, ...detail }));
    }
    notify() { this.onChange(); }
    start(config) {
      if (this.active()) throw invalid('ORIGINAL_ATTEMPT_ALREADY_ACTIVE');
      if (this.sequence >= 16) throw invalid('OWN_ATTEMPT_LIMIT_REACHED_HISTORY_RETAINED');
      const original = validateConfig(config);
      const startedAt = this.now();
      const attempt = {
        attemptId: `synthetic-C033-attempt-${++this.sequence}`, original, startedAt,
        deadline: startedAt + original.budgetMs, phase: 'running', outcome: null, code: null,
        pausedAt: null, totalPausedMs: 0, endedAt: null, requests: 0, responses: 0,
        acknowledgements: [], gate: null, abort: new AbortController(), ttl: null, clockValid: true
      };
      this.current = attempt;
      this.event(attempt, 'ORIGINAL_ATTEMPT_STARTED', { boundary: original.boundary }, startedAt);
      attempt.ttl = setTimeout(() => { if (this.active(attempt)) this.finish(attempt, 'unknown', 'OWN_ATTEMPT_TTL_EXPIRED'); }, ATTEMPT_TTL_MS);
      this.running = this.drive(attempt).catch((error) => {
        if (this.active(attempt)) this.finish(attempt, 'unknown', error.code || 'INTERRUPTED_OR_UNAVAILABLE_REPLY');
        else this.event(attempt, 'LATE_OR_OUT_OF_ORDER_REPLY', { replyCode: error.code || 'INTERRUPTED_OR_UNAVAILABLE_REPLY' });
      });
      this.notify();
      return attempt.attemptId;
    }
    async hold(attempt, boundary) {
      if (!this.active(attempt)) return false;
      if (attempt.original.boundary !== boundary) return true;
      attempt.pausedAt = this.now();
      attempt.phase = 'paused';
      this.event(attempt, 'BOUNDARY_HELD', { boundary, requests: attempt.requests }, attempt.pausedAt);
      const gate = new Promise((resolve) => { attempt.gate = resolve; });
      this.notify();
      return gate;
    }
    resume() {
      const attempt = this.current;
      if (!attempt || attempt.phase !== 'paused' || !attempt.gate) return false;
      const time = this.now();
      attempt.totalPausedMs += time - attempt.pausedAt;
      attempt.pausedAt = null;
      attempt.phase = 'running';
      this.event(attempt, 'RESUME_ORIGINAL_ATTEMPT', {}, time);
      const release = attempt.gate;
      attempt.gate = null;
      release(true);
      this.notify();
      return true;
    }
    async readOnce(attempt, implementation) {
      if (!this.active(attempt)) return false;
      const request = Object.freeze({
        implementation, profileId: attempt.original.profileId,
        requestToken: `${attempt.attemptId}/read-${attempt.requests + 1}/${implementation}`,
        signal: attempt.abort.signal
      });
      attempt.requests++;
      this.event(attempt, 'ACTUAL_READ_STARTED', { implementation, ordinal: attempt.requests }, this.now());
      this.notify();
      const reply = await this.read(request);
      if (!this.active(attempt)) {
        this.event(attempt, 'LATE_OR_OUT_OF_ORDER_REPLY', { httpStatus: reply?.status ?? null }, this.now());
        this.notify();
        return false;
      }
      attempt.responses++;
      if (!validReply(reply, request)) {
        this.finish(attempt, 'failed', `FAILED_HTTP_REPLY_${reply.status}`, reply.value?.error?.code || null);
        return false;
      }
      const value = freeze(clone(reply.value));
      if (attempt.acknowledgements.length && canonical(value.profile) !== canonical(attempt.acknowledgements[0].profile)) {
        throw invalid('UNKNOWN_BUSINESS_STATE_CONTINUITY');
      }
      attempt.acknowledgements.push(value);
      this.event(attempt, 'ACTUAL_READ_ACKNOWLEDGED', { implementation, ordinal: attempt.responses }, this.now());
      this.notify();
      return true;
    }
    async drive(attempt) {
      if (!await this.hold(attempt, 'before-first-read') || !this.active(attempt)) return;
      if (!await this.readOnce(attempt, 'v1')) return;
      if (!await this.hold(attempt, 'between-reads') || !this.active(attempt)) return;
      if (!await this.readOnce(attempt, 'v2')) return;
      if (attempt.requests !== 2 || attempt.responses !== 2 || attempt.acknowledgements.length !== 2) {
        throw invalid('UNKNOWN_DUPLICATE_OR_MISSING_ACKNOWLEDGEMENT');
      }
      this.finish(attempt, 'observed', 'TWO_READ_LOCAL_SEGMENT_OBSERVED');
    }
    finish(attempt, outcome, code, replyCode = null) {
      if (!this.active(attempt)) return false;
      let time;
      try { time = this.now(); }
      catch { time = this.lastClock; outcome = 'unknown'; code = 'MONOTONIC_CLOCK_INVALID'; attempt.clockValid = false; }
      if (attempt.pausedAt !== null) attempt.totalPausedMs += time - attempt.pausedAt;
      attempt.pausedAt = null;
      attempt.endedAt = time;
      attempt.phase = outcome === 'observed' ? 'complete' : outcome;
      attempt.outcome = outcome;
      attempt.code = code;
      clearTimeout(attempt.ttl);
      const release = attempt.gate;
      attempt.gate = null;
      if (release) release(false);
      if (outcome !== 'observed') attempt.abort.abort();
      this.event(attempt, code, { outcome, replyCode }, time);
      this.history.push(freeze({
        attemptId: attempt.attemptId, original: attempt.original, outcome, code, replyCode,
        startedAt: attempt.startedAt, deadline: attempt.deadline, endedAt: time,
        elapsedMs: time - attempt.startedAt, pausedMs: attempt.totalPausedMs,
        budgetExceeded: time >= attempt.deadline, clockValid: attempt.clockValid,
        requests: attempt.requests, responses: attempt.responses,
        acknowledgements: clone(attempt.acknowledgements), fullJourneyQualified: false
      }));
      this.notify();
      return true;
    }
    stop() { return this.finish(this.current, 'unknown', 'INTERRUPTED_BY_STOP'); }
    reset() {
      if (this.active()) this.finish(this.current, 'unknown', 'INTERRUPTED_BY_RESET');
      if (this.current) this.event(this.current, 'RESET_VIEW_HISTORY_RETAINED');
      this.current = null;
      this.notify();
      return true;
    }
    done() { return this.running; }
    snapshot() {
      const attempt = this.current;
      let sampledAt = this.lastClock;
      if (this.active(attempt)) {
        try { sampledAt = this.now(); }
        catch { this.finish(attempt, 'unknown', 'MONOTONIC_CLOCK_INVALID'); }
      }
      const end = attempt?.endedAt ?? sampledAt;
      return freeze({
        phase: attempt?.phase ?? 'idle', attemptId: attempt?.attemptId ?? null,
        original: attempt?.original ?? null, startedAt: attempt?.startedAt ?? null, deadline: attempt?.deadline ?? null,
        sampledAt, elapsedMs: attempt ? end - attempt.startedAt : 0,
        pausedMs: attempt ? attempt.totalPausedMs + (attempt.pausedAt === null ? 0 : end - attempt.pausedAt) : 0,
        budgetExceeded: attempt ? end >= attempt.deadline : false, clockValid: attempt?.clockValid ?? true,
        requests: attempt?.requests ?? 0, responses: attempt?.responses ?? 0,
        acknowledgements: clone(attempt?.acknowledgements ?? []),
        outcome: attempt?.outcome ?? null, code: attempt?.code ?? null,
        history: clone(this.history), events: clone(this.events),
        fullJourneyQualified: false, nativeTransportQualified: false, productionRuntimeValidated: false
      });
    }
  }
  return freeze({ createJourney: (options) => new Journey(options), boundaries, drafts, profiles, budgets, ATTEMPT_TTL_MS });
}));
