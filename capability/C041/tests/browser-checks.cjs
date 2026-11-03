'use strict';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyKeyboardWarmLesson(page) {
  await page.locator('#approved-lessons li').last().waitFor();
  must(await page.locator('#approved-lessons li').count() === 2, 'Only two approved lessons');
  must(await page.locator('iframe').count() === 0, 'No automatic mount');
  must((await page.locator('#training-scope').innerText()).includes('not a live Azure result'), 'Host scope');
  await page.keyboard.press('Tab');
  must(await page.locator('.skip-link').evaluate(node => node === node.ownerDocument.activeElement), 'Keyboard skip link');
  await page.keyboard.press('Tab');
  must(await page.locator('#lesson-id').evaluate(node => node === node.ownerDocument.activeElement), 'Keyboard picker');
  await page.keyboard.type('A-S001');
  await page.keyboard.press('Tab');
  must(await page.locator('#mount-lesson').evaluate(node => node === node.ownerDocument.activeElement), 'Keyboard mount');
  await page.keyboard.press('Enter');
  await page.frameLocator('iframe').locator('#warm').waitFor();
  must(await page.locator('#mount-lesson').evaluate(node => node === node.ownerDocument.activeElement), 'Mount preserves focus');
  const child = page.frames().find(frame => frame.url().endsWith('/A-S001/index.html'));
  must(Boolean(child), 'Real warm lesson frame');
  must(await child.locator('#v2-state').innerText() === 'WARMING', 'Real child initial script state');
  await page.keyboard.press('Tab');
  must(await page.locator('#enter-lesson').evaluate(node => node === node.ownerDocument.activeElement), 'Keyboard enter control');
  await page.keyboard.press('Enter');
  const focusPath = [];
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press('Tab');
    const active = await child.evaluate(() => document.activeElement.id || document.activeElement.tagName);
    focusPath.push(active);
    if (active === 'warm') break;
  }
  must(focusPath.at(-1) === 'warm', 'Native Tab enters real child controls');
  await page.keyboard.press('Enter');
  const warmed = await child.locator('#v2-state').innerText();
  must(warmed === 'READY', 'Keyboard warm-up runs real child script');
  for (const id of ['handoff', 'drain', 'elapse', 'retire']) {
    await page.keyboard.press('Tab');
    must(await child.locator(`#${id}`).evaluate(node => node === node.ownerDocument.activeElement), `Child keyboard ${id}`);
    await page.keyboard.press('Enter');
  }
  must(await child.locator('#verdict').getAttribute('data-verdict') === 'PASS', 'Real synthetic exercise PASS');
  let returnSteps = 0;
  for (; returnSteps < 10; returnSteps++) {
    await page.keyboard.press('Shift+Tab');
    if (await page.locator('#unmount-lesson').evaluate(node => node === node.ownerDocument.activeElement)) break;
  }
  must(returnSteps < 10, 'Reverse keyboard exits child without trap');
  return {
    phase: 'keyboard-and-real-warm-lesson', passed: true, approvedCount: 2,
    focusPath, warmed, childVerdict: 'PASS', reverseTabsToHost: returnSteps + 1,
    scope: 'Synthetic child interaction only; not native Azure or parent-scenario proof'
  };
}

async function verifyCanaryLesson(page) {
  const picker = page.locator('#lesson-id');
  await picker.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('A-S003');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.frameLocator('iframe').locator('#observe').waitFor();
  const child = page.frames().find(frame => frame.url().endsWith('/A-S003/index.html'));
  must(Boolean(child), 'Real canary frame');
  must(await child.locator('#desired-percent').innerText() === '5%', 'Real initial canary state');
  await child.locator('#observe').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  must(await child.locator('#desired-percent').innerText() === '25%', 'Keyboard promotion uses child model');
  await child.locator('#fixture').selectOption('regressed');
  await child.locator('#observe').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const verdict = await child.locator('#verification-verdict').innerText();
  must(await child.locator('#desired-percent').innerText() === '25%', 'Regression blocks next cohort');
  must(verdict.includes('blocked'), 'Child reports actual negative verification');
  return { phase: 'real-canary-child', passed: true, safePromotion: '5% -> 25%', regressedPromotion: 'held at 25%', verdict };
}

