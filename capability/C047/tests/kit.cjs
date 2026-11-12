'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), net = require('node:net'), path = require('node:path');
const root = path.resolve(process.env.C047_SUBJECT || path.join(__dirname, '..'));
const subject = require(path.join(root, 'server.cjs'));
async function fixture(options = {}) {
  let time = 100000;
  const app = subject.createApp({ now: () => time, ...options });
  assert.equal(typeof app.server?.listen, 'function', 'APP_EXPOSES_REAL_HTTP_SERVER');
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  return { app, origin, advance: ms => { time += ms; } };
}
function request(f, route, { method = 'GET', token, body, headers = {} } = {}) {
  const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const q = http.request(f.origin + route, { method, agent: false, headers: {
      ...(token !== undefined && token !== null ? { Authorization: `Bearer ${token}` } : {}),
      ...(data !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers
    } }, r => {
      const chunks = [];
      r.on('data', chunk => chunks.push(chunk)); r.on('error', reject);
      r.on('end', () => { const raw = Buffer.concat(chunks).toString(); let json; try { json = JSON.parse(raw); } catch { json = null; } resolve({ status: r.statusCode, headers: r.headers, raw, json }); });
    });
    q.on('error', reject); if (data !== null) q.write(data); q.end();
  });
}
async function login(f, user = 'alf', tenant = 'tenant-alder') {
  const ticket = f.app.issueTicket({ user, tenant });
  const r = await request(f, '/v1/session/login', { method: 'POST', body: { ticket } });
  assert.equal(r.status, 201, 'ACCEPTED_C022_LOGIN_SUCCEEDS');
  assert.equal(typeof r.json?.token, 'string', 'LOGIN_RETURNS_OPAQUE_TOKEN');
  return r.json;
}
function raw(f, text, { keepOpen = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(new URL(f.origin).port, '127.0.0.1');
    let data = '', ended = false;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('SOCKET_WATCHDOG_NOT_A_SEMANTIC_KILL')); }, 12000);
    socket.setEncoding('utf8');
    socket.on('connect', () => keepOpen ? socket.write(text.replaceAll('$HOST', new URL(f.origin).host)) : socket.end(text.replaceAll('$HOST', new URL(f.origin).host)));
    socket.on('data', chunk => { data += chunk; }); socket.on('end', () => { ended = true; });
    socket.on('error', e => { if (e.code !== 'ECONNRESET') { clearTimeout(timer); reject(e); } });
    socket.on('close', () => { clearTimeout(timer); resolve({ data, ended, closed: true }); });
  });
}
const world = f => f.app.snapshot().world;
function denied(r, status, code) {
  assert.equal(r.status, status, 'DIRECT_ACCESS_DENIED_STATUS');
  assert.equal(r.json?.outcome, code, 'DIRECT_ACCESS_TYPED_REFUSAL');
  assert.equal(/synthetic-00[12]|displayName|alder-orchard/.test(r.raw), false, 'REFUSAL_CONTAINS_NO_CANDIDATE_DATA');
  assert.equal(r.headers['cache-control'], 'no-store', 'DENIED_NOT_CACHEABLE');
}
module.exports = { assert, fixture, request, login, raw, world, denied, subject };
