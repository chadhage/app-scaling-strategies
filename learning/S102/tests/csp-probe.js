(function () {
  'use strict';
  const violations = [];
  globalThis.s102CspViolations = violations;
  document.addEventListener('securitypolicyviolation', (event) => violations.push({
    directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
  }));
  globalThis.s102CspResult = { done: false, violations };
  (async function () {
    const inline = document.createElement('script');
    inline.textContent = 'globalThis.s102InlineExecuted = true;';
    document.body.append(inline);
    inline.remove();
    let evalBlocked = false;
    try { (0, eval)('globalThis.s102EvalExecuted = true;'); } catch (error) {
      evalBlocked = error instanceof EvalError;
    }
    const image = document.createElement('img');
    image.alt = 'Owned CSP negative probe';
    image.src = 'https://s102-image.invalid/blocked';
    document.body.append(image);
    let connectionBlocked = false;
    try { await fetch('https://s102-connect.invalid/blocked'); } catch {
      connectionBlocked = true;
    }
    const form = document.createElement('form');
    form.method = 'post';
    form.action = 'https://s102-form.invalid/blocked';
    document.body.append(form);
    HTMLFormElement.prototype.submit.call(form);
    image.remove();
    form.remove();
    globalThis.s102CspResult = {
      done: true,
      inlineExecuted: globalThis.s102InlineExecuted === true,
      evalExecuted: globalThis.s102EvalExecuted === true,
      evalBlocked, connectionBlocked, violations
    };
  }());
}());
