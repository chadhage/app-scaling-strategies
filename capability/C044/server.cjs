'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const cursors = require('./cursor.js');
const { createRun, defaultScheduler } = require('./run.cjs');
const { readContext } = require('./context.cjs');

const scope = Object.freeze({
  cardId: 'C044', businessData: 'synthetic', transport: '127.0.0.1 HTTP only (Server-Sent Events)',
  testRuntime: process.version, approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux',
  productionRuntimeValidated: false, identityVerified: false, nativeTargetQualified: false,
  controlApiImplemented: false, productionDurableStoreImplemented: false, localFileLogImplemented: true,
  liveAzureRuns: 0, authorizedCloudSpend: 0,
});
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/cursor.js': ['cursor.js', 'text/javascript; charset=utf-8'],
  '/reducer.js': ['reducer.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
});
const ttlMs = 600000;
const defaultStateDir = path.join(__dirname, 'state');

function createLocalServer(options) {
  const {
    run, scheduler = defaultScheduler, heartbeatMs = 15000, retryMs = 1000, maxStreams = 64,
    maxBufferedBytes = 1048576, slowReaderMs = 10000, streamLifetimeMs = 0,
  } = options;
  let openStreams = 0;

  const server = http.createServer((request, response) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-C044-Scope': 'synthetic-loopback-only',
    };
    request.on('error', () => {});
    response.on('error', () => {});

    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': body.length, ...extra });
      response.end(body);
    }
    function fail(code) {
      const failure = cursors.failure(code, run.view());
      send(failure.status, failure);
    }
    // A request that carries a body is answered once and its connection is closed and destroyed after the response, so an
    // endless body (for example one-byte chunks) is never parsed.
    function refuseBody() {
      const failure = cursors.failure('UNEXPECTED_BODY', run.view());
      response.once('finish', () => request.socket.destroy());
      send(failure.status, failure, 'application/json; charset=utf-8', { Connection: 'close' });
    }

    function stream(url) {
      const resolved = run.resolveCursor({ header: request.headers['last-event-id'], query: url.searchParams.getAll('lastEventId') });
      if (!resolved.ok) return send(resolved.failure.status, resolved.failure);
      if (run.isComplete() && resolved.afterSeq === run.view().headSeq) {
        response.writeHead(204, { ...headers, 'X-C044-Run-Status': 'completed' });
        return response.end();
      }
      if (openStreams >= maxStreams) return fail('STREAM_CAPACITY');
      openStreams += 1;
      response.writeHead(200, {
        ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no', 'X-C044-Cursor-Source': resolved.source,
      });
      let open = true;
      let cancelHeartbeat = () => {};
      let cancelLifetime = () => {};
      let cancelSlow = () => {};
      let slowArmed = false;
      let attachment = { detach() {} };
      const drop = () => {
        if (!open) return;
        run.counters.slowReaderDrops += 1;
        open = false;
        response.destroy();
      };
      // A reader is dropped when it holds more than maxBufferedBytes in server memory, or when a write has not drained within
      // slowReaderMs. The run itself never waits for any reader.
      const write = (chunk) => {
        if (!open) return;
        const flushed = response.write(chunk);
        if (response.writableLength > maxBufferedBytes) return drop();
        if (!flushed && !slowArmed) {
          slowArmed = true;
          cancelSlow = scheduler.after(slowReaderMs, drop);
          response.once('drain', () => {
            cancelSlow();
            slowArmed = false;
          });
        }
      };
      const finish = () => {
        if (open) response.end();
      };
      response.on('close', () => {
        open = false;
        openStreams -= 1;
        attachment.detach();
        cancelHeartbeat();
        cancelLifetime();
        cancelSlow();
      });
      write(`retry: ${retryMs}\n: connected\n\n`);
      attachment = run.attach(resolved.afterSeq, (event) => {
        write(event.frame);
        if (event.event === 'run-completed') finish();
      });
      for (const event of attachment.replay) write(event.frame);
      if (run.isComplete()) return finish();
      cancelHeartbeat = scheduler.every(heartbeatMs, () => {
        run.counters.heartbeats += 1;
        write(': heartbeat\n\n');
      });
      if (streamLifetimeMs > 0) cancelLifetime = scheduler.after(streamLifetimeMs, finish);
    }

    try {
      const { address, port } = server.address();
      const host = `${address}:${port}`;
      const origin = `http://${host}`;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) return fail('LOCAL_HOST_REQUIRED');
      if (request.headers.origin && request.headers.origin !== origin) return fail('CROSS_ORIGIN_DENIED');
      if (request.method !== 'GET') return fail('METHOD_NOT_ALLOWED');
      if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) return refuseBody();
      if (!request.url || request.url.length > 2048) return fail('URL_TOO_LONG');
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return fail('INVALID_URL');
      const keys = [...url.searchParams.keys()];
      if (['/stream', '/cursor'].includes(url.pathname)) {
        if (keys.some((key) => key !== 'lastEventId')) return fail('INVALID_QUERY');
        if (url.pathname === '/stream') return stream(url);
        const resolved = run.resolveCursor({ header: request.headers['last-event-id'], query: url.searchParams.getAll('lastEventId') });
        if (!resolved.ok) return send(resolved.failure.status, resolved.failure);
        return send(200, {
          schemaVersion: 1, ok: true, source: resolved.source, afterSeq: resolved.afterSeq,
          runComplete: run.isComplete(), headSeq: run.view().headSeq, businessData: 'synthetic', localOnly: true,
        });
      }
      if (url.pathname === '/run.json') {
        if (keys.length) return fail('INVALID_QUERY');
        return send(200, { ...run.snapshot(), scope });
      }
      if (Object.hasOwn(assets, url.pathname)) {
        if (keys.length) return fail('INVALID_QUERY');
        const [file, type] = assets[url.pathname];
        return send(200, fs.readFileSync(path.join(__dirname, file)), type);
      }
      return fail('NOT_FOUND');
    } catch (error) {
      if (error instanceof TypeError && error.code === 'ERR_INVALID_URL') return fail('INVALID_URL');
      return response.headersSent ? response.destroy() : fail('SERVER_UNAVAILABLE');
    }
  });
  server.run = run;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.on('listening', () => run.start());
  server.on('close', () => run.close());
  return server;
}

