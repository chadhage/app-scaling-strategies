'use strict';
(function () {
  const observation = globalThis.__s134Csp = {
    executionContext: 'ordinary external self-script, not privileged Playwright evaluation',
    complete: false, violations: [], inlineScriptBlocked: false, inlineEventBlocked: false,
    evalError: null, inlineStyleBlocked: false, connectError: null, imageWidth: null,
  };
  globalThis.__s134InlineRan = false;
  globalThis.__s134InlineEventRan = false;
  const phase = document.getElementById('phase');
  const originalMargin = getComputedStyle(phase).marginLeft;
  function complete() {
    const required = ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr',
      'connect-src', 'img-src', 'frame-src', 'form-action'];
    observation.inlineScriptBlocked = globalThis.__s134InlineRan === false;
    observation.inlineEventBlocked = globalThis.__s134InlineEventRan === false;
    observation.inlineStyleBlocked = getComputedStyle(phase).marginLeft === originalMargin;
    observation.complete = observation.evalError !== null && observation.connectError !== null
      && observation.imageWidth !== null
      && required.every((name) => observation.violations.some((entry) => entry.effectiveDirective === name));
  }
  document.addEventListener('securitypolicyviolation', (event) => {
    observation.violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
    });
    complete();
  });
  function probe(tag) {
    const element = document.createElement(tag);
    element.className = 's134-csp-probe';
    document.body.append(element);
    return element;
  }
  const script = document.createElement('script');
  script.className = 's134-csp-probe';
  script.textContent = 'globalThis.__s134InlineRan = true;';
  document.body.append(script);
  const button = probe('button');
  button.type = 'button';
  button.setAttribute('onclick', 'globalThis.__s134InlineEventRan = true;');
  button.click();
  try { globalThis.eval('1 + 1'); } catch (error) { observation.evalError = error.name; }
  const style = document.createElement('style');
  style.className = 's134-csp-probe';
  style.textContent = '#phase { margin-left: 123px !important; }';
  document.head.append(style);
  phase.setAttribute('style', 'margin-left: 123px !important;');
  fetch(location.href).then(() => {
    observation.connectError = 'unexpected allowed fetch';
    complete();
  }).catch((error) => {
    observation.connectError = error.name;
    complete();
  });
  const image = probe('img');
  image.addEventListener('error', () => {
    observation.imageWidth = image.naturalWidth;
    complete();
  });
  image.addEventListener('load', () => {
    observation.imageWidth = image.naturalWidth;
    complete();
  });
  image.src = location.href;
  probe('iframe').src = location.href;
  const form = probe('form');
  form.action = location.href;
  form.method = 'get';
  HTMLFormElement.prototype.submit.call(form);
  complete();
})();
