(function () {
  'use strict';

  const element = (id) => document.getElementById(id);
  const contract = globalThis.C032Contract;
  const client = globalThis.C032Client;
  const NO_CREDENTIAL = '__none__';
  const DECOY_NAMES = ['c032_destination', 'c032_client', 'ARRAffinity'];
  const MAX_LOG_LINES = 12;
  const logLines = [];
  let ready = false;
  let busy = false;
  let attempts = 0;

  function controls() {
    element('observe').disabled = !ready || busy;
    element('set-decoy').disabled = !ready || busy;
    element('clear-decoy').disabled = !ready || busy;
    element('credential').disabled = busy;
    element('decoy-destination').disabled = busy;
  }

  function clearObservation() {
    element('client-view').textContent = 'No observation.';
    element('destination-view').textContent = 'No observation.';
    element('counter-view').textContent = 'No observation.';
    element('result').textContent = 'No observation.';
  }

  function showCookies() {
    element('cookie-view').textContent = `document.cookie: ${document.cookie || '(none)'}`;
  }

  function log(line) {
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) logLines.shift();
    element('log').textContent = logLines.join('\n');
  }

  function setDecoy() {
    const destination = element('decoy-destination').value;
    document.cookie = `c032_destination=${destination}; path=/; SameSite=Strict`;
    document.cookie = 'c032_client=synthetic-client-beta; path=/; SameSite=Strict';
    document.cookie = `ARRAffinity=synthetic-affinity-${destination.replace('synthetic-destination-', '')}; path=/; SameSite=Strict`;
    showCookies();
    log('decoy cookies set; they are never sent as credentials');
  }

  function clearDecoy() {
    for (const name of DECOY_NAMES) document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Strict`;
    showCookies();
    log('decoy cookies cleared');
  }

  async function observe() {
    if (!ready || busy) return;
    busy = true;
    attempts += 1;
    controls();
    clearObservation();
    element('status').textContent = 'Pending — observing the actual local response.';
    const selected = element('credential').value;
    try {
      const observation = await client.createClient({ credential: selected === NO_CREDENTIAL ? undefined : selected }).observe();
      element('client-view').textContent = observation.client.id;
      element('destination-view').textContent = `${observation.destination.id} (version ${observation.destination.version})`;
      element('counter-view').textContent = String(observation.state.counter);
      element('result').textContent = JSON.stringify(observation, null, 2);
      element('status').textContent = 'VERIFIED LOCAL — destination and state came from the server; no cookie was sent as a credential.';
      log(`#${attempts} ${observation.client.id} -> ${observation.destination.id}, counter ${observation.state.counter}`);
    } catch (error) {
      clearObservation();
      element('status').textContent = `UNVERIFIED — ${error.code || 'OBSERVATION_FAILED'}: ${error.message}`;
      log(`#${attempts} failure ${error.code || 'OBSERVATION_FAILED'}`);
    } finally {
      busy = false;
      showCookies();
      controls();
      element('observe').focus();
    }
  }

  async function checkScope() {
    const response = await fetch(contract.paths.scope, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const scope = await response.json();
    if (scope.cardId !== 'C032' || scope.businessData !== 'synthetic' || scope.transport !== '127.0.0.1 HTTP only' ||
        scope.identityVerified !== false || scope.nativeTargetQualified !== false ||
        scope.productionRuntimeValidated !== false || scope.controlApiImplemented !== false ||
        scope.durableStoreImplemented !== false || scope.liveAzureRuns !== 0 || scope.authorizedCloudSpend !== 0 ||
        typeof scope.testRuntime !== 'string') throw new Error('Local-only tooling scope is missing or inconsistent.');
    return scope;
  }

  element('observe').addEventListener('click', observe);
  element('set-decoy').addEventListener('click', setDecoy);
  element('clear-decoy').addEventListener('click', clearDecoy);
  showCookies();

  if (!contract || !client) {
    element('status').textContent = 'UNVERIFIED — local client dependency unavailable.';
    return;
  }
  checkScope().then((scope) => {
    element('runtime').textContent = `Observed test tooling: ${scope.testRuntime}. Not Node24/Express production validation.`;
    ready = true;
    controls();
  }).catch((error) => {
    clearObservation();
    element('status').textContent = `UNVERIFIED — scope unavailable: ${error.message}`;
    controls();
  });
}());
