(function () {
  'use strict';
  const proof = { violations: [], fetchRejected: false, inlineExecuted: false };
  globalThis.__s073CspProbe = proof;
  document.addEventListener('securitypolicyviolation', (event) => {
    proof.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s073InlineExecuted = true;';
  document.body.append(inline);
  const style = document.createElement('style');
  style.textContent = 'body { --s073-inline-style: executed; }';
  document.head.append(style);
  const foreign = document.createElement('script');
  foreign.src = 'https://synthetic.invalid/blocked-script.js';
  document.body.append(foreign);
  const frame = document.createElement('iframe');
  frame.src = 'https://synthetic.invalid/blocked-frame';
  document.body.append(frame);
  fetch('https://synthetic.invalid/blocked-fetch', { credentials: 'omit' })
    .catch(() => { proof.fetchRejected = true; });
  const form = document.createElement('form');
  form.action = 'https://synthetic.invalid/blocked-form';
  form.method = 'post';
  document.body.append(form);
  form.submit();
  proof.inlineExecuted = globalThis.__s073InlineExecuted === true;
}());
