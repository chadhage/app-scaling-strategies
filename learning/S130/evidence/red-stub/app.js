(function () {
  'use strict';
  const form = document.getElementById('controls');
  const model = globalThis.FlexLesson;
  if (!model) return;
  let state = model.createState();
  const render = () => {
    document.getElementById('phase').textContent = state.phase;
    document.getElementById('history-count').textContent = `${state.history.length} / 12`;
    document.getElementById('error').textContent = '';
    document.getElementById('status').textContent = 'Load a fixed trace, inspect, then measure.';
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state = model.execute(state, { type: 'load', presetId: document.getElementById('preset').value, version: document.getElementById('software-token').value });
    render();
  });
  document.getElementById('reset-button').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    render();
    document.getElementById('preset').focus();
  });
  render();
}());
