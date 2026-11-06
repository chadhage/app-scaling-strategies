'use strict';

// RED (written before any production file existed). Initial tests B: the page and the loopback service. The subject is the
// namespace root, or the directory in C059_RED_SUBJECT: a naive page (an unnamed button, focus dropped after every action,
// a status that always says success) and a service that answers every request 501.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { idle, loadPage, press, type } = require('./helpers/dom.cjs');
const { engineFetch } = require('./helpers/engine-fetch.cjs');

const subject = process.env.C059_RED_SUBJECT ? path.resolve(process.env.C059_RED_SUBJECT) : path.resolve(__dirname, '..', '..');
const repository = path.resolve(__dirname, '..', '..', '..', '..');
const c042 = (name) => require(path.join(repository, 'capability', 'C042', name));
const checker = require(path.join(subject, 'a11y-check.js'));

const resolveScript = (src) => (src.startsWith('/c042/') ? path.join(repository, 'capability', 'C042', src.slice(6))
  : src.startsWith('/c041/') ? path.join(repository, 'capability', 'C041', src.slice(6)) : path.join(subject, src.slice(1)));

async function openPage() {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  const fetch = engineFetch({ engine, parseBody: c042('input.cjs').parseBody, refusal: c042('result.cjs').refusal });
  return { ...loadPage({ html: fs.readFileSync(path.join(subject, 'index.html'), 'utf8'), resolve: resolveScript, fetch }), fetch };
}

const $ = (page, id) => page.document.getElementById(id);

function nameOf(document, element) {
  const labelled = element.getAttribute('aria-labelledby');
  if (labelled) return labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  if (element.getAttribute('aria-label')) return element.getAttribute('aria-label').trim();
  const label = document.elements().find((item) => item.localName === 'label' && item.getAttribute('for') === element.id && element.id);
  return (label ? label.textContent : element.textContent || element.title).trim();
}

const interactive = (element) => ['button', 'select', 'textarea', 'iframe'].includes(element.localName) ||
  (element.localName === 'input' && element.getAttribute('type') !== 'hidden') || (element.localName === 'a' && element.hasAttribute('href')) || element.getAttribute('role') === 'radio';

async function conduct(page, { key, lease = 'synthetic-lease-001', units }) {
  type($(page, 'key'), key);
  $(page, 'lease').value = lease;
  type($(page, 'units'), units);
  $(page, 'submit').focus();
  press(page.document, 'Enter');
  await idle(page.document);
}

test('after rendering, every interactive element has an accessible name', async () => {
  const page = await openPage();
  const unnamed = page.document.elements().filter(interactive).filter((element) => nameOf(page.document, element) === '').map((element) => element.id || element.localName);
  assert.deepEqual(unnamed, []);
});

test('after a submitted step the focus is on a named, connected element, never on the body', async () => {
  const page = await openPage();
  await conduct(page, { key: 'red-key-0001', units: '5' });
  const active = page.document.activeElement;
  assert.notEqual(active.localName, 'body', 'the focus was lost to the body');
  assert.equal(active.isConnected, true);
  assert.ok(nameOf(page.document, active).length > 0);
});

test('a rejected outcome is never announced as success; it names its typed code and the offered recovery', async () => {
  const page = await openPage();
  await conduct(page, { key: 'red-key-0002', lease: 'synthetic-lease-002', units: '10' });
  await conduct(page, { key: 'red-key-0003', lease: 'synthetic-lease-002', units: '1' });
  const text = $(page, 'status').textContent;
  assert.equal($(page, 'result').getAttribute('data-outcome'), 'rejected');
  assert.doesNotMatch(text, /success/i);
  assert.match(text, /CAPACITY_EXHAUSTED/);
  assert.match(text, /Correct and resubmit/);
});

