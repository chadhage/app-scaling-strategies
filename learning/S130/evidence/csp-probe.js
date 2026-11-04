(async function () {
  'use strict';
  const report = { violations: [], complete: false };
  globalThis.__s130Csp = report;
  document.addEventListener('securitypolicyviolation', (event) => {
    report.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s130InlineRan = true;';
  document.head.append(inline);
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('onclick', 'globalThis.__s130EventRan = true;');
  document.body.append(button);
  button.click();
  try {
    (0, eval)('1 + 1');
    report.evalBlocked = false;
  } catch (error) {
    report.evalBlocked = error instanceof EvalError;
  }
  const styled = document.createElement('div');
  styled.textContent = 'CSP style observation';
  styled.setAttribute('style', 'display:none');
  document.body.append(styled);
  report.inlineStyleBlocked = getComputedStyle(styled).display !== 'none';
  try {
    await fetch('data:text/plain,synthetic-csp-probe');
    report.connectBlocked = false;
  } catch (error) {
    report.connectBlocked = error instanceof TypeError;
  }
  const image = document.createElement('img');
  image.alt = 'Synthetic blocked image probe';
  image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  document.body.append(image);
  const frame = document.createElement('iframe');
  frame.title = 'Synthetic blocked frame probe';
  frame.src = 'data:text/html,synthetic-frame-probe';
  document.body.append(frame);
  const form = document.createElement('form');
  const originalUrl = location.href;
  form.action = originalUrl;
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  await new Promise((resolve) => setTimeout(resolve, 150));
  report.inlineScriptBlocked = globalThis.__s130InlineRan !== true;
  report.inlineEventBlocked = globalThis.__s130EventRan !== true;
  report.imageBlocked = image.naturalWidth === 0;
  report.formNavigationBlocked = location.href === originalUrl;
  report.complete = true;
}()).catch((error) => {
  globalThis.__s130Csp = { complete: true, error: error.message };
});
