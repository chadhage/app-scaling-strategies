'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { openIsolatedLesson } = require('./isolated.cjs');
const { chromium } = require('playwright');

const fixture = path.join('testing', 'browser', 'fixtures', 'counter.html');
const repoRoot = path.resolve(__dirname, '..', '..');

test('tooling uses the exact pinned package and repository browser cache', () => {
  assert.equal(require('playwright/package.json').version, '1.56.1');
  assert.equal(
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(repoRoot, '.git', 'kanban-orchestrator', 'browser-binaries'),
  );
  assert.equal(
    require('node:os').tmpdir(),
    path.join(repoRoot, '.git', 'kanban-orchestrator', 'browser-runtime'),
  );
});

test('concurrent real headless sessions stay visible, independent, and actionable', async (t) => {
  const actualLaunch = chromium.launch.bind(chromium);
  const scratchByBrowser = new Map();
  const launch = t.mock.method(chromium, 'launch', async (...args) => {
    const browser = await actualLaunch(...args);
    scratchByBrowser.set(browser, args[0].env?.TEMP);
    return browser;
  });
  const sessions = [];
  t.after(async () => {
    const results = await Promise.allSettled(sessions.map((session) => session.close()));
    for (const result of results) assert.equal(result.status, 'fulfilled');
  });

  const results = await Promise.allSettled([0, 1].map(async () => {
    const session = await openIsolatedLesson(fixture);
    sessions.push(session);
    return session;
  }));
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }

  const [left, right] = results.map((result) => result.value);
  const leftBrowser = left.page.context().browser();
  const rightBrowser = right.page.context().browser();
  assert.equal(launch.mock.callCount(), 2);
  for (const call of launch.mock.calls) {
    assert.equal(call.arguments[0].channel, 'msedge');
    assert.equal(call.arguments[0].headless, true);
    assert.equal(call.arguments[0].chromiumSandbox, true);
  }
  const scratchDirectories = [scratchByBrowser.get(leftBrowser), scratchByBrowser.get(rightBrowser)];
  for (const directory of scratchDirectories) {
    assert.equal(typeof directory, 'string', 'Each browser must own a repository-local scratch directory');
    assert.equal(path.dirname(directory), path.join(repoRoot, '.git', 'kanban-orchestrator', 'browser-runtime'));
    assert.equal((await fs.stat(directory)).isDirectory(), true);
  }
  assert.notEqual(scratchDirectories[0], scratchDirectories[1]);
  assert.notEqual(leftBrowser, rightBrowser);
  assert.notEqual(left.page.context(), right.page.context());
  assert.match(left.browserVersion, /^\d+\./);
  assert.equal(left.browserVersion, right.browserVersion);

  for (const session of [left, right]) {
    assert.equal(await session.page.evaluate(() => document.visibilityState), 'visible');
    assert.match(await session.page.evaluate(() => navigator.userAgent), /HeadlessChrome/);
  }

  await Promise.all([
    (async () => {
      const input = left.page.getByRole('textbox', { name: 'Message' });
      await input.fill('alpha');
      await input.press('End');
      await left.page.keyboard.type('-left');
      await input.press('Enter');
    })(),
    (async () => {
      const input = right.page.getByRole('textbox', { name: 'Message' });
      await input.fill('bravo');
      await input.press('End');
      await right.page.keyboard.type('-right');
      await right.page.getByRole('button', { name: 'Increment' }).click();
      await right.page.getByRole('button', { name: 'Increment' }).click();
    })(),
  ]);

  assert.equal(await left.page.locator('#message').inputValue(), 'alpha-left');
  assert.equal(await right.page.locator('#message').inputValue(), 'bravo-right');
  assert.equal(await left.page.locator('#count').textContent(), '1');
  assert.equal(await right.page.locator('#count').textContent(), '2');
  assert.equal(await left.page.locator('#last-message').textContent(), 'alpha-left');
  assert.equal(await right.page.locator('#last-message').textContent(), 'bravo-right');
  assert.equal(await left.page.evaluate(() => document.visibilityState), 'visible');
  assert.equal(await right.page.evaluate(() => document.visibilityState), 'visible');

  await Promise.all([left.close(), left.close()]);
  assert.equal(leftBrowser.isConnected(), false);
  assert.equal(left.page.isClosed(), true);
  assert.equal(rightBrowser.isConnected(), true);
  await assert.rejects(fs.stat(scratchDirectories[0]), { code: 'ENOENT' });
  assert.equal((await fs.stat(scratchDirectories[1])).isDirectory(), true);
  await right.page.getByRole('textbox', { name: 'Message' }).press('Enter');
  assert.equal(await right.page.locator('#count').textContent(), '3');
  assert.equal(await right.page.evaluate(() => document.visibilityState), 'visible');
  await right.close();
  await right.close();
  assert.equal(rightBrowser.isConnected(), false);
  assert.equal(right.page.isClosed(), true);
  await assert.rejects(fs.stat(scratchDirectories[1]), { code: 'ENOENT' });
  t.diagnostic(`Real Chromium ${left.browserVersion}; two concurrent visible headless sessions; keyboard/button state isolated; both browsers disconnected.`);
});

