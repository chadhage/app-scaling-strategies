'use strict';

(function expose(root) {
  const DEFAULTS = Object.freeze({
    prefixBytes: 12, response: 'correct', delayMs: 10, budgetMs: 100, hashEvidence: 'present',
  });
  const ARTIFACT = Object.freeze(Array.from({ length: 32 }, (_, i) => i));
  const EXPECTED_HASH = '630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd';
  const VALIDATOR = '"s044-artifact-v1"';
  const RESPONSES = Object.freeze(['correct', 'gap', 'duplicate', 'corrupt', 'ignored']);
  const HISTORY_LIMIT = 8;

  function readonly(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) readonly(child);
      Object.freeze(value);
    }
    return value;
  }

  function validate(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Object.keys(input).sort().join(',') !== Object.keys(DEFAULTS).sort().join(',')) {
      throw new Error('Input must contain exactly the five declared configuration fields.');
    }
    for (const [key, minimum, maximum] of [
      ['prefixBytes', 4, 28], ['delayMs', 0, 1000], ['budgetMs', 1, 1000],
    ]) {
      if (!Number.isInteger(input[key]) || input[key] < minimum || input[key] > maximum) {
        throw new Error(`Input ${key} must be an integer from ${minimum} through ${maximum}.`);
      }
    }
    if (!RESPONSES.includes(input.response)) throw new Error('Input response is not a supported synthetic condition.');
    if (!['present', 'missing'].includes(input.hashEvidence)) throw new Error('Input checksum evidence must be present or missing.');
    return readonly({ ...input });
  }

  function initialTrace(config) {
    return [
      { atMs: 0, detail: `v1 admits original artifact; original deadline ${config.budgetMs} ms.` },
      { atMs: 30, detail: `Retain verified byte offsets 0 through ${config.prefixBytes - 1} from v1.` },
      { atMs: 40, detail: 'Cutover to synthetic v2; keep the prefix, artifact validator and original clock.' },
    ];
  }

  function counts(verdict) {
    return { attempted: 1, succeeded: Number(verdict === 'PASS'), interrupted: Number(verdict === 'FAIL'), unknown: Number(verdict === 'UNKNOWN') };
  }

  function cancelled(active) {
    return readonly({
      runId: active.runId, mode: 'synthetic', config: active.config,
      verdict: 'UNKNOWN', impact: 'Unverified synthetic journey',
      reasons: ['Reset before resume; final completion was not observed.'],
      counts: counts('UNKNOWN'), trace: [...active.trace, { atMs: 40, detail: 'Reset before resume; no completion claim.' }],
      cleanup: 'Active in-memory prefix released; session history retained.',
    });
  }

  async function verify(active) {
    const config = active.config;
    const elapsedMs = 60 + config.delayMs;
    const supported = config.response !== 'ignored';
    const start = config.prefixBytes + (config.response === 'gap' ? 1 : config.response === 'duplicate' ? -1 : 0);
    const offsets = supported ? ARTIFACT.slice(start) : [...ARTIFACT];
    const body = offsets.map((offset) => ARTIFACT[offset]);
    if (config.response === 'corrupt') body[0] ^= 255;
    const assembledOffsets = [...ARTIFACT.slice(0, config.prefixBytes), ...(supported ? offsets : [])];
    const assembled = [...ARTIFACT.slice(0, config.prefixBytes), ...(supported ? body : [])];
    const occurrences = ARTIFACT.map((offset) => assembledOffsets.filter((item) => item === offset).length);
    const missing = ARTIFACT.filter((offset) => occurrences[offset] === 0);
    const duplicates = ARTIFACT.filter((offset) => occurrences[offset] > 1);
    let observed = null;
    let checksumError = false;
    if (supported && config.hashEvidence === 'present') {
      try {
        const digest = await root.crypto.subtle.digest('SHA-256', Uint8Array.from(assembled));
        observed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      } catch {
        checksumError = true;
      }
    }
    const checks = {
      rangeSupported: supported,
      rangeMatches: supported && start === config.prefixBytes,
      coverage: !missing.length && !duplicates.length && assembledOffsets.every((offset, index) => offset === index),
      byteCount: assembled.length === ARTIFACT.length,
      contentHash: observed === null ? null : observed === EXPECTED_HASH,
      originalBudget: elapsedMs <= config.budgetMs,
    };
    const reasons = [];
    if (!checks.rangeSupported) reasons.push('Unsupported resume: destination ignored Range and returned 200; unsafe append refused.');
    if (supported && !checks.rangeMatches) reasons.push(`Content-Range starts at ${start}, not requested cursor ${config.prefixBytes}.`);
    if (!checks.coverage) reasons.push(`Coverage failed: missing offsets [${missing.join(', ')}]; duplicate offsets [${duplicates.join(', ')}].`);
    if (!checks.byteCount) reasons.push(`Assembled ${assembled.length} bytes, expected ${ARTIFACT.length}.`);
    if (checks.contentHash === false) reasons.push('Final SHA-256 differs from the original artifact.');
    if (checks.contentHash === null) reasons.push(checksumError
      ? 'Checksum calculation unavailable; final content hash is unverified.'
      : 'Final checksum evidence not observed; content hash is unknown.');
    if (!checks.originalBudget) reasons.push(`Original user budget exceeded: ${elapsedMs} ms > ${config.budgetMs} ms; the retry clock cannot replace it.`);
    const values = Object.values(checks);
    const verdict = values.includes(false) ? 'FAIL' : values.includes(null) ? 'UNKNOWN' : 'PASS';
    const integrityProven = Object.entries(checks).every(([key, value]) => key === 'originalBudget' || value === true);
    const response = {
      status: supported ? 206 : 200,
      contentRange: supported ? `bytes ${start}-31/32` : null,
      validator: VALIDATOR,
    };
    return readonly({
      runId: active.runId, mode: 'synthetic', config, verdict,
      impact: verdict === 'PASS' ? 'Uninterrupted synthetic completion'
        : verdict === 'FAIL' ? 'Interrupted synthetic journey' : 'Unverified synthetic journey',
      request: { range: `bytes=${config.prefixBytes}-`, ifRange: VALIDATOR },
      response,
      bytes: { expected: ARTIFACT.length, retained: config.prefixBytes, received: body.length, assembled: assembled.length, missing, duplicates },
      hash: { algorithm: 'SHA-256', expected: EXPECTED_HASH, observed, matches: checks.contentHash },
      timing: {
        admittedAtMs: 0, prefixAtMs: 30, cutoverAtMs: 40, resumedAtMs: 40 + config.delayMs,
        transferDurationMs: 20, observedAtMs: elapsedMs, completedAtMs: integrityProven ? elapsedMs : null,
        elapsedMs, budgetMs: config.budgetMs, withinBudget: checks.originalBudget,
      },
      checks, counts: counts(verdict),
      reasons: reasons.length ? reasons : ['Every byte occurs once in order, the original SHA-256 matches, and the original budget is met.'],
      trace: [
        ...active.trace,
        { atMs: 40 + config.delayMs, detail: `v2 resume request: Range bytes=${config.prefixBytes}-, If-Range ${VALIDATOR}.` },
        { atMs: elapsedMs, detail: `Synthetic response ${response.status}; Content-Range ${response.contentRange ?? 'absent'}; ${body.length} received bytes.` },
        { atMs: elapsedMs, detail: `Verify original bytes/hash and clock: ${verdict}.` },
      ],
      cleanup: 'No resources created; only bounded session memory remains.',
    });
  }

  function createRehearsal() {
    let phase = 'idle';
    let active = null;
    let result = null;
    let sequence = 0;
    const history = [];
    function retain(outcome) {
      history.push(outcome);
      if (history.length > HISTORY_LIMIT) history.shift();
    }
    function snapshot() {
      return readonly({ phase, active, result, history: [...history] });
    }
    return Object.freeze({
      admit(input) {
        if (phase !== 'idle') throw new Error('State guard: reset before admitting another download.');
        const config = validate(input);
        active = readonly({ runId: ++sequence, config, trace: initialTrace(config) });
        phase = 'paused';
        return snapshot();
      },
      async resume() {
        if (phase !== 'paused') throw new Error('State guard: resume requires one admitted, paused prefix.');
        phase = 'verifying';
        result = await verify(active);
        retain(result);
        phase = 'complete';
        return result;
      },
      reset() {
        if (phase === 'verifying') throw new Error('State guard: wait for verification before reset.');
        if (phase === 'paused') retain(cancelled(active));
        phase = 'idle';
        active = null;
        result = null;
        return snapshot();
      },
      snapshot,
    });
  }
  const api = Object.freeze({ DEFAULTS, ARTIFACT, EXPECTED_HASH, RESPONSES, HISTORY_LIMIT, createRehearsal });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.S044 = api;
}(globalThis));
