'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { fail, bucket, summarize } = require('./contract.cjs');

class Evidence {
  constructor(directory, context) {
    fs.mkdirSync(directory, { recursive: true });
    this.directory = directory;
    this.context = context;
    this.journeys = [];
    this.requests = [];
    this.events = [];
  }

  event(type, details) {
    const event = { type, time: new Date().toISOString(), ...details };
    fs.appendFileSync(path.join(this.directory, 'observations.jsonl'), `${JSON.stringify(event)}\n`);
    this.events.push(event);
    return event;
  }

  save(outcome, controlPassed, error = null) {
    const groups = {};
    for (const stage of new Set(this.requests.map(request => request.stage))) {
      const requests = this.requests.filter(request => request.stage === stage);
      const latencies = requests.map(request => request.milliseconds).sort((a, b) => a - b);
      const percentile = p => latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null;
      groups[stage] = {
        requests: requests.length, failedRequests: requests.filter(request => !request.passed).length,
        p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
        observedVersions: [...new Set(requests.map(request => request.version).filter(Boolean))],
        observedWorkers: [...new Set(requests.map(request => request.instanceId).filter(Boolean))]
      };
    }
    const result = {
      schemaVersion: 1, context: this.context, outcome, controlPassed,
      evidenceLevel: 'native-demo-not-qualified',
      population: 'Explicitly admitted synthetic cross-transition sessions; stationary controls and continuous diagnostic journeys are reported separately.',
      transitionJourneys: summarize(this.journeys.filter(journey => journey.affected)),
      controls: summarize(this.journeys.filter(journey => !journey.affected)),
      stages: groups, journeys: this.journeys, error,
      limits: [
        'Shared App Service plan, including the router and both slots; a slot adds no compute.',
        'Synthetic bearer-authorized HTTP/state journeys, not browser rendering or real user authentication.',
        'LRS blob state, no regional redundancy, database, cache, queue, or long-lived stream qualification.',
        'No independent-trial assumption or five-nines claim; errors preceding rollback remain failures.'
      ]
    };
    fs.writeFileSync(path.join(this.directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
}

class Client {
  constructor(context, credentials, evidence) {
    this.context = context;
    this.credentials = credentials;
    this.evidence = evidence;
    this.stage = 'baseline';
  }

  async request(endpoint, body, { base = this.context.routerUrl, control = false, budgetMs = this.context.requestBudgetMs } = {}) {
    const started = performance.now();
    const observation = { stage: this.stage, endpoint, milliseconds: 0, passed: false };
    try {
      const response = await fetch(new URL(endpoint, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${control ? this.credentials.controlToken : this.credentials.demoToken}`,
          'content-type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(10000, budgetMs)),
        redirect: 'error'
      });
      observation.status = response.status;
      const value = await response.json();
      observation.milliseconds = performance.now() - started;
      const deployment = value.deployment || (endpoint === '/identity' ? value : null);
      if (deployment) {
        observation.version = deployment.version;
        observation.instanceId = deployment.instanceId;
        if (deployment.epoch !== this.context.epoch || deployment.commit !== this.context.commit || !deployment.instanceId) {
          throw fail('unverified-identity', 'Actual deployment epoch, artifact, or worker identity did not match.', 502);
        }
      }
      if (!response.ok) throw fail(value.error || 'http-error', `Demo endpoint returned HTTP ${response.status}.`, response.status);
      if (observation.milliseconds > budgetMs) throw fail('latency-budget-exceeded', `Request exceeded its ${budgetMs}ms budget.`, 504);
      observation.passed = true;
      return value;
    } catch (error) {
      observation.error = error.code || error.name || 'request-failed';
      throw error;
    } finally {
      observation.milliseconds = performance.now() - started;
      this.evidence.requests.push(observation);
      this.evidence.event('request', observation);
    }
  }

  check(value, journey, counter, effects) {
    if (!value.deployment || !value.deployment.instanceId) throw fail('unverified-identity', 'Journey deployment identity is missing.', 502);
    if (!value.state || value.state.id !== journey.id || value.state.marker !== journey.marker ||
      value.state.counter !== counter || value.state.effects !== effects) {
      throw fail('correctness-error', 'State, counter, or business-effect oracle failed.', 409);
    }
    journey.versions.push(value.deployment.version);
    return value;
  }

  async begin(journey) {
    journey.startedAt = Date.now();
    return this.check(await this.request('/journey/start', { id: journey.id, marker: journey.marker }), journey, 0, 0);
  }

  async finish(journey, expectedVersion, alreadyStepped = false) {
    if (!alreadyStepped) {
      this.check(await this.request('/journey/step', { id: journey.id, marker: journey.marker, expectedCounter: 0 }), journey, 1, 0);
    }
    const body = { id: journey.id, marker: journey.marker, operationId: `op-${journey.id}` };
    this.check(await this.request('/journey/complete', body), journey, 1, 1);
    const completed = this.check(await this.request('/journey/complete', body), journey, 1, 1);
    if (completed.state.operationId !== body.operationId) throw fail('correctness-error', 'The persisted operation identity changed.', 409);
    if (Date.now() - journey.startedAt > this.context.journeyBudgetMs) throw fail('journey-budget-exceeded', 'The complete transition journey exceeded its declared budget.', 504);
    if (expectedVersion && completed.deployment.version !== expectedVersion) throw fail('migration-not-observed', 'The intended destination was not actually observed.', 502);
    if (journey.affected && journey.requireVersionChange && journey.versions[0] === completed.deployment.version) {
      throw fail('migration-not-observed', 'An intended user remained entirely on the old version.', 502);
    }
    journey.outcome = 'uninterrupted';
  }

  async diagnostic() {
    const journey = newJourney(`load-${randomUUID()}`, false);
    try {
      await this.begin(journey);
      await this.finish(journey);
      return true;
    } catch (error) {
      this.evidence.event('diagnostic-interruption', { id: journey.id, stage: this.stage, error: error.code || error.name });
      return false;
    }
  }
}

function newJourney(id, affected, requireVersionChange = false) {
  return { id, marker: `m-${randomUUID()}`, affected, requireVersionChange, versions: [], outcome: 'unverified' };
}

function selectJourneys(epoch, count, from, to, label) {
  const moving = [];
  const stationary = [];
  for (let i = 0; i < 50000 && (moving.length < count || stationary.length < count); i++) {
    const id = `${label}-${i}`;
    const value = bucket(epoch, id);
    const changed = (value < from) !== (value < to);
    (changed ? moving : stationary).push(newJourney(id, changed, changed));
    if (from === 0 && to === 100 && moving.length === count) break;
  }
  const moveCount = from === 0 && to === 100 ? count : count / 2;
  if (moving.length < moveCount || stationary.length < count - moveCount) throw fail('sampling-failed', 'Cannot construct the declared cohort sample.');
  return [...moving.slice(0, moveCount), ...stationary.slice(0, count - moveCount)];
}

async function poll(check, description, { timeoutMs = 600000, intervalMs = 2000, onFailure = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      if (await check()) return;
    } catch (error) {
      onFailure(error);
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  throw fail('gate-timeout', `Timed out: ${description}`, 504);
}

module.exports = { Evidence, Client, newJourney, selectJourneys, poll };