test('unsupported URLs, absolute paths, and root escapes are rejected before launch', async (t) => {
  const launch = t.mock.method(chromium, 'launch', () => {
    throw new Error('Invalid paths must never launch a browser');
  });
  const invalid = [
    'https://example.invalid/lesson',
    'http://localhost:3000/',
    'file:///C:/Windows/win.ini',
    'data:text/html,lesson',
    'javascript:void(0)',
    '//example.invalid/lesson',
    '\\\\server\\share\\lesson.html',
    'C:\\Windows\\win.ini',
    'C:relative.html',
    '\\Windows\\win.ini',
    '..\\outside.html',
    'learning\\..\\README.md',
    'testing\\browser\\isolated.cjs',
    'testing\\browser\\fixtures\\..\\isolated.cjs',
    'testing\\browser\\fixtures\\counter.html:stream',
    'testing\\browser\\fixtures\\counter.html\0',
    '',
    null,
  ];
  for (const value of invalid) {
    await assert.rejects(openIsolatedLesson(value), {
      code: 'ERR_LESSON_PATH',
      message: /Invalid local lesson path:/,
    }, String(value));
  }
  assert.equal(launch.mock.callCount(), 0);
});

test('missing files and directories receive explicit validation errors before launch', async (t) => {
  const launch = t.mock.method(chromium, 'launch', () => {
    throw new Error('Invalid paths must never launch a browser');
  });
  for (const value of [
    path.join('learning', '__missing_browser_tooling_fixture__.html'),
    path.join('capability', '__missing_browser_tooling_fixture__.html'),
    path.join('testing', 'browser', 'fixtures', '__missing__.html'),
    path.join('testing', 'browser', 'fixtures'),
  ]) {
    await assert.rejects(openIsolatedLesson(value), {
      code: 'ERR_LESSON_PATH',
      message: /Invalid local lesson path:/,
    });
  }
  assert.equal(launch.mock.callCount(), 0);
});

test('a fixture-root junction cannot escape to an unapproved real path', async (t) => {
  const runtime = path.join(__dirname, 'fixtures', `.path-validation-${process.pid}`);
  t.after(() => fs.rm(runtime, { recursive: true, force: true }));
  await fs.mkdir(runtime);
  await fs.symlink(path.join(repoRoot, 'testing'), path.join(runtime, 'escape'), 'junction');
  const escaped = path.relative(repoRoot, path.join(runtime, 'escape', 'browser', 'isolated.cjs'));
  const launch = t.mock.method(chromium, 'launch', () => {
    throw new Error('An escaped real path must never launch a browser');
  });
  await assert.rejects(openIsolatedLesson(escaped), {
    code: 'ERR_LESSON_PATH',
    message: /Invalid local lesson path:.*outside approved roots/,
  });
  assert.equal(launch.mock.callCount(), 0);
});

test('an unavailable selected Edge channel is reported without a silent fallback', async (t) => {
  const failure = new Error('Selected msedge channel is unavailable');
  const launch = t.mock.method(chromium, 'launch', async () => { throw failure; });
  await assert.rejects(openIsolatedLesson(fixture), (error) => error === failure);
  assert.equal(launch.mock.callCount(), 1);
  assert.equal(launch.mock.calls[0].arguments[0].channel, 'msedge');
  await assert.rejects(fs.stat(launch.mock.calls[0].arguments[0].env.TEMP), { code: 'ENOENT' });
});

test('navigation failure closes its real browser before rejecting', async (t) => {
  const actualLaunch = chromium.launch.bind(chromium);
  const browsers = [];
  const scratchDirectories = [];
  t.after(async () => {
    await Promise.all(browsers.map((browser) => browser.close()));
  });
  const failure = new Error('Deterministic navigation failure');
  t.mock.method(chromium, 'launch', async (...args) => {
    scratchDirectories.push(args[0].env.TEMP);
    const browser = await actualLaunch(...args);
    browsers.push(browser);
    const actualNewContext = browser.newContext.bind(browser);
    t.mock.method(browser, 'newContext', async (...contextArgs) => {
      const context = await actualNewContext(...contextArgs);
      context.on('page', (page) => {
        t.mock.method(page, 'goto', async () => { throw failure; });
      });
      return context;
    });
    return browser;
  });
  await assert.rejects(openIsolatedLesson(fixture), (error) => error === failure);
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].isConnected(), false);
  assert.equal(browsers[0].contexts().length, 0);
  await assert.rejects(fs.stat(scratchDirectories[0]), { code: 'ENOENT' });
});

test('close still disconnects the real browser if context cleanup reports an error', async (t) => {
  const actualLaunch = chromium.launch.bind(chromium);
  const launch = t.mock.method(chromium, 'launch', (...args) => actualLaunch(...args));
  const session = await openIsolatedLesson(fixture);
  const context = session.page.context();
  const browser = context.browser();
  t.after(() => browser.close());
  const actualClose = context.close.bind(context);
  const failure = new Error('Deterministic context cleanup failure');
  t.mock.method(context, 'close', async () => {
    await actualClose();
    throw failure;
  });
  await assert.rejects(session.close(), (error) => error === failure);
  assert.equal(browser.isConnected(), false);
  assert.equal(session.page.isClosed(), true);
  await assert.rejects(fs.stat(launch.mock.calls[0].arguments[0].env.TEMP), { code: 'ENOENT' });
});
