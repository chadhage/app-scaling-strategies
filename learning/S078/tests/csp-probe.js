(function () {
  'use strict';
  const probe = {
    violations: [], inlineExecuted: false, connectDenied: false,
    originalBase: document.baseURI, finalBase: null, inlineStyleApplied: false,
  };
  const required = ['script-src-elem', 'style-src-elem', 'base-uri', 'connect-src', 'frame-src', 'object-src'];
  let resolveViolations;
  const violationsReady = new Promise((resolve) => { resolveViolations = resolve; });
  globalThis.S078CspProbe = probe;
  document.addEventListener('securitypolicyviolation', (event) => {
    probe.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    if (required.every((directive) => probe.violations.some((entry) => entry.directive === directive))) resolveViolations();
  });
  globalThis.S078InlineExecuted = false;
  const script = document.createElement('script');
  script.textContent = 'globalThis.S078InlineExecuted = true;';
  document.body.append(script);
  const style = document.createElement('style');
  style.textContent = 'html { --s078-inline-probe: applied; }';
  document.head.append(style);
  const base = document.createElement('base');
  base.href = new URL('csp-probe-base/', document.baseURI).href;
  document.head.append(base);
  probe.finalBase = document.baseURI;
  base.remove();
  const frame = document.createElement('iframe');
  frame.src = 'data:text/html,S078-frame-probe';
  document.body.append(frame);
  const object = document.createElement('object');
  object.data = 'data:text/plain,S078-object-probe';
  object.type = 'text/plain';
  document.body.append(object);
  probe.done = (async () => {
    try { await fetch('data:text/plain,S078-connect-probe'); }
    catch { probe.connectDenied = true; }
    await violationsReady;
    probe.inlineExecuted = globalThis.S078InlineExecuted;
    probe.inlineStyleApplied = getComputedStyle(document.documentElement).getPropertyValue('--s078-inline-probe').trim() !== '';
    script.remove();
    style.remove();
    frame.remove();
    object.remove();
  })();
}());
