(async function () {
  'use strict';
  const result = { pageLoadedScript: true, evalError: null, fetchError: null, done: false };
  globalThis.__s060CspProbe = result;
  globalThis.__s060Violations = [];
  globalThis.__s060InlineRan = false;
  globalThis.__s060EvalRan = false;
  document.addEventListener('securitypolicyviolation', (event) => {
    globalThis.__s060Violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s060InlineRan = true;';
  document.head.append(inline);
  try { globalThis.eval('globalThis.__s060EvalRan = true;'); } catch (error) { result.evalError = error.name; }
  try { await fetch('https://s060.invalid/connection-probe'); } catch (error) { result.fetchError = error.name; }
  const form = document.createElement('form');
  form.action = 'https://s060.invalid/form-probe';
  form.method = 'post';
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  form.remove();
  inline.remove();
  result.done = true;
}());
