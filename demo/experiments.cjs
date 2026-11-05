'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const { fail, destination } = require('./lib/contract.cjs');
const { Client, newJourney, selectJourneys, poll } = require('./lib/client.cjs');

async function runExperiment(context, credentials, evidence, platform) {
  const client = new Client(context, credentials, evidence);
  const route = () => client.request('/control/route', undefined, { control: true });
  const setRoute = async (percent, initialize = false) => {
    const before = initialize ? { revision: -1 } : await route();
    const written = await client.request('/control/route', {
      epoch: context.epoch, greenPercent: percent, expectedRevision: before.revision
    }, { control: true });
    const effective = await route();
    if (effective.greenPercent !== percent || effective.epoch !== context.epoch || effective.revision !== written.revision) {
      throw fail('routing-not-converged', 'Effective routing did not match the confirmed controller revision.', 502);
    }
    evidence.event('effective-route', effective);
  };
  const fault = (unready, delayMs) => client.request('/control/fault', { epoch: context.epoch, unready, delayMs }, { control: true });
  const ready = async (base, version) => {
    let consecutive = 0;
    await poll(async () => {
      const health = await client.request('/health/ready', undefined, { base });
      const identity = await client.request('/identity', undefined, { base });
      if (health.ready !== true || identity.version !== version) { consecutive = 0; return false; }
      consecutive++;
      return consecutive >= 3;
    }, `three fresh readiness and identity observations for ${version}`, {
      timeoutMs: context.readinessTimeoutMs,
      intervalMs: 1000,
      onFailure: error => { consecutive = 0; evidence.event('readiness-not-met', { version, error: error.code || error.name }); }
    });
    evidence.event('lifecycle', { version, state: 'READY', evidenceFreshAt: new Date().toISOString() });
  };
  let stopped = false;
  let monitoring;
  let diagnosticFailures = 0;
  let outcome = 'unverified';
  let controlPassed = false;
  let runError = null;
  const recover = async () => {
    for (const [origin, base] of [['blue', context.blueUrl], ['green', context.greenUrl]]) {
      let identity;
      try { identity = await client.request('/identity', undefined, { base }); }
      catch (error) {
        evidence.event('rollback-origin-unavailable', { origin, code: error.code || error.name, message: error.message });
        continue;
      }
      if (identity.version !== 'blue') continue;
      await ready(base, 'blue');
      await setRoute(origin === 'green' ? 100 : 0);
      const check = newJourney(`recovery-${Date.now()}`, false);
      await client.begin(check);
      await client.finish(check, 'blue');
      evidence.event('rollback', { verified: true, originalVersionAt: origin });
      return;
    }
    throw fail('rollback-unavailable', 'No freshly verified original blue deployment remains.', 503);
  };
  const transition = async ({ from, to, label, trigger, native = false, capacity = false, slow = false }) => {
    client.stage = label;
    const journeys = native || capacity
      ? Array.from({ length: context.users }, (_, i) => newJourney(`${label}-${i}`, true, native))
      : selectJourneys(context.epoch, context.users, from, to, label);
    evidence.journeys.push(...journeys);
    for (const journey of journeys) {
      try { await client.begin(journey); }
      catch (error) { journey.outcome = 'interrupted'; journey.error = error.code || error.name; }
    }
    if (journeys.some(journey => journey.outcome === 'interrupted')) throw fail('baseline-interruption', 'A crossing journey failed before the transition.', 502);
    let admitted;
    let slowError;
    let slowResult;
    if (slow) {
      admitted = client.request('/journey/step', {
        id: journeys[0].id, marker: journeys[0].marker, expectedCounter: 0, workDelayMs: 2000
      }, { budgetMs: 5000 }).then(value => { slowResult = value; }).catch(error => { slowError = error; });
      await poll(async () => (await client.request('/identity', undefined, { base: context.blueUrl })).activeRequests > 0,
        'old deployment admitted in-flight work', { timeoutMs: 10000, intervalMs: 50 });
    }
    try {
      await trigger();
      if (native) await ready(context.blueUrl, 'green');
      if (admitted) {
        await admitted;
        if (slowError) throw slowError;
        client.check(slowResult, journeys[0], 1, 0);
        if (slowResult.deployment.version !== 'blue') throw fail('inflight-not-observed', 'The already-admitted request was not observed completing on the old blue deployment.', 502);
      }
      for (const [index, journey] of journeys.entries()) {
        const expected = native ? 'green' : capacity ? 'blue' : destination({ epoch: context.epoch, greenPercent: to }, journey.id);
        try { await client.finish(journey, expected, slow && index === 0); }
        catch (error) {
          journey.outcome = error.code === 'migration-not-observed' || error.code === 'unverified-identity' ? 'unverified' : 'interrupted';
          journey.error = error.code || error.name;
        }
      }
    } finally {
      if (admitted) await admitted;
      for (const journey of journeys) evidence.event('journey-outcome', journey);
    }
    if (journeys.some(journey => journey.outcome !== 'uninterrupted')) throw fail('journey-gate-failed', 'A complete crossing journey failed or its migration was unverified.', 502);
    evidence.event('stage-accepted', { label, affected: journeys.filter(journey => journey.affected).length });
  };

  try {
    evidence.event('lifecycle', { state: 'WARMING' });
    await ready(context.routerUrl, 'router');
    await ready(context.blueUrl, 'blue');
    await ready(context.greenUrl, 'green');
    await setRoute(0, true);
    client.stage = 'baseline';
    if (!await client.diagnostic()) throw fail('baseline-interruption', 'Baseline correctness failed.', 502);
    const monitorDeadline = Date.now() + context.monitorTimeoutMs;
    monitoring = (async () => {
      while (!stopped && Date.now() < monitorDeadline) {
        if (!await client.diagnostic()) diagnosticFailures++;
        await sleep(1000 / context.journeysPerSecond);
      }
      if (!stopped) throw fail('monitor-deadline', 'Continuous diagnostic load reached its safety deadline.', 504);
    })();
    // Keep an early rejection handled until the controller joins the monitor.
    monitoring.catch(error => { runError = { code: error.code || error.name, message: error.message }; });
    await sleep(context.observationSeconds * 1000);
    if (context.experiment === 'readiness-abort') {
      client.stage = 'readiness-abort';
      await fault(true, 0);
      let rejected = false;
      try { await client.request('/health/ready', undefined, { base: context.greenUrl }); }
      catch (error) {
        if (error.code !== 'candidate-unready') throw error;
        rejected = true;
      }
      if (!rejected || (await route()).greenPercent !== 0 || !await client.diagnostic()) {
        throw fail('unsafe-abort', 'Candidate exposure was not safely prevented.', 502);
      }
      evidence.event('lifecycle', { state: 'ABORTED', candidateExposed: false });
      outcome = 'safe-abort-before-exposure';
      controlPassed = true;
    } else if (context.experiment === 'rollback') {
      await fault(false, context.requestBudgetMs + 500);
      let rejected = false;
      try {
        await transition({ from: 0, to: 5, label: 'regressed-canary', trigger: () => setRoute(5) });
      } catch (error) {
        if (error.code !== 'journey-gate-failed' || !evidence.journeys.some(journey => journey.error === 'latency-budget-exceeded')) throw error;
        rejected = true;
      }
      if (!rejected) throw fail('regression-not-detected', 'The injected candidate regression was not detected.', 502);
      client.stage = 'rollback';
      await recover();
      outcome = 'interrupted-transition';
      controlPassed = true;
    } else if (context.experiment === 'scale') {
      for (const capacity of [2, 1]) {
        await transition({
          from: 0, to: 0, capacity: true, label: `capacity-${capacity}`,
          trigger: async () => {
            await platform.scale(capacity);
            await poll(async () => (await platform.instances()).length === capacity,
              `effective workload instance count ${capacity}`, { timeoutMs: 240000, intervalMs: 5000, onFailure: error => evidence.event('capacity-not-met', { error: error.code || error.name }) });
            const workers = new Set();
            await poll(async () => {
              const identity = await client.request('/identity', undefined, { base: context.blueUrl });
              workers.add(identity.instanceId);
              return workers.size >= capacity;
            }, `responses from ${capacity} distinct workload workers`, { timeoutMs: 120000, intervalMs: 500, onFailure: error => evidence.event('worker-observation-not-met', { error: error.code || error.name }) });
            evidence.event('capacity', { desired: capacity, instances: await platform.instances(), observedWorkers: [...workers] });
          }
        });
      }
      outcome = 'capacity-transition-observed';
      controlPassed = true;
    } else if (context.experiment === 'native-swap') {
      await transition({ from: 0, to: 100, label: 'native-swap', native: true, trigger: () => platform.swap() });
      outcome = 'migration-observed';
      controlPassed = true;
    } else {
      const stages = context.experiment === 'canary' ? [5, 25, 50, 100] : context.experiment === 'ab' ? [50] : [100];
      let from = 0;
      for (const to of stages) {
        await ready(context.greenUrl, 'green');
        await transition({ from, to, label: `route-${to}`, trigger: () => setRoute(to), slow: context.experiment === 'blue-green' });
        from = to;
        await sleep(context.observationSeconds * 1000);
      }
      outcome = context.experiment === 'ab' ? 'stable-ab-cohorts-observed' : 'migration-observed';
      controlPassed = true;
    }
    stopped = true;
    if (monitoring) await monitoring;
    if (diagnosticFailures && context.experiment !== 'rollback') throw fail('continuous-load-interrupted', 'Continuous diagnostic journeys experienced interruptions.', 502);
    if (context.experiment === 'rollback' && evidence.requests.some(request => !request.passed && request.endpoint.startsWith('/journey') && request.version !== 'green')) {
      throw fail('rollback-control-interrupted', 'A failure outside the intentionally regressed green candidate was observed.', 502);
    }
    client.stage = 'drain';
    for (const base of [context.blueUrl, context.greenUrl, context.routerUrl]) {
      await poll(async () => (await client.request('/identity', undefined, { base })).activeRequests === 0,
        'synthetic HTTP work drained before teardown', { timeoutMs: 30000, intervalMs: 500, onFailure: error => evidence.event('drain-not-met', { error: error.code || error.name }) });
    }
    evidence.event('lifecycle', { state: 'RETAINED', retentionSeconds: 2, scope: 'short synthetic demonstration only' });
    await sleep(2000);
  } catch (error) {
    stopped = true;
    controlPassed = false;
    runError = { code: error.code || error.name, message: error.message };
    evidence.event('experiment-failed', runError);
    client.stage = 'recovery';
    try { await recover(); }
    catch (recoveryError) { evidence.event('rollback-failed', { code: recoveryError.code || recoveryError.name, message: recoveryError.message }); }
    if (evidence.journeys.some(journey => journey.outcome === 'interrupted')) outcome = 'interrupted-transition';
  } finally {
    stopped = true;
    if (monitoring) {
      try { await monitoring; }
      catch (error) {
        controlPassed = false;
        runError = { code: error.code || error.name, message: error.message };
        evidence.event('monitor-failed', runError);
      }
    }
    evidence.save(outcome, controlPassed, runError);
  }
  if (!controlPassed) throw fail('experiment-failed', runError?.message || 'Native experiment failed.', 502);
}

module.exports = { runExperiment };
