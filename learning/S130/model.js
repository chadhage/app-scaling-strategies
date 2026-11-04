(function (root) {
  'use strict';
  const MAX_ACTIONS = 12;
  const BUDGET_MS = 900;
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  function fail(code, message, field = null) {
    const error = new Error(message);
    error.code = code;
    error.field = field;
    throw error;
  }
  function rows(instanceIds = ['fx-A', 'fx-B', 'fx-C']) {
    return [
      { id: 'user-A', executionId: 'job-A', instance: instanceIds[0], beforeVersion: 'v1', afterVersion: 'v2', remainingSeconds: 120, execution: 'completed', pollingStatus: 200, state: 'preserved', effects: 1, latencyMs: 250 },
      { id: 'user-B', executionId: 'job-B', instance: instanceIds[1], beforeVersion: 'v1', afterVersion: 'v2', remainingSeconds: 1800, execution: 'completed', pollingStatus: 200, state: 'preserved', effects: 1, latencyMs: 300 },
      { id: 'user-C', executionId: 'job-C', instance: instanceIds[2], beforeVersion: 'v1', afterVersion: 'v2', remainingSeconds: 300, execution: 'completed', pollingStatus: 200, state: 'preserved', effects: 1, latencyMs: 350 },
    ];
  }
  function point(name, instances, readyUnits, restarts = []) {
    return { point: name, instances, readyUnits, demandUnits: 3, restarts };
  }
  function fixture(id, label, overrides = {}) {
    return {
      id, label, plan: 'Flex Consumption (fictional DATA)', strategy: 'rolling site update',
      instancesBefore: 3, budgetMs: BUDGET_MS, documentedGraceSeconds: 3600, observedGraceSeconds: 3600,
      graceContext: 'Rolling replacement / scale-in grace reference, not platform-update grace',
      fleetUpdateCompletion: 'unknown',
      logEstimate: 'v2 logs observed; original log silence is only a best-effort estimate, not completion',
      trace: [
        point('t0', ['fx-A:v1 serving', 'fx-B:v1 serving', 'fx-C:v1 serving'], 9),
        point('t1', ['fx-A:v1 draining', 'fx-B:v1 serving', 'fx-C:v1 serving', 'fx-D:v2 serving'], 9),
        point('t2', ['fx-B:v1 draining', 'fx-C:v1 serving', 'fx-D:v2 serving'], 6, ['fx-A replaced by fx-D (fictional observation)']),
      ],
      journeys: rows(), ...overrides,
    };
  }
  const single = rows(['fx-A', 'fx-A', 'fx-A']);
  single[1] = { ...single[1], pollingStatus: 503, latencyMs: 920 };
  const incompatible = rows();
  incompatible[1] = { ...incompatible[1], state: 'lost' };
  incompatible[2] = { ...incompatible[2], effects: 2 };
  const starved = rows();
  starved[1] = { ...starved[1], pollingStatus: 503, latencyMs: 1100 };
  starved[2] = { ...starved[2], latencyMs: 1400 };
  const expired = rows();
  expired[1] = { ...expired[1], remainingSeconds: 3700, execution: 'terminated', effects: 0, pollingStatus: 504, latencyMs: 950 };
  const unknown = rows();
  unknown[1] = { ...unknown[1], remainingSeconds: 2700, execution: 'unknown', effects: null, afterVersion: 'unknown' };
  const platform = rows();
  platform[1] = { ...platform[1], remainingSeconds: 780, execution: 'terminated', effects: 0, pollingStatus: 504, latencyMs: 980 };
  const recreate = rows().map((row) => ({ ...row, execution: 'terminated', pollingStatus: 503, effects: 0, latencyMs: 1000 }));
  const PRESETS = freeze({
    'single-compatible': fixture('single-compatible', 'Single instance / compatible rolling', {
      instancesBefore: 1,
      trace: [
        point('t0', ['fx-A:v1 serving'], 3),
        point('t1', ['fx-A:v1 draining; new polling admission unavailable'], 0),
        point('t2', ['fx-D:v2 serving'], 3, ['fx-A replaced by fx-D; existing jobs completed (DATA)']),
      ],
      journeys: single,
    }),
    'multi-compatible': fixture('multi-compatible', 'Three instances / compatible rolling'),
    'multi-incompatible': fixture('multi-incompatible', 'Three instances / mixed-version state and effects fail', { journeys: incompatible }),
    'multi-starved': fixture('multi-starved', 'Three instances / insufficient ready capacity', {
      trace: [
        point('t0', ['fx-A:v1 serving', 'fx-B:v1 serving', 'fx-C:v1 serving'], 9),
        point('t1', ['fx-A:v1 draining', 'fx-B:v1 draining', 'fx-C:v1 serving with constrained capacity'], 1),
        point('t2', ['fx-C:v1 serving', 'fx-D:v2 serving'], 6, ['Replacement arrived after the capacity gap (DATA)']),
      ],
      journeys: starved,
    }),
    'multi-grace-expired': fixture('multi-grace-expired', 'Three instances / rolling grace exceeded', { journeys: expired }),
    'multi-grace-unknown': fixture('multi-grace-unknown', 'Three instances / grace and execution unknown', {
      observedGraceSeconds: null, journeys: unknown,
    }),
    'multi-platform-restart': fixture('multi-platform-restart', 'Three instances / platform-update restart', {
      strategy: 'platform update (not a rolling code deployment)', documentedGraceSeconds: 600, observedGraceSeconds: 600,
      graceContext: 'Platform-update grace reference; do not borrow the 60-minute rolling scale-in window',
      trace: [
        point('t0', ['fx-A:v1 serving', 'fx-B:v1 serving', 'fx-C:v1 serving'], 9),
        point('t1', ['fx-B:v1 restarting', 'fx-A:v1 serving', 'fx-C:v1 serving'], 6, ['fx-B restarted; job-B terminated (DATA)']),
        point('t2', ['fx-D:v2 serving', 'fx-A:v1 serving', 'fx-C:v1 serving'], 9),
      ],
      journeys: platform,
    }),
    'multi-recreate': fixture('multi-recreate', 'Three instances / recreate terminates work', {
      strategy: 'recreate site update', documentedGraceSeconds: null, observedGraceSeconds: 0,
      graceContext: 'Recreate termination; no rolling completion grace inferred',
      trace: [
        point('t0', ['fx-A:v1 serving', 'fx-B:v1 serving', 'fx-C:v1 serving'], 9),
        point('t1', ['All three old instances restarting'], 0, ['fx-A, fx-B and fx-C restarted; existing jobs terminated (DATA)']),
        point('t2', ['fx-D:v2 serving', 'fx-E:v2 serving', 'fx-F:v2 serving'], 9),
      ],
      journeys: recreate,
    }),
  });
  function exactRecord(value, keys, label, code = 'ERR_INPUT') {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      fail(code, `${label} must be an exact plain typed record.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    if (actual.some((key) => typeof key !== 'string') || actual.length !== keys.length
      || keys.some((key) => !Object.hasOwn(descriptors, key))
      || actual.some((key) => !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
      fail(code, `${label} has missing, extra or accessor fields.`);
    }
    return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  }
  function strictArray(value, label, maximum) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) {
      fail('ERR_STATE', `${label} must be a bounded ordinary array.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(String(key)))) {
      fail('ERR_STATE', `${label} cannot be sparse or have extra fields.`);
    }
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('ERR_STATE', `${label} cannot contain accessors or holes.`);
      return descriptor.value;
    });
  }
  function validateCommand(command) {
    if (!command || typeof command !== 'object' || Object.getPrototypeOf(command) !== Object.prototype) {
      fail('ERR_INPUT', 'Command must be an exact plain typed record.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      fail('ERR_INPUT', 'Command type must be an exact string, not an accessor.');
    }
    const type = descriptor.value;
    if (type === 'load') {
      const fields = exactRecord(command, ['type', 'presetId', 'version'], 'Load command');
      if (typeof fields.presetId !== 'string' || !Object.hasOwn(PRESETS, fields.presetId)) fail('ERR_INPUT', 'Choose an exact fixed preset identifier.', 'presetId');
      if (typeof fields.version !== 'string' || fields.version !== 'v2') fail('ERR_INPUT', 'Software token must be exactly v2; no trimming or coercion.', 'version');
      return { type, presetId: fields.presetId, version: fields.version };
    }
    if (type === 'inspect' || type === 'measure') return exactRecord(command, ['type'], 'Observation command');
    fail('ERR_INPUT', 'Only exact load, inspect and measure command types are supported.');
  }
  function measure(fixed) {
    const journeys = fixed.journeys.map((row) => {
      const failures = [];
      const missing = [];
      if (row.execution === 'terminated') failures.push('execution terminated');
      if (row.execution === 'unknown') missing.push('execution completion unknown');
      if (row.pollingStatus !== null && row.pollingStatus !== 200) failures.push(`polling error ${row.pollingStatus}`);
      if (row.pollingStatus === null) missing.push('polling result unknown');
      if (row.state === 'lost') failures.push('mixed-version state lost');
      if (row.state === 'unknown') missing.push('state unknown');
      if (row.effects !== null && row.effects !== 1) failures.push(`${row.effects} business effects; exactly one required`);
      if (row.effects === null) missing.push('business effects unknown');
      if (row.latencyMs !== null && row.latencyMs > fixed.budgetMs) failures.push(`latency ${row.latencyMs} ms exceeds original ${fixed.budgetMs} ms budget`);
      if (row.latencyMs === null) missing.push('latency unknown');
      if (row.afterVersion === 'unknown') missing.push('intended v2 migration unknown');
      if (row.afterVersion === 'v1') failures.push('intended v2 migration not observed');
      if (fixed.observedGraceSeconds === null && row.execution === 'unknown') missing.push('observed grace unknown; documented maximum is not completion proof');
      return { ...row, outcome: failures.length ? 'interrupted' : missing.length ? 'unknown' : 'uninterrupted', reasons: [...failures, ...missing] };
    });
    const count = (outcome) => journeys.filter((row) => row.outcome === outcome).length;
    const interrupted = count('interrupted');
    const unknownCount = count('unknown');
    return freeze({
      presetId: fixed.id, attempted: journeys.length, uninterrupted: count('uninterrupted'), interrupted,
      unknown: unknownCount, outcome: interrupted ? 'interrupted' : unknownCount ? 'unknown' : 'uninterrupted sample',
      fleetUpdateCompletion: 'unknown', certification: 'not certified', journeys,
    });
  }
  function createState() {
    return freeze({ schemaVersion: 1, phase: 'empty', presetId: null, history: [], runs: [] });
  }
  function apply(state, command) {
    if (state.history.length >= MAX_ACTIONS) fail('ERR_HISTORY', 'Safe hold: twelve retained actions reached. Explicitly reset; history is never pruned.');
    if (command.type === 'load' && !['empty', 'measured'].includes(state.phase)) fail('ERR_STATE', 'Safe hold: finish inspecting and measuring the loaded trace before choosing another.');
    if (command.type === 'inspect' && state.phase !== 'loaded') fail('ERR_STATE', 'Safe hold: load one trace before inspecting executions and grace.');
    if (command.type === 'measure' && state.phase !== 'inspected') fail('ERR_STATE', 'Safe hold: inspect the loaded executions and grace before measuring; repeat measurement is not new evidence.');
    const presetId = command.type === 'load' ? command.presetId : state.presetId;
    const phase = { load: 'loaded', inspect: 'inspected', measure: 'measured' }[command.type];
    return freeze({
      schemaVersion: 1, phase, presetId, history: [...state.history, command],
      runs: command.type === 'measure' ? [...state.runs, measure(PRESETS[presetId])] : [...state.runs],
    });
  }
  // Validate serialized state by replaying its exact commands; derived successes cannot be forged.
  function canonical(value, depth = 0, seen = new Set()) {
    if (depth > 18) fail('ERR_STATE', 'State nesting is outside the bounded contract.');
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value === 'string' && value.length <= 6000) return JSON.stringify(value);
    if (!value || typeof value !== 'object' || seen.has(value)) fail('ERR_STATE', 'State has an unsupported value or cycle.');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = `[${strictArray(value, 'State array', MAX_ACTIONS).map((item) => canonical(item, depth + 1, seen)).join(',')}]`;
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype) fail('ERR_STATE', 'State objects must be ordinary data records.');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.length > 40 || keys.some((key) => typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) {
        fail('ERR_STATE', 'State cannot contain symbols, accessors or hidden fields.');
      }
      result = `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key].value, depth + 1, seen)}`).join(',')}}`;
    }
    seen.delete(value);
    return result;
  }
  function validateState(state) {
    const fields = exactRecord(state, ['schemaVersion', 'phase', 'presetId', 'history', 'runs'], 'State', 'ERR_STATE');
    const commands = strictArray(fields.history, 'History', MAX_ACTIONS);
    let replayed = createState();
    for (const command of commands) replayed = apply(replayed, validateCommand(command));
    if (canonical(state) !== canonical(replayed)) fail('ERR_STATE', 'Safe hold: state and measured results must exactly match deterministic history replay.');
    return replayed;
  }
  function execute(state, command) {
    const typed = validateCommand(command);
    return apply(validateState(state), typed);
  }
  function view(state) {
    const trusted = validateState(state);
    return freeze({
      fixture: trusted.presetId === null ? null : PRESETS[trusted.presetId],
      inspected: ['inspected', 'measured'].includes(trusted.phase),
      result: trusted.phase === 'measured' ? trusted.runs[trusted.runs.length - 1] : null,
      totals: {
        runs: trusted.runs.length,
        attempted: trusted.runs.reduce((sum, run) => sum + run.attempted, 0),
        uninterrupted: trusted.runs.reduce((sum, run) => sum + run.uninterrupted, 0),
        interrupted: trusted.runs.reduce((sum, run) => sum + run.interrupted, 0),
        unknown: trusted.runs.reduce((sum, run) => sum + run.unknown, 0),
      },
    });
  }
  const api = freeze({ createState, execute, view, PRESETS, MAX_ACTIONS, BUDGET_MS });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlexLesson', { value: api, writable: false, configurable: false });
}(typeof globalThis === 'object' ? globalThis : this));
