(function expose(root) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const STEPS = ['capture-old', 'check-readiness', 'cutover', 'render-old', 'render-new'];
  const issued = new WeakSet();
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function error(code, message) {
    const failure = new Error(message);
    failure.code = code;
    throw failure;
  }
  function asset(version, kind) {
    return { kind, status: 200, version, cacheVersion: version };
  }
  function page(version, durationMs) {
    return {
      version, htmlStatus: 200, htmlVersion: version,
      assets: ['css', 'script', 'image'].map((kind) => asset(version, kind)),
      renderedCorrect: true, browseContextPreserved: true, journeyCorrect: true, durationMs,
      preview: { css: `${version}.css`, script: `${version}.js`, image: `${version}.svg` },
    };
  }
  const oldPage = page('v1', 420);
  const newPage = page('v2', 360);
  function changedPage(original, fields, changedAsset) {
    return {
      ...original, ...fields,
      assets: changedAsset
        ? original.assets.map((entry) => entry.kind === changedAsset.kind ? { ...entry, ...changedAsset } : entry)
        : original.assets,
      preview: { ...original.preview, ...fields.preview },
    };
  }
  function fixture(id, label, expected, fields = {}) {
    return {
      id, label, expected, readiness: true, routeVersion: 'v2',
      old: oldPage, new: newPage, ...fields,
    };
  }
  const FIXTURES = freeze([
    fixture('retained-assets', 'Retain both versions — complete pages', 'pass'),
    fixture('missing-old-script', 'Remove a pre-cutover v1 script', 'fail', {
      old: changedPage(oldPage, {
        renderedCorrect: false, journeyCorrect: false, preview: { script: 'unavailable-v1.js' },
      }, { kind: 'script', status: 404, version: null, cacheVersion: null }),
    }),
    fixture('missing-new-image', 'New HTML 200, missing required v2 image', 'fail', {
      new: changedPage(newPage, {
        renderedCorrect: false, journeyCorrect: false, preview: { image: 'unavailable-v2.svg' },
      }, { kind: 'image', status: 404, version: null, cacheVersion: null }),
    }),
    fixture('wrong-cache-version', 'Old reference receives cached v2 CSS with 200', 'fail', {
      old: changedPage(oldPage, {
        renderedCorrect: false, journeyCorrect: false, preview: { css: 'v2.css' },
      }, { kind: 'css', version: 'v2', cacheVersion: 'v2' }),
    }),
    fixture('render-defect', 'All assets 200, incorrect new rendered content', 'fail', {
      new: changedPage(newPage, {
        renderedCorrect: false, journeyCorrect: false, preview: { script: 'v2-broken.js' },
      }),
    }),
    fixture('lost-browse-context', 'Rendered pages, lost anonymous browsing context', 'fail', {
      old: changedPage(oldPage, { browseContextPreserved: false, journeyCorrect: false }),
    }),
    fixture('slow-html-200', 'Correct new page exceeds its original 2000 ms budget', 'fail', {
      new: changedPage(newPage, { durationMs: 2400 }),
    }),
    fixture('unknown-page-receipts', 'Old asset/cache/render/context/journey observations unknown', 'unverified', {
      old: {
        ...oldPage,
        assets: oldPage.assets.map((entry) => ({
          ...entry, status: entry.kind === 'css' ? 200 : null, version: null, cacheVersion: null,
        })),
        renderedCorrect: null, browseContextPreserved: null, journeyCorrect: null, durationMs: null,
        preview: { css: null, script: null, image: null },
      },
    }),
    fixture('unknown-routing', 'Nominal cutover, route observation unknown', 'unverified', { routeVersion: null }),
    fixture('unknown-readiness', 'Readiness unknown — deny exposure', 'unverified', { readiness: null }),
    fixture('candidate-not-ready', 'Readiness false — safe abort before exposure', 'fail', { readiness: false }),
  ]);
  const byId = new Map(FIXTURES.map((entry) => [entry.id, entry]));
  function exactObject(input, fields) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      error('ERR_INPUT', 'Use an exact plain command object.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))
        || fields.some((key) => !descriptors[key] || !Object.hasOwn(descriptors[key], 'value'))) {
      error('ERR_INPUT', 'Unknown, missing or accessor command fields are not accepted.');
    }
  }
  function issue(state) {
    freeze(state);
    issued.add(state);
    return state;
  }
  function guard(state) {
    if (!state || !issued.has(state) || !Object.isFrozen(state) || state.schemaVersion !== 1) {
      error('ERR_STATE', 'Use an immutable state issued by this lesson; imported or forged states are denied.');
    }
  }
  function activeRun(state) {
    return state.active === null ? null : state.runs[state.active - 1];
  }
  function replaceRun(state, run, active = state.active) {
    return issue({
      schemaVersion: 1, active,
      runs: state.runs.map((entry) => entry.id === run.id ? run : entry),
    });
  }
  function create() {
    return issue({ schemaVersion: 1, runs: [], active: null });
  }
  function check(name, value, expected, observed = true) {
    return {
      name,
      state: !observed || value === null ? 'unknown' : value === expected ? 'pass' : 'fail',
      observation: !observed ? 'not observed' : value === null ? 'unknown' : String(value),
      expected: String(expected),
    };
  }
  function pageChecks(spec, started, rendered, budgetMs) {
    const checks = [
      check(`${spec.version} HTML status`, spec.htmlStatus, 200, started),
      check(`${spec.version} HTML version`, spec.htmlVersion, spec.version, started),
    ];
    for (const entry of spec.assets) {
      checks.push(
        check(`${spec.version} required ${entry.kind} status`, entry.status, 200, rendered),
        check(`${spec.version} required ${entry.kind} version`, entry.version, spec.version, rendered),
        check(`${spec.version} ${entry.kind} cache payload version`, entry.cacheVersion, spec.version, rendered),
      );
    }
    checks.push(
      check(`${spec.version} complete rendered-page correctness`, spec.renderedCorrect, true, rendered),
      check(`${spec.version} anonymous browsing context`, spec.browseContextPreserved, true, rendered),
      check(`${spec.version} complete journey correctness`, spec.journeyCorrect, true, rendered),
      {
        name: `${spec.version} original journey budget`,
        state: !rendered || spec.durationMs === null ? 'unknown' : spec.durationMs <= budgetMs ? 'pass' : 'fail',
        observation: !rendered ? 'not observed' : spec.durationMs === null ? 'unknown' : `${spec.durationMs} fictional ms`,
        expected: `at most ${budgetMs} fictional ms`,
      },
    );
    return checks;
  }
  function verdict(checks) {
    if (checks.some((entry) => entry.state === 'fail')) return 'fail';
    if (checks.some((entry) => entry.state === 'unknown')) return 'unverified';
    return 'pass';
  }
  function inspectRun(run) {
    const selected = byId.get(run.config.fixture);
    const stage = run.actions.length;
    const exposed = stage >= 3;
    const common = [
      check('candidate readiness', selected.readiness, true, stage >= 2),
      check('observed post-cutover route version', selected.routeVersion, 'v2', exposed),
    ];
    const pages = [selected.old, selected.new].map((spec, index) => {
      const started = index === 0 ? stage >= 1 : stage >= 5;
      const rendered = index === 0 ? stage >= 4 : stage >= 5;
      const checks = pageChecks(spec, started, rendered, run.config.budgetMs);
      const outcome = !started ? 'not-started' : !exposed ? 'not-exposed'
        : { pass: 'succeeded', fail: 'failed', unverified: 'unknown' }[verdict([...common, ...checks])];
      return {
        version: spec.version, started, rendered, outcome, checks,
        htmlStatus: started ? spec.htmlStatus : null,
        assets: spec.assets.map((entry) => rendered ? entry : { kind: entry.kind, status: null, version: null, cacheVersion: null }),
        renderedCorrect: rendered ? spec.renderedCorrect : null,
        browseContextPreserved: rendered ? spec.browseContextPreserved : null,
        journeyCorrect: rendered ? spec.journeyCorrect : null,
        durationMs: rendered ? spec.durationMs : null,
      };
    });
    const checks = [...common, ...pages.flatMap((entry) => entry.checks)];
    const verification = verdict(checks);
    const counts = { attempted: 0, succeeded: 0, failed: 0, unknown: 0, notExposed: 0, notStarted: 0 };
    for (const entry of pages) {
      if (!entry.started) counts.notStarted++;
      else {
        counts.attempted++;
        counts[entry.outcome === 'not-exposed' ? 'notExposed' : entry.outcome]++;
      }
    }
    const terminal = stage === STEPS.length || (stage === 2 && selected.readiness !== true);
    return freeze({
      runId: run.id, fixture: selected.id, phase: stage === 0 ? 'started' : STEPS[stage - 1],
      mode: 'fixed-fictional-teaching-data', htmlStatus: stage >= 1 ? 200 : null,
      nominalCutover: exposed, readiness: stage >= 2 ? selected.readiness : null,
      observedRoute: exposed ? selected.routeVersion : null,
      verification,
      userImpact: !exposed ? 'not-exposed' : verification === 'pass' ? 'uninterrupted-transition'
        : verification === 'fail' ? 'interrupted-transition' : 'unknown-transition',
      exerciseExpectedAt2000Ms: selected.expected,
      exerciseAssertion: !terminal ? 'not-yet-evaluated' : run.config.budgetMs !== 2000 ? 'changed-budget'
        : verification === selected.expected ? 'matched' : 'mismatch',
      counts, pages, checks,
    });
  }
  function inspect(state) {
    guard(state);
    const run = activeRun(state);
    if (run) return inspectRun(run);
    return freeze({
      phase: 'idle', mode: 'fixed-fictional-teaching-data', verification: 'unverified',
      userImpact: 'not-exposed', htmlStatus: null,
      counts: { attempted: 0, succeeded: 0, failed: 0, unknown: 0, notExposed: 0, notStarted: 2 },
      pages: [], checks: [],
    });
  }
  function verificationAllowed(run) {
    const stage = run.actions.length;
    const gateBlocked = stage === 2 && byId.get(run.config.fixture).readiness !== true;
    return (stage === 1 || stage === 4 || stage === 5 || gateBlocked)
      && run.reviews.length < 3 && !run.reviews.some((entry) => entry.evidenceStep === stage);
  }
  function command(state, input) {
    guard(state);
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
      error('ERR_INPUT', 'Use an exact plain command object.');
    }
    const typeDescriptor = Object.getOwnPropertyDescriptor(input, 'type');
    if (!typeDescriptor || !Object.hasOwn(typeDescriptor, 'value') || typeof typeDescriptor.value !== 'string') {
      error('ERR_INPUT', 'Command type must be an exact data string, not an accessor.');
    }
    exactObject(input, input.type === 'start' ? ['type', 'fixture', 'budgetMs', 'dataOnly'] : ['type']);
    if (input.type === 'start') {
      if (state.active !== null) error('ERR_PHASE', 'Reset the active run before starting another; history is retained.');
      if (state.runs.length >= 6) error('ERR_BOUND', 'The six-run session bound is reached. History stays here; deliberately reload for a fresh session.');
      if (typeof input.fixture !== 'string' || !byId.has(input.fixture)) error('ERR_INPUT', 'Select an exact listed fixed fixture.');
      if (!Number.isInteger(input.budgetMs) || input.budgetMs < 100 || input.budgetMs > 5000) {
        error('ERR_INPUT', 'Original budget must be a typed integer 100 through 5000 ms.');
      }
      if (input.dataOnly !== true) error('ERR_INPUT', 'Confirm DATA ONLY with literal boolean true.');
      const run = {
        id: state.runs.length + 1,
        config: { fixture: input.fixture, budgetMs: input.budgetMs, dataOnly: true },
        actions: [], reviews: [],
        history: [{ sequence: 1, action: 'start', detail: 'Declared fixed DATA ONLY fixture and original budget before either browsing journey.' }],
        archived: false,
      };
      return issue({ schemaVersion: 1, active: run.id, runs: [...state.runs, run] });
    }
    const run = activeRun(state);
    if (input.type === 'reset') {
      if (!run) return state;
      return replaceRun(state, {
        ...run, archived: true,
        history: [...run.history, {
          sequence: run.history.length + 1, action: 'reset', detail: 'Controls reset; this complete run history is retained.',
          report: inspectRun(run),
        }],
      }, null);
    }
    if (!run) error('ERR_PHASE', 'Start a DATA ONLY run first.');
    if (input.type === 'verify') {
      if (!verificationAllowed(run)) error('ERR_PHASE', 'Verify once after old HTML, old rendering, complete rendering or a blocked readiness gate.');
      const report = inspectRun(run);
      return replaceRun(state, {
        ...run,
        reviews: [...run.reviews, { evidenceStep: run.actions.length, report }],
        history: [...run.history, {
          sequence: run.history.length + 1, action: 'verify',
          detail: `${report.verification.toUpperCase()} — ${report.userImpact}; successes ${report.counts.succeeded}/${report.counts.attempted}.`,
          report,
        }],
      });
    }
    if (!STEPS.includes(input.type)) error('ERR_INPUT', 'Unknown action; no arbitrary paths, receipts or operator commands are accepted.');
    if (STEPS[run.actions.length] !== input.type) error('ERR_PHASE', 'Action is repeated or out of order; retained state is unchanged.');
    const selected = byId.get(run.config.fixture);
    if (input.type === 'cutover' && selected.readiness !== true) {
      error('ERR_READINESS', `${selected.readiness === null ? 'Unknown' : 'Failed'} readiness: cutover denied before exposure.`);
    }
    const details = {
      'capture-old': 'Old fictional HTML 200 captured before cutover; required v1 references are pinned, not yet rendered.',
      'check-readiness': `Fixed candidate readiness: ${selected.readiness === null ? 'unknown' : selected.readiness}.`,
      cutover: `Nominal fictional cutover recorded; observed route ${selected.routeVersion === null ? 'unknown' : selected.routeVersion}; old references remain v1.`,
      'render-old': 'Observed fixed old-page required assets, cache versions, complete render, anonymous context and original journey duration after cutover.',
      'render-new': 'Observed fixed new-page HTML, required assets, cache versions, complete render, anonymous context and original journey duration.',
    };
    return replaceRun(state, {
      ...run, actions: [...run.actions, input.type],
      history: [...run.history, { sequence: run.history.length + 1, action: input.type, detail: details[input.type] }],
    });
  }
  function controls(state) {
    guard(state);
    const run = activeRun(state);
    const next = run ? STEPS[run.actions.length] || null : null;
    return freeze({
      start: state.active === null && state.runs.length < 6,
      next: next === 'cutover' && byId.get(run.config.fixture).readiness !== true ? null : next,
      verify: Boolean(run && verificationAllowed(run)),
      runBoundReached: state.runs.length >= 6 && state.active === null,
    });
  }
  function previewPlan(state, version) {
    guard(state);
    const run = activeRun(state);
    if (!run || !['v1', 'v2'].includes(version)) error('ERR_INPUT', 'Select an active v1 or v2 illustration.');
    const requiredStep = version === 'v1' ? 4 : 5;
    if (run.actions.length < requiredStep) error('ERR_PHASE', 'Load pinned assets only at their declared rendering step.');
    return byId.get(run.config.fixture)[version === 'v1' ? 'old' : 'new'].preview;
  }
  const api = freeze({ banner: BANNER, fixtures: FIXTURES, steps: STEPS, create, command, inspect, controls, previewPlan });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S131Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
