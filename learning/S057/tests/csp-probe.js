(function () {
  'use strict';
  const result = {
    violations: [], inlineRan: false, handlerRan: false, evalRan: false,
    evalBlocked: false, connectionBlocked: false,
  };
  globalThis.__s057CspProbe = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const script = document.createElement('script');
  script.textContent = 'globalThis.__s057CspProbe.inlineRan = true';
  document.head.append(script);
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('onclick', 'globalThis.__s057CspProbe.handlerRan = true');
  document.body.append(button);
  button.click();
  button.remove();
  try { (0, eval)('globalThis.__s057CspProbe.evalRan = true'); } catch { result.evalBlocked = true; }
  fetch('https://synthetic.invalid/s057-csp-probe').catch(() => { result.connectionBlocked = true; });
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://synthetic.invalid/s057-csp-form';
  document.body.append(form);
  form.requestSubmit();
  form.remove();
}());
