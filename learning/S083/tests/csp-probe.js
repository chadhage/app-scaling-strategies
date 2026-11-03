'use strict';

window.__s083CspProbe = { violations: [], inlineRan: false, connectionBlocked: false, done: false };
document.addEventListener('securitypolicyviolation', (event) => {
  window.__s083CspProbe.violations.push({
    directive: event.effectiveDirective,
    blockedURI: event.blockedURI
  });
});
const inlineProbe = document.createElement('script');
inlineProbe.textContent = 'window.__s083CspProbe.inlineRan = true;';
document.head.append(inlineProbe);
fetch('https://s083-training.invalid/csp-probe')
  .then(() => { window.__s083CspProbe.connectionBlocked = false; })
  .catch(() => { window.__s083CspProbe.connectionBlocked = true; })
  .finally(() => { window.__s083CspProbe.done = true; });
