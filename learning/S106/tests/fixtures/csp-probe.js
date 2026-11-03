'use strict';

// Test-only, page-owned execution: DevTools evaluation is not a CSP oracle.
(() => {
  const root = document.documentElement;
  root.dataset.s106CspProbeRan = 'true';
  try {
    window.eval('1 + 1');
    root.dataset.s106EvalBlocked = 'not blocked';
  } catch (error) {
    root.dataset.s106EvalBlocked = error.name;
  }
  const inline = document.createElement('script');
  inline.textContent = 'document.documentElement.dataset.s106InlineExecuted = "true";';
  document.body.append(inline);
  setTimeout(() => { root.dataset.s106CspProbeDone = 'true'; }, 0);
})();
