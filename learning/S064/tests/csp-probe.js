(function probeFromOrdinaryPageScript() {
  'use strict';
  const result = {
    inlineRan: false, evalRan: false, evalBlocked: false,
    connectionBlocked: false, finished: false, violations: [],
  };
  globalThis.__s064Csp = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s064Csp.inlineRan = true;';
  document.body.append(inline);
  inline.remove();
  // DevTools evaluation can bypass eval CSP; this file runs as an ordinary external script.
  try { globalThis.eval('globalThis.__s064Csp.evalRan = true;'); } catch { result.evalBlocked = true; }
  fetch('data:text/plain,synthetic-csp-probe')
    .catch(() => { result.connectionBlocked = true; })
    .finally(() => { result.finished = true; });
}());
