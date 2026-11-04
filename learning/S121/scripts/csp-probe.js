(function () {
  'use strict';
  globalThis.runS121CspProbe = async function () {
    const violations = [];
    const observe = (event) => violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
    document.addEventListener('securitypolicyviolation', observe);
    delete globalThis.__s121Inline;
    delete globalThis.__s121Handler;
    delete globalThis.__s121Eval;
    const script = document.createElement('script');
    script.textContent = 'globalThis.__s121Inline = true;';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('onclick', 'globalThis.__s121Handler = true;');
    let evalBlocked = false;
    let connectBlocked = false;
    try {
      document.body.append(script, button);
      button.click();
      try { new Function('globalThis.__s121Eval = true;')(); } catch { evalBlocked = true; }
      try {
        await fetch(new URL('model.js', location.href));
      } catch { connectBlocked = true; }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        inlineBlocked: globalThis.__s121Inline !== true,
        handlerBlocked: globalThis.__s121Handler !== true,
        evalBlocked: evalBlocked && globalThis.__s121Eval !== true,
        connectBlocked, violations,
      };
    } finally {
      script.remove();
      button.remove();
      document.removeEventListener('securitypolicyviolation', observe);
    }
  };
  const launcher = document.createElement('button');
  launcher.id = 'run-csp-probe';
  launcher.type = 'button';
  launcher.textContent = 'Run page-owned CSP observation';
  launcher.addEventListener('click', async () => {
    try {
      globalThis.s121CspObservation = await globalThis.runS121CspProbe();
    } catch (error) {
      globalThis.s121CspObservation = { error: error.message };
    }
    launcher.dataset.complete = 'true';
  }, { once: true });
  document.body.append(launcher);
}());
