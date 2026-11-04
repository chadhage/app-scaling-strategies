(function () {
  'use strict';
  const model = window.S124;
  let state = model.initialState();
  const form = document.getElementById('comparison-form');
  function render() {
    const result = model.project(state);
    document.getElementById('phase').textContent = result.phase;
    document.getElementById('compute').textContent = String(result.totalComputeUnits);
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state = model.transition(state, {
      type: 'compare',
      strategy: document.getElementById('strategy-select').value,
      fixture: document.getElementById('fixture-select').value,
    });
    render();
  });
  document.getElementById('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.initialState();
    render();
    document.getElementById('strategy-select').focus();
  });
  for (const control of form.elements) control.disabled = false;
  document.getElementById('startup-error').hidden = true;
  render();
}());
