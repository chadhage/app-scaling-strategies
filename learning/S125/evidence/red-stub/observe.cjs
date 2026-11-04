'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const hash = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(hash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

(async () => {
  const session = await openIsolatedLesson(path.join('learning', 'S125', 'index.html'));
  let observation;
  try {
    const page = session.page;
    assert.equal(await page.title(), 'S125 - Single ACA revision rehearsal');
    assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#candidate-version').focus();
    await page.keyboard.press('Enter');
    const phase = await page.locator('#phase').textContent();
    assert.equal(phase, 'baseline');
    observation = {
      observedAtUtc: new Date().toISOString(), stage: 'loadable-stub-before-implementation',
      helperSha256: hash, node: process.version, playwright: '1.56.1',
      browser: session.browserVersion, title: await page.title(), phaseAfterKeyboardUpdate: phase,
      behavioralGap: 'Expected awaiting-readiness; the loadable stub remains baseline.',
      historyCount: await page.locator('#history-count').textContent(),
      nativeResult: 'unverified', iac: 'not evaluated until behavioral RED',
    };
  } finally {
    await session.close();
  }
  console.log(JSON.stringify({ ...observation, awaitedCleanupCompleted: true }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
