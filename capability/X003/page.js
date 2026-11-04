(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./recommendation.js'), require('../C005/catalog-data.js'),
      require('../C003/matrix-data.js'));
  } else {
    const page = factory(root.X003Recommendation, root.C005Catalog, root.C003Matrix);
    Object.defineProperty(root, 'X003Page', { value: page });
    page.mount(root.document);
  }
}(globalThis, function (engine, sharedCatalog, sharedMatrix) {
  'use strict';
  const mounted = new WeakMap();

  function mount(document, catalog = sharedCatalog, matrix = sharedMatrix) {
    mounted.get(document)?.destroy();
    const byId = id => document.getElementById(id);
    const select = byId('goal-select');
    const recommendButton = byId('recommend');
    const resetButton = byId('reset');
    const returnButton = byId('return-chooser');
    const status = byId('goal-status');
    const error = byId('goal-error');
    const resultSection = byId('recommendation');
    const heading = byId('recommendation-heading');
    const body = byId('recommendation-body');
    let valid = false;
    let startupError;

    function element(tag, text, id) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (id) node.id = id;
      return node;
    }
    function clearResult() {
      body.replaceChildren();
      resultSection.hidden = true;
      resultSection.removeAttribute('data-entry-id');
      heading.textContent = 'Suggested next exercise';
    }
    function clearError() {
      error.hidden = true;
      error.textContent = '';
      select.removeAttribute('aria-invalid');
    }
    function fail(caught) {
      clearResult();
      error.textContent = `${caught.code || 'ERR_PROVIDERS'}: ${caught.message || 'Recommendation is unverified.'}`;
      error.hidden = false;
      select.setAttribute('aria-invalid', 'true');
      status.textContent = 'No recommendation or practice link is retained for this input.';
      if (!select.disabled) select.focus();
      return false;
    }
    function reset() {
      select.value = '';
      clearResult();
      clearError();
      if (!valid) return fail(startupError);
      status.textContent = 'No goal selected. Choose a goal, then recommend a practice.';
      select.focus();
      return true;
    }
    function returnToChooser() {
      if (!valid) return false;
      select.focus();
      status.textContent = 'Back at the goal chooser. Choose another goal or reset this local choice.';
      return true;
    }
    function recommend(input) {
      try {
        if (!valid) throw startupError;
        const result = engine.recommend(input, catalog, matrix);
        clearResult();
        clearError();
        heading.textContent = `${result.suggestedId} — ${result.title}`;
        const objective = element('p', result.objective, 'suggested-objective');
        const banner = element('p', result.mode, 'recommendation-banner');
        banner.className = 'banner';
        const inspect = element('button', 'Inspect why this matches', 'inspect-why');
        inspect.type = 'button';
        inspect.setAttribute('aria-controls', 'why-detail');
        inspect.setAttribute('aria-expanded', 'false');
        const why = element('section', undefined, 'why-detail');
        why.hidden = true;
        const whyHeading = element('h3', 'Why this matches your chosen goal', 'why-heading');
        whyHeading.tabIndex = -1;
        const explanation = element('p', result.why, 'goal-relevance');
        const acceptance = element('p',
          `Accepted portable ${result.suggestedId}: ${result.learningEvidence.commit}, `
          + `${result.learningEvidence.tag}, ${result.learningEvidence.acceptedAtUtc}. `
          + `Historical snapshot ${result.sourceCommit}; no live ledger lookup.`, 'practice-provenance');
        const source = element('a', 'Inspect the exact pinned source row', 'source-row-link');
        source.href = result.sourceHref;
        why.append(whyHeading, explanation, acceptance, source);
        const lesson = element('a', `Open ${result.suggestedId} local practice (new tab)`, 'practice-link');
        lesson.href = result.lessonHref;
        lesson.target = '_blank';
        lesson.rel = 'noopener noreferrer';
        inspect.addEventListener('click', () => {
          why.hidden = !why.hidden;
          inspect.setAttribute('aria-expanded', String(!why.hidden));
          (why.hidden ? inspect : whyHeading).focus();
        });
        body.append(objective, banner, inspect, why, lesson,
          element('p', 'Accepted portability is not native execution, source-parent completion or a reliability guarantee.'));
        resultSection.setAttribute('data-entry-id', result.suggestedId);
        resultSection.hidden = false;
        status.textContent = `Suggested ${result.suggestedId} for "${result.goalLabel}". Inspect why, then open the local practice.`;
        heading.focus();
        return true;
      } catch (caught) { return fail(caught); }
    }
    function changed() {
      clearResult();
      clearError();
      status.textContent = select.value
        ? 'Goal changed. Activate Recommend to validate this exact goal.'
        : 'No goal selected. Choose a goal, then recommend a practice.';
    }
    const clickRecommend = () => recommend(select.value);
    select.addEventListener('change', changed);
    recommendButton.addEventListener('click', clickRecommend);
    resetButton.addEventListener('click', reset);
    returnButton.addEventListener('click', returnToChooser);
    const controller = Object.freeze({
      recommend, reset,
      destroy() {
        select.removeEventListener('change', changed);
        recommendButton.removeEventListener('click', clickRecommend);
        resetButton.removeEventListener('click', reset);
        returnButton.removeEventListener('click', returnToChooser);
        mounted.delete(document);
      }
    });
    mounted.set(document, controller);
    clearResult();
    clearError();
    select.disabled = true;
    recommendButton.disabled = true;
    select.replaceChildren(element('option', 'Choose one learning goal'));
    select.firstElementChild.value = '';
    try {
      const snapshot = engine.inspectCatalog(catalog, matrix);
      for (const goal of engine.GOALS) {
        const option = element('option', goal.label);
        option.value = goal.id;
        select.append(option);
      }
      byId('source-summary').textContent = `Source ${snapshot.sourceCommit}; catalog-data SHA256 ${snapshot.catalogDataSha256}. `
        + `Acceptance snapshot ${snapshot.acceptanceSnapshot.commitTimeUtc}; ledger SHA256 ${snapshot.acceptanceSnapshot.ledgerSha256}; `
        + `ledger recorded ${snapshot.acceptanceSnapshot.ledgerUpdatedAtUtc}. Fixed historical bytes, not live availability.`;
      byId('availability-summary').textContent = `${snapshot.entries} source entries: ${snapshot.scenarios} scenarios; `
        + `${snapshot.availablePractices} accepted available portable practices; ${snapshot.unavailableWorkflows} unavailable workflows (W001, W002). `
        + `${snapshot.nativeRunnable} native runnable; ${snapshot.nativeQualified} native qualified; ${snapshot.completedParents} completed source parents.`;
      valid = true;
      select.disabled = false;
      recommendButton.disabled = false;
      status.textContent = 'No goal selected. Choose a goal, then recommend a practice.';
    } catch (caught) {
      startupError = caught;
      byId('source-summary').textContent = 'Declared source has not validated; no alternative snapshot is inferred.';
      byId('availability-summary').textContent = 'Practice availability and native boundaries are unverified.';
      fail(caught);
    }
    return controller;
  }
  return Object.freeze({ mount });
}));
