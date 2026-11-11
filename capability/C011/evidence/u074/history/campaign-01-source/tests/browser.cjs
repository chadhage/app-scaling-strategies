'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { startApp, reserve, release, call } = require('./helpers.cjs');
const ownership = require('./browser-ownership.cjs');
const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');
const { readQualified } = require('../../../testing/browser/qualify/adapters.cjs');
const { openLoopbackScratchSession } = require('../../../testing/browser/lifecycle/scratch-session.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const output = process.env.C011_BROWSER_OUTPUT;
const observed = [];
const options = Object.freeze({
  deadlineMs: 120000, graceMs: 60000, listMs: 60000, terminateMs: 120000,
  gracefulMs: 60000, settleMs: 60000, exitSettleMs: 45000
});
const BOOKS = ['pool-units', 'pool-spend', 'reserved-units', 'reserved-spend', 'free-units', 'free-spend', 'a-units', 'a-spend', 'b-units', 'b-spend'];

async function snapshot(page) {
  return page.evaluate(() => ({
    ids: [...document.querySelectorAll('[id]')].map((element) => element.id),
    rows: [...document.querySelectorAll('#rows tr')].map((row) => [...row.cells].map((cell) => cell.textContent)),
    rowVisibility: [...document.querySelectorAll('#rows tr')].map((row) => {
      const rect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }),
    outcomes: [...document.querySelectorAll('#rows [data-outcome]')].map((cell) => cell.dataset.outcome),
    status: document.getElementById('status').textContent,
    balanced: document.getElementById('books-balanced').dataset.balanced,
    books: Object.fromEntries([...document.querySelectorAll('[id^="books-"]')].map((element) => [element.id, element.textContent])),
    live: [...document.querySelectorAll('[role="status"],[aria-live]')].length,
    inlineScripts: [...document.scripts].filter((script) => !script.src).length
  }));
}

function assertView(view, expected) {
  assert.equal(new Set(view.ids).size, view.ids.length, 'rendered ids are unique after every action');
  assert.equal(view.live, 1, 'one announced status region');
  assert.equal(view.inlineScripts, 0, 'no inline script');
  if (!expected) {
    assert.equal(view.rows.length, 0);
    assert.equal(view.balanced, 'unknown');
    return;
  }
  const expectedRows = [];
  const allowed = (who, action, target) => [who, action, target, '200', 'ok', 'allowed'];
  const denied = (who, action, target, status = '403', code = 'ROLE_FORBIDDEN') => [who, action, target, status, code, 'forbidden'];
  for (const who of ['visitor', 'conductor-a', 'conductor-b', 'operator']) expectedRows.push(allowed(who, 'who am I', 'itself'));
  for (const who of ['conductor-a', 'conductor-b']) {
    expectedRows.push(allowed(who, 'read allowance', 'own caps'), allowed(who, 'list reservations', 'own list'), allowed(who, 'read reservation', 'own reservation'));
  }
  for (const who of ['conductor-a', 'conductor-b']) expectedRows.push(denied(who, 'read reservation', 'foreign reservation', '404', 'RESERVATION_NOT_FOUND'));
  for (const who of ['visitor', 'operator']) {
    expectedRows.push(denied(who, 'read allowance', 'conductor routes'), denied(who, 'list reservations', 'conductor routes'));
  }
  for (const who of ['conductor-a', 'conductor-b']) expectedRows.push(denied(who, 'read pool books', 'operator route'));
  expectedRows.push(denied('anonymous', 'read allowance', 'conductor routes', '401', 'AUTHENTICATION_REQUIRED'),
    allowed('operator', 'read pool books', 'operator route'), allowed('operator', 'read audit', 'operator route'));
  assert.deepEqual(view.rows, expectedRows, 'every visible identity, action, target, status, typed code and outcome is independently compared');
  assert.equal(view.rows.length, 21);
  assert.equal(new Set(view.rows.map((row) => row.slice(0, 3).join('|'))).size, 21, 'each identity/action/target is unique');
  assert.ok(view.rowVisibility.every(Boolean), 'hidden row text never counts as rendered proof');
  assert.equal(view.outcomes.filter((value) => value === 'allowed').length, 12);
  assert.equal(view.outcomes.filter((value) => value === 'forbidden').length, 9);
  assert.equal(view.outcomes.length, 21);
  assert.match(view.status, /^Checked 21 rows:/);
  const replayA = expected[6] === 3 ? 1 : 2;
  assert.ok(view.status.endsWith(`Replay keys: conductor-a ${replayA}/1000 (${1000-replayA} remaining); conductor-b 1/1000 (999 remaining).`),
    'the real browser announces the validated server-lifetime own replay-key limits');
  assert.doesNotMatch(view.status, /violation|no answer/i);
  assert.equal(view.balanced, 'yes');
  assert.deepEqual(Object.keys(view.books).sort(), [...BOOKS.map((name) => 'books-' + name), 'books-balanced', 'books-title'].sort(), 'oracle enumerates every rendered book figure and its heading');
  assert.equal(view.books['books-title'], '3. The books, as the operator sees them and as each conductor reports its own share');
  assert.deepEqual(BOOKS.map((name) => Number(view.books['books-' + name])), expected);
}

async function inspect(page) {
  await page.locator('#run').focus();
  assert.equal(await page.locator('#run').evaluate((element) => document.activeElement === element), true);
  const visibleFocus = await page.locator('#run').evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
  });
  assert.equal(visibleFocus, true, 'keyboard focus is visible');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Checked '));
}

