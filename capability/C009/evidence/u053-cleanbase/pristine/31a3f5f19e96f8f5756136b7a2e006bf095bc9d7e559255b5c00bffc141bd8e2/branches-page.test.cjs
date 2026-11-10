'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDocument, runPage } = require('./dom-stub.cjs');

const DASH = '\u2014';
const answer = (status, body) => ({ status, json: async () => body });
const cells = (document) => document.getElementById('rows').children.map((row) => row.children.map((cell) => cell.textContent));
const until = async (predicate) => {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate(), 'condition not reached');
};

async function open(fetch) {
  const document = createDocument();
  await runPage({ fetch, document });
  await until(() => document.getElementById('revision').textContent !== 'unknown');
  return document;
}

test('a preview that contradicts itself is shown as no decision and never as allowed', async () => {
  const document = await open(async (url) => (url === '/v1/state' ? answer(200, { revision: 1 })
    : answer(200, { preview: { allowed: true, status: 403, code: 'ok', role: 'operator', subject: 'operator' } })));
  await document.getElementById('check').click();
  assert.equal(cells(document).length, 5);
  for (const row of cells(document)) assert.deepEqual(row.slice(1), ['no decision', DASH, 'MALFORMED_ANSWER', DASH]);
  assert.match(document.getElementById('status').textContent, /^No server decision/);
});

test('a typed error that is not a credential refusal is shown with its own code and never as a decision', async () => {
  const document = await open(async (url) => (url === '/v1/state' ? answer(200, { revision: 1 }) : answer(421, { error: { code: 'LOCAL_HOST_REQUIRED' } })));
  await document.getElementById('check').click();
  for (const row of cells(document)) assert.deepEqual(row.slice(1), ['no decision', DASH, 'LOCAL_HOST_REQUIRED', DASH]);
});

test('a send is reported from the server answer: applied with its revision, or an error body without detail', async () => {
  let revision = 0;
  let reply = answer(200, { outcome: 'ok', revision: 2 });
  const document = await open(async (url, init = {}) => {
    if (init.method === 'POST') { revision = 2; return reply; }
    return answer(200, { revision });
  });
  document.getElementById('command').value = 'pool.resize';
  await document.getElementById('send').click();
  assert.equal(document.getElementById('sent').textContent, 'HTTP 200 ok: applied, server revision 2.');
  assert.equal(document.getElementById('revision').textContent, '2');
  reply = answer(500, null);
  await document.getElementById('send').click();
  assert.equal(document.getElementById('sent').textContent, 'HTTP 500 MALFORMED_ANSWER.');
  reply = answer(403, { outcome: 'ROLE_FORBIDDEN', error: { code: 'ROLE_FORBIDDEN' } });
  await document.getElementById('send').click();
  assert.equal(document.getElementById('sent').textContent, 'HTTP 403 ROLE_FORBIDDEN.');
});

test('an unknown or inherited command name sends an empty object and a revision that is not an integer is ignored', async () => {
  const sent = [];
  const document = await open(async (url, init = {}) => {
    if (init.method === 'POST') { sent.push([url, init.body]); return answer(404, { outcome: 'COMMAND_UNKNOWN' }); }
    return answer(200, { revision: url === '/v1/state' && sent.length ? 'x' : 3 });
  });
  document.getElementById('command').value = 'constructor';
  await document.getElementById('send').click();
  assert.deepEqual(sent, [['/v1/commands/constructor', '{}']]);
  assert.equal(document.getElementById('revision').textContent, '3');
});
