(function (root) {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const MAX_REHEARSALS = 12;
  const CHOICES = freeze({
    cookies: ['absent', 'browser-fixture'],
    identity: ['bearer-subject', 'browser-session'],
    routing: ['api-policy', 'browser-cookie'],
    state: ['shared-subject', 'instance-local'],
    observation: ['complete', 'delayed', 'unavailable', 'invalid-bearer'],
  });
  const DEFAULTS = freeze({
    cookies: 'absent',
    identity: 'bearer-subject',
    routing: 'api-policy',
    state: 'shared-subject',
    observation: 'complete',
  });
  const FIXTURE = freeze([
    {
      id: 'synthetic-api-040',
      kind: 'API',
      subject: 'synthetic-subject-api-040',
      bearerMarker: 'SYNTHETIC-API-MARKER-NOT-A-TOKEN',
      work: { draft: 'synthetic-api-draft-040', step: 2, revision: 7 },
      beforeMs: 60,
      afterMs: 90,
      budgetMs: 300,
    },
    {
      id: 'synthetic-mobile-040',
      kind: 'Mobile',
      subject: 'synthetic-subject-mobile-040',
      bearerMarker: 'SYNTHETIC-MOBILE-MARKER-NOT-A-TOKEN',
      work: { draft: 'synthetic-mobile-draft-040', step: 3, revision: 9 },
      beforeMs: 90,
      afterMs: 150,
      budgetMs: 300,
    },
  ]);

  function configuration(input) {
    const keys = Object.keys(CHOICES);
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length) {
      throw new TypeError('Invalid configuration: provide exactly the five declared choices.');
    }
    const result = {};
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable
          || !CHOICES[key].includes(property.value)) {
        throw new TypeError(`Invalid ${key}: choose ${CHOICES[key].join(' or ')}.`);
      }
      result[key] = property.value;
    }
    return freeze(result);
  }

  function sameWork(actual, expected) {
    return actual !== null && actual.draft === expected.draft
      && actual.step === expected.step && actual.revision === expected.revision;
  }

  function evaluate(input) {
    const config = configuration(input);
    const hasCookie = config.cookies === 'browser-fixture';
    const checks = [{
      client: 'both',
      name: 'cookie-removal',
      status: hasCookie ? 'unknown' : 'passed',
      detail: hasCookie
        ? 'Browser-only cookie trace: cookie-less continuity has not been exercised.'
        : 'No synthetic browser cookies accompany either client.',
    }];
    const clients = FIXTURE.map((client) => {
      const before = {
        destination: 'v1', subject: client.subject, status: 200,
        work: client.work, elapsedMs: client.beforeMs, originalDeadlineMs: client.budgetMs,
      };
      let after = null;
      if (!(config.observation === 'unavailable' && client.kind === 'Mobile')) {
        const destination = config.routing === 'api-policy' || hasCookie ? 'v2' : 'v1';
        const subject = config.identity === 'bearer-subject'
          ? (config.observation === 'invalid-bearer' ? null : client.subject)
          : (hasCookie ? client.subject : null);
        after = {
          destination,
          subject,
          status: subject ? 200 : 401,
          work: subject && (config.state === 'shared-subject' || destination === 'v1') ? client.work : null,
          elapsedMs: client.beforeMs + client.afterMs + (config.observation === 'delayed' ? 200 : 0),
          originalDeadlineMs: client.budgetMs,
          cookiesSent: hasCookie ? 1 : 0,
          identityEvidence: config.identity === 'bearer-subject'
            ? (subject ? 'synthetic bearer subject verified' : 'synthetic invalid bearer rejected')
            : (subject ? 'synthetic browser session only' : 'no browser session; rejected'),
        };
      }
      const add = (name, passed, detail) => checks.push({
        client: client.id, name, status: after ? (passed ? 'passed' : 'failed') : 'unknown',
        detail: after ? detail : 'Post-handoff observation unavailable; no outcome inferred.',
      });
      add('identity', after && after.status === 200 && after.subject === client.subject,
        after && after.subject ? 'Original synthetic subject retained.' : 'Required identity rejected (401).');
      add('destination', after && after.destination === 'v2',
        after && after.destination === 'v2' ? 'Observed synthetic destination is v2.' : 'Cookie routing falls back to v1; the client did not migrate.');
      add('work-state', after && sameWork(after.work, client.work),
        after && sameWork(after.work, client.work) ? 'Draft, step and revision all match.' : 'Required work is missing; HTTP status alone cannot prove continuity.');
      add('original-budget', after && after.elapsedMs <= client.budgetMs,
        after ? `${after.elapsedMs} ms from the original start / ${client.budgetMs} ms deadline; no restart.` : '');
      return {
        clientId: client.id, kind: client.kind, bearerMarker: client.bearerMarker,
        expectedSubject: client.subject, expectedWork: client.work, before, after,
      };
    });
    const metrics = {
      passed: checks.filter((check) => check.status === 'passed').length,
      failed: checks.filter((check) => check.status === 'failed').length,
      unknown: checks.filter((check) => check.status === 'unknown').length,
      observedClients: clients.filter((client) => client.after !== null).length,
      moved: checks.filter((check) => check.name === 'destination' && check.status === 'passed').length,
      identitiesPreserved: checks.filter((check) => check.name === 'identity' && check.status === 'passed').length,
      statesPreserved: checks.filter((check) => check.name === 'work-state' && check.status === 'passed').length,
      withinOriginalBudget: checks.filter((check) => check.name === 'original-budget' && check.status === 'passed').length,
      cookiesSent: hasCookie ? 2 : 0,
    };
    const verdict = metrics.failed ? 'failure' : metrics.unknown ? 'unknown' : 'success';
    return freeze({
      verdict, configuration: config, clients, checks, metrics,
      userImpact: verdict === 'success'
        ? 'Both synthetic clients moved to v2 without cookies, with identity, work and original deadlines preserved.'
        : verdict === 'failure'
          ? 'Synthetic continuity failed: at least one required observed check failed. Do not call this a successful migration.'
          : 'Cookie-less continuity is unproven: browser-only or missing observations are not success.',
      cleanup: 'No network, accounts, resources or persistent state were created. Page history is retained until reload.',
    });
  }

  function createLesson() {
    const history = [];
    let current = null;
    let phase = 'ready';
    const snapshot = () => freeze({
      phase, used: history.length, remaining: MAX_REHEARSALS - history.length,
      current, history: [...history],
    });
    return Object.freeze({
      snapshot,
      rehearse(input) {
        if (history.length >= MAX_REHEARSALS) throw new Error('The twelve-rehearsal page budget is exhausted; reset cannot replenish it.');
        if (phase !== 'ready') throw new Error('Reset the checked rehearsal before running another configuration.');
        const result = freeze({ ...evaluate(input), run: history.length + 1 });
        history.push(result);
        current = result;
        phase = 'checked';
        return result;
      },
      reset() {
        current = null;
        phase = history.length >= MAX_REHEARSALS ? 'exhausted' : 'ready';
        return snapshot();
      },
    });
  }

  const api = Object.freeze({ DEFAULTS, CHOICES, FIXTURE, MAX_REHEARSALS, evaluate, createLesson });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S040Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
