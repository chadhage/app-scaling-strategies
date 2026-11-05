'use strict';

const express = require('express');
const { setTimeout: sleep } = require('node:timers/promises');
const { destination, fail, identifier, integer, secretEquals } = require('./lib/contract.cjs');

function bodyInteger(value, name, min, max) {
  if (typeof value !== 'number') throw fail('invalid-input', `${name} must be a JSON number.`);
  return integer(value, name, min, max);
}

function createApp({ store, release, demoToken, controlToken, origins, instanceId, logger = console.error }) {
  if (!['blue', 'green', 'router'].includes(release.version) || !release.epoch || !release.commit) {
    throw fail('invalid-release', 'An immutable version, epoch, and commit are required.', 500);
  }
  if (typeof demoToken !== 'string' || demoToken.length < 32 || typeof controlToken !== 'string' || controlToken.length < 32 || demoToken === controlToken) {
    throw fail('invalid-secret', 'Distinct bounded demo and control credentials are required.', 500);
  }
  if (release.version === 'router') {
    for (const origin of Object.values(origins)) {
      const url = new URL(origin);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
        throw fail('invalid-origin', 'Only fixed deployment origins are accepted.', 500);
      }
    }
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb', strict: true }));
  app.use((request, _response, next) => {
    if (request.method === 'POST' && (!request.body || typeof request.body !== 'object' || Array.isArray(request.body))) {
      return next(fail('invalid-input', 'POST requires a JSON object.'));
    }
    next();
  });
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  let activeRequests = 0;
  const identity = () => ({ ...release, instanceId, activeRequests });
  const authenticate = token => (request, _response, next) => {
    if (!secretEquals(request.get('authorization'), `Bearer ${token}`)) return next(fail('unauthorized', 'A valid demo credential is required.', 401));
    next();
  };
  const fault = async () => (await store.get(`control/fault-${release.version}.json`))?.value;

  app.get('/health/live', (_request, response) => response.json({ live: true }));
  app.get('/health/ready', async (_request, response) => {
    await store.ready();
    if ((await fault())?.unready) throw fail('candidate-unready', 'Injected candidate readiness rejection.', 503);
    response.json({ ready: true });
  });
  app.get('/identity', authenticate(demoToken), (_request, response) => response.json(identity()));

  app.use('/control', authenticate(controlToken));
  app.use('/control', (_request, _response, next) => {
    if (release.version !== 'router') return next(fail('not-controller', 'Control operations exist only on the router.', 404));
    next();
  });
  app.get('/control/route', async (_request, response) => {
    const record = await store.get('control/routing.json');
    if (!record) throw fail('route-not-initialized', 'Routing has not been explicitly initialized.', 503);
    response.json(record.value);
  });
  app.post('/control/route', async (request, response) => {
    const { epoch, greenPercent, expectedRevision } = request.body;
    if (epoch !== release.epoch) throw fail('stale-epoch', 'The controller epoch does not match this deployment.', 409);
    bodyInteger(greenPercent, 'greenPercent', 0, 100);
    bodyInteger(expectedRevision, 'expectedRevision', -1, 1000);
    const previous = await store.get('control/routing.json');
    if ((previous?.value.revision ?? -1) !== expectedRevision) throw fail('stale-revision', 'Routing revision has changed.', 409);
    const next = { epoch, greenPercent, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    await store.put('control/routing.json', next, previous?.etag);
    response.json(next);
  });
  app.post('/control/fault', async (request, response) => {
    const { epoch, unready, delayMs } = request.body;
    if (epoch !== release.epoch) throw fail('stale-epoch', 'The controller epoch does not match.', 409);
    if (typeof unready !== 'boolean') throw fail('invalid-input', 'unready must be an explicit boolean.');
    bodyInteger(delayMs, 'delayMs', 0, 5000);
    const key = 'control/fault-green.json';
    const previous = await store.get(key);
    const value = { unready, delayMs, epoch };
    await store.put(key, value, previous?.etag);
    response.json(value);
  });

  app.use('/journey', authenticate(demoToken));
  app.use('/journey', (request, response, next) => {
    if (request.method !== 'POST' || !['/start', '/step', '/complete'].includes(request.path)) {
      return next(fail('unknown-operation', 'Only bounded synthetic journey operations are supported.', 404));
    }
    identifier(request.body.id, 'id');
    identifier(request.body.marker, 'marker');
    activeRequests++;
    let finished = false;
    const finish = () => {
      if (!finished) { activeRequests--; finished = true; }
    };
    response.once('finish', finish);
    response.once('close', () => {
      if (!response.writableFinished) logger(JSON.stringify({ event: 'unfinished-journey-connection', id: request.body.id }));
    });
    next();
  });
  app.use('/journey', async (request, response, next) => {
    if (release.version !== 'router') return next();
    const route = await store.get('control/routing.json');
    if (!route || route.value.epoch !== release.epoch) throw fail('invalid-route', 'Current routing evidence is unavailable.', 503);
    const origin = origins[destination(route.value, request.body.id)];
    const upstream = await fetch(new URL(`/journey${request.path}`, origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${demoToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    const body = await upstream.json();
    response.status(upstream.status).json({ ...body, router: { epoch: release.epoch, routeRevision: route.value.revision } });
  });
  app.use('/journey', async (request, _response, next) => {
    const injected = await fault();
    if (injected?.unready) throw fail('candidate-unready', 'Candidate is not ready.', 503);
    if (injected?.delayMs) await sleep(injected.delayMs);
    if (request.body.workDelayMs !== undefined) await sleep(bodyInteger(request.body.workDelayMs, 'workDelayMs', 0, 2000));
    next();
  });
  app.post('/journey/start', async (request, response) => {
    const { id, marker } = request.body;
    const state = { id, marker, counter: 0, effects: 0, operationId: null };
    await store.put(`sessions/${id}.json`, state);
    response.json({ state, deployment: identity() });
  });
  app.post('/journey/step', async (request, response) => {
    const record = await store.get(`sessions/${request.body.id}.json`);
    if (!record) throw fail('lost-state', 'An admitted journey no longer exists.', 409);
    if (record.value.marker !== request.body.marker) throw fail('state-mismatch', 'The original state marker did not survive.', 409);
    bodyInteger(request.body.expectedCounter, 'expectedCounter', 0, 100);
    if (record.value.counter !== request.body.expectedCounter) throw fail('counter-mismatch', 'Journey state has changed.', 409);
    const state = { ...record.value, counter: record.value.counter + 1 };
    await store.put(`sessions/${state.id}.json`, state, record.etag);
    response.json({ state, deployment: identity() });
  });
  app.post('/journey/complete', async (request, response) => {
    identifier(request.body.operationId, 'operationId');
    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await store.get(`sessions/${request.body.id}.json`);
      if (!record) throw fail('lost-state', 'An admitted journey no longer exists.', 409);
      if (record.value.marker !== request.body.marker) throw fail('state-mismatch', 'The original state marker did not survive.', 409);
      if (record.value.counter !== 1) throw fail('incomplete-journey', 'The declared journey step must precede completion.', 409);
      if (record.value.operationId && record.value.operationId !== request.body.operationId) {
        throw fail('duplicate-operation', 'A different operation already owns this synthetic effect.', 409);
      }
      const state = { ...record.value, effects: 1, operationId: request.body.operationId };
      if (record.value.operationId) return response.json({ state, deployment: identity() });
      try {
        await store.put(`sessions/${state.id}.json`, state, record.etag);
        return response.json({ state, deployment: identity() });
      } catch (error) {
        if (error.code !== 'state-conflict' || attempt === 2) throw error;
      }
    }
  });
  app.use((_request, _response, next) => next(fail('not-found', 'Unknown demo endpoint.', 404)));
  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    const code = error.code || 'dependency-or-application-error';
    logger(JSON.stringify({ event: 'request-failed', code, status }));
    response.status(status).json({ error: code, message: status === 500 ? 'A dependency or application operation failed; inspect deployment logs.' : error.message });
  });
  return app;
}

module.exports = { createApp };
