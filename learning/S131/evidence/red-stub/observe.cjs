'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const helper = path.resolve(__dirname, '..', '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);

(async () => {
  const observed = { stage: 'loadable-stub-before-RED', capturedAt: new Date().toISOString(), helperSha256 };
  const session = await openIsolatedLesson('learning\\S131\\index.html');
  const browser = session.page.context().browser();
  try {
    const page = session.page;
    observed.browserVersion = session.browserVersion;
    observed.nodeVersion = process.version;
    observed.title = await page.title();
    observed.banner = await page.locator('#mode-banner').innerText();
    assert.equal(observed.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#stub-load').click();
    observed.result = await page.locator('#stub-result').innerText();
    assert.equal(observed.result, 'PASS (unsafe baseline): HTML 200 only.');
    observed.dom = await page.locator('main').innerText();
    observed.loaded = true;
  } finally {
    await session.close();
    observed.closeAwaited = true;
    observed.pageClosed = session.page.isClosed();
    observed.browserDisconnected = !browser.isConnected();
  }
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const target = path.join(__dirname, '..', 'raw', 'stub-browser.json');
    fs.writeFileSync(target, `${JSON.stringify(observed, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify(observed));
})().catch((error) => { console.error(error); process.exitCode = 1; });
