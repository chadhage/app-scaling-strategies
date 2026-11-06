'use strict';

// Test tooling, not production code: THE CANARY SWEEP. It plants every held canary in every encoding in every place the system can touch, drives real
// management traffic (the service uses its secrets and fails with them in an exception), plants client canaries in every request position, calls every route
// as every identity, and scans EVERY byte that left the server (status lines, headers, bodies, the console) in every covered encoding, once whole and once
// in one-byte chunks. It returns canary ids and form names only, never a value. It runs against any server with the startLocal() surface: the real one
// (zero hits) and the naive stub of the RED (hits: the sweep is not vacuous).
const { WHO, seedConfig, canaryList, clientCanaries } = require('./canaries.cjs');
const { ENCODERS, scan, createStreamScanner } = require('./scanner.cjs');
const { call, Transcript } = require('./harness.cjs');

const PLACES = ['run', 'trace', 'log', 'audit', 'error'];
const ROUTES = ['/', '/page.js', '/style.css', '/scope.json', '/v1/evidence/trace?limit=200', '/v1/evidence/runs?limit=200', '/v1/evidence/audit?limit=200', '/v1/evidence/logs?limit=200',
  '/v1/evidence/bundle', '/v1/manage/config', '/v1/nowhere', '/v1/evidence/trace?limit=zero'];
const METHODS = ['OPTIONS', 'HEAD', 'PUT', 'DELETE', 'TRACE', 'PATCH'];

async function runSweep({ start, config = seedConfig(), encoders = ENCODERS, light = false, stream: wantStream = true }) {
  const consoleLines = [];
  const local = await start({ config, logSink: (line) => consoleLines.push(String(line)) });
  try {
    const expired = await local.service.issueToken('operator', { ttlMs: 0 });
    const held = [...canaryList(config), { id: 'token-expired', value: expired }];
    const client = clientCanaries();
    const everything = [...held, ...client];
    const transcript = new Transcript();
    const port = local.port;
    const send = async (label, method, target, options) => {
      const result = await call(port, method, target, options);
      transcript.add(`${label} ${method} #${transcript.parts.length}`, result.bytes);
      return result;
    };
    const facts = { statuses: {} };

    for (const place of light ? ['run', 'trace'] : PLACES) for (const canary of held) await local.service.plant(place, Object.values(encoders).map((encode) => encode(canary.value)).join(' '));

    facts.created = (await send('conductor-a', 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'sweep-run', units: 3 } })).status;
    facts.visitor = (await send('visitor', 'POST', '/v1/commands/run.create', { token: config.tokens.visitor, body: { name: 'sweep-run', units: 1 } })).status;
    facts.checked = (await send('operator', 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'ok' } })).status;
    const failed = await send('operator', 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'fail' } });
    facts.failed = failed.status;
    facts.failedCode = failed.answer ? failed.json().error.code : null;

    const [cHeader, cUrl, cQuery, cBody, cCookie, cAgent] = client.map((canary) => canary.value);
    const noisy = { 'User-Agent': cAgent, Referer: `http://127.0.0.1/${cUrl}`, Cookie: `sid=${cCookie}`, 'X-Role': cHeader, 'X-Forwarded-For': cHeader, 'X-Request-Id': cHeader, 'X-Api-Key': cHeader };
    await send('noisy', 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-b'], headers: noisy, body: { name: cBody.toLowerCase().slice(0, 30), units: 2 } });
    await send('noisy', 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-b'], headers: noisy, body: { name: 'x', units: 2, [cBody]: cBody } });
    await send('noisy', 'POST', `/v1/commands/${cUrl}`, { token: config.tokens.operator, headers: noisy, body: { note: cBody } });
    await send('noisy', 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], headers: noisy, body: `{"name":"${cBody}` });
    await send('noisy', 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], headers: { ...noisy, 'Content-Type': `text/${cHeader}` }, body: cBody });
    await send('noisy', 'GET', `/v1/evidence/runs?limit=${cQuery}`, { headers: noisy });
    await send('noisy', 'GET', `/${cUrl}`, { headers: noisy, token: cHeader });
    await send('noisy', 'GET', '/v1/evidence/trace', { headers: { ...noisy, Authorization: `Basic ${Buffer.from(`${cHeader}:${cBody}`).toString('base64')}` } });
    for (const method of METHODS) await send('noisy', method, `/v1/evidence/runs?x=${cQuery}`, { headers: { ...noisy, Origin: `http://${cUrl}.invalid`, 'Access-Control-Request-Method': 'POST' } });

    const identities = [['anonymous', null], ...WHO.map((who) => [who, config.tokens[who]]), ['forged', `c009_${'A'.repeat(43)}`], ['malformed', 'not-a-token'], ['expired', expired]]
      .filter(([label]) => !light || ['anonymous', 'operator'].includes(label));
    const routes = light ? ROUTES.filter((route) => route.startsWith('/v1/evidence/')) : ROUTES;
    for (const [label, token] of identities) {
      for (const route of routes) await send(label, 'GET', route, { token, headers: noisy });
      await send(label, 'POST', '/v1/commands/run.create', { token, headers: noisy, body: { name: 'sweep-again', units: 1 } });
      await send(label, 'POST', '/v1/commands/config.check', { token, body: { mode: 'fail' } });
    }
    for (const kind of ['trace', 'runs', 'audit', 'logs']) facts[kind] = (await send('reader', 'GET', `/v1/evidence/${kind}?limit=200`)).json();

    const bytes = transcript.all();
    const stream = createStreamScanner(everything);
    const streamed = wantStream ? bytes.subarray(0, 1500000) : Buffer.alloc(0);
    for (let at = 0; at < streamed.length; at += 1) stream.push(streamed.subarray(at, at + 1));
    // the console of a server in another process is its stdout and stderr, as the launcher collected them
    const consoleText = local.consoleText ? local.consoleText() : consoleLines.join('\n');
    return {
      hits: scan(bytes, everything), streamHits: stream.hits(), consoleHits: scan(consoleText, everything), size: transcript.size(), requests: transcript.parts.length,
      consoleLines: consoleText.split('\n').filter(Boolean).length, facts, canaries: everything.length
    };
  } finally { await local.close(); }
}

module.exports = Object.freeze({ PLACES, ROUTES, METHODS, runSweep });
