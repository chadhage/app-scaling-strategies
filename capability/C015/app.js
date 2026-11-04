(function () {
  'use strict';
  const run = document.getElementById('run-id');
  const scope = document.getElementById('scope');
  const inspect = document.getElementById('inspect');
  const reset = document.getElementById('reset');
  const status = document.getElementById('status');
  const receipt = document.getElementById('receipt');
  const snapshot = globalThis.C015ObservedSnapshot;

  function clear(message) {
    receipt.textContent = 'No observation selected.';
    status.dataset.outcome = 'cleared';
    status.textContent = message;
  }

  function reject(code, message) {
    receipt.textContent = 'No observation returned. No filesystem or cloud operation occurred.';
    status.dataset.outcome = 'rejected';
    status.textContent = `REJECTED ${code}: ${message}`;
  }

  inspect.addEventListener('click', () => {
    if (!snapshot || snapshot.source !== 'captured-actual-filesystem-fresh-process') {
      reject('EVIDENCE_MISSING', 'Actual captured evidence is unavailable; no prediction or default replaces it.');
      return;
    }
    if (scope.value !== 'local-snapshot') {
      reject(scope.value === 'azure' ? 'LOCAL_ONLY' : 'UNKNOWN_SCOPE',
        'Only read-only bundled local evidence inspection is supported. Azure and production execution are forbidden.');
      return;
    }
    const observed = snapshot.runs.find((entry) => entry.runId === run.value);
    if (!observed) {
      reject('UNKNOWN_RUN_ID', 'Only the two closed synthetic run IDs have captured observations.');
      return;
    }
    status.dataset.outcome = 'observed-snapshot';
    status.textContent = `BUNDLED OBSERVATION: ${observed.runId} epoch ${observed.result.state.epoch}; actual writer PIDs ${observed.writerPids.join(', ')} exited; fresh reader PID ${observed.readerPid} restored the exact state. This click is not a new disk read or restart.`;
    receipt.textContent = JSON.stringify({
      evidence: snapshot.evidenceFile, capturedAtUtc: snapshot.capturedAtUtc,
      browserOperation: 'read-only-bundled-observation', actualFilesystemOperationNow: false,
      state: observed.result.state, acknowledgment: observed.result.acknowledgment,
      stateSha256: observed.result.stateSha256, history: observed.result.history,
      writerPids: observed.writerPids, readerPid: observed.readerPid,
      directoryDurability: 'not-guaranteed', powerLossGuarantee: false,
    }, null, 2);
  });
  reset.addEventListener('click', () => {
    run.value = 'synthetic-run-001';
    scope.value = 'local-snapshot';
    clear('Display cleared only. Files and historical evidence remain unchanged.');
    run.focus();
  });
  for (const control of [run, scope]) {
    control.addEventListener('change', () => clear('Selection changed. Inspect again; no stale observation is retained.'));
  }
  if (snapshot && snapshot.source === 'captured-actual-filesystem-fresh-process' &&
      Array.isArray(snapshot.runs) && snapshot.runs.length === 2) {
    inspect.disabled = false;
    clear('Ready for read-only bundled evidence inspection. No live consent or disk state is inferred.');
  } else {
    reject('EVIDENCE_MISSING', 'A captured actual-filesystem observation is required. The control remains disabled.');
  }
}());
