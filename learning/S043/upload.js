(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultipartLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const PARTS = Object.freeze([1, 2, 3, 4].map((id) => `S043-part-${id}\n`));
  const ARTIFACT = Object.freeze({
    parts: 4, partBytes: 12, bytes: 48,
    sha256: '43a0f160cf05a5f0be77de503bc019c24f94a325b0ed84e4b7e60d788fd189e0',
  });
  const LIMITS = Object.freeze({ runs: 12, commands: 96, trace: 20, staleProbes: 4 });
  const DEFAULTS = Object.freeze({
    storage: 'shared', resumePolicy: 'reconcile', listing: 'available',
    payload: 'intact', continuationMs: 400, budgetMs: 1000,
  });
  const OPTIONS = Object.freeze({
    storage: ['shared', 'instance-local'],
    resumePolicy: ['reconcile', 'restart'],
    listing: ['available', 'unavailable'],
    payload: ['intact', 'corrupt'],
  });
  const STATES = Object.freeze({
    start: ['idle'], pause: ['uploading'], transfer: ['paused'],
    resume: ['transferred'], verify: ['resumed'],
    'probe-stale': ['transferred', 'resumed'],
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ ...DEFAULTS });

  function validateConfig(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.getPrototypeOf(input) !== Object.prototype
        || Object.keys(input).length !== Object.keys(DEFAULTS).length
        || Object.keys(DEFAULTS).some((key) => !Object.hasOwn(input, key))) {
      return 'Configuration must contain exactly the six declared controls.';
    }
    for (const [key, values] of Object.entries(OPTIONS)) {
      if (!values.includes(input[key])) return `Unsupported ${key} option.`;
    }
    if (!Number.isInteger(input.continuationMs) || input.continuationMs < 0
        || input.continuationMs > 10000) {
      return 'Continuation must be an integer from 0 to 10000 ms.';
    }
    if (!Number.isInteger(input.budgetMs) || input.budgetMs < 100 || input.budgetMs > 10000) {
      return 'Original budget must be an integer from 100 to 10000 ms.';
    }
    return null;
  }

  async function digest(text) {
    const bytes = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function createSession() {
    let phase = 'idle';
    let runCount = 0;
    let commandCount = 0;
    let current = null;
    let busy = false;
    const history = [];

    function view() {
      return clone({
        phase, runCount, commandCount, limits: LIMITS,
        current: current ? {
          runId: current.runId, uploadId: current.uploadId,
          owner: current.owner, epoch: current.epoch, config: current.config,
          elapsedMs: current.elapsedMs, preservedParts: current.preservedParts,
          acceptedPartIds: current.epoch === 2 && !current.listingObserved
            && current.config.listing === 'unavailable'
            ? null : Object.keys(current.accepted).map(Number),
          transmittedPartIds: current.transmittedPartIds,
          duplicateUploads: current.duplicateUploads, staleRejections: current.staleRejections,
          trace: current.trace, result: current.result,
        } : null,
        history,
      });
    }

    function response(ok, error, message) {
      return { ok, ...(error ? { error } : {}), ...(message ? { message } : {}), view: view() };
    }

    function trace(event, atMs = current.elapsedMs) {
      if (current.trace.length >= LIMITS.trace) throw new Error('Internal trace bound exceeded');
      current.trace.push({ atMs, event });
    }

    function accept(owner, epoch, id, bytes) {
      if (owner !== current.owner || epoch !== current.epoch) return false;
      if (current.seen.has(id)) current.duplicateUploads++;
      current.seen.add(id);
      current.transmittedPartIds.push(id);
      current.accepted[id] = bytes;
      return true;
    }

    function finish({ bytesObserved = false, actualHash = null, reason = null } = {}) {
      const failures = [];
      const unknowns = [];
      const ids = Object.keys(current.accepted).map(Number);
      const finalText = ids.sort((a, b) => a - b).map((id) => current.accepted[id]).join('');
      if (current.preservedParts !== null && current.preservedParts < 2) {
        failures.push(`${2 - current.preservedParts} previously accepted parts were lost at ownership transfer.`);
      }
      if (current.duplicateUploads > 0) failures.push(`${current.duplicateUploads} duplicate part uploads.`);
      if (current.elapsedMs > current.config.budgetMs) {
        failures.push(`Original elapsed ${current.elapsedMs} ms exceeds budget ${current.config.budgetMs} ms.`);
      }
      if (!current.listingObserved) unknowns.push('Candidate accepted-parts listing was not verified.');
      if (bytesObserved) {
        if (ids.length !== ARTIFACT.parts || finalText.length !== ARTIFACT.bytes) {
          failures.push('Final part count or byte length does not match the original artifact.');
        }
      } else unknowns.push('Final byte count was not observed.');
      if (actualHash === null) unknowns.push('Final SHA-256 was not observed.');
      else if (actualHash !== ARTIFACT.sha256) failures.push('Final SHA-256 does not match the original artifact.');
      if (reason) unknowns.push(reason);
      const outcome = failures.length ? 'failure' : unknowns.length ? 'unknown' : 'success';
      trace(`Verifier: ${outcome}; original clock was not reset.`);
      current.result = {
        runId: current.runId, uploadId: current.uploadId, outcome,
        owner: current.owner, epoch: current.epoch, config: clone(current.config),
        acceptedBeforeTransfer: [1, 2], preservedParts: current.preservedParts,
        expectedPartCount: ARTIFACT.parts, finalPartCount: bytesObserved ? ids.length : null,
        transmittedPartIds: [...current.transmittedPartIds],
        uploadedParts: current.transmittedPartIds.length,
        duplicateUploads: current.duplicateUploads,
        transmittedBytes: current.transmittedPartIds.length * ARTIFACT.partBytes,
        expectedBytes: ARTIFACT.bytes, finalBytes: bytesObserved ? finalText.length : null,
        expectedSha256: ARTIFACT.sha256, actualSha256: actualHash,
        elapsedObservedMs: current.elapsedMs,
        completionElapsedMs: bytesObserved && actualHash !== null ? current.elapsedMs : null,
        originalBudgetMs: current.config.budgetMs,
        staleRejections: current.staleRejections, failures, unknowns, trace: clone(current.trace),
        cleanup: 'Synthetic in-memory state only; no external resource to clean up.',
      };
      phase = 'finished';
      history.push(clone(current.result));
    }

    async function dispatch(action, input) {
      if (busy) return response(false, 'Verification is running; wait before another action.');
      if (typeof action !== 'string' || (action !== 'reset' && !Object.hasOwn(STATES, action))) {
        return response(false, 'Unknown lesson action.');
      }
      if (action !== 'start' && input !== undefined) {
        return response(false, 'Only Start accepts a configuration.');
      }
      if (action === 'reset') {
        if (current && !current.result) {
          trace('Reset ended the started upload without a verified completion.');
          finish({ reason: 'Reset before final verification; this attempted upload remains recorded.' });
        }
        if (phase !== 'idle') commandCount = Math.min(LIMITS.commands, commandCount + 1);
        current = null;
        phase = 'idle';
        return response(true, null, 'Defaults restored; prior results and lifetime limits retained.');
      }
      if (!STATES[action].includes(phase)) {
        return response(false, `${action} is not allowed in ${phase}; follow Start, Pause, Transfer, Resume, Verify.`);
      }
      if (commandCount >= LIMITS.commands) return response(false, 'The 96-action page-lifetime limit is reached.');
      if (action === 'start') {
        if (runCount >= LIMITS.runs) return response(false, 'The 12-run page-lifetime limit is reached.');
        const config = input === undefined ? defaults() : input;
        const error = validateConfig(config);
        if (error) return response(false, error);
        runCount++;
        current = {
          runId: runCount, uploadId: `synthetic-upload-${String(runCount).padStart(2, '0')}`,
          owner: 'v1', epoch: 1, config: clone(config), elapsedMs: 200,
          accepted: { 1: PARTS[0], 2: PARTS[1] }, seen: new Set([1, 2]),
          transmittedPartIds: [1, 2], duplicateUploads: 0, preservedParts: null,
          listingObserved: false, staleRejections: 0, trace: [], result: null,
        };
        phase = 'uploading';
        trace('v1 epoch 1 accepted part 1: 12 bytes.', 100);
        trace('v1 epoch 1 accepted part 2: 12 bytes.', 200);
      } else if (action === 'pause') {
        phase = 'paused';
        trace('Paused after two accepted parts; original journey clock continues.');
      } else if (action === 'transfer') {
        current.elapsedMs = 300;
        current.owner = 'v2';
        current.epoch = 2;
        phase = 'transferred';
        trace('Ownership transferred to v2 epoch 2; v1 epoch 1 is fenced.');
        if (current.config.storage === 'instance-local') {
          current.accepted = {};
          current.preservedParts = 0;
          trace('Instance-local storage lost both accepted parts at transfer.');
        } else trace('Shared accepted parts await candidate reconciliation.');
      } else if (action === 'probe-stale') {
        if (current.staleRejections >= LIMITS.staleProbes) {
          return response(false, 'The four stale-writer probes for this run are exhausted.');
        }
        if (accept('v1', 1, 3, PARTS[2])) throw new Error('Stale writer unexpectedly accepted');
        current.staleRejections++;
        trace('Rejected stale v1 epoch 1 write; zero accepted-part or byte effects.');
      } else if (action === 'resume') {
        if (current.config.listing === 'unavailable') {
          trace('Accepted-parts listing unavailable; no speculative candidate upload.');
          finish({ reason: 'Resume cannot be verified without the candidate accepted-parts listing.' });
        } else {
          current.listingObserved = true;
          current.preservedParts = [1, 2].filter((id) => current.accepted[id] === PARTS[id - 1]).length;
          trace(`Candidate listing reconciled: ${current.preservedParts} of 2 prior parts preserved.`);
          const ids = [1, 2, 3, 4].filter((id) =>
            current.config.resumePolicy === 'restart' || !Object.hasOwn(current.accepted, id));
          for (const [index, id] of ids.entries()) {
            const bytes = id === 3 && current.config.payload === 'corrupt'
              ? `X${PARTS[id - 1].slice(1)}` : PARTS[id - 1];
            const atMs = 300 + Math.floor(current.config.continuationMs * (index + 1) / ids.length);
            if (!accept('v2', 2, id, bytes)) throw new Error('Current owner was rejected');
            trace(`v2 epoch 2 uploaded part ${id}: 12 bytes.`, atMs);
          }
          current.elapsedMs = 300 + current.config.continuationMs;
          phase = 'resumed';
          trace('All candidate parts assembled; final SHA-256 still requires verification.');
        }
      } else if (action === 'verify') {
        busy = true;
        try {
          const text = [1, 2, 3, 4].map((id) => current.accepted[id] || '').join('');
          let actualHash = null;
          try { actualHash = await digest(text); } catch { /* Missing hash evidence is not success. */ }
          finish({ bytesObserved: true, actualHash });
        } finally {
          busy = false;
        }
      }
      commandCount++;
      return response(true, null, action === 'probe-stale' ? 'Stale writer rejected with no upload effect.' : null);
    }

    return Object.freeze({ view, dispatch });
  }
  return Object.freeze({ createSession, defaults, ARTIFACT, LIMITS });
}));
