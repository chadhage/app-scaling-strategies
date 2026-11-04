(function runLesson() {
  'use strict';
  const engine = globalThis.S131Lesson;
  const fatal = document.getElementById('fatal-error');
  if (!engine || typeof engine.create !== 'function') {
    fatal.textContent = 'Lesson model did not load. Refresh the owned local file; no result is verified.';
    document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = true; });
    return;
  }
  fatal.hidden = true;
  const form = document.getElementById('configuration');
  const errorBox = document.getElementById('validation-error');
  const fields = ['fixture', 'budget', 'data-only'].map((id) => document.getElementById(id));
  const localRuns = new Map();
  const assetNodes = new Set();
  let state = engine.create();
  let busy = false;
  let generation = 0;
  let pendingIllustrations = 0;
  document.documentElement.dataset.pendingAssets = '0';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    fields.forEach((field) => field.removeAttribute('aria-invalid'));
  }
  function showError(error, field) {
    errorBox.textContent = `${error.code || 'ERR_LOCAL'}: ${error.message}`;
    errorBox.hidden = false;
    if (field) field.setAttribute('aria-invalid', 'true');
    (field || errorBox).focus();
  }
  function activeRun() {
    return state.active === null ? null : state.runs[state.active - 1];
  }
  function historyRow(run, event, detail) {
    const row = document.createElement('tr');
    row.append(element('td', `${run.id} / ${run.config.fixture}`), element('td', event), element('td', detail));
    return row;
  }
  function refresh() {
    const controls = engine.controls(state);
    const run = activeRun();
    const report = engine.inspect(state);
    fields.forEach((field) => { field.disabled = Boolean(run); });
    document.getElementById('start-run').disabled = !controls.start || busy;
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.disabled = busy || (button.dataset.action === 'verify' ? !controls.verify : controls.next !== button.dataset.action);
    });
    const next = busy ? 'Loading owned local illustration assets; trace observations remain fictional.'
      : controls.runBoundReached ? 'Six-run bound reached. History is retained; deliberate reload is required for a fresh session.'
        : !run ? 'Declare inputs and start.'
          : controls.next ? `Next ordered action: ${controls.next}.`
            : report.readiness !== true && run.actions.length === 2 ? 'Readiness failed or unknown: cutover denied. Verify the non-exposed result.'
              : 'Complete pages observed. Verify the fixed-data result or reset while retaining history.';
    document.getElementById('next-action').textContent = next;
    const result = document.getElementById('result');
    result.dataset.verification = report.verification;
    result.textContent = `${report.verification.toUpperCase()} — ${report.userImpact} (fixed fictional data only).`;
    document.getElementById('exercise-assertion').textContent = !run ? 'Exercise assertion not yet evaluated.'
      : report.exerciseAssertion === 'matched'
        ? `Exercise assertion matched (${report.exerciseExpectedAt2000Ms.toUpperCase()}). Detecting failure or uncertainty is not an uninterrupted journey.`
        : report.exerciseAssertion === 'changed-budget'
          ? 'The original budget differs from the 2000 ms worked example; this is a different declared envelope.'
          : 'Exercise assertion not yet evaluated; complete required observations are missing.';
    document.getElementById('html-observations').textContent = !run ? 'Not observed'
      : report.pages.map((entry) => `${entry.version}: ${entry.htmlStatus === null ? 'not observed' : `fictional ${entry.htmlStatus}`}`).join('; ');
    document.getElementById('route-observations').textContent = !run ? 'Not observed'
      : `Readiness ${report.readiness === null ? 'unknown/not observed' : report.readiness}; nominal cutover ${report.nominalCutover}; route ${report.observedRoute === null ? 'unknown/not observed' : report.observedRoute}.`;
    const counts = report.counts;
    document.getElementById('journey-counts').textContent =
      `${counts.attempted} attempted; ${counts.succeeded} succeeded; ${counts.failed} failed; ${counts.unknown} unknown; ${counts.notExposed} not exposed; ${counts.notStarted} not started.`;
    const locals = run ? localRuns.get(run.id) || {} : {};
    document.getElementById('local-result').textContent = busy ? 'Loading local files — not HTTP'
      : ['v1', 'v2'].map((version) => `${version}: ${locals[version] ? locals[version].result : 'not loaded'}`).join('; ');
    const checkBody = document.getElementById('checks-body');
    checkBody.replaceChildren();
    for (const check of report.checks) {
      const row = document.createElement('tr');
      const status = element('td', check.state.toUpperCase());
      status.dataset.check = check.state;
      row.append(element('td', check.name), element('td', check.observation), element('td', check.expected), status);
      checkBody.append(row);
    }
    const history = document.getElementById('history-body');
    history.replaceChildren();
    for (const retained of state.runs) {
      for (const event of retained.history) {
        history.append(historyRow(retained, `${event.sequence}. ${event.action}`, event.detail));
      }
      const illustrations = localRuns.get(retained.id) || {};
      for (const [version, receipt] of Object.entries(illustrations)) {
        history.append(historyRow(retained, `${version} local illustration (not trace)`, JSON.stringify(receipt)));
      }
    }
    document.getElementById('trace').textContent = state.runs.length
      ? JSON.stringify({ mode: 'FIXED FICTIONAL DATA ONLY', runs: state.runs, currentAssessment: report }, null, 2)
      : 'No run.';
  }
  function loadAsset(node, destination, path, attribute) {
    if (path === null) return Promise.resolve('unknown');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        node.onload = null;
        node.onerror = null;
        resolve(value);
      };
      const deadline = setTimeout(() => finish('unknown'), 2000);
      node.onload = () => finish('loaded');
      node.onerror = () => finish('failed');
      node.setAttribute(attribute, `fixtures/${path}`);
      assetNodes.add(node);
      destination.append(node);
    });
  }
  async function illustrate(version, startedGeneration) {
    const plan = engine.previewPlan(state, version);
    const section = document.getElementById(`preview-${version}`);
    const product = element('div', undefined, 'fixture-product');
    const caption = element('p', 'Script-dependent content not rendered.', 'rendered-caption');
    const image = element('img', undefined, 'fixture-image');
    image.alt = `${version} required shelf illustration`;
    const status = element('p', 'Loading owned local files; not HTTP.', 'local-status');
    product.append(caption);
    section.dataset.illustrationGeneration = String(startedGeneration);
    section.replaceChildren(element('h3', `${version === 'v1' ? 'Old' : 'New'} ${version} page`), product, status);
    const stylesheet = element('link');
    stylesheet.rel = 'stylesheet';
    const script = element('script');
    script.dataset.illustrationGeneration = String(startedGeneration);
    pendingIllustrations++;
    document.documentElement.dataset.pendingAssets = String(pendingIllustrations);
    let loads;
    try {
      loads = await Promise.all([
        loadAsset(stylesheet, document.head, plan.css, 'href'),
        loadAsset(script, document.body, plan.script, 'src'),
        loadAsset(image, product, plan.image, 'src'),
      ]);
    } finally {
      pendingIllustrations--;
      document.documentElement.dataset.pendingAssets = String(pendingIllustrations);
    }
    const background = getComputedStyle(product).backgroundColor;
    const expectedBackground = version === 'v1' ? 'rgb(224, 243, 255)' : 'rgb(233, 255, 230)';
    const expectedCaption = version === 'v1' ? 'Archive shelf — v1' : 'Today shelf — v2';
    const semantics = caption.textContent === expectedCaption
      && background === expectedBackground && image.naturalWidth === (version === 'v1' ? 80 : 88);
    const result = loads.includes('failed') ? 'failed'
      : loads.includes('unknown') ? 'unknown' : semantics ? 'passed' : 'failed';
    const receipt = { css: loads[0], script: loads[1], image: loads[2], caption: caption.textContent, background, naturalWidth: image.naturalWidth, result };
    if (startedGeneration === generation) {
      section.dataset.localResult = result;
      status.textContent = `Actual owned local illustration: ${result.toUpperCase()}; CSS ${loads[0]}, script ${loads[1]}, image ${loads[2]}. Not HTTP or cloud evidence.`;
    }
    return receipt;
  }
  function clearIllustrations() {
    for (const node of assetNodes) node.remove();
    assetNodes.clear();
    for (const version of ['v1', 'v2']) {
      const section = document.getElementById(`preview-${version}`);
      delete section.dataset.localResult;
      delete section.dataset.illustrationGeneration;
      section.replaceChildren(element('h3', `${version === 'v1' ? 'Old' : 'New'} ${version} page`),
        element('p', version === 'v1' ? 'Required v1 references pinned before cutover; not loaded yet.' : 'Not loaded yet.'));
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const rawBudget = fields[1].value;
    if (!/^[1-9][0-9]*$/.test(rawBudget) || rawBudget.length > 4) {
      showError({ code: 'ERR_INPUT', message: 'Budget must be an exact whole decimal integer 100–5000; no coercion.' }, fields[1]);
      return;
    }
    try {
      state = engine.command(state, {
        type: 'start', fixture: fields[0].value, budgetMs: Number(rawBudget), dataOnly: fields[2].checked,
      });
      localRuns.set(state.active, {});
      refresh();
      document.getElementById('capture-old').focus();
    } catch (error) {
      refresh();
      showError(error, error.message.includes('budget') ? fields[1] : error.message.includes('DATA ONLY') ? fields[2] : fields[0]);
    }
  });
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      clearError();
      if (busy) {
        showError({ code: 'ERR_PHASE', message: 'Wait for the bounded owned local asset load.' });
        return;
      }
      try {
        const action = button.dataset.action;
        state = engine.command(state, { type: action });
        if (action === 'render-old' || action === 'render-new') {
          const runId = state.active;
          const startedGeneration = generation;
          busy = true;
          refresh();
          const version = action === 'render-old' ? 'v1' : 'v2';
          const receipt = await illustrate(version, startedGeneration);
          if (startedGeneration !== generation || state.active !== runId) return;
          localRuns.get(runId)[version] = receipt;
          busy = false;
        }
        refresh();
        const next = engine.controls(state);
        if (next.next) document.getElementById(next.next).focus();
        else if (next.verify) document.getElementById('verify').focus();
      } catch (error) {
        busy = false;
        refresh();
        showError(error);
      }
    });
  });
  document.getElementById('reset-lesson').addEventListener('click', () => {
    generation++;
    if (busy && state.active !== null) {
      const locals = localRuns.get(state.active);
      const version = activeRun().actions.at(-1) === 'render-old' ? 'v1' : 'v2';
      locals[version] = { result: 'unknown', reason: 'Reset while local illustration was loading; no local rendering proof manufactured.' };
    }
    state = engine.command(state, { type: 'reset' });
    busy = false;
    HTMLFormElement.prototype.reset.call(form);
    clearIllustrations();
    clearError();
    refresh();
    fields[0].focus();
  });
  refresh();
}());
