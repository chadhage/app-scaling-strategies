'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

(async () => {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Deliberate stub capture requires the exact flag.');
  const session = await openIsolatedLesson(path.join('learning', 'S126', 'index.html'));
  let observation;
  try {
    assert.equal(await session.page.title(), 'S126 - Multiple revision rehearsal');
    assert.equal(await session.page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    await session.page.locator('#token').press('Enter');
    observation = {
      cardId: 'A-S126', mode: 'portable-synthetic', observedAtUtc: new Date().toISOString(),
      browser: session.browserVersion, node: process.version, helperSha256,
      phaseAfterKeyboardPrepare: await session.page.locator('#phase').textContent(),
      loadableNoOpStub: true, nativeProofComplete: false, extraKanoCredits: 0,
    };
    assert.equal(observation.phaseAfterKeyboardPrepare, 'baseline');
  } finally {
    await session.close();
  }
  observation.awaitedCleanupCompleted = true;
  fs.writeFileSync(path.join(__dirname, 'raw', 'stub-browser.json'), `${JSON.stringify(observation, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(observation));
})().catch((error) => { console.error(error); process.exitCode = 1; });
