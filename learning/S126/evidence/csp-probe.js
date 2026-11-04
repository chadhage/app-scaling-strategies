(async function () {
  'use strict';
  const probe = { violations: [], done: false };
  globalThis.__s126CspProbe = probe;
  document.addEventListener('securitypolicyviolation', (event) => {
    probe.violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const script = document.createElement('script');
  script.textContent = 'globalThis.__s126InlineExecuted = true;';
  document.body.append(script);
  probe.inlineBlocked = globalThis.__s126InlineExecuted !== true;
  const button = document.createElement('button');
  button.setAttribute('onclick', 'globalThis.__s126EventExecuted = true;');
  document.body.append(button);
  button.click();
  probe.inlineEventBlocked = globalThis.__s126EventExecuted !== true;
  try {
    globalThis.eval('globalThis.__s126EvalExecuted = true;');
    probe.evalBlocked = false;
  } catch (error) {
    probe.evalErrorName = error.name;
    probe.evalBlocked = error.name === 'EvalError';
  }
  const style = document.createElement('style');
  style.textContent = '.banner { display: none !important; }';
  document.head.append(style);
  const form = document.createElement('form');
  form.method = 'get';
  form.action = globalThis.location.href;
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  const frame = document.createElement('iframe');
  frame.src = globalThis.location.href;
  document.body.append(frame);
  const image = document.createElement('img');
  const imageResult = new Promise((resolve) => {
    image.addEventListener('error', () => { probe.imageRejected = true; resolve(); }, { once: true });
    image.addEventListener('load', () => { probe.imageRejected = false; resolve(); }, { once: true });
  });
  image.src = new URL('lesson.css', globalThis.location.href).href;
  document.body.append(image);
  const connectionResult = fetch(globalThis.location.href).then(
    () => { probe.connectionRejected = false; },
    (error) => { probe.connectionRejected = true; probe.connectionErrorName = error.name; },
  );
  await Promise.all([connectionResult, imageResult]);
  probe.inlineStyleBlocked = getComputedStyle(document.querySelector('.banner')).display !== 'none';
  probe.done = true;
}());
