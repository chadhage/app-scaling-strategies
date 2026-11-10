'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseAnswers } = require('./raw-http.cjs');
const imported = path.resolve(__dirname, '..', '..', 'C009');
const files = ['server.cjs', 'authz.cjs', 'codes.cjs', 'contract.js', 'http-io.cjs', 'queue.cjs', 'commands.cjs', 'handlers.cjs', 'ledger.cjs'];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inputs = files.map((name) => {
  const bytes = fs.readFileSync(path.join(imported, name));
  return { path: `capability/C009/${name}`, bytes: bytes.length, rawSha256: sha(bytes), lfSha256: sha(Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1')) };
});

async function main() {
  const app = require(path.join(imported, 'server.cjs')).createApp();
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const before = app.snapshot();
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
  const chunks = [];
  let ended = false;
  let closed = false;
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('end', () => { ended = true; socket.end(); });
  socket.on('close', () => { closed = true; });
  socket.on('error', () => {});
  const request = `GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`;
  const started = process.hrtime.bigint();
  socket.write(request);
  let document;
  try {
    for (let poll = 0; poll < 2500 && !closed; poll += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const bytes = Buffer.concat(chunks);
    document = { schema: 'C010-U057-C009-default-diagnostic/1', snapshot: 'accepted C009 0da3ff6eea40; no imported authority repin', host: '127.0.0.1', requestShape: 'request line plus Host header, no blank line, then silence',
      limits: { idleMs: app.server.timeout, headerMs: app.server.headersTimeout, requestMs: app.server.requestTimeout, checkMs: app.server.connectionsCheckingInterval },
      request, answers: parseAnswers(bytes).map(({ status, json }) => ({ status, code: json?.error?.code ?? null })), receivedBytes: bytes.length, receivedSha256: sha(bytes), ended, closed,
      elapsedMsDiagnosticOnly: Number(process.hrtime.bigint() - started) / 1e6, audit: app.auditLog(), unchangedState: JSON.stringify(before) === JSON.stringify(app.snapshot()), inputs };
  } finally {
    socket.destroy();
    await app.close();
  }
  document.cleanup = { listenerClosed: app.server.listening === false, connections: app.server._connections };
  assert.equal(document.cleanup.listenerClosed, true);
  assert.equal(document.cleanup.connections, 0);
  for (const entry of inputs) assert.equal(sha(fs.readFileSync(path.join(imported, path.basename(entry.path)))), entry.rawSha256, 'the accepted C009 snapshot is read only');
  console.log(JSON.stringify(document, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
