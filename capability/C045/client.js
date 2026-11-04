'use strict';

(async function () {
  const form = document.getElementById('client-form');
  const profile = document.getElementById('profile-id');
  const submit = document.getElementById('observe');
  const status = document.getElementById('client-status');
  const error = document.getElementById('client-error');
  const result = document.getElementById('result');
  const evidence = document.getElementById('request-evidence');
  const identity = document.getElementById('identity');
  let scope = null;
  let active = null;
  let generation = 0;

  function clearObservation(message) {
    generation++;
    if (active) active.abort();
    active = null;
    profile.disabled = false;
    submit.disabled = !scope;
    profile.removeAttribute('aria-invalid');
    error.hidden = true;
    error.textContent = '';
    result.textContent = 'No HTTP observation.';
    evidence.textContent = 'No HTTP observation.';
    identity.textContent = 'Observed synthetic profile: none (not authenticated).';
    status.textContent = message;
  }

  function fail(message, invalid = false) {
    status.textContent = `ERROR - ${message} No verified profile result.`;
    error.textContent = message;
    error.hidden = false;
    if (invalid) profile.setAttribute('aria-invalid', 'true');
  }

  function checkedScope(value) {
    const flags = ['identityVerified', 'previewEntitlementVerified', 'signedAttestation', 'actualAzureGA',
      'deploymentQualified', 'authorizationQualified', 'productionRuntimeValidated', 'nativeTransportQualified'];
    const implementation = value?.client === 'ga' ? 'v1' : value?.client === 'preview' ? 'v2' : null;
    if (!implementation || value.cardId !== 'C045' || value.mode !== 'synthetic-loopback-client'
      || value.label !== (value.client === 'ga' ? 'GA' : 'preview')
      || value.apiContract !== 'getProfile/1' || value.implementation !== implementation
      || value.fixturePath !== `/fixtures/${implementation}/getProfile` || value.origin !== location.origin
      || value.dataKind !== 'synthetic' || typeof value.runtime !== 'string'
      || !Number.isInteger(value.ttlMs) || value.ttlMs < 1000 || value.ttlMs > 120000
      || flags.some(flag => value[flag] !== false) || value.liveAzureRuns !== 0 || value.authorizedCloudSpend !== 0
      || Object.keys(value).length !== 21) throw new Error('Local scope is missing, altered or outside the approved synthetic boundary.');
    return Object.freeze(value);
  }

  form.addEventListener('reset', () => {
    clearObservation(scope ? 'NOT RUN - this client was reset; no profile observation.' : 'UNKNOWN - no local scope or HTTP profile observation.');
  });
  profile.addEventListener('input', () => {
    clearObservation(scope ? 'NOT RUN - explicit profile selection changed; no current HTTP observation.' : 'UNKNOWN - no local scope or HTTP profile observation.');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (active) return;
    clearObservation(scope ? 'NOT RUN - no current HTTP observation.' : 'UNKNOWN - no local scope or HTTP profile observation.');
    if (!scope) { fail('The owned local scope is unknown; submission is disabled.'); return; }
    const profileId = profile.value;
    if (!/^synthetic-\d{3}$/.test(profileId)) {
      fail('INVALID_PROFILE_ID - supply one explicit synthetic-NNN ID, without whitespace.', true);
      return;
    }
    const requestURL = new URL(scope.fixturePath, location.origin);
    requestURL.searchParams.set('profileId', profileId);
    const attempt = generation;
    const controller = new AbortController();
    active = controller;
    profile.disabled = true;
    submit.disabled = true;
    status.textContent = 'PENDING - awaiting this client\'s actual local HTTP response.';
    const timer = setTimeout(() => controller.abort(), 4000);
    let observation = { requestURL: requestURL.href, responseURL: null, method: 'GET', status: null,
      client: scope.client, requestedProfileId: profileId, source: 'actual owned local HTTP only', verified: false };
    try {
      const response = await fetch(requestURL.href, {
        method: 'GET', mode: 'same-origin', credentials: 'omit', cache: 'no-store',
        redirect: 'error', signal: controller.signal
      });
      observation = { ...observation, responseURL: response.url, status: response.status,
        headers: {
          client: response.headers.get('x-c045-client'), scope: response.headers.get('x-c045-scope'),
          apiContract: response.headers.get('x-c020-api-contract'),
          implementationVersion: response.headers.get('x-c020-implementation-version'),
          deploymentStamp: response.headers.get('x-c020-deployment-stamp')
        } };
      const text = await response.text();
      if (text.length > 16384 || response.headers.get('content-type') !== 'application/json; charset=utf-8') {
        throw new Error('INVALID_LOCAL_RESPONSE - no bounded JSON fixture response.');
      }
      const body = JSON.parse(text);
      if (attempt !== generation) return;
      if (response.url !== requestURL.href || observation.headers.client !== scope.client
        || observation.headers.scope !== 'synthetic-local-readonly') throw new Error('DESTINATION_MISMATCH - response did not identify this exact owned client.');
      if (!response.ok) {
        observation.errorCode = typeof body.error?.code === 'string' ? body.error.code : 'UNEXPECTED_HTTP_ERROR';
        evidence.textContent = JSON.stringify(observation, null, 2);
        fail(`HTTP ${response.status} ${observation.errorCode}.`, true);
        return;
      }
      const inspected = globalThis.C020Inspector.inspect(body, scope.implementation, profileId);
      if (observation.headers.apiContract !== inspected.apiContract
        || observation.headers.implementationVersion !== inspected.stamp.implementationVersion
        || observation.headers.deploymentStamp !== inspected.stamp.deploymentStamp) {
        throw new Error('STAMP_HEADER_MISMATCH - exact server-owned header/body labels differ.');
      }
      observation.verified = true;
      observation.implementation = inspected.implementation;
      observation.apiContract = inspected.apiContract;
      observation.stamp = inspected.stamp;
      result.textContent = JSON.stringify(body, null, 2);
      evidence.textContent = JSON.stringify(observation, null, 2);
      identity.textContent = `Observed synthetic profile: ${inspected.profileId} (not authenticated).`;
      status.textContent = 'OBSERVED LOCAL - actual fixed-provider HTTP body and labels match unchanged C020 getProfile/1. Not a live Azure result.';
    } catch (cause) {
      if (attempt !== generation) return;
      observation.errorCode = cause.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'LOCAL_RESPONSE_UNAVAILABLE';
      evidence.textContent = JSON.stringify(observation, null, 2);
      fail(`${observation.errorCode} - no successful HTTP profile observation.`);
    } finally {
      clearTimeout(timer);
      if (attempt === generation) {
        active = null;
        profile.disabled = false;
        submit.disabled = !scope;
      }
    }
  });

  try {
    if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || !location.port) {
      throw new Error('Static/nonserver execution has no actual owned local HTTP destination.');
    }
    if (!globalThis.C020Contract || !globalThis.C020Inspector) throw new Error('Immutable C020 inspection dependencies are unavailable.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let response;
    try {
      response = await fetch('/client.json', { method: 'GET', mode: 'same-origin', credentials: 'omit',
        cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (response.status !== 200 || response.url !== `${location.origin}/client.json`) throw new Error('Actual local scope response is unavailable.');
      const text = await response.text();
      if (text.length > 8192 || response.headers.get('content-type') !== 'application/json; charset=utf-8') throw new Error('Actual local scope is invalid.');
      scope = checkedScope(JSON.parse(text));
      if (response.headers.get('x-c045-client') !== scope.client
        || response.headers.get('x-c045-scope') !== 'synthetic-local-readonly') throw new Error('Actual local scope labels are incoherent.');
    } finally { clearTimeout(timer); }
    for (const entry of globalThis.C020Contract.profiles) {
      const option = document.createElement('option');
      option.value = entry.id;
      document.getElementById('synthetic-profiles').append(option);
    }
    document.title = `C045 ${scope.label} synthetic isolated client`;
    document.getElementById('client-label').textContent = `${scope.label} client - synthetic local lane`;
    document.getElementById('scope-status').textContent = `Actual local scope response: ${scope.runtime}; production Node 24 unverified; listener lifetime ${scope.ttlMs} ms.`;
    document.getElementById('destination').textContent = `Actual owned origin announced by this server: ${scope.origin}${scope.fixturePath} (not a health guarantee or Azure destination).`;
    document.documentElement.dataset.scope = 'local-ready';
    clearObservation('NOT RUN - select an explicit synthetic profile; no HTTP profile observation.');
  } catch {
    scope = null;
    document.documentElement.dataset.scope = 'unknown';
    document.getElementById('scope-status').textContent = 'UNKNOWN - no valid actual owned local scope response.';
    document.getElementById('destination').textContent = 'UNKNOWN - no actual owned server destination observed.';
    clearObservation('UNKNOWN - static/nonserver or unavailable local scope; no HTTP profile observation.');
  }
}());
