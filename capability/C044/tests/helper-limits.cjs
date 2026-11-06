'use strict';

// Reproducible probe of two limits of the isolated browser helper that shape this card (not a focused unit test):
//   node capability\C044\tests\helper-limits.cjs        (real isolated headless Edge, own tiny loopback server)
// 1. The helper's route.fetch buffers a whole response, so an endless stream cannot reach the page; only responses that END do.
// 2. A browser's automatic EventSource reconnect adds a Last-Event-ID header that the helper does not forward to the server,
//    so the page must own its cursor and re-open with ?lastEventId=. This says nothing about Edge outside the helper.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));

const seen = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const csp = "default-src 'none'; script-src 'self'; connect-src 'self'";
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp });
    response.end('<!doctype html><html><head><script defer src="probe.js"></script></head><body><ol id="log"></ol></body></html>');
  } else if (url.pathname === '/probe.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end("const log = document.getElementById('log'); const es = new EventSource('/s');"
      + "es.addEventListener('tick', (m) => { const li = document.createElement('li'); li.textContent = m.lastEventId; log.append(li); });");
  } else if (url.pathname === '/s') {
    const last = request.headers['last-event-id'];
    seen.push({ lastEventId: last === undefined ? null : last });
    const start = last === undefined ? 1 : Number(last) + 1;
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.write('retry: 50\n\n');
    for (let id = start; id < start + 3; id++) response.write(`id: ${id}\nevent: tick\ndata: {}\n\n`);
    setTimeout(() => response.end(), 100);
  } else {
    response.writeHead(404);
    response.end();
  }
});

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let session;
  try {
    session = await openIsolatedLoopback(path.join('capability', 'C044', 'index.html'), server);
    await session.page.waitForFunction(() => document.querySelectorAll('#log li').length >= 9, null, { timeout: 15000 });
    const ids = await session.page.locator('#log li').allTextContents();
    assert.ok(seen.length >= 3, 'the browser reconnected automatically after each finite response');
    assert.ok(seen.every((entry) => entry.lastEventId === null), 'the helper did not forward a browser-added Last-Event-ID header');
    assert.deepEqual(ids.slice(0, 6), ['1', '2', '3', '1', '2', '3'], 'without the header every automatic reconnect restarts at the beginning');
    console.log(JSON.stringify({
      browser: session.browserVersion, serverSawLastEventIdHeaders: seen.slice(0, 4), pageIdsSeen: ids.slice(0, 9),
      conclusion: 'finite SSE responses work through the helper; native header-based resume is not observable there; the C044 page owns its cursor',
    }));
  } finally {
    if (session) await session.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
