(function () {
  'use strict';
  const observation = {
    violations: [], done: false, evalBlocked: false, connectionBlocked: false,
    originalColor: getComputedStyle(document.body).color,
  };
  globalThis.__S135CSPProbe = observation;
  document.addEventListener('securitypolicyviolation', function (event) {
    observation.violations.push({
      directive: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__S135InlineRan = true;';
  document.body.append(inline);
  const button = document.createElement('button');
  button.textContent = 'Evidence-only inline-event probe';
  button.setAttribute('onclick', 'globalThis.__S135InlineEventRan = true;');
  document.body.append(button);
  button.click();
  try { globalThis.eval('globalThis.__S135EvalRan = true;'); }
  catch (error) { observation.evalBlocked = true; observation.evalError = error.name; }
  const style = document.createElement('style');
  style.textContent = 'body { color: rgb(255, 0, 255); }';
  document.head.append(style);
  button.setAttribute('style', 'color: rgb(255, 0, 255);');
  const image = document.createElement('img');
  image.alt = 'Evidence-only blocked DATA image';
  image.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
  document.body.append(image);
  const frame = document.createElement('iframe');
  frame.title = 'Evidence-only blocked DATA frame';
  frame.src = 'data:text/html,%3Cp%3Esynthetic%3C/p%3E';
  document.body.append(frame);
  const form = document.createElement('form');
  form.action = new URL('index.html?synthetic-csp-probe', document.URL).href;
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  fetch('data:text/plain,synthetic-csp-probe').then(function () {
    observation.done = true;
  }, function (error) {
    observation.connectionBlocked = true;
    observation.connectionError = error.name;
    observation.done = true;
  });
}());
