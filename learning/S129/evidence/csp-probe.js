'use strict';
(() => {
  const observed = {
    events: [], inlineExecuted: false, evalExecuted: false,
    dataFetchSucceeded: false, workerStarted: false, done: false,
  };
  window.S129CspObservation = observed;
  window.addEventListener('securitypolicyviolation', (event) => {
    observed.events.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
  });
  (async () => {
    const inline = document.createElement('script');
    inline.textContent = 'window.S129CspObservation.inlineExecuted = true;';
    document.body.append(inline);
    try { Function('window.S129CspObservation.evalExecuted = true;')(); }
    catch (error) { observed.evalError = error.name; }
    try {
      await fetch('data:text/plain,S129-policy-probe');
      observed.dataFetchSucceeded = true;
    } catch (error) { observed.dataFetchError = error.name; }
    const url = URL.createObjectURL(new Blob(['postMessage("started");'], { type: 'text/javascript' }));
    window.S129CspWorkerURL = url;
    try {
      const worker = new Worker(url);
      window.S129CspWorker = worker;
      worker.addEventListener('message', () => { observed.workerStarted = true; });
      worker.addEventListener('error', () => { observed.workerError = 'blocked'; });
    } catch (error) { observed.workerError = error.name; }
    observed.done = true;
  })().catch((error) => { observed.fixtureError = error.message; observed.done = true; });
})();
