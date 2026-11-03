'use strict';

// A local script, not debugger evaluation, must exercise the browser's eval boundary.
(() => {
  const state = { blocked: {}, violations: [], done: false };
  globalThis.__s092Csp = state;
  globalThis.__s092InlineRan = false;
  globalThis.__s092EvalRan = false;
  document.addEventListener('securitypolicyviolation', (event) => {
    state.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  (async () => {
    const script = document.createElement('script');
    script.textContent = 'globalThis.__s092InlineRan = true';
    document.head.append(script);
    script.remove();
    state.blocked.evalBlocked = false;
    try { new Function('globalThis.__s092EvalRan = true')(); }
    catch (error) { state.blocked.evalBlocked = error.name === 'EvalError'; }
    state.blocked.connectionBlocked = false;
    try { await fetch('data:text/plain,synthetic-only'); }
    catch { state.blocked.connectionBlocked = true; }
    const frame = document.createElement('iframe');
    frame.id = 's092-csp-frame';
    frame.src = 'data:text/html,<p>synthetic-only</p>';
    document.body.append(frame);
    const object = document.createElement('object');
    object.id = 's092-csp-object';
    object.type = 'text/plain';
    object.data = 'data:text/plain,synthetic-only';
    document.body.append(object);
    const form = document.createElement('form');
    form.id = 's092-csp-form';
    form.action = location.href;
    document.body.append(form);
    HTMLFormElement.prototype.submit.call(form);
    state.blocked.inlineRan = globalThis.__s092InlineRan;
    state.blocked.evalRan = globalThis.__s092EvalRan;
    state.done = true;
  })().catch((error) => { state.error = String(error); state.done = true; });
})();