async function closeOwned(server) {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

async function startLocal(settings = {}) {
  let approval;
  try {
    const file = path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json');
    approval = JSON.parse(fs.readFileSync(file, 'utf8')).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listener was not started.');
  }
  const permission = await guardOperation('local.probe', approval);
  if (!permission.allowed) {
    throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  }
  const context = await readContext();
  const { persistDir = defaultStateDir, intervalMs = 500, totalSteps = 120, replayWindow = 32, scheduler, ...transport } = settings;
  const run = createRun({ context, persistDir, intervalMs, totalSteps, replayWindow, scheduler });
  const server = createLocalServer({ run, scheduler, ...transport });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function cli(argv) {
  if (argv.length !== 2) {
    console.error('C044 accepts no host, port, identity, cursor, run or state overrides.');
    process.exitCode = 1;
    return;
  }
  const server = await startLocal();
  const ttl = setTimeout(() => { closeOwned(server).catch(() => {}); }, ttlMs);
  server.once('close', () => clearTimeout(ttl));
  console.log(JSON.stringify({
    event: 'C044-local-listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}`, ttlMs, scope,
    instructions: 'Open exactly this URL. Type stop and Enter or use Ctrl+C; the owned listener closes itself after the TTL.',
  }));
  let closing = false;
  let input = '';
  const stop = async () => {
    if (closing) return;
    closing = true;
    process.stdin.destroy();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await closeOwned(server);
    console.log(JSON.stringify({ event: 'C044-local-closed', pid: process.pid, listening: server.listening }));
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
    if (input.includes('\n') || input.length > 64) {
      if (input.trim() !== 'stop') {
        console.error('Only the exact owned stop command is supported.');
        process.exitCode = 1;
      }
      stop().catch((error) => { console.error(error.message); process.exitCode = 1; });
    }
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  cli(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ createLocalServer, startLocal, closeOwned, scope, ttlMs });
