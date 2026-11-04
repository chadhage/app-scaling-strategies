'use strict';
globalThis.S128Csp = { violations: [] };
document.addEventListener('securitypolicyviolation', (event) => {
  S128Csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
});
globalThis.runS128Csp = async () => {
  const script = document.createElement('script');
  script.textContent = 'globalThis.S128InlineRan = true;';
  document.body.append(script);
  const eventTarget = document.getElementById('csp-event-target');
  eventTarget.setAttribute('onclick', 'globalThis.S128InlineEventRan = true;');
  eventTarget.click();
  try { eval('globalThis.S128EvalRan = true;'); } catch (failure) { S128Csp.evalError = failure.name; }
  const target = document.getElementById('csp-style-target');
  S128Csp.originalColor = getComputedStyle(target).color;
  const style = document.createElement('style');
  style.textContent = '#csp-style-target { color: rgb(17, 18, 19) !important; }';
  document.head.append(style);
  target.setAttribute('style', 'background-color: rgb(12, 34, 56)');
  const image = new Image();
  image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  document.body.append(image);
  const frame = document.createElement('iframe');
  frame.src = 'data:text/html,<p>fictional blocked frame</p>';
  document.body.append(frame);
  try {
    await fetch('data:application/json,{"fictional":"only"}');
    S128Csp.connectionSucceeded = true;
  } catch { S128Csp.connectionSucceeded = false; }
  document.getElementById('csp-form').requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 150));
  S128Csp.inlineScriptRan = globalThis.S128InlineRan === true;
  S128Csp.inlineEventRan = globalThis.S128InlineEventRan === true;
  S128Csp.evalRan = globalThis.S128EvalRan === true;
  S128Csp.currentColor = getComputedStyle(target).color;
  S128Csp.currentBackground = getComputedStyle(target).backgroundColor;
  S128Csp.done = true;
  return S128Csp;
};
// Native keyboard dispatch avoids the DevTools evaluation context's CSP exemptions.
document.getElementById('csp-run').addEventListener('click', () => {
  runS128Csp().catch((failure) => { S128Csp.error = failure.message; S128Csp.done = true; });
});
