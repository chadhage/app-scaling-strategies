(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const json = (value) => JSON.stringify(value, null, 2);
  const fixture = globalThis.C024Upload;
  let handle = null;
  let generation = 0;
  let busy = false;

  function clearCompletion() {
    byId('final-hash').textContent = 'Not computed';
    byId('completed-bytes').textContent = '0';
    byId('byte-preview').textContent = 'No completed content';
    byId('receipt').textContent = 'No completed receipt.';
  }
  function clearError() {
    byId('error').textContent = '';
    byId('error').hidden = true;
  }
  function history(text) {
    const item = document.createElement('li');
    item.textContent = text;
    byId('history').append(item);
    while (byId('history').children.length > 30) byId('history').firstElementChild.remove();
  }
  function render() {
    const view = handle ? fixture.inspectUpload(handle) : null;
    const status = view?.status;
    const terminal = status === 'complete';
    byId('start').disabled = Boolean(handle);
    byId('fixture-id').disabled = Boolean(handle);
    byId('reset').disabled = !handle;
    byId('conduct').disabled = !handle || busy || terminal;
    byId('completion-controls').disabled = !handle || busy || terminal || status === 'paused';
    for (const id of ['accept', 'conflict', 'pause']) byId(id).disabled = status !== 'active' || busy;
    byId('resume').disabled = status !== 'paused' || busy;
    byId('part-id').disabled = status !== 'active' || busy;
    byId('memory-state').textContent = status || 'Not started';
    byId('accepted-bytes').textContent = `${view?.acceptedBytes || 0} / 256`;
    byId('missing-ids').textContent = view ? (view.missingPartIds.join(', ') || 'None') : 'No upload started';
    byId('arrival-order').textContent = view?.arrivalOrder.join(', ') || 'None';
    byId('accepted-ids').replaceChildren();
    for (const id of view?.acceptedPartIds.length ? view.acceptedPartIds : ['None']) {
      const item = document.createElement('li');
      item.textContent = id === 'None' ? id : `${id} · 64 actual synthetic bytes`;
      byId('accepted-ids').append(item);
    }
    byId('resume-observation').textContent = view?.lastResume
      ? json(view.lastResume) : 'No same-memory resume observed.';
  }
  function failed(error) {
    clearCompletion();
    byId('error').hidden = false;
    byId('error').textContent = `${error.code || 'LOCAL_FIXTURE_ERROR'} — ${error.message}`;
    byId('status').textContent = `REJECTED — ${error.code || 'LOCAL_FIXTURE_ERROR'}; no successful completion.`;
    history(byId('error').textContent);
  }
  function conduct(action, label) {
    clearError();
    clearCompletion();
    try {
      const observation = action();
      byId('observation').textContent = json(observation);
      byId('status').textContent = `${label} — inspect the actual accepted IDs and byte count below.`;
      history(label);
    } catch (error) {
      failed(error);
    }
    render();
  }
  function reset() {
    generation++;
    handle = null;
    busy = false;
    clearError();
    clearCompletion();
    byId('completion-order').value = fixture.manifest.partIds.join(', ');
    byId('expected-hash').value = fixture.manifest.expectedSha256;
    byId('part-id').value = fixture.manifest.partIds[0];
    byId('observation').textContent = 'No accepted-part observation.';
    byId('history').replaceChildren();
    byId('status').textContent = 'Reset — memory discarded; no durable recovery or successful observation.';
    render();
  }
  function selectedPart(conflicting) {
    const id = byId('part-id').value;
    const bytes = fixture.partBytes(id);
    if (conflicting) bytes[0] ^= 1;
    return fixture.acceptPart(handle, id, bytes);
  }
  async function complete() {
    const epoch = generation;
    const target = handle;
    clearError();
    clearCompletion();
    busy = true;
    byId('status').textContent = 'Hashing the actual 256 accepted synthetic bytes…';
    try {
      const pending = fixture.completeUpload(target, {
        partIds: byId('completion-order').value.split(',').map((id) => id.trim()),
        expectedSha256: byId('expected-hash').value
      });
      render();
      const receipt = await pending;
      // Reset may discard this fixture while its actual Web Crypto promise is outstanding.
      if (generation !== epoch || handle !== target) return;
      const bytes = fixture.readCompletedBytes(target);
      const hex = (values) => Array.from(values, (byte) => byte.toString(16).padStart(2, '0')).join('');
      byId('receipt').textContent = json(receipt);
      byId('final-hash').textContent = receipt.actualSha256;
      byId('completed-bytes').textContent = String(bytes.length);
      byId('byte-preview').textContent = `${hex(bytes.slice(0, 16))} … ${hex(bytes.slice(-16))}`;
      byId('status').textContent = 'VERIFIED LOCAL SYNTHETIC CONTENT — actual SHA-256 matches; not a network or durable upload.';
      history(`Verified actual ${bytes.length}-byte content with accepted IDs ${receipt.orderedPartIds.join(', ')}.`);
    } catch (error) {
      if (generation === epoch && handle === target) failed(error);
    } finally {
      if (generation === epoch && handle === target) {
        busy = false;
        render();
      }
    }
  }
  try {
    if (!fixture || !globalThis.C020Contract) throw new Error('Required unchanged C020 metadata or C024 fixture did not load.');
    byId('fixture-version').textContent = `${fixture.manifest.fixtureId} · ${fixture.manifest.fixtureVersion} · ${fixture.manifest.deploymentStamp}`;
    byId('source-version').textContent = `${fixture.manifest.profileId} · ${fixture.manifest.source.apiContract} · ${fixture.manifest.source.stamp.implementationVersion} · ${fixture.manifest.source.stamp.deploymentStamp} (local label, not a deployment)`;
    byId('pinned-hash').textContent = fixture.manifest.expectedSha256;
    byId('completion-order').value = fixture.manifest.partIds.join(', ');
    byId('expected-hash').value = fixture.manifest.expectedSha256;
    byId('start').addEventListener('click', () => conduct(() => {
      handle = fixture.createUpload({ fixtureId: byId('fixture-id').value });
      generation++;
      return fixture.inspectUpload(handle);
    }, 'Started named synthetic fixture'));
    byId('accept').addEventListener('click', () => conduct(() => selectedPart(false), 'Observed synthetic part acceptance or identical duplicate'));
    byId('conflict').addEventListener('click', () => conduct(() => selectedPart(true), 'Conflict probe'));
    byId('pause').addEventListener('click', () => conduct(() => fixture.pauseUpload(handle), 'Paused same-memory fixture'));
    byId('resume').addEventListener('click', () => conduct(() => fixture.resumeUpload(handle), 'Resumed same retained memory object'));
    byId('reset').addEventListener('click', reset);
    byId('complete').addEventListener('click', complete);
    for (const id of ['completion-order', 'expected-hash']) {
      byId(id).addEventListener('input', () => {
        clearError();
        clearCompletion();
        byId('status').textContent = 'Verification input changed — no current successful completion observation.';
      });
    }
    render();
  } catch (error) {
    byId('status').textContent = 'UNAVAILABLE — required local fixture initialization failed.';
    byId('error').hidden = false;
    byId('error').textContent = error.message;
  }
}());
