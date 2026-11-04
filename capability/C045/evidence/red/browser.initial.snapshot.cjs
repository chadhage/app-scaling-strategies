'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { openClients } = require('./clients.stub.cjs');

test('original C045 actual-client acceptance against the loadable stub', async t => {
  const opened = await openClients();
  const { ga, preview } = opened.clients;
  try {
    await ga.page.waitForFunction(() => document.documentElement.dataset.stubLoaded === 'true');
    assert.match(await ga.page.locator('body').textContent(), /Training rehearsal - synthetic data - not a live Azure result/);
    console.log(JSON.stringify({ event: 'actual-stub-loaded', browserVersion: ga.browserVersion, actualURL: ga.page.url(), pid: process.pid }));
    await t.test('GA and preview must be actual different pages and contexts, not two aliases', () => {
      assert.equal(ga.page !== preview.page, true, 'GA and preview still alias the same actual page.');
      assert.equal(ga.page.context() !== preview.page.context(), true, 'Actual browser contexts must be independently isolated.');
    });
    await t.test('actual HTTP-backed client destinations must differ', () => {
      assert.notEqual(new URL(ga.page.url()).origin, new URL(preview.page.url()).origin, 'Both purported clients still reach one actual listener.');
    });
    await t.test('actual DOM must expose the observed synthetic profile and server-owned implementation', async () => {
      assert.match(await ga.page.locator('#result').textContent(), /"apiContract": "getProfile\/1"/, 'The actual loadable stub has no HTTP profile result.');
    });
  } finally {
    await opened.close();
    assert.equal(ga.page.isClosed(), true);
    assert.equal(ga.server.listening, false);
    console.log(JSON.stringify({ event: 'actual-stub-cleanup', actualPageClosed: ga.page.isClosed(), ownedListenerClosed: !ga.server.listening }));
  }
});
