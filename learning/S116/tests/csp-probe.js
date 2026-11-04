'use strict';

(async () => {
  const probe = {
    complete: false, inlineRan: false, evalRan: false, evalError: null,
    connectionResult: null, violations: [],
  };
  window.S116CspProbe = probe;
  document.addEventListener('securitypolicyviolation', (event) => {
    probe.violations.push({
      effectiveDirective: event.effectiveDirective,
      blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const inline = document.createElement('script');
  inline.textContent = 'window.S116CspProbe.inlineRan = true;';
  document.head.append(inline);
  try {
    (0, eval)('window.S116CspProbe.evalRan = true;');
  } catch (error) {
    probe.evalError = { name: error.name, message: error.message };
  }
  try {
    await fetch('data:text/plain,S116-CSP-probe');
    probe.connectionResult = 'unexpectedly-allowed';
  } catch (error) {
    probe.connectionResult = error.name;
  }
  probe.complete = true;
})();
