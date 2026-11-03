(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrpcLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    acknowledged: 3,
    continuation: 'checkpoint',
    nativeEvidence: 'grpc',
    proxyEvidence: 'complete',
    resumeDelayMs: 40,
    budgetMs: 200,
  });

  const BOUNDS = Object.freeze({ results: 8, resultMs: 10, acknowledgedMin: 1, acknowledgedMax: 6, delayMax: 1000, budgetMin: 1, budgetMax: 1000, history: 8 });
  const choices = Object.freeze({
    continuation: ['checkpoint', 'restart', 'skip', 'none'],
    nativeEvidence: ['grpc', 'ordinary-http', 'missing-trailers', 'grpc-error', 'missing'],
    proxyEvidence: ['complete', 'drop', 'duplicate', 'missing'],
  });
  const sequence = (first, last) => Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function invalid(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function validateConfig(input) {
    const keys = Object.keys(DEFAULTS);
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || keys.some((key) => !Object.prototype.hasOwnProperty.call(input, key))) {
      throw invalid('INVALID_INPUT', 'Provide exactly the six declared inputs as a plain object.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key], 'value') || !descriptors[key].enumerable)) {
      throw invalid('INVALID_INPUT', 'Inputs must be ordinary data values, not accessors.');
    }
    for (const [key, min, max] of [
      ['acknowledged', BOUNDS.acknowledgedMin, BOUNDS.acknowledgedMax],
      ['resumeDelayMs', 0, BOUNDS.delayMax],
      ['budgetMs', BOUNDS.budgetMin, BOUNDS.budgetMax],
    ]) {
      if (!Number.isSafeInteger(input[key]) || input[key] < min || input[key] > max) {
        throw invalid('INVALID_INPUT', `${key} must be an integer from ${min} to ${max}.`);
      }
    }
    for (const [key, values] of Object.entries(choices)) {
      if (!values.includes(input[key])) throw invalid('INVALID_INPUT', `Unknown ${key} choice.`);
    }
    return Object.fromEntries(keys.map((key) => [key, input[key]]));
  }

  function metrics(records) {
    if (records === null) {
      return { expected: BOUNDS.results, observed: null, deliveredOnce: null, missingCount: null, duplicateCount: null, missingSequences: null, duplicateSequences: null, orderOk: null, complete: null, unknown: BOUNDS.results };
    }
    const expected = sequence(1, BOUNDS.results);
    const counts = new Map(expected.map((id) => [id, records.filter((record) => record === id).length]));
    const missingSequences = expected.filter((id) => counts.get(id) === 0);
    const duplicateSequences = expected.filter((id) => counts.get(id) > 1);
    const duplicateCount = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    const orderOk = records.every((record, index) => index === 0 || record > records[index - 1]);
    return {
      expected: BOUNDS.results, observed: records.length,
      deliveredOnce: expected.filter((id) => counts.get(id) === 1).length,
      missingCount: missingSequences.length, duplicateCount, missingSequences, duplicateSequences, orderOk,
      complete: records.length === BOUNDS.results && missingSequences.length === 0 && duplicateCount === 0 && orderOk,
      unknown: 0,
    };
  }

  function verdict(checks) {
    for (const status of ['FAIL', 'UNSUPPORTED', 'UNKNOWN']) {
      if (checks.some((check) => check.status === status)) return status;
    }
    return 'PASS';
  }

  function createReady(history) {
    return { phase: 'ready', runId: null, config: null, resumeFrom: null, elapsedMs: 0, nativeRecords: [], proxyRecords: [], trace: [], result: null, history };
  }

  function createLesson() {
    let counter = 0;
    let state = createReady([]);

    function requirePhase(phase) {
      if (state.phase !== phase) throw invalid('INVALID_PHASE', `Action requires ${phase}; current phase is ${state.phase}.`);
    }

    function trace(action, details = {}) {
      state.trace.push({ step: state.trace.length + 1, atMs: state.elapsedMs, action, ...details });
    }

    function retain(result) {
      state.history = [...state.history, clone(result)].slice(-BOUNDS.history);
    }

    function buildResult() {
      const config = state.config;
      const missingNative = config.nativeEvidence === 'missing';
      const ordinaryHttp = config.nativeEvidence === 'ordinary-http';
      const nativeMetrics = metrics(state.nativeRecords);
      const proxyMetrics = metrics(state.proxyRecords);
      const grpcStatus = missingNative || ordinaryHttp || config.nativeEvidence === 'missing-trailers'
        ? null : config.nativeEvidence === 'grpc-error' || config.continuation === 'none' ? 14 : 0;
      const deadline = { id: 'original-deadline', status: state.elapsedMs <= config.budgetMs ? 'PASS' : 'FAIL', elapsedMs: state.elapsedMs, budgetMs: config.budgetMs };
      const nativeChecks = [
        { id: 'native-protocol', status: missingNative ? 'UNKNOWN' : ordinaryHttp ? 'UNSUPPORTED' : 'PASS', detail: missingNative ? 'No native wire receipt; proxy success cannot supply it.' : ordinaryHttp ? 'HTTP/1.1 application/json and HTTP 200 are not gRPC streaming evidence.' : 'Synthetic HTTP/2 application/grpc receipt; not a real exchange.' },
        { id: 'native-grpc-status', status: grpcStatus === null ? 'UNKNOWN' : grpcStatus === 0 ? 'PASS' : 'FAIL', httpStatus: missingNative ? null : 200, grpcStatus },
        { id: 'native-sequences', status: nativeMetrics.complete === null ? 'UNKNOWN' : nativeMetrics.complete ? 'PASS' : 'FAIL', metrics: nativeMetrics },
        { id: 'new-stream', status: config.continuation === 'none' ? 'FAIL' : missingNative ? 'UNKNOWN' : 'PASS', detail: 'Infrastructure did not preserve the original stream; continuation needs an application checkpoint and a new stream.' },
        deadline,
      ];
      const proxyChecks = [
        { id: 'proxy-sequences', status: proxyMetrics.complete === null ? 'UNKNOWN' : proxyMetrics.complete ? 'PASS' : 'FAIL', metrics: proxyMetrics },
        deadline,
      ];
      const overall = verdict([...nativeChecks, ...proxyChecks]);
      return {
        schemaVersion: 1, runId: state.runId, sourceId: 'S047', cardId: 'A-S047', packet: 'SC-S047',
        executionMode: 'synthetic', nativeProof: 'not performed', verdictScope: 'synthetic assertions only',
        configuration: clone(config), verdict: overall, elapsedMs: state.elapsedMs, budgetMs: config.budgetMs,
        impact: {
          PASS: 'Application continuation on a new stream within the synthetic original budget.',
          FAIL: 'Interrupted synthetic transition; known failures remain in this receipt.',
          UNKNOWN: 'Unverified synthetic transition; missing evidence is not a successful result.',
          UNSUPPORTED: 'Unsupported gRPC evidence; ordinary HTTP or proxy success cannot qualify the stream.',
        }[overall],
        native: {
          verdict: verdict(nativeChecks), transport: missingNative ? null : ordinaryHttp ? 'HTTP/1.1' : 'HTTP/2',
          contentType: missingNative ? null : ordinaryHttp ? 'application/json' : 'application/grpc',
          httpStatus: missingNative ? null : 200, grpcStatus,
          resumeFrom: state.resumeFrom,
          streamIds: missingNative ? null : [`synthetic-native-v1-${state.runId}`, ...(config.continuation === 'none' ? [] : [`synthetic-native-v2-${state.runId}`])],
          originalStreamSurvived: missingNative ? null : false,
          records: clone(state.nativeRecords), metrics: nativeMetrics,
        },
        proxy: {
          verdict: verdict(proxyChecks), transport: 'browser-proxy fixture, not native gRPC',
          httpStatus: config.proxyEvidence === 'missing' ? null : 200, records: clone(state.proxyRecords), metrics: proxyMetrics,
        },
        checks: [...nativeChecks, proxyChecks[0]],
        trace: clone(state.trace), cleanupStatus: 'No resources allocated; page-memory attempt only.',
      };
    }

    return Object.freeze({
      snapshot() { return freeze(clone(state)); },
      start(config) {
        requirePhase('ready');
        const validated = validateConfig(config);
        counter += 1;
        state = { ...createReady(state.history), phase: 'streaming', runId: counter, config: validated, elapsedMs: validated.acknowledged * BOUNDS.resultMs };
        const prefix = sequence(1, validated.acknowledged);
        state.nativeRecords = validated.nativeEvidence === 'missing' ? null : prefix;
        state.proxyRecords = validated.proxyEvidence === 'missing' ? null : [...prefix];
        trace('start-v1', { acknowledged: validated.acknowledged, expectedResults: BOUNDS.results });
      },
      cutover() {
        requirePhase('streaming');
        state.phase = 'cutover';
        trace('close-original-stream', { acknowledged: state.config.acknowledged, infrastructurePreservedStream: false });
      },
      resume() {
        requirePhase('cutover');
        const config = state.config;
        state.resumeFrom = {
          checkpoint: config.acknowledged + 1, restart: 1, skip: config.acknowledged + 2, none: null,
        }[config.continuation];
        const prefix = sequence(1, config.acknowledged);
        const suffix = state.resumeFrom === null ? [] : sequence(state.resumeFrom, BOUNDS.results);
        state.nativeRecords = config.nativeEvidence === 'missing' ? null : prefix.concat(suffix);
        const proxySuffix = config.proxyEvidence === 'drop' ? suffix.slice(0, -1)
          : config.proxyEvidence === 'duplicate' && suffix.length ? [suffix[0], ...suffix] : suffix;
        state.proxyRecords = config.proxyEvidence === 'missing' ? null : prefix.concat(proxySuffix);
        state.elapsedMs += config.resumeDelayMs + suffix.length * BOUNDS.resultMs;
        state.phase = 'resumed';
        trace('application-continuation', { policy: config.continuation, requestedFrom: state.resumeFrom, newEpoch: state.resumeFrom === null ? null : 'v2', resumeDelayMs: config.resumeDelayMs });
      },
      verify() {
        requirePhase('resumed');
        const result = buildResult();
        trace('check', { verdict: result.verdict });
        result.trace = clone(state.trace);
        state.phase = 'checked';
        state.result = result;
        retain(result);
        return freeze(clone(result));
      },
      reset() {
        if (!['ready', 'checked'].includes(state.phase)) {
          trace('reset-incomplete', { phase: state.phase });
          retain({
            schemaVersion: 1, runId: state.runId, sourceId: 'S047', cardId: 'A-S047', packet: 'SC-S047',
            executionMode: 'synthetic', nativeProof: 'not performed', verdictScope: 'synthetic assertions only',
            verdict: 'UNKNOWN', reason: 'RESET_INCOMPLETE', phaseAtReset: state.phase,
            configuration: clone(state.config), elapsedMs: state.elapsedMs, budgetMs: state.config.budgetMs,
            impact: 'Unfinished synthetic attempt reset; no final outcome was verified.',
            native: { verdict: 'UNKNOWN', records: null, metrics: metrics(null) },
            proxy: { verdict: 'UNKNOWN', records: null, metrics: metrics(null) },
            partialObservations: { native: clone(state.nativeRecords), proxy: clone(state.proxyRecords) },
            trace: clone(state.trace), cleanupStatus: 'No resources allocated; page-memory attempt reset.',
          });
        }
        state = createReady(state.history);
      },
    });
  }

  return Object.freeze({ DEFAULTS, BOUNDS, validateConfig, createLesson });
}));
