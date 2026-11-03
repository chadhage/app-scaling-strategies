(function () {
  'use strict';

  const element = (id) => document.getElementById(id);
  const inspector = globalThis.C020Inspector;
  let ready = false;
  let busy = false;

  function clearObservations() {
    element('compatibility').textContent = 'No verified compatibility result.';
    element('stamps').textContent = 'No observed stamps.';
    element('v1').textContent = 'No observation.';
    element('v2').textContent = 'No observation.';
    element('candidate').value = '';
    element('candidate-status').textContent = 'No candidate checked.';
  }

  function controls() {
    element('inspect').disabled = !ready || busy;
    element('validate').disabled = !ready || busy;
    element('profile-id').disabled = busy;
    element('candidate-implementation').disabled = busy;
    element('candidate').disabled = busy;
  }

  async function getJson(url) {
    const response = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' });
    let value;
    try { value = await response.json(); } catch { throw new Error('INVALID_JSON: the local response is not JSON.'); }
    if (!response.ok) throw new Error(`${value.error?.code || 'HTTP_ERROR'}: HTTP ${response.status}`);
    return value;
  }

  element('inspect-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    busy = true;
    controls();
    clearObservations();
    element('status').textContent = 'Pending — observing both actual local responses.';
    const id = element('profile-id').value;
    try {
      const query = new URLSearchParams({ profileId: id });
      const attempts = await Promise.allSettled(['v1', 'v2'].map((version) => getJson(`/fixtures/${version}/getProfile?${query}`)));
      const failed = attempts.flatMap((attempt, index) => attempt.status === 'rejected' ? [`v${index + 1}: ${attempt.reason.message}`] : []);
      if (failed.length) throw new Error(failed.join('; '));
      const [v1, v2] = attempts.map((attempt) => attempt.value);
      const result = inspector.compare(v1, v2, id);
      element('compatibility').textContent = JSON.stringify({ compatible: result.compatible, apiContract: result.apiContract, oldConsumer: result.oldConsumer }, null, 2);
      element('stamps').textContent = JSON.stringify(result.observations.map((observation) => observation.stamp), null, 2);
      element('v1').textContent = JSON.stringify(v1, null, 2);
      element('v2').textContent = JSON.stringify(v2, null, 2);
      element('candidate').value = JSON.stringify(v2, null, 2);
      element('candidate-implementation').value = 'v2';
      element('status').textContent = 'VERIFIED LOCAL — both implementations preserve getProfile/1 and unchanged old-consumer semantics.';
    } catch (error) {
      clearObservations();
      element('status').textContent = `UNVERIFIED — ${error.code || 'OBSERVATION_FAILED'}: ${error.message}`;
    } finally {
      busy = false;
      controls();
      element('inspect').focus();
    }
  });

  element('candidate-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    element('candidate-status').textContent = 'No candidate checked.';
    try {
      const result = inspector.parseCandidate(element('candidate').value, element('candidate-implementation').value, element('profile-id').value);
      element('candidate-status').textContent = `VALID LOCAL CANDIDATE — ${result.implementation}, ${result.apiContract}; not a new HTTP observation.`;
    } catch (error) {
      element('candidate-status').textContent = `REJECTED — ${error.code || 'INVALID_DATA'}: ${error.message}`;
    }
  });

  if (!inspector) {
    element('status').textContent = 'UNVERIFIED — local inspector dependency unavailable.';
    return;
  }
  getJson('/scope.json').then((scope) => {
    if (scope.cardId !== 'C020' || scope.businessData !== 'synthetic' || scope.transport !== '127.0.0.1 HTTP only' ||
        scope.identityVerified !== false || scope.nativeTargetQualified !== false ||
        scope.productionRuntimeValidated !== false || scope.controlApiImplemented !== false ||
        scope.durableStoreImplemented !== false || scope.liveAzureRuns !== 0 || scope.authorizedCloudSpend !== 0 ||
        typeof scope.testRuntime !== 'string') throw new Error('Local-only tooling scope is missing or inconsistent.');
    element('runtime').textContent = `Observed test tooling: ${scope.testRuntime}. Not Node24/Express production validation.`;
    ready = true;
    controls();
  }).catch((error) => {
    clearObservations();
    element('status').textContent = `UNVERIFIED — scope unavailable: ${error.message}`;
    controls();
  });
}());
