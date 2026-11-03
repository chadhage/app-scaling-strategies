(function () {
  'use strict';
  const result = {
    violations: [], inlineRan: false, evalRan: false, evalBlocked: false, connectionBlocked: false, finished: false,
  };
  globalThis.__s058Csp = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s058Csp.inlineRan = true;';
  document.head.append(inline);
  inline.remove();
  try { globalThis.eval('globalThis.__s058Csp.evalRan = true;'); }
  catch (error) { result.evalBlocked = error instanceof EvalError; }
  globalThis.fetch('https://s058.invalid/csp-probe', { mode: 'no-cors' })
    .catch((error) => { result.connectionBlocked = error instanceof TypeError; })
    .finally(() => { result.finished = true; });
}());
