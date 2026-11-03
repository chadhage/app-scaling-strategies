'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const helperFile = path.join(root, 'testing', 'browser', 'isolated.cjs');
const approvedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperFile)), approvedHelperHash, 'Only the published, approved helper is permitted');
const { openIsolatedLesson } = require(helperFile);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const proofPath = path.join(lesson, 'evidence', 'raw', 'browser-session.json');
const text = (page, id) => page.locator(`#${id}`).textContent();
const records = (page) => page.locator('#history tr[data-record]').count();

test('actual isolated S059 DOM, keyboard, error, failure, history, reset and CSP', async (t) => {
  if (capture && fs.existsSync(proofPath)) throw new Error('Saved browser proof is immutable; normal verification must be read-only');
  const proof = {
    cardId: 'A-S059', mode: 'synthetic', startedAtUtc: new Date().toISOString(),
    node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    helper: { path: 'testing\\browser\\isolated.cjs', rawSha256: approvedHelperHash, publishedCommit: '53c0c0d' },
    sources: ['index.html', 'model.js', 'lesson.js', 'lesson.css', 'manifest.json'].map((file) => {
      const bytes = fs.readFileSync(path.join(lesson, file));
      return { file, rawSha256: hash(bytes), canonicalSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) };
    }),
    checks: [], limits: 'Local tooling pair only; not native Azure, distributed configuration, Node.js 24 production or source-parent proof.',
  };
  const session = await openIsolatedLesson('learning\\S059\\index.html');
  const { page } = session;
  proof.browser = session.browserVersion;
  const pageErrors = [];
  const consoleErrors = [];
  let phase = 'lesson';
  let externalRoutedRequests = 0;
  let published;
  let failureRow;
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ phase, text: message.text() });
  });
  const check = async (name, action) => {
    await t.test(name, async () => {
      const observed = await action();
      proof.checks.push({ name, observed });
    });
  };
  try {
    await check('standalone banner, labels, declared fixture and no hidden execution', async () => {
      assert.equal(await page.title(), 'S059 — Configuration-version overlap');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Shared configuration schema').count(), 1);
      assert.equal(await page.getByLabel('retryBudget raw integer', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('New code interpretation / evidence').count(), 1);
      assert.equal(await text(page, 'verdict'), 'NOT CHECKED');
      assert.equal(await records(page), 0);
      assert.equal(await page.locator('iframe').count(), 0);
      return { title: await page.title(), banner: await page.locator('.banner').textContent(), gate: await text(page, 'verdict') };
    });

    await check('real Tab, Enter and Space inspect then publish the compatible default', async () => {
      const focus = [];
      await page.locator('#schema').focus();
      focus.push(await page.evaluate(() => document.activeElement.id));
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Tab');
        focus.push(await page.evaluate(() => document.activeElement.id));
      }
      assert.deepEqual(focus, ['schema', 'budget', 'reader', 'inspect-draft']);
      await page.keyboard.press('Enter');
      assert.equal(await text(page, 'verdict'), 'PASS');
      assert.equal(await text(page, 'compatibility'), 'PASS');
      assert.equal(await text(page, 'successful'), '2');
      assert.equal(await text(page, 'failed'), '0');
      assert.equal(await text(page, 'unknown'), '0');
      assert.deepEqual(await page.locator('#readings tr td:nth-child(4)').allTextContents(), ['3', '3']);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'publish-draft');
      await page.keyboard.press('Space');
      published = await text(page, 'published');
      assert.match(published, /Published locally: retryBudget=2; retries-v1; new code=compatible/);
      assert.equal(await records(page), 2);
      return { focus, readings: await page.locator('#readings').innerText(), published, announcement: await text(page, 'announcement') };
    });

    await check('editing invalidates the check; divergent meaning fails and cannot replace publication', async () => {
      await page.locator('#reader').selectOption('reinterpreted');
      assert.equal(await text(page, 'verdict'), 'NOT CHECKED');
      await page.locator('#publish-draft').click();
      assert.match(await text(page, 'announcement'), /inspect this exact draft/);
      assert.equal(await text(page, 'published'), published);
      await page.locator('#inspect-draft').click();
      assert.equal(await text(page, 'verdict'), 'FAIL');
      assert.equal(await text(page, 'compatibility'), 'FAIL');
      assert.equal(await text(page, 'failed'), '1');
      assert.equal(await text(page, 'successful'), '1');
      assert.deepEqual(await page.locator('#readings tr td:nth-child(4)').allTextContents(), ['3', '2']);
      failureRow = await page.locator('#history tr[data-record="4"]').innerText();
      await page.locator('#publish-draft').click();
      assert.equal(await text(page, 'published'), published);
      assert.match(await text(page, 'announcement'), /Blocked: FAIL/);
      assert.equal(await records(page), 5);
      return { gate: await text(page, 'verdict'), failed: await text(page, 'failed'), failureRow, publication: await text(page, 'published') };
    });

    await check('two successful probes do not hide different shared-setting meanings', async () => {
      await page.locator('#budget').fill('3');
      await page.locator('#inspect-draft').click();
      assert.equal(await text(page, 'successful'), '2');
      assert.equal(await text(page, 'failed'), '0');
      assert.equal(await text(page, 'compatibility'), 'FAIL');
      assert.equal(await text(page, 'verdict'), 'FAIL');
      assert.deepEqual(await page.locator('#readings tr td:nth-child(4)').allTextContents(), ['4', '3']);
      await page.locator('#publish-draft').click();
      assert.equal(await text(page, 'published'), published);
      return { gate: await text(page, 'verdict'), successes: await text(page, 'successful'), reason: await text(page, 'reason') };
    });

    await check('missing evidence is unknown and publication is explicitly blocked', async () => {
      await page.locator('#budget').fill('2');
      await page.locator('#reader').selectOption('unobserved');
      await page.locator('#inspect-draft').click();
      assert.equal(await text(page, 'verdict'), 'UNKNOWN');
      assert.equal(await text(page, 'compatibility'), 'UNKNOWN');
      assert.equal(await text(page, 'successful'), '1');
      assert.equal(await text(page, 'failed'), '0');
      assert.equal(await text(page, 'unknown'), '1');
      await page.locator('#publish-draft').click();
      assert.match(await text(page, 'announcement'), /Blocked: UNKNOWN/);
      assert.equal(await text(page, 'published'), published);
      return { gate: await text(page, 'verdict'), unknown: await text(page, 'unknown'), impact: await text(page, 'user-impact') };
    });

    await check('new schema explicitly rejects the old reader without upgrading it', async () => {
      await page.locator('#budget').fill('3');
      await page.locator('#reader').selectOption('compatible');
      await page.locator('#schema').selectOption('attempts-v2');
      await page.locator('#inspect-draft').click();
      assert.equal(await text(page, 'verdict'), 'FAIL');
      assert.match(await page.locator('#readings tr[data-code="old-v1"]').innerText(), /unrecognized schema.*not established.*failure/);
      await page.locator('#publish-draft').click();
      assert.equal(await text(page, 'published'), published);
      return { oldReader: await page.locator('#readings tr[data-code="old-v1"]').innerText(), gate: await text(page, 'verdict') };
    });

    await check('matching meanings with an insufficient journey budget still fail', async () => {
      await page.locator('#schema').selectOption('retries-v1');
      await page.locator('#budget').fill('1');
      await page.locator('#inspect-draft').click();
      assert.equal(await text(page, 'compatibility'), 'PASS');
      assert.equal(await text(page, 'verdict'), 'FAIL');
      assert.equal(await text(page, 'failed'), '2');
      assert.equal(await records(page), 12);
      return { compatibility: await text(page, 'compatibility'), gate: await text(page, 'verdict'), failed: await text(page, 'failed') };
    });

    await check('decimal and empty errors announce refusal, focus the field and preserve measured state', async () => {
      const before = await page.locator('#history').innerText();
      for (const invalid of ['2.5', '']) {
        await page.locator('#budget').fill(invalid);
        await page.locator('#inspect-draft').click();
        assert.ok(await page.locator('#input-error').isVisible());
        assert.match(await text(page, 'input-error'), /integer 0–4/);
        assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'budget');
        assert.equal(await records(page), 12);
        assert.equal(await text(page, 'published'), published);
        assert.equal(await page.locator('#history').innerText(), before);
      }
      return { error: await text(page, 'input-error'), focused: await page.evaluate(() => document.activeElement.id), retainedRecords: await records(page) };
    });

    await check('compatible recovery publishes while earlier failures and unknowns remain', async () => {
      await page.locator('#budget').fill('2');
      await page.locator('#inspect-draft').click();
      await page.locator('#publish-draft').click();
      assert.equal(await text(page, 'verdict'), 'PASS');
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), null);
      assert.equal(await records(page), 14);
      assert.equal(await page.locator('#history tr[data-record="4"]').innerText(), failureRow);
      assert.match(await page.locator('#history tr[data-record="8"]').innerText(), /UNKNOWN/);
      assert.equal(await text(page, 'published'), published);
      return { recoveredGate: await text(page, 'verdict'), retainedFailure: await page.locator('#history tr[data-record="4"]').innerText(), records: await records(page) };
    });

    await check('history capacity refuses further actions without erasing any of 16 records', async () => {
      await page.locator('#inspect-draft').click();
      await page.locator('#inspect-draft').click();
      assert.equal(await records(page), 16);
      const before = await page.locator('#history').innerText();
      await page.locator('#inspect-draft').click();
      assert.match(await text(page, 'input-error'), /History is full/);
      assert.equal(await records(page), 16);
      assert.equal(await page.locator('#history').innerText(), before);
      assert.equal(await text(page, 'published'), published);
      return { error: await text(page, 'input-error'), historyDOM: await page.locator('#history').evaluate((node) => node.outerHTML) };
    });

    await check('Enter and Space reset restore defaults, clear local errors and focus the first control', async () => {
      await page.locator('#start-over').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'schema');
      assert.equal(await page.locator('#budget').inputValue(), '2');
      assert.equal(await page.locator('#schema').inputValue(), 'retries-v1');
      assert.equal(await page.locator('#reader').inputValue(), 'compatible');
      assert.equal(await records(page), 0);
      assert.equal(await text(page, 'published'), 'Nothing published.');
      assert.equal(await text(page, 'verdict'), 'NOT CHECKED');
      assert.equal(await page.locator('#input-error').isVisible(), false);
      await page.locator('#reader').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#reader').inputValue(), 'reinterpreted');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await text(page, 'verdict'), 'FAIL');
      await page.locator('#start-over').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'schema');
      assert.equal(await records(page), 0);
      assert.equal(await text(page, 'published'), 'Nothing published.');
      assert.equal(await page.evaluate(() => typeof document.getElementById('configuration-form').reset), 'function');
      return { focused: await page.evaluate(() => document.activeElement.id), announcement: await text(page, 'announcement'), records: await records(page), published: await text(page, 'published') };
    });

    await check('enforced CSP blocks inline code and connection before any external route', async () => {
      phase = 'intentional-csp-negative-probes';
      await page.route('https://s059.synthetic.invalid/**', async (route) => {
        externalRoutedRequests++;
        await route.abort('blockedbyclient');
      });
      const networkError = await page.evaluate(async () => {
        window.__s059InlineExecuted = false;
        window.__s059CspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s059CspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s059InlineExecuted = true;';
        document.head.appendChild(script);
        try {
          await fetch('https://s059.synthetic.invalid/never-sent');
          return 'unexpected success';
        } catch (error) {
          return error.name;
        }
      });
      await page.waitForFunction(() => window.__s059CspViolations.length >= 2);
      const violations = await page.evaluate(() => window.__s059CspViolations);
      assert.equal(await page.evaluate(() => window.__s059InlineExecuted), false);
      assert.equal(networkError, 'TypeError');
      assert.ok(violations.some((entry) => entry.directive.startsWith('script-src') && entry.blockedURI === 'inline'));
      assert.ok(violations.some((entry) => entry.directive === 'connect-src'));
      assert.equal(externalRoutedRequests, 0);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors.filter((entry) => entry.phase === 'lesson'), []);
      assert.ok(consoleErrors.some((entry) => /Content Security Policy/.test(entry.text)));
      return { inlineExecuted: false, networkError, externalRoutedRequests, violations, intentionalConsoleErrors: consoleErrors };
    });
    assert.equal(proof.checks.length, 12, 'Every actual-browser checkpoint must pass before evidence capture');
    proof.finalDOM = {
      banner: await page.locator('.banner').textContent(), gate: await text(page, 'verdict'),
      history: await page.locator('#history').innerText(), publication: await text(page, 'published'),
      focused: await page.evaluate(() => document.activeElement.id),
    };
    proof.pageErrors = pageErrors;
    proof.externalRoutedRequests = externalRoutedRequests;
  } finally {
    await session.close();
  }
  assert.ok(page.isClosed(), 'The real isolated page was closed');
  proof.sessionClosed = true;
  proof.finishedAtUtc = new Date().toISOString();
  if (capture) fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
});
