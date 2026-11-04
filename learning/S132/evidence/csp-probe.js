(async function () {
  'use strict';
  const report = { complete: false, violations: [] };
  globalThis.__s132Csp = report;
  document.addEventListener('securitypolicyviolation', (event) => {
    report.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s132InlineRan = true;';
  document.head.append(inline);
  const control = document.createElement('button');
  control.type = 'button';
  control.setAttribute('onclick', 'globalThis.__s132EventRan = true;');
  document.body.append(control);
  control.click();
  try { (0, eval)('1 + 1'); report.evalBlocked = false; }
  catch (error) { report.evalBlocked = error instanceof EvalError; }
  const styled = document.createElement('p');
  styled.textContent = 'Test-only CSP style observation';
  styled.setAttribute('style', 'display:none');
  document.body.append(styled);
  report.inlineStyleBlocked = getComputedStyle(styled).display !== 'none';
  try { await fetch('data:text/plain,fictional-S132-CSP-DATA'); report.connectBlocked = false; }
  catch (error) { report.connectBlocked = error instanceof TypeError; }
  const image = document.createElement('img');
  image.alt = 'Test-only blocked fictional image DATA';
  image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  document.body.append(image);
  const frame = document.createElement('iframe');
  frame.title = 'Test-only blocked fictional frame DATA';
  frame.src = 'data:text/html,fictional-S132-frame-DATA';
  document.body.append(frame);
  const originalUrl = location.href;
  const form = document.createElement('form');
  form.action = originalUrl;
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  await new Promise((resolve) => setTimeout(resolve, 150));
  report.inlineScriptBlocked = globalThis.__s132InlineRan !== true;
  report.inlineEventBlocked = globalThis.__s132EventRan !== true;
  report.imageBlocked = image.naturalWidth === 0;
  report.formNavigationBlocked = location.href === originalUrl;
  report.complete = true;
}()).catch((error) => { globalThis.__s132Csp = { complete: true, error: error.message }; });
