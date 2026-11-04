(function () {
  'use strict';
  const form = document.getElementById('controls');
  const state = globalThis.SignInLesson.createState();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    globalThis.SignInLesson.execute(state, { type: 'start', scenarioId: 'compatible', budgetMs: 2000 });
    document.getElementById('phase').textContent = state.phase;
    document.getElementById('status').textContent = 'Loadable stub: original journey start is not implemented.';
  });
}());
