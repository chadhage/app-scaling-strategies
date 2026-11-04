'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);

(async () => {
  const session = await openIsolatedLesson(path.join('learning', 'S130', 'evidence', 'red-stub', 'index.html'));
  const report = { phase: 'loadable-stub', helperSha256, node: process.version, browser: session.browserVersion, pageErrors: [], awaitedCleanupCompleted: false };
  try {
    session.page.on('pageerror', (error) => report.pageErrors.push(error.message));
    assert.equal(await session.page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    await session.page.locator('#preset').selectOption('multi-compatible');
    await session.page.locator('#software-token').focus();
    await session.page.keyboard.press('Enter');
    report.phaseAfterKeyboardLoad = await session.page.locator('#phase').textContent();
    report.historyAfterKeyboardLoad = await session.page.locator('#history-count').textContent();
    assert.equal(report.phaseAfterKeyboardLoad, 'empty');
    assert.equal(report.historyAfterKeyboardLoad, '0 / 12');
    assert.deepEqual(report.pageErrors, []);
  } finally {
    await session.close();
    report.awaitedCleanupCompleted = true;
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      fs.writeFileSync(path.join(__dirname, '..', 'raw', 'stub-browser.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    }
    console.log(JSON.stringify(report));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