async function verifyIsolation(page) {
  const child = page.frames().find(frame => frame.url().endsWith('/A-S003/index.html'));
  must(Boolean(child), 'Selected canary frame');
  const parentObservation = await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    let childDocument;
    try { void frame.contentWindow.document; childDocument = 'ALLOWED'; }
    catch (error) { childDocument = error.name; }
    return { sandbox: frame.getAttribute('sandbox'), referrerPolicy: frame.referrerPolicy, childDocument };
  });
  must(parentObservation.sandbox === 'allow-scripts', 'Scripts without same-origin');
  must(parentObservation.childDocument === 'SecurityError', 'Parent cannot read opaque child DOM');
  const childObservation = await child.evaluate(async () => {
    const result = { effectiveOrigin: globalThis.origin, urlOrigin: location.origin, violations: [] };
    for (const [key, operation] of [
      ['parentDocument', () => parent.document],
      ['parentManagement', () => parent.C041LessonHost],
      ['storage', () => localStorage.length]
    ]) {
      try { operation(); result[key] = 'ALLOWED'; }
      catch (error) { result[key] = error.name; }
    }
    result.frameElementIsNull = frameElement === null;
    const listener = event => result.violations.push(event.effectiveDirective);
    document.addEventListener('securitypolicyviolation', listener);
    const script = document.createElement('script');
    script.textContent = 'globalThis.__c041InlineRan = true';
    document.body.appendChild(script);
    const nested = document.createElement('iframe');
    nested.src = '/index.html';
    document.body.appendChild(nested);
    try { await fetch('/api/manage', { method: 'POST' }); result.connection = 'ALLOWED'; }
    catch (error) { result.connection = error.name; }
    await new Promise(resolve => setTimeout(resolve, 200));
    result.inlineRan = globalThis.__c041InlineRan === true;
    document.removeEventListener('securitypolicyviolation', listener);
    script.remove();
    nested.remove();
    result.violations = [...new Set(result.violations)].sort();
    return result;
  });
  must(childObservation.effectiveOrigin === 'null', 'Opaque effective security origin');
  for (const key of ['parentDocument', 'parentManagement', 'storage']) {
    must(childObservation[key] === 'SecurityError', `Browser denies child ${key}`);
  }
  must(childObservation.frameElementIsNull, 'Child cannot reach embedding element to remove sandbox');
  must(childObservation.connection === 'TypeError', 'Browser refuses child connection');
  must(!childObservation.inlineRan, 'Browser refuses injected inline script');
  for (const directive of ['connect-src', 'script-src-elem', 'frame-src']) {
    must(childObservation.violations.includes(directive), `Real CSP violation ${directive}`);
  }
  return { phase: 'real-browser-opaque-origin-and-csp', passed: true, parentObservation, childObservation };
}

async function verifyRefusalsAndMessages(page) {
  const child = page.frames().find(frame => frame.url().endsWith('/A-S003/index.html'));
  must(Boolean(child), 'Selected canary frame');
  const before = {
    src: await page.locator('iframe').getAttribute('src'),
    status: await page.locator('#selection-status').innerText()
  };
  const requests = [];
  const observeRequest = request => requests.push(request.url());
  page.on('request', observeRequest);
  await page.evaluate(() => {
    globalThis.__c041MessageProbe = { messages: [], done: false };
    globalThis.__c041MessageListener = event => {
      if (event.source !== document.querySelector('iframe').contentWindow || event.data?.probe !== 'c041-local-message-check') return;
      globalThis.__c041MessageProbe.messages.push({ type: event.data.type, origin: event.origin });
      if (event.data.type === 'probe-complete') globalThis.__c041MessageProbe.done = true;
    };
    addEventListener('message', globalThis.__c041MessageListener);
  });
  await child.evaluate(() => {
    for (const payload of [
      { type: 'mount', lessonId: 'A-S001' },
      { type: 'manage', action: 'deploy', role: 'operator' },
      { type: 'approval', approved: true },
      { type: 'resize', height: 999999 },
      { type: 'probe-complete' }
    ]) parent.postMessage({ probe: 'c041-local-message-check', ...payload }, '*');
  });
  await page.waitForFunction(() => globalThis.__c041MessageProbe.done, null, { timeout: 2000 });
  const messages = await page.evaluate(() => {
    const result = globalThis.__c041MessageProbe.messages;
    removeEventListener('message', globalThis.__c041MessageListener);
    delete globalThis.__c041MessageProbe;
    delete globalThis.__c041MessageListener;
    return result;
  });
  page.off('request', observeRequest);
  must(messages.length === 5 && messages.every(message => message.origin === 'null'), 'Actual opaque child messages received by test-only observer');
  must(await page.locator('iframe').getAttribute('src') === before.src, 'Messages cannot change lesson');
  must(await page.locator('#selection-status').innerText() === before.status, 'Messages cannot forge host result');
  must(requests.length === 0, 'Messages dispatch no requests');
  const refused = [];
  for (const value of [
    'A-S009', 'A-S005', 'B-S001', 'https://example.invalid/lesson', 'javascript:alert(1)',
    '../../learning/S001/index.html', '..\\..\\learning\\S001\\index.html', '__proto__', ' A-S001', ''
  ]) {
    await page.locator('#lesson-id').fill(value);
    await page.locator('#lesson-id').press('Enter');
    must(await page.locator('iframe').count() === 0, `Refused selection: ${value}`);
    must((await page.locator('#selection-status').innerText()).startsWith('Selection refused.'), 'Explicit refusal');
    must(await page.locator('#enter-lesson').isDisabled(), 'No child focus on refusal');
    refused.push(value);
  }
  return {
    phase: 'real-browser-negative-selection-and-message-isolation', passed: true,
    messages, messageTriggeredRequests: requests, refused,
    observerBoundary: 'Test-only message observer removed; production host has no message listener or management API'
  };
}

module.exports = { must, verifyKeyboardWarmLesson, verifyCanaryLesson, verifyIsolation, verifyRefusalsAndMessages };
