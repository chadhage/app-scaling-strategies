'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

const experiments = Object.freeze({
  'blue-green': { scenarios: ['S001', 'S031', 'S041', 'S101', 'S148'], effect: 'Warmed, externally routed handoff with shared synthetic state and an in-flight request.' },
  'native-swap': { scenarios: ['S002', 'S122'], effect: 'Prepared native Linux code-slot swap; worker recycling is not application-controlled draining.' },
  canary: { scenarios: ['S003', 'S031', 'S148'], effect: '5/25/50/100 percent stable cohorts, gated by observed journeys at every stage.' },
  ab: { scenarios: ['S004', 'S031'], effect: 'Stable, deliberately stratified 50/50 cohorts; not complete migration.' },
  scale: { scenarios: ['S011', 'S015'], effect: 'Actual plan capacity 1 -> 2 -> 1 with observed worker identities and state continuity.' },
  'readiness-abort': { scenarios: ['S022', 'S027', 'S091'], effect: 'A dependency-aware readiness rejection prevents candidate exposure.' },
  rollback: { scenarios: ['S092', 'S093', 'S097'], effect: 'An exposed latency regression is recorded, then routing returns to the ready original version.' }
});

function fail(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function integer(value, name, min, max) {
  const number = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || Object.is(number, -0) || number < min || number > max) {
    throw fail('invalid-input', `${name} must be an integer in [${min}, ${max}].`);
  }
  return number;
}

function identifier(value, name) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)) {
    throw fail('invalid-input', `${name} is not a bounded identifier.`);
  }
  return value;
}

function secretEquals(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bucket(epoch, journeyId) {
  return createHash('sha256').update(`${epoch}:${journeyId}`).digest().readUInt32BE(0) % 100;
}

function destination(route, journeyId) {
  return bucket(route.epoch, journeyId) < route.greenPercent ? 'green' : 'blue';
}

function resourceGroup(runId, attempt, experiment) {
  integer(runId, 'runId', 1, Number.MAX_SAFE_INTEGER);
  integer(attempt, 'attempt', 1, 9999);
  if (!Object.hasOwn(experiments, experiment)) throw fail('unknown-experiment', 'Choose an implemented experiment.');
  return `ass-demo-${runId}-${attempt}-${experiment}`;
}

function catalog(markdown) {
  const rows = markdown.split(/\r?\n/).map(line => line.match(/^\| (S\d{3}) \| \*\*(.+?):\*\* (.+) \|$/)).filter(Boolean);
  if (rows.length !== 150 || rows.some((row, i) => row[1] !== `S${String(i + 1).padStart(3, '0')}`)) {
    throw fail('catalog-drift', 'README must contain exactly the ordered S001-S150 scenario catalog.');
  }
  return rows.map(([, id, title, requirement]) => {
    const number = Number(id.slice(1));
    const implementedBy = Object.entries(experiments).filter(([, experiment]) => experiment.scenarios.includes(id)).map(([key]) => key);
    const phase = implementedBy.length ? 1 : number >= 111 && number <= 120 || number >= 145 ? 4 : number >= 121 && number <= 130 ? 2 : 3;
    return {
      id, title, requirement, phase, implementedBy,
      implementation: implementedBy.length ? 'partial-bounded-demonstration' : 'planned',
      qualification: 'not-qualified',
      limitation: implementedBy.length
        ? 'Only the declared synthetic App Service HTTP/state envelope is exercised. Native execution and review are still required; no OAuth, browser, full n-tier, or five-nines claim.'
        : 'No executable native experiment yet. Never treat catalog inclusion as a passing test.'
    };
  });
}

function summarize(journeys) {
  const attempted = journeys.length;
  const successful = journeys.filter(journey => journey.outcome === 'uninterrupted').length;
  const interrupted = journeys.filter(journey => journey.outcome === 'interrupted').length;
  const unverified = attempted - successful - interrupted;
  return {
    attempted, successful, interrupted, unverified,
    successRatio: attempted ? successful / attempted : null,
    illustrativeIndependentZeroFailure95UpperBound: attempted && !interrupted && !unverified ? -Math.expm1(Math.log(0.05) / attempted) : null,
    independenceEstablished: false,
    fiveNinesEstablished: false
  };
}

module.exports = { experiments, fail, integer, identifier, secretEquals, bucket, destination, resourceGroup, catalog, summarize };
