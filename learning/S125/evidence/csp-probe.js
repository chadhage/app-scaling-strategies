(async function () {
  'use strict';
  const probe = { violations: [], done: false };
  globalThis.__s125CspProbe = probe;
  document.addEventListener('securitypolicyviolation', (event) => {
    probe.violations.push({
      effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s125InlineRan = true;';
  document.body.append(inline);
  probe.inlineBlocked = globalThis.__s125InlineRan !== true;
  const eventButton = document.createElement('button');
  eventButton.setAttribute('onclick', 'globalThis.__s125EventRan = true;');
  document.body.append(eventButton);
  eventButton.click();
  probe.inlineEventBlocked = globalThis.__s125EventRan !== true;
  try {
    globalThis.eval('globalThis.__s125EvalRan = true;');
    probe.evalBlocked = false;
  } catch (error) {
    probe.evalBlocked = error.name === 'EvalError';
    probe.evalErrorName = error.name;
  }
  const style = document.createElement('style');
  style.textContent = '.banner { display: none !important; }';
  document.head.append(style);
  const form = document.createElement('form');
  form.action = globalThis.location.href;
  form.method = 'get';
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
  const connection = fetch(globalThis.location.href).then(
    () => { probe.connectionRejected = false; },
    (error) => { probe.connectionRejected = true; probe.connectionErrorName = error.name; },
  );
  await Promise.all([connection, imageResult]);
  probe.inlineStyleBlocked = getComputedStyle(document.querySelector('.banner')).display !== 'none';
  probe.done = true;
}());
