(function () {
  'use strict';
  const element = (id) => document.getElementById(id);
  const fields = ['profile', 'draft', 'boundary', 'budget'];
  const controls = ['start', 'resume', 'stop', 'reset-view', ...fields];
  let journey;
  let ready = false;
  let tick;
  function render() {
    if (!journey) return;
    const state = journey.snapshot();
    const active = ['running', 'paused'].includes(state.phase);
    for (const field of fields) element(field).disabled = !ready || active;
    element('start').disabled = !ready || active;
    element('resume').disabled = !ready || state.phase !== 'paused';
    element('stop').disabled = !ready || !active;
    element('reset-view').disabled = !ready;
    element('attempt').textContent = state.attemptId || 'None';
    element('counts').textContent = `${state.requests} / ${state.responses} / ${state.acknowledgements.length}`;
    const clockLabel = state.clockValid ? 'performance.now' : 'last valid observation; clock is now invalid';
    element('elapsed').textContent = state.attemptId ? `${state.elapsedMs.toFixed(3)} ms (${clockLabel})` : 'Not measured';
    element('paused-time').textContent = state.attemptId ? `${state.pausedMs.toFixed(3)} ms (${clockLabel})` : 'Not measured';
    element('budget-status').textContent = state.attemptId ?
      `${state.original.budgetMs} ms ORIGINAL - ${state.budgetExceeded ? 'EXCEEDED' : 'not exceeded'}; start ${state.startedAt.toFixed(3)}, deadline ${state.deadline.toFixed(3)}` : 'Not started';
    element('budget-status').dataset.budget = state.budgetExceeded ? 'exceeded' : 'not-exceeded';
    const messages = {
      idle: 'Not run. No HTTP or pause observation.',
      running: 'RUNNING original attempt; actual read-only fixture action.',
      paused: `PAUSED at ${state.original?.boundary}; the next request is HELD until Resume. The original clock and budget continue.`,
      complete: `OBSERVED LOCAL TWO-READ SEGMENT; state continuity observed. ${state.budgetExceeded ? 'ORIGINAL BUDGET EXCEEDED.' : 'Original budget not exceeded.'} Not full H006 or native qualification.`,
      failed: `FAILED REPLY - ${state.code}; no successful journey.`,
      unknown: `UNKNOWN - ${state.code}; interrupted/unmeasurable work is not successful.`
    };
    element('status').textContent = messages[state.phase];
    element('status').dataset.phase = state.phase;
    element('state').textContent = JSON.stringify(state, null, 2);
    element('history').textContent = JSON.stringify(state.history, null, 2);
    element('events').textContent = JSON.stringify(state.events, null, 2);
  }
  async function read(request) {
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const timeout = setTimeout(() => abort.abort(), 2500);
    try {
      const target = `/fixtures/${request.implementation}/getProfile?profileId=${request.profileId}`;
      const response = await fetch(target, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: abort.signal });
      if (response.url !== `${location.origin}${target}` || response.redirected ||
          response.headers.get('x-c033-card') !== 'C033') throw Object.assign(new Error('UNKNOWN_REPLY_SOURCE'), { code: 'UNKNOWN_REPLY_SOURCE' });
      let value;
      try { value = await response.json(); }
      catch { throw Object.assign(new Error('UNKNOWN_MALFORMED_REPLY'), { code: 'UNKNOWN_MALFORMED_REPLY' }); }
      return {
        requestToken: request.requestToken, implementation: request.implementation,
        status: response.status, value,
        headerVersion: response.headers.get('x-c020-implementation-version'),
        headerDeployment: response.headers.get('x-c020-deployment-stamp')
      };
    } catch (error) {
      if (!error.code) error.code = request.signal.aborted ? 'INTERRUPTED_REQUEST_REPLY' : 'INTERRUPTED_OR_UNAVAILABLE_REPLY';
      throw error;
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', onAbort);
    }
  }
  function perform(action) {
    try { action(); render(); }
    catch (error) {
      if (journey?.snapshot().attemptId && ['paused', 'running'].includes(journey.snapshot().phase)) journey.stop();
      element('status').textContent = `UNAVAILABLE - ${error.code || 'LOCAL_ACTION_FAILED'}; no successful observation.`;
    }
  }
  async function boot() {
    if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || !location.port) {
      element('mode').textContent = 'UNAVAILABLE - static files are not an owned HTTP listener. No actual pause, requests or timing are claimed.';
      return;
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 2500);
    try {
      const response = await fetch('/page.js', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: abort.signal });
      if (!response.ok || response.url !== `${location.origin}/page.js` ||
          response.headers.get('x-c033-card') !== 'C033' || response.headers.get('x-c033-business-data') !== 'synthetic') {
        throw new Error('OWN_LISTENER_REQUIRED');
      }
      journey = globalThis.C033Journey.createJourney({ read, clock: () => performance.now(), onChange: render });
      ready = true;
      element('mode').textContent = 'READY - actual own read-only 127.0.0.1 HTTP; synthetic memory-only state. Buffered guarded browser HTTP is not native transport qualification.';
      element('start').addEventListener('click', () => perform(() => journey.start({
        profileId: element('profile').value, draft: element('draft').value,
        boundary: element('boundary').value, budgetMs: Number(element('budget').value)
      })));
      element('resume').addEventListener('click', () => perform(() => journey.resume()));
      element('stop').addEventListener('click', () => perform(() => journey.stop()));
      element('reset-view').addEventListener('click', () => perform(() => journey.reset()));
      tick = setInterval(render, 50);
      render();
    } catch {
      for (const control of controls) element(control).disabled = true;
      element('mode').textContent = 'UNAVAILABLE - actual own listener verification failed. No successful HTTP/pause/timing observation.';
    } finally { clearTimeout(timeout); }
  }
  window.addEventListener('pagehide', () => {
    clearInterval(tick);
    ready = false;
    if (journey) journey.stop();
  }, { once: true });
  boot();
}());
