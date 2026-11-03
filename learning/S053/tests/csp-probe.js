(function () {
  'use strict';
  const result = {
    violations: [], inlineRan: false, evalRan: false,
    evalBlocked: false, connectionBlocked: false, finished: false,
  };
  globalThis.__s053Csp = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s053Csp.inlineRan = true;';
  document.head.append(inline);
  inline.remove();
  try {
    globalThis.eval('globalThis.__s053Csp.evalRan = true;');
  } catch (error) {
    result.evalBlocked = error instanceof EvalError;
  }
  globalThis.fetch('https://s053.invalid/csp-probe', { mode: 'no-cors' })
    .catch((error) => { result.connectionBlocked = error instanceof TypeError; })
    .finally(() => { result.finished = true; });
}());
