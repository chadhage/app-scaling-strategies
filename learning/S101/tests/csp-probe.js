(function () {
  'use strict';
  const probe = { done: false, violations: [], fetchRejected: false };
  window.__s101CspProbe = probe;
  window.__s101ForbiddenInlineRan = false;
  document.addEventListener('securitypolicyviolation', (event) => {
    probe.violations.push({ effectiveDirective: event.effectiveDirective,
      blockedURI: event.blockedURI, disposition: event.disposition });
  });
  const inline = document.createElement('script');
  inline.textContent = 'window.__s101ForbiddenInlineRan = true;';
  document.head.append(inline);
  const external = document.createElement('script');
  external.src = 'https://blocked.training.invalid/rehearsal-probe.js';
  document.head.append(external);
  fetch('https://blocked.training.invalid/connection-probe')
    .catch(() => { probe.fetchRejected = true; });
  const form = document.createElement('form');
  form.method = 'post';
  form.action = 'https://blocked.training.invalid/form-probe';
  document.body.append(form);
  form.requestSubmit();
  setTimeout(() => {
    inline.remove(); external.remove(); form.remove();
    probe.done = true;
  }, 250);
}());
