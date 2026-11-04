(function () {
  'use strict';
  const model = globalThis.S135Lesson;
  const form = document.getElementById('controls');
  let state = model.createState();
  function render() {
    document.getElementById('phase').textContent = state.phase;
    document.getElementById('history-count').textContent = `${state.history.length} / 16`;
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    state = model.execute(state, {
      type: 'load', presetId: form.elements.preset.value,
      eventId: form.elements.eventToken.value, budgetMs: Number(form.elements.budget.value),
    });
    render();
  });
  document.getElementById('reset-lesson').addEventListener('click', function () {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    render();
    form.elements.preset.focus();
  });
  render();
}());
