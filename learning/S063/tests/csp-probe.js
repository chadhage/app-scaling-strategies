(function probeCsp() {
  'use strict';
  const result = {
    inlineRan: false, evalRan: false, evalBlocked: false,
    connectionBlocked: false, complete: false, violations: [],
  };
  globalThis.__s063CspProbe = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s063CspProbe.inlineRan = true;';
  document.head.append(inline);
  try {
    new Function('globalThis.__s063CspProbe.evalRan = true;')();
  } catch {
    result.evalBlocked = true;
  }
  fetch('https://example.invalid/s063-synthetic-csp-probe')
    .catch(() => { result.connectionBlocked = true; })
    .finally(() => { result.complete = true; });
}());
