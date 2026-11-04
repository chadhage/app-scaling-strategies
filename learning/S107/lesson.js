'use strict';

(function () {
  const model = window.S107;
  const byId = id => document.getElementById(id);
  const form = byId('rehearsal-form');
  const cfg = window.S107_RUNTIME;
  const http = cfg !== null;
  let state = model.createState();
  let busy = false;
  let cspOverflow = false;
  const csp = [];

  if (http && (!cfg || typeof cfg !== 'object'
      || Object.keys(cfg).sort().join(',') !== 'apiOrigin,frontendOrigin,origin,origins,runId'
      || !model.constants.origins.includes(cfg.origin) || cfg.frontendOrigin !== location.origin
      || !model.isRunId(cfg.runId)
      || !model.literalOrigin(cfg.apiOrigin) || cfg.apiOrigin === location.origin
      || !Array.isArray(cfg.origins) || cfg.origins.length !== 3
      || !cfg.origins.every(model.literalOrigin) || new Set(cfg.origins).size !== 3
      || !cfg.origins.includes(location.origin) || !cfg.origins.includes(cfg.apiOrigin))) {
    byId('error').hidden = false;
    byId('error').textContent = 'Invalid owned fixture configuration; no request is permitted.';
    byId('run-attempt').disabled = true;
    return;
  }

  document.addEventListener('securitypolicyviolation', event => {
    if (csp.length < 100) csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    else cspOverflow = true;
    byId('csp-summary').textContent = `CSP violations observed: ${csp.length}${cspOverflow ? ' (overflow; uncertain)' : ''}`;
  });
  function error(message) {
    byId('error').textContent = message;
    byId('error').hidden = false;
    byId('error').focus();
  }
  function clearError() {
    byId('error').hidden = true;
    byId('error').textContent = '';
  }
  function render() {
    const summary = model.summarize(state);
    const counts = summary.counts;
    byId('metrics').textContent = `Attempted: ${counts.attempted}; education pass: ${counts.educationPass}; education fail: ${counts.educationFail}; pending: ${counts.pending}; browser-readable: ${counts.readable}; CORS-denied: ${counts.corsDenied}; unknown: ${counts.unknown}; remaining: ${summary.remaining}.`;
    const current = summary.current;
    byId('status').dataset.cors = current?.cors || 'unknown';
    byId('status').dataset.impact = current?.userImpact || 'unknown';
    byId('status').dataset.verifier = current?.verifier || 'not-run';
    byId('status').textContent = current
      ? `Education verifier: ${current.verifier}; user impact: ${current.userImpact}; CORS assessment: ${current.cors}. ${current.evidenceBasis}. Not Azure certification.`
      : 'No current attempt; real CORS is unknown. The retained journal is unchanged.';
    byId('trace').textContent = current ? JSON.stringify(current, null, 2) : 'No current trace; earlier attempts remain below.';
    const journal = byId('history');
    journal.replaceChildren();
    for (const entry of summary.history) {
      const item = document.createElement('li');
      item.dataset.attempt = String(entry.id);
      item.dataset.cors = entry.cors;
      item.dataset.impact = entry.userImpact;
      item.dataset.verifier = entry.verifier;
      item.textContent = `Attempt ${entry.id}: ${entry.origin}, ${entry.policy}; predicted ${entry.prediction}; education ${entry.verifier}; user impact ${entry.userImpact}; CORS ${entry.cors}.`;
      journal.append(item);
    }
    for (const control of form.elements) control.disabled = busy;
    byId('origin').disabled = http || busy;
    byId('run-attempt').disabled = busy || summary.remaining === 0;
  }
  async function request(url, mode) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 3000);
    try {
      return await fetch(url, { method: 'GET', mode, credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    } finally {
      clearTimeout(deadline);
    }
  }
  function unmeasured() {
    return { browser: 'not-measured', receipt: null, cspBlocked: false, payloadVerified: false };
  }
  async function observe(attempt) {
    if (!http || byId('measurement').value === 'not-measured') return unmeasured();
    const api = `${cfg.apiOrigin}/profile?policy=${attempt.policy}&attempt=${attempt.id}&run=${attempt.runId}`;
    const cspStart = csp.length;
    let browser = 'blocked';
    let payloadVerified = false;
    try {
      const response = await request(api, 'cors');
      browser = 'readable';
      const payload = JSON.parse(await response.text());
      payloadVerified = response.status === 200 && response.headers.get('content-type') === 'application/json; charset=utf-8'
        && Object.keys(payload).sort().join(',') === 'displayName,id,version'
        && payload.id === 'fictional-profile' && payload.displayName === 'Cedar learner'
        && payload.version === (attempt.policy === 'baseline' ? 'v1' : 'v2');
    } catch {
      payloadVerified = false;
    }
    let receipt = null;
    try {
      const response = await request(`${location.origin}/receipt?attempt=${attempt.id}&run=${attempt.runId}`, 'same-origin');
      const result = JSON.parse(await response.text());
      if (response.status !== 200 || Object.keys(result).join(',') !== 'receipt') throw new Error('Missing receipt envelope');
      if (result.receipt !== null) model.validateReceipt(result.receipt);
      receipt = result.receipt;
    } catch {
      receipt = null;
    }
    const cspBlocked = cspOverflow || csp.slice(cspStart).some(event =>
      event.directive === 'connect-src' && (event.blockedURI === cfg.apiOrigin || event.blockedURI.startsWith(`${cfg.apiOrigin}/`)));
    return { browser, receipt, cspBlocked, payloadVerified };
  }

  if (http) {
    byId('mode').textContent = `Owned HTTP fixture: frontend ${cfg.origin}. Actual browser requests use the API cross-origin; only matching finished receipts support an assessment.`;
    byId('origins').textContent = `Frontend ${cfg.origin}: ${cfg.frontendOrigin}\nOwned API: ${cfg.apiOrigin}\nAll owned origins: ${cfg.origins.join(', ')}`;
    byId('origin').value = cfg.origin;
    byId('run-attempt').textContent = 'Send real cross-origin request';
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearError();
    try {
      if (!['request', 'not-measured'].includes(byId('measurement').value)) throw new Error('Choose a fixed observation condition.');
      state = model.transition(state, { type: 'begin', policy: byId('policy').value,
        origin: http ? cfg.origin : byId('origin').value, prediction: byId('prediction').value,
        mode: http ? 'http' : 'static', frontendOrigin: http ? location.origin : null,
        apiOrigin: http ? cfg.apiOrigin : null, runId: http ? cfg.runId : null });
      busy = true;
      render();
      const observation = await observe(state.attempts.at(-1));
      state = model.transition(state, { type: 'complete', observation });
    } catch (failure) {
      if (state.attempts.at(-1)?.observation === null) {
        state = model.transition(state, { type: 'complete', observation: unmeasured() });
      }
      error(`${failure.code || 'OBSERVATION_ERROR'}: ${failure.message}`);
    } finally {
      busy = false;
      render();
      if (byId('error').hidden) byId('policy').focus();
    }
  });
  byId('reset-controls').addEventListener('click', () => {
    if (busy) return;
    state = model.transition(state, { type: 'reset' });
    form.reset();
    if (http) byId('origin').value = cfg.origin;
    clearError();
    render();
    byId('policy').focus();
  });
  render();
}());
