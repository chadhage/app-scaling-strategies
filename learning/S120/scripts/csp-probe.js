(async function () {
  'use strict';
  if (!window.__csp) return;
  const script = document.createElement('script');
  script.textContent = 'window.__inlineRan = true';
  document.body.append(script);
  try { window.eval('window.__evalRan = true'); } catch (error) { window.__csp.evalBlocked = error.name === 'EvalError'; }
  try { await fetch('data:text/plain,s120-csp-probe'); } catch { window.__csp.connectBlocked = true; }
  const form = document.createElement('form');
  form.action = window.location.href;
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  window.__csp.done = true;
}());
