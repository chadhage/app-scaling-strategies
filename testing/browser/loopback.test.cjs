'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { openIsolatedLesson, openIsolatedLoopback } = require('./isolated.cjs');
const { chromium } = require('playwright');

const entry = path.join('testing', 'browser', 'fixtures', 'loopback.html');
const repoRoot = path.resolve(__dirname, '..', '..');

async function startListener(t, { redirectTo, redirectRoot = false } = {}) {
  const [html, child] = await Promise.all([
    fs.readFile(path.join(__dirname, 'fixtures', 'loopback.html')),
    fs.readFile(path.join(__dirname, 'fixtures', 'loopback-child.html')),
  ]);
  const requests = [];
  const upgrades = [];
  let origin;
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    if (request.headers.host !== new URL(origin).host
        || (request.headers.origin && request.headers.origin !== origin)) {
      response.writeHead(403).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    if ((redirectRoot && request.url === '/') || request.url === '/redirect-out') {
      response.writeHead(302, { Location: redirectTo }).end();
      return;
    }
    const jsonByPath = {
      '/scope.json': { mode: 'synthetic-local-only' },
      '/fixtures/v1/getProfile': { version: 'v1', displayName: 'Synthetic V1' },
      '/fixtures/v2/getProfile': { version: 'v2', displayName: 'Synthetic V2' },
    };
    const json = Object.hasOwn(jsonByPath, request.url) ? jsonByPath[request.url] : undefined;
    let body;
    let contentType;
    if (request.url === '/') {
      body = html;
      contentType = 'text/html; charset=utf-8';
      response.setHeader('Content-Security-Policy', "script-src 'unsafe-inline'; object-src 'none'; frame-src 'self'");
    } else if (request.url === '/child.html') {
      body = child;
      contentType = 'text/html; charset=utf-8';
      response.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'");
    } else if (json) {
      body = JSON.stringify(json);
      contentType = 'application/json';
    } else if (request.url === '/sw.js') {
      body = 'self.addEventListener("fetch", () => {});';
      contentType = 'application/javascript';
    } else {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  server.on('upgrade', (request, socket) => {
    upgrades.push(request.url);
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { origin, requests, upgrades, server };
}

test('only a caller-owned live HTTP server bound to exact 127.0.0.1 can authorize loopback', async (t) => {
  const launch = t.mock.method(chromium, 'launch', () => {
    throw new Error('Invalid loopback origins must not launch');
  });
  for (const handle of [
    'https://127.0.0.1:12345', 'http://localhost:12345', 'http://127.0.0.2:12345',
    'http://2130706433:12345', 'http://0x7f000001:12345', 'http://[::1]:12345',
    'http://example.invalid:12345', 'http://127.0.0.1', 'http://127.0.0.1:0',
    'http://127.0.0.1:65536', 'http://127.0.0.1:01234', 'http://127.0.0.1:12345/',
    'http://user@127.0.0.1:12345', 'http://127.0.0.1:12345?query',
    'http://127.0.0.1:12345#fragment', 'http://127.0.0.1:12345\\path',
    ' http://127.0.0.1:12345', 'http://127.0.0.1:12345\n', '', null,
    {}, { url: 'http://127.0.0.1:12345' }, http.createServer(),
  ]) {
    await assert.rejects(openIsolatedLoopback(entry, handle), {
      code: 'ERR_LOOPBACK_SERVER', message: /Invalid loopback server:/,
    }, String(handle));
  }
  const listener = await startListener(t);
  for (const address of [
    { address: '0.0.0.0', family: 'IPv4', port: 12345 },
    { address: '127.0.0.2', family: 'IPv4', port: 12345 },
    { address: '::1', family: 'IPv6', port: 12345 },
    { address: '127.0.0.1', family: 'IPv4', port: 0 },
    { address: '127.0.0.1', family: 'IPv4', port: 65536 },
    null, 'named-pipe',
  ]) {
    const mock = t.mock.method(listener.server, 'address', () => address);
    await assert.rejects(openIsolatedLoopback(entry, listener.server), { code: 'ERR_LOOPBACK_SERVER' });
    mock.mock.restore();
  }
  const closed = await startListener(t);
  await new Promise((resolve) => closed.server.close(resolve));
  await assert.rejects(openIsolatedLoopback(entry, closed.server), { code: 'ERR_LOOPBACK_SERVER' });
  assert.equal(launch.mock.callCount(), 0);
});

test('loopback ownership anchors retain every local path guard including realpath escapes', async (t) => {
  const runtime = path.join(__dirname, 'fixtures', `.loopback-path-${process.pid}`);
  t.after(() => fs.rm(runtime, { recursive: true, force: true }));
  await fs.mkdir(runtime);
  await fs.symlink(path.join(repoRoot, 'testing'), path.join(runtime, 'escape'), 'junction');
  const launch = t.mock.method(chromium, 'launch', () => {
    throw new Error('Invalid entry anchors must not launch');
  });
  const listener = await startListener(t);
  const origin = listener.origin;
  for (const value of [
    origin, 'https://example.invalid/', '..\\outside.html', 'learning\\..\\README.md',
    'testing\\browser\\isolated.cjs', 'testing\\browser\\fixtures\\__missing__.html',
    path.join('testing', 'browser', 'fixtures'),
    path.relative(repoRoot, path.join(runtime, 'escape', 'browser', 'isolated.cjs')),
  ]) {
    await assert.rejects(openIsolatedLoopback(value, listener.server), {
      code: 'ERR_LESSON_PATH', message: /Invalid local lesson path:/,
    });
  }
  await assert.rejects(openIsolatedLesson(origin), { code: 'ERR_LESSON_PATH' });
  assert.equal(launch.mock.callCount(), 0);
});

test('parallel real loopback browsers fetch same-origin data and preserve response CSP isolation', async (t) => {
  const listener = await startListener(t);
  const childHash = createHash('sha256')
    .update(await fs.readFile(path.join(__dirname, 'fixtures', 'loopback-child.html'))).digest('hex');
  const sessions = [];
  t.after(async () => {
    const results = await Promise.allSettled(sessions.map((session) => session.close()));
    for (const result of results) assert.equal(result.status, 'fulfilled');
  });
  const opened = await Promise.allSettled([0, 1].map(async () => {
    const session = await openIsolatedLoopback(entry, listener.server);
    sessions.push(session);
    return session;
  }));
  for (const result of opened) {
    if (result.status === 'rejected') throw result.reason;
  }
  const [left, right] = opened.map((result) => result.value);
  assert.notEqual(left.page.context().browser(), right.page.context().browser());
  await Promise.all([left, right].map(async (session, index) => {
    assert.equal(session.page.url(), `${listener.origin}/`);
    assert.equal(await session.page.evaluate(() => document.visibilityState), 'visible');
    await session.page.getByRole('textbox', { name: 'Message' }).fill(index ? 'right' : 'left');
    if (index) {
      await session.page.getByRole('button', { name: 'Read profiles' }).click();
    } else {
      await session.page.getByRole('textbox', { name: 'Message' }).press('Enter');
    }
    await session.page.waitForFunction(() => document.querySelector('#reads').value === '1');
    const result = JSON.parse(await session.page.locator('#result').textContent());
    assert.equal(result.input, index ? 'right' : 'left');
    assert.equal(result.scope.mode, 'synthetic-local-only');
    assert.equal(result.v1.version, 'v1');
    assert.equal(result.v2.version, 'v2');
    await session.page.waitForFunction(() => document.querySelector('#child-origin').value === 'null');
    assert.equal(await session.page.locator('#child-parent-denied').textContent(), 'true');
    assert.equal(await session.page.evaluate(() => {
      try { void window.frames[0].document; return false; } catch (error) { return error.name === 'SecurityError'; }
    }), true);
    const childResponse = await session.page.evaluate(async () => {
      const response = await fetch('/child.html');
      return { csp: response.headers.get('content-security-policy'), body: await response.text() };
    });
    assert.match(childResponse.csp, /^sandbox allow-scripts;/);
    assert.equal(createHash('sha256').update(childResponse.body).digest('hex'), childHash);
  }));
  for (const url of ['/scope.json', '/fixtures/v1/getProfile', '/fixtures/v2/getProfile']) {
    assert.equal(listener.requests.filter((request) => request.url === url).length, 2);
  }
  const leftBrowser = left.page.context().browser();
  const rightBrowser = right.page.context().browser();
  await Promise.all([left.close(), left.close()]);
  assert.equal(leftBrowser.isConnected(), false);
  assert.equal(rightBrowser.isConnected(), true);
  await right.page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await right.page.waitForFunction(() => document.querySelector('#reads').value === '2');
  await right.close();
  assert.equal(rightBrowser.isConnected(), false);
  assert.equal(listener.server.listening, true);
  t.diagnostic(`Real Chromium ${left.browserVersion}; concurrent visible HTTP sessions; scope/v1/v2 responses; response CSP sandbox produces opaque child origin.`);
});

test('real loopback context blocks cross-origin requests, writes, WebSockets, and service workers', async (t) => {
  const sentinel = await startListener(t);
  const listener = await startListener(t, { redirectTo: `${sentinel.origin}/` });
  const session = await openIsolatedLoopback(entry, listener.server);
  t.after(() => session.close());
  const result = await session.page.evaluate(async ({ otherOrigin, ownOrigin }) => {
    async function rejected(url, options) {
      try { await fetch(url, options); return false; } catch { return true; }
    }
    async function socketResult(url) {
      return new Promise((resolve) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => resolve('timeout'), 3000);
        const finish = (value) => { clearTimeout(timer); resolve(value); };
        socket.onopen = () => { socket.close(); finish('opened'); };
        socket.onerror = () => finish('blocked');
        socket.onclose = () => finish('closed');
      });
    }
    let serviceWorkerBlocked = false;
    try { serviceWorkerBlocked = !await navigator.serviceWorker.register('/sw.js'); } catch { serviceWorkerBlocked = true; }
    return {
      crossOriginRejected: await rejected(`${otherOrigin}/scope.json`),
      postRejected: await rejected('/scope.json', { method: 'POST', body: 'synthetic-write-denied' }),
      sockets: await Promise.all([
        socketResult(`${otherOrigin.replace('http:', 'ws:')}/`),
        socketResult(`${ownOrigin.replace('http:', 'ws:')}/`),
      ]),
      serviceWorkerBlocked,
    };
  }, { otherOrigin: sentinel.origin, ownOrigin: listener.origin });
  assert.equal(result.crossOriginRejected, true);
  assert.equal(result.postRejected, true);
  assert.equal(result.serviceWorkerBlocked, true);
  for (const socket of result.sockets) assert.match(socket, /^(blocked|closed)$/);
  assert.equal(session.page.context().serviceWorkers().length, 0);
  const requestCount = listener.requests.length;
  const address = listener.server.address();
  const rebound = t.mock.method(listener.server, 'address', () => ({
    ...address, port: address.port === 65535 ? 65534 : address.port + 1,
  }));
  assert.equal(await session.page.evaluate(async () => {
    try { await fetch('/scope.json'); return false; } catch { return true; }
  }), true);
  assert.equal(listener.requests.length, requestCount);
  rebound.mock.restore();
  await assert.rejects(session.page.goto(`${listener.origin}/redirect-out`));
  assert.equal(sentinel.requests.length, 0);
  assert.equal(sentinel.upgrades.length, 0);
  assert.equal(listener.upgrades.length, 0);
  assert.equal(listener.requests.some((request) => request.method === 'POST' || request.url === '/sw.js'), false);
  const browser = session.page.context().browser();
  await session.close();
  assert.equal(browser.isConnected(), false);
  assert.equal(listener.server.listening, true);
});

test('an entry redirect outside the exact origin rejects and cleans its real browser and scratch', async (t) => {
  const sentinel = await startListener(t);
  const listener = await startListener(t, { redirectTo: `${sentinel.origin}/`, redirectRoot: true });
  const actualLaunch = chromium.launch.bind(chromium);
  const browsers = [];
  const scratchDirectories = [];
  let unexpectedSession;
  t.after(async () => {
    try {
      if (unexpectedSession) await unexpectedSession.close();
    } finally {
      await Promise.all(browsers.map((browser) => browser.close()));
    }
  });
  t.mock.method(chromium, 'launch', async (...args) => {
    const browser = await actualLaunch(...args);
    browsers.push(browser);
    scratchDirectories.push(args[0].env.TEMP);
    return browser;
  });
  await assert.rejects(async () => {
    unexpectedSession = await openIsolatedLoopback(entry, listener.server);
  });
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].isConnected(), false);
  await assert.rejects(fs.stat(scratchDirectories[0]), { code: 'ENOENT' });
  assert.equal(sentinel.requests.length, 0);
  assert.equal(listener.server.listening, true);
});
