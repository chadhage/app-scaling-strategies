(function (root) {
  'use strict';

  const LIMITS = Object.freeze({ runs: 12, journeys: 12, artifactBytes: 256 });
  const KINDS = Object.freeze(['upload', 'workflow', 'generated']);
  const STORES = Object.freeze(['durable', 'local']);
  const OBSERVATIONS = Object.freeze(['intact', 'empty-200', 'corrupt', 'missing-checkpoint', 'unavailable']);
  const DEFAULTS = Object.freeze({ kind: 'upload', storage: 'durable', observation: 'intact' });

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  const copy = (value) => freeze(JSON.parse(JSON.stringify(value)));
  const FIXTURES = freeze({
    upload: {
      bytes: 'S039 synthetic upload\npart=1\ncontent=DEMO-UPLOAD\n',
      checkpoint: { workflowId: 'synthetic-workflow-039', step: 2, status: 'awaiting-review' },
    },
    workflow: {
      bytes: '{"workflowId":"synthetic-workflow-039","step":3,"status":"awaiting-review"}',
      checkpoint: { workflowId: 'synthetic-workflow-039', step: 3, status: 'awaiting-review' },
    },
    generated: {
      bytes: 'S039 DEMO EXPORT\nsku,quantity\nDEMO-PEN,2\n',
      checkpoint: { workflowId: 'synthetic-workflow-039', step: 4, status: 'ready-for-download' },
    },
  });

  // Fixed fixtures are ASCII; this teaching checksum is not a cryptographic digest.
  function checksum(bytes) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < bytes.length; index += 1) {
      hash = Math.imul(hash ^ bytes.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
  function describe(artifact) {
    return {
      bytes: artifact.bytes, byteLength: artifact.bytes.length,
      checksum: checksum(artifact.bytes), checkpoint: artifact.checkpoint,
    };
  }
  function configuration(input) {
    if (!input || typeof input !== 'object'
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
      throw new TypeError('Configuration must be a plain record.');
    }
    const keys = Reflect.ownKeys(input);
    const names = ['kind', 'storage', 'observation'];
    if (keys.length !== names.length || keys.some((key) => !names.includes(key))) {
      throw new TypeError('Configuration requires exactly kind, storage and observation.');
    }
    const allowed = { kind: KINDS, storage: STORES, observation: OBSERVATIONS };
    const result = {};
    for (const name of names) {
      const property = Object.getOwnPropertyDescriptor(input, name);
      if (!property || !Object.hasOwn(property, 'value')
          || typeof property.value !== 'string' || !allowed[name].includes(property.value)) {
        throw new TypeError(`Unsupported ${name}; choose a listed synthetic value.`);
      }
      result[name] = property.value;
    }
    return freeze(result);
  }
  function noArguments(args) {
    if (args.length !== 0) throw new TypeError('This command accepts no arguments.');
  }

  function createLesson() {
    noArguments(arguments);
    let run = 1;
    let phase = 'idle';
    let owner = 'A';
    let config = null;
    let expected = null;
    let stores = { A: null, B: null, shared: null };
    let trace = [];
    let result = null;
    const history = [];

    function snapshot() {
      noArguments(arguments);
      const totals = { attempted: history.length, successful: 0, failed: 0, unknown: 0 };
      for (const entry of history) {
        totals.successful += entry.successful;
        totals.failed += entry.failed;
        totals.unknown += entry.unknown;
      }
      return copy({
        run, phase, owner, config, expected, result, trace, history, totals, limits: LIMITS,
        canPrepare: phase === 'idle' && history.length < LIMITS.journeys,
        canHandoff: phase === 'prepared', canVerify: phase === 'transferred',
        canReset: run < LIMITS.runs,
      });
    }
    function requirePhase(required) {
      if (phase !== required) throw new Error(`Command requires ${required}; current phase is ${phase}.`);
    }
    function prepare(input) {
      if (arguments.length !== 1) throw new TypeError('Prepare requires exactly one configuration record.');
      const next = configuration(input);
      requirePhase('idle');
      if (history.length >= LIMITS.journeys) throw new Error('The 12-journey page budget is exhausted.');
      const artifact = FIXTURES[next.kind];
      config = next;
      expected = copy(describe(artifact));
      stores = next.storage === 'durable'
        ? { A: null, B: null, shared: artifact }
        : { A: artifact, B: null, shared: null };
      owner = 'A';
      phase = 'prepared';
      trace = [{
        step: 'prepare', owner, detail: next.storage === 'durable'
          ? 'Required bytes and checkpoint reside in the simulated shared store, outside either worker.'
          : 'Required bytes and checkpoint reside only in owner A memory; B starts empty.',
      }];
      return snapshot();
    }
    function handoff() {
      noArguments(arguments);
      requirePhase('prepared');
      owner = 'B';
      phase = 'transferred';
      trace.push({
        step: 'handoff', owner,
        detail: 'Ownership moved A → B. No artifact was copied by the routing change; A is no longer the serving owner.',
      });
      return snapshot();
    }
    function verify() {
      noArguments(arguments);
      requirePhase('transferred');
      if (history.length >= LIMITS.journeys) throw new Error('The 12-journey page budget is exhausted.');
      let observed = null;
      let responseStatus = null;
      const checks = [];
      let verdict;
      let reason;
      if (config.observation === 'unavailable') {
        verdict = 'unknown';
        reason = 'No retrieval observation was supplied. Neither persistence nor loss has been observed.';
        for (const id of ['byteLength', 'bytes', 'checksum', 'checkpoint']) {
          checks.push({ id, status: 'unknown' });
        }
      } else {
        let artifact = config.storage === 'durable' ? stores.shared : stores.B;
        if (!artifact || config.observation === 'empty-200') artifact = { bytes: '', checkpoint: null };
        else if (config.observation === 'corrupt') {
          artifact = { bytes: `X${artifact.bytes.slice(1)}`, checkpoint: artifact.checkpoint };
        } else if (config.observation === 'missing-checkpoint') {
          artifact = { bytes: artifact.bytes, checkpoint: null };
        }
        observed = describe(artifact);
        responseStatus = 200;
        for (const id of ['byteLength', 'bytes', 'checksum', 'checkpoint']) {
          checks.push({
            id, status: JSON.stringify(observed[id]) === JSON.stringify(expected[id]) ? 'passed' : 'failed',
          });
        }
        verdict = checks.every((check) => check.status === 'passed') ? 'success' : 'failure';
        if (verdict === 'success') {
          reason = 'B retrieved every required byte and the exact workflow checkpoint from the simulated shared store.';
        } else if (config.storage === 'local') {
          reason = 'Required state remained on A. Empty B returned an HTTP-like 200 but zero bytes and no checkpoint: observed local-state loss.';
        } else if (config.observation === 'empty-200') {
          reason = 'HTTP-like 200 hid an empty body and missing checkpoint. Status alone cannot establish artifact continuity.';
        } else if (config.observation === 'missing-checkpoint') {
          reason = 'Artifact bytes survived but the required workflow checkpoint did not. Bytes alone cannot complete this journey.';
        } else {
          reason = 'The returned body has the expected length but altered bytes. The exact-byte and checksum checks expose corruption.';
        }
      }
      trace.push({
        step: 'verify', owner,
        detail: responseStatus === null ? 'Retrieval unobserved; outcome remains unknown.'
          : `HTTP-like ${responseStatus}; ${observed.byteLength}/${expected.byteLength} bytes; ${verdict}.`,
      });
      result = copy({
        run, config, owner, from: 'A', verdict, attempted: 1,
        successful: verdict === 'success' ? 1 : 0,
        failed: verdict === 'failure' ? 1 : 0,
        unknown: verdict === 'unknown' ? 1 : 0,
        responseStatus, expected, observed, checks, reason,
        impact: verdict === 'success' ? 'synthetic-uninterrupted-transition'
          : verdict === 'failure' ? 'synthetic-interrupted-transition' : 'unverified',
        cleanup: 'No external resources; in-memory observations retained for this page lifetime.',
        trace,
      });
      history.push(result);
      phase = 'verified';
      return copy(result);
    }
    function reset() {
      noArguments(arguments);
      if (run >= LIMITS.runs) throw new Error('The 12-run page budget is exhausted; retained history is unchanged.');
      run += 1;
      phase = 'idle';
      owner = 'A';
      config = null;
      expected = null;
      stores = { A: null, B: null, shared: null };
      trace = [];
      result = null;
      return snapshot();
    }
    return Object.freeze({ prepare, handoff, verify, reset, snapshot });
  }
  const api = Object.freeze({ createLesson, LIMITS, KINDS, STORES, OBSERVATIONS, DEFAULTS });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArtifactHandoff = api;
}(typeof globalThis === 'object' ? globalThis : this));