test('invalid fields are not sent: aria-invalid, aria-describedby, the first invalid field focused, announced once', async () => {
  const page = await openPage();
  type($(page, 'key'), 'x');
  type($(page, 'units'), '0');
  $(page, 'submit').focus();
  const before = page.document.announcements.length;
  press(page.document, 'Enter');
  await idle(page.document);
  assert.deepEqual(page.fetch.state.calls, [], 'an invalid form must not be sent');
  for (const id of ['key', 'units']) {
    assert.equal($(page, id).getAttribute('aria-invalid'), 'true');
    const message = $(page, id).getAttribute('aria-describedby')?.split(/\s+/).map((ref) => page.document.getElementById(ref)).find((element) => element && element.textContent.trim());
    assert.ok(message, `${id} must be described by its error message`);
  }
  assert.equal(page.document.activeElement, $(page, 'key'));
  assert.equal(page.document.announcements.slice(before).filter((entry) => entry.text !== '').length, 1);
});

test('the production checker agrees with the independent oracle about unnamed controls (it reports each as NAME_MISSING)', async () => {
  const page = await openPage();
  const unnamed = page.document.elements().filter(interactive).filter((element) => nameOf(page.document, element) === '');
  const reported = checker.check(page.document).findings.filter((item) => item.code === 'NAME_MISSING');
  assert.equal(reported.length, unnamed.length, `the oracle found ${unnamed.length} unnamed controls, the checker reported ${reported.length}`);
  const clean = fs.readFileSync(path.join(subject, 'index.html'), 'utf8');
  assert.equal(unnamed.length > 0, /class="icon-play"/.test(clean), 'only the naive page may have an unnamed control');
});

test('the lesson chooser is a radio group with ONE tab stop and arrow keys that move and select', async () => {
  const page = await openPage();
  const radios = page.document.elements().filter((element) => element.getAttribute('role') === 'radio');
  assert.equal(radios.length, 2);
  assert.equal(radios.filter((radio) => radio.getAttribute('tabindex') === '0').length, 1, 'exactly one radio is a tab stop');
  radios[0].focus();
  press(page.document, 'ArrowDown');
  assert.equal(page.document.activeElement, radios[1]);
  assert.equal(radios[1].getAttribute('aria-checked'), 'true');
});

function call(port, method, target, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = http.request({ host: '127.0.0.1', port, method, path: target, agent: false, headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

async function serve(run) {
  const server = require(path.join(subject, 'server.cjs'));
  const started = await server.startLocal({ io: c042('journal.cjs').createMemoryIo() });
  try { await run(started.address().port); } finally { await server.closeServer(started); }
}

test('GET / serves the page with a strict CSP, no-store and nosniff', () => serve(async (port) => {
  const answer = await call(port, 'GET', '/');
  assert.equal(answer.status, 200);
  assert.match(answer.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(answer.headers['cache-control'], 'no-store');
  assert.match(answer.bytes.toString('utf8'), /<html lang="en"/);
}));

test('a valid step over the socket is answered 201 with a valid result envelope', () => serve(async (port) => {
  const answer = await call(port, 'POST', '/v1/steps', { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'red-key-0010', leaseId: 'synthetic-lease-001', units: 3 });
  assert.equal(answer.status, 201);
  assert.equal(c042('contract.js').validateResultEnvelope(JSON.parse(answer.bytes.toString('utf8'))).ok, true);
}));

test('a foreign Host header is refused 421 and the connection is closed', () => serve(async (port) => {
  const answer = await call(port, 'GET', '/', undefined, { Host: 'example.test' });
  assert.equal(answer.status, 421);
  assert.equal(answer.headers.connection, 'close');
}));

test('the pinned C042 contract and the C041 host files are served to the page', () => serve(async (port) => {
  const contract = await call(port, 'GET', '/c042/contract.js');
  assert.equal(contract.status, 200);
  assert.ok(contract.bytes.equals(fs.readFileSync(path.join(repository, 'capability', 'C042', 'contract.js'))));
  assert.equal((await call(port, 'GET', '/c041/lesson-host.js')).status, 200);
  assert.equal((await call(port, 'GET', '/c041-lessons/A-S001/index.html')).status, 200);
}));
