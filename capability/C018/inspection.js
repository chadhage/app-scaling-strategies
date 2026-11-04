(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C018Inspection', { value: factory() });
}(globalThis, function () {
  'use strict';

  const ids = Object.freeze(['synthetic-run-001', 'synthetic-run-002']);
  const steps = Object.freeze(['prepare', 'advance', 'finish']);
  const maximumJournalEntries = 64;

  function invalid(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function exactId(runId) {
    if (typeof runId !== 'string' || !ids.includes(runId)) {
      throw invalid('UNKNOWN_RUN_ID', 'Only exact synthetic-run-001 and synthetic-run-002 are supported; no default run.');
    }
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function checkObservation(receipt, runId) {
    exactId(runId);
    const state = receipt?.state;
    const record = state?.record;
    const ack = receipt?.acknowledgment;
    const history = receipt?.history;
    const epoch = state?.epoch;
    if (receipt?.schemaVersion !== 1 || receipt.mode !== 'actual-local-filesystem' ||
        receipt.restored !== true || receipt.writesPerformed !== 0 ||
        receipt.source !== 'read-and-verified-immutable-files' ||
        receipt.directoryDurability !== 'not-guaranteed' || receipt.powerLossGuarantee !== false ||
        !Number.isSafeInteger(receipt.pid) || receipt.pid < 1 ||
        typeof receipt.namespace !== 'string' || !receipt.namespace ||
        state?.schemaVersion !== 1 || state.cardId !== 'C015' || state.dataKind !== 'closed-synthetic-fixture' ||
        state.runId !== runId || !Number.isSafeInteger(epoch) || epoch < 1 || epoch > 3 ||
        !record || !['prepared', 'running', 'completed'].includes(record.status) ||
        record.completedStep !== steps[epoch - 1] ||
        record.pendingStep !== (epoch === 3 ? 'none' : steps[epoch]) ||
        record.acknowledgedUnits !== epoch ||
        (record.status === 'prepared') !== (epoch === 1) ||
        (record.status === 'running') !== (epoch === 2) ||
        (record.status === 'completed') !== (epoch === 3) ||
        !/^[0-9a-f]{64}$/.test(receipt.stateSha256) ||
        ack?.schemaVersion !== 1 || ack.kind !== 'local-file-write-receipt' ||
        ack.runId !== runId || ack.epoch !== epoch || ack.stateSha256 !== receipt.stateSha256 ||
        ack.regularFileFlushed !== true || ack.published !== true ||
        !Array.isArray(history) || history.length !== epoch ||
        history.some((entry, index) => entry?.epoch !== index + 1 || !/^[0-9a-f]{64}$/.test(entry.stateSha256)) ||
        history.at(-1)?.stateSha256 !== receipt.stateSha256) {
      throw invalid('INVALID_OBSERVATION', 'Missing, wrong-version, wrong-ID, unordered or contradictory read receipt; progress remains unknown.');
    }
    return freeze(receipt);
  }

  function createInspector(read, onChange = () => {}) {
    if (typeof read !== 'function' || typeof onChange !== 'function') throw new TypeError('An explicit read function is required.');
    let status = 'UNKNOWN';
    let message = 'UNKNOWN: No run has been read.';
    let selectedRunId = null;
    let current = null;
    let serial = 0;
    const journal = [];

    function snapshot() {
      return freeze({ status, message, selectedRunId, current, journal: [...journal],
        blocked: journal.length >= maximumJournalEntries });
    }

    function emit() {
      const view = snapshot();
      onChange(view);
      return view;
    }

    function retain(entry) {
      if (journal.length < maximumJournalEntries) journal.push(freeze(entry));
    }

    function unknown(code, text, outcome = 'unknown', runId = selectedRunId) {
      current = null;
      status = outcome === 'hold' ? 'HOLD' : 'UNKNOWN';
      message = `${status}: ${code} — ${text}`;
      retain({ runId: typeof runId === 'string' ? runId : null, outcome, code,
        message: text, pid: null, epoch: null });
      return emit();
    }

    async function lookup(runId) {
      const request = ++serial;
      selectedRunId = typeof runId === 'string' ? runId : null;
      current = null;
      if (journal.length >= maximumJournalEntries - 1) {
        return unknown('INSPECTION_LIMIT', 'This client journal is full; earlier observations are retained, never evicted. Open a fresh client for further reads.');
      }
      status = 'READING';
      message = 'READING: A new actual process is inspecting C015 files; previous success is not current.';
      emit();
      try {
        exactId(runId);
        const receipt = await read(runId);
        if (request !== serial) {
          retain({ runId, outcome: 'unknown', code: 'READ_SUPERSEDED',
            message: 'A completed read no longer matches the current selection; it was not displayed as current.', pid: null, epoch: null });
          return emit();
        }
        current = checkObservation(receipt, runId);
        status = 'OBSERVED';
        message = 'OBSERVED: Actual fresh-process disk snapshot. No streamed or future progress is inferred.';
        retain({ runId, outcome: 'observed', code: 'C015_RESTORED',
          message: 'C015 verified immutable files; this inspection performed zero writes.',
          pid: current.pid, epoch: current.state.epoch });
        return emit();
      } catch (error) {
        if (request !== serial) {
          retain({ runId: typeof runId === 'string' ? runId : null, outcome: 'unknown',
            code: error.code || 'READ_SUPERSEDED', message: error.message || 'Superseded reader failure remains unknown.',
            pid: null, epoch: null });
          return emit();
        }
        return unknown(error.code || 'READER_UNAVAILABLE', error.message || 'Read failed; no stored progress was observed.',
          error.code === 'HOLD_UNOBSERVED' ? 'hold' : 'unknown');
      }
    }

    function edit(runId) {
      ++serial;
      selectedRunId = typeof runId === 'string' ? runId : null;
      current = null;
      status = 'UNKNOWN';
      message = 'UNKNOWN: Selection changed; explicitly reopen this exact ID.';
      return emit();
    }

    function disconnect() {
      ++serial;
      return unknown('CONNECTION_UNKNOWN', 'Connection was lost; a previous snapshot is not current. Reconnect must reread the same selected ID.');
    }

    function resetDisplay() {
      ++serial;
      selectedRunId = null;
      return unknown('DISPLAY_CLEARED', 'Only current presentation was cleared. Earlier inspection failures and unknowns remain below; disk was not reset.');
    }

    return Object.freeze({ snapshot, lookup, reconnect: () => lookup(selectedRunId), edit, disconnect, resetDisplay });
  }

  return Object.freeze({ createInspector, checkObservation, maximumJournalEntries });
}));
