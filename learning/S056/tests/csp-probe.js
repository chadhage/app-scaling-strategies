(function () {
  'use strict';
  const result = { loaded: true, done: false, violations: [], connectionRejected: false, workerRejected: false };
  globalThis.__s056PolicyProbe = result;
  document.addEventListener('securitypolicyviolation', (event) => {
    result.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s056InlineRan = true;';
  document.body.append(inline);
  const button = document.createElement('button');
  button.setAttribute('onclick', 'globalThis.__s056HandlerRan = true;');
  document.body.append(button);
  button.click();
  button.remove();
  const style = document.createElement('style');
  style.textContent = ':root { --s056-inline-style: forbidden; }';
  document.head.append(style);
  const frame = document.createElement('iframe');
  frame.src = 'data:text/html,<p>synthetic blocked frame</p>';
  document.body.append(frame);
  const form = document.createElement('form');
  form.action = 'https://s056-probe.invalid/never-submit';
  form.method = 'post';
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
  const workerURL = URL.createObjectURL(new Blob(['self.postMessage("synthetic probe");'], { type: 'text/javascript' }));
  try {
    const worker = new Worker(workerURL);
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      result.workerRejected = true;
      worker.terminate();
      URL.revokeObjectURL(workerURL);
    });
    worker.addEventListener('message', () => {
      result.workerUnexpectedlyRan = true;
      worker.terminate();
      URL.revokeObjectURL(workerURL);
    });
  } catch {
    result.workerRejected = true;
    URL.revokeObjectURL(workerURL);
  }
  fetch('https://s056-probe.invalid/never-connect').then(
    () => { result.done = true; },
    () => { result.connectionRejected = true; result.done = true; },
  );
}());