test('real signed qualified Edge observes the actual private reservation service and closes its exact owned resources on success and injected failure', { timeout: 900000 }, async () => {
  assert.ok(output && path.isAbsolute(output), 'an explicit invocation-owned observation output is required');
  const qualification = await qualifyEdge({ timeoutMs: 120000 });
  assert.equal(require('playwright/package.json').version, '1.56.1', 'use the existing explicitly approved cached browser tooling, never install or fall back');
  assert.equal(qualification.ok, true, JSON.stringify(qualification.reasonCodes));
  assert.equal(qualification.signature.status, 'Valid');
  assert.equal(qualification.signature.publisher, 'Microsoft Corporation');
  assert.ok(readQualified().qualifiedMajors.includes(qualification.major));
  assert.equal(qualification.major, 157, 'only the actually admitted installed major is exercised');
  assert.equal(readQualified().qualifiedMajors.includes(158), false);
  const restore = ownership.observe();
  try {
    for (const injectedFailure of [false, true]) {
      const label = injectedFailure ? 'injected-failure' : 'success';
      const ctx = await startApp({});
      let session;
      let authority;
      let cleanup;
      let failureCaught = false;
      try {
        const a = (await reserve(ctx, 'conductor-a', 3)).json.reservation;
        const b = (await reserve(ctx, 'conductor-b', 2, { tier: 'burst' })).json.reservation;
        const beforeRefusal = ctx.app.snapshot();
        const refusal = await reserve(ctx, 'conductor-a', 4);
        assert.equal(refusal.json.error.code, 'LEASE_CAP_EXCEEDED');
        assert.deepEqual(ctx.app.snapshot(), beforeRefusal, 'real HTTP refusal never consumes the other lease');
        session = await ownership.scope.run(label, () =>
          openLoopbackScratchSession('capability\\C011\\index.html', ctx.app.server, options));
        authority = await ownership.authenticate(session, label);
        assert.equal(Number(session.browserVersion.split('.')[0]), qualification.major);
        assert.equal(await session.page.title(), 'C011 lease capacity and spend inspector');
        const headers = await call(ctx, null, 'GET', '/');
        assert.match(headers.headers['content-security-policy'], /default-src 'none'/);
        assert.match(headers.headers['content-security-policy'], /script-src 'self'/);
        assertView(await snapshot(session.page), null);
        if (injectedFailure) assert.fail('C011_INJECTED_BROWSER_ASSERTION');
        for (const name of ['visitor', 'conductor-a', 'conductor-b', 'operator']) {
          await session.page.locator('#token-' + name).fill(ctx.tokens[name]);
        }
        await inspect(session.page);
        const first = await snapshot(session.page);
        assertView(first, [10, 60, 5, 28, 5, 32, 3, 12, 2, 16]);
        await release(ctx, 'conductor-a', a.id);
        await reserve(ctx, 'conductor-a', 1);
        await inspect(session.page);
        const second = await snapshot(session.page);
        assertView(second, [10, 60, 3, 20, 7, 40, 1, 4, 2, 16]);
        assert.equal((await call(ctx, ctx.tokens['conductor-b'], 'GET', `/v1/reservations/${b.id}`)).json.reservation.units, 2);
        observed.push({ label, browserVersion: session.browserVersion, first, second, root: authority.root });
      } catch (error) {
        if (injectedFailure && error.code === 'ERR_ASSERTION' && error.message === 'C011_INJECTED_BROWSER_ASSERTION') failureCaught = true;
        else throw error;
      } finally {
        try {
          if (session) cleanup = authority ? await ownership.closeOwned(session, authority) : await session.close();
        } finally { await ctx.close(); }
      }
      assert.equal(ctx.app.server.listening, false, 'owned loopback service is closed');
      if (injectedFailure) {
        assert.equal(failureCaught, true, 'the real injected assertion ran before finally cleanup');
        observed.push({ label, failureCaught, cleanup });
      } else observed.at(-1).cleanup = cleanup;
    }
    assert.equal(observed.length, 2);
    assert.ok(observed.every((entry) => entry.cleanup.clean));
    fs.writeFileSync(output, JSON.stringify({
      schema: 'C011-browser-observations/1', authority: 'current accepted isolated helper, opt-in owned lifecycle and owning qualifier API',
      browser: { version: qualification.version, sha256: qualification.sha256, major: qualification.major,
        signature: qualification.signature.status, publisher: qualification.signature.publisher },
      observations: observed, globalRuntimeCleanlinessClaimed: false,
      fixtureRoot: path.relative(repository, path.resolve(__dirname, '..')), writesInBrowserBlocked: true
    }, null, 2) + '\n', { flag: 'wx' });
  } finally { restore(); }
});
